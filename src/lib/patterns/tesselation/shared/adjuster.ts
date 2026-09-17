import type {
	BandCutPattern,
	CutPattern,
	PathSegment,
	TiledPatternConfig,
	TubeCutPattern
} from '$lib/types';
import { findPreviousBandFacets, type BandEnd } from '$lib/cut-pattern/resolve-partner-band';
import type { IndexPair, TiledPatternSpec } from '../../spec-types';
import { alignPrevBandPath } from '../../adjust/align-prev-band';
import {
	evaluateSkipEdge,
	getTransformedPartnerCutPattern,
	removeInPlace,
	replaceInPlace
} from './helpers';
import {
	layoutTesselation,
	sideColumn,
	tiledIndex,
	unitCounts,
	unitIndexOf,
	type UnitGroup,
	type UnitIndex
} from './layout';

const DEBUG_METADATA = true;

/** A spec's adjustment rules expanded from unit indices into tiled-path indices. */
export type ExpandedAdjustments = {
	withinBand: IndexPair[];
	acrossBands: IndexPair[];
	skipRemove: number[];
	/**
	 * Partner-matching pairs, `[end][partnerEnd]`: targets written at this
	 * band's `end` from sources read at the partner's `partnerEnd`.
	 */
	partnerPairs: Record<BandEnd, Record<BandEnd, IndexPair[]>>;
	/** The start row's and end row's groups, removed by `endsTrimmed`. */
	trim: Record<BandEnd, number[]>;
};

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/**
 * The rows a start/end-group index names as a band end: row 0's start row or
 * the last row's end row. A middle index has no band-end row.
 */
const bandEndRow = (group: UnitGroup, rows: number): number | undefined =>
	group === 'start' ? 0 : group === 'end' ? rows - 1 : undefined;

/**
 * Expand a spec's unit-tile rules into indices of the `rows × columns` tiled
 * path, using the layout the generator assembles that path from. Rules are
 * expanded pair by pair, so a user-authored rule may mix index groups: both
 * sides of a pair are placed in the same rows, chosen from that pair alone.
 * Each rule lands only where the relationship it encodes exists:
 *
 * - `withinBand` joins this facet's end row to the next facet's start row, in
 *   every column. The source is read from the next facet's row 0 whatever its
 *   group; the target sits in this facet's last row (row 0 if it is a
 *   start-group index).
 * - `acrossBands` joins this band's side to its neighbour's: each side in the
 *   column on the side its unit vertex lies on (this band's first column; the
 *   previous band's last column for its sources). Rows: a start index allows
 *   row 0, an end index the last row, a middle index every row; the pair uses
 *   the rows both sides allow. A start↔end pair shares no row when rows > 1;
 *   it is placed tile-locally, in every row, as a 1×1 tile relates it.
 * - `skipRemove` uses the same rows and side column for each index.
 * - Partner matching and end trimming name band ends: row 0's start group and
 *   the last row's end group, every column. A partner pair naming a middle
 *   index is ignored, and a start/end pairing stops at the shorter rule list.
 *
 * Indices outside the unit are ignored.
 */
export const expandTesselationAdjustments = (
	spec: TiledPatternSpec,
	rows: number,
	columns: number
): ExpandedAdjustments => {
	const { unit, adjustments } = spec;
	const counts = unitCounts(unit);
	const layout = layoutTesselation(counts, rows, columns);
	const at = (u: UnitIndex, row: number, column: number) => tiledIndex(layout, u, row, column);
	const side = (u: UnitIndex) => sideColumn(unit, u.index, columns);
	const resolvePair = ({ source, target }: IndexPair) => {
		const s = unitIndexOf(source, counts);
		const t = unitIndexOf(target, counts);
		return s && t ? { s, t } : undefined;
	};

	const acrossRows = (s: UnitIndex, t: UnitIndex): number[] => {
		const sRow = bandEndRow(s.group, rows);
		const tRow = bandEndRow(t.group, rows);
		if (sRow === undefined && tRow === undefined) return range(rows);
		if (sRow === undefined) return [tRow!];
		if (tRow === undefined || sRow === tRow) return [sRow];
		return range(rows); // start ↔ end: tile-local
	};

	const withinBand = adjustments.withinBand.flatMap((pair) => {
		const resolved = resolvePair(pair);
		if (!resolved) return [];
		const { s, t } = resolved;
		const targetRow = t.group === 'start' ? 0 : rows - 1;
		return range(columns).map((c) => ({ source: at(s, 0, c), target: at(t, targetRow, c) }));
	});

	const acrossBands = adjustments.acrossBands.flatMap((pair) => {
		const resolved = resolvePair(pair);
		if (!resolved) return [];
		const { s, t } = resolved;
		return acrossRows(s, t).map((r) => ({ source: at(s, r, side(s)), target: at(t, r, side(t)) }));
	});

	const skipRemove = adjustments.skipRemove.flatMap((index) => {
		const u = unitIndexOf(index, counts);
		if (!u) return [];
		const row = bandEndRow(u.group, rows);
		return (row === undefined ? range(rows) : [row]).map((r) => at(u, r, side(u)));
	});

	const partnerRules = (end: BandEnd) =>
		end === 'start' ? adjustments.partner.startEnd : adjustments.partner.endEnd;
	const partnerPairsFor = (end: BandEnd, partnerEnd: BandEnd): IndexPair[] => {
		const targets = partnerRules(end);
		const sources = partnerRules(partnerEnd);
		return range(Math.min(targets.length, sources.length)).flatMap((i) => {
			const resolved = resolvePair({ source: sources[i].source, target: targets[i].target });
			if (!resolved) return [];
			const { s, t } = resolved;
			const sRow = bandEndRow(s.group, rows);
			const tRow = bandEndRow(t.group, rows);
			if (sRow === undefined || tRow === undefined) return [];
			return range(columns).map((c) => ({ source: at(s, sRow, c), target: at(t, tRow, c) }));
		});
	};

	const groupAtBandEnd = (group: 'start' | 'end') => {
		const u = (local: number): UnitIndex => ({
			index: (group === 'start' ? 0 : counts.start + counts.middle) + local,
			group,
			local
		});
		return range(counts[group]).flatMap((local) =>
			range(columns).map((c) => at(u(local), bandEndRow(group, rows)!, c))
		);
	};

	return {
		withinBand,
		acrossBands,
		skipRemove,
		partnerPairs: {
			start: { start: partnerPairsFor('start', 'start'), end: partnerPairsFor('start', 'end') },
			end: { start: partnerPairsFor('end', 'start'), end: partnerPairsFor('end', 'end') }
		},
		trim: { start: groupAtBandEnd('start'), end: groupAtBandEnd('end') }
	};
};

/**
 * The band ends that facet `f` of a `facetCount`-facet band carries: `start` on
 * the first facet, `end` on the last, both on the only facet of a one-facet band.
 */
export const bandEndsAtFacet = (f: number, facetCount: number): BandEnd[] => [
	...(f === 0 ? (['start'] as const) : []),
	...(f === facetCount - 1 ? (['end'] as const) : [])
];

export const adjustTesselation = (
	bands: BandCutPattern[],
	tiledPatternConfig: TiledPatternConfig,
	tubes: TubeCutPattern[],
	spec: TiledPatternSpec
) => {
	const {
		config: { endLooped, endsMatched, endsTrimmed, rowCount: rows = 1, columnCount: columns = 1 }
	} = tiledPatternConfig;
	const expanded = expandTesselationAdjustments(spec, rows, columns);

	const newBands = structuredClone(bands);
	for (let b = 0; b < bands.length; b++) {
		const band = bands[b];

		// The previous band by address, paired in parent quad coordinates — never
		// `bands[b - 1]`, which in a split tube is often this piece's own sibling.
		// A facet with no counterpart (a piece beside a shorter uncut band) gets
		// no cross-band adjustment.
		const prevBandPaths = findPreviousBandFacets<CutPattern>(bands, b).map(
			(facet, f): PathSegment[] | undefined => {
				if (!facet) return undefined;
				const { path, quad } = facet;
				const referenceQuad = band.facets[f].quad;
				if (!quad || !referenceQuad) throw new Error('missing quad');
				return alignPrevBandPath(path, quad, referenceQuad);
			}
		);

		const { withinBand: withinBandPairs, acrossBands: acrossBandsPairs } = expanded;
		const skipRemoveIndices = expanded.skipRemove;

		for (let f = 0; f < band.facets.length; f++) {
			if (DEBUG_METADATA) {
				newBands[b].facets[f].meta = {
					originalPath: structuredClone(band.facets[f].path),
					prevBandPath: prevBandPaths[f]
				};
			}

			const nextPath = band.facets[(f + 1) % band.facets.length].path;

			const doEndMatching = true;
			if (doEndMatching && endsMatched) {
				// A one-facet band's facet is both its start and its end: match each
				// end against its own partner. They write disjoint vertices (each
				// end's own target group) and read only the partner's path, so the
				// order of the two cannot matter.
				for (const end of bandEndsAtFacet(f, band.facets.length)) {
					const partner = getTransformedPartnerCutPattern(
						band as BandCutPattern,
						end,
						tubes,
						tiledPatternConfig.config.endsMatched
					);
					if (!partner) continue;
					newBands[b].meta = {
						...newBands[b].meta,
						...(end === 'start'
							? { translatedStartPartnerFacet: partner.facet }
							: { translatedEndPartnerFacet: partner.facet })
					} as BandCutPattern['meta'];

					replaceInPlace({
						pairs: expanded.partnerPairs[end][partner.partnerEnd],
						target: newBands[b].facets[f].path,
						source: partner.facet.path
					});
				}
			}

			if (f < band.facets.length - 1 || endLooped) {
				replaceInPlace({
					pairs: withinBandPairs,
					target: newBands[b].facets[f].path,
					source: nextPath
				});
			}

			const prevBandPath = prevBandPaths[f];
			if (prevBandPath) {
				replaceInPlace({
					pairs: acrossBandsPairs,
					target: newBands[b].facets[f].path,
					source: prevBandPath
				});
			}

			const shouldRemove = evaluateSkipEdge(
				tiledPatternConfig.config.skipEdges || 'none',
				f,
				band.facets.length - 1
			);

			if (shouldRemove) {
				removeInPlace({ indices: skipRemoveIndices, target: newBands[b].facets[f].path });
			}
		}

		if (endsTrimmed && spec.adjustments.trimsEnds && band.facets.length > 0) {
			const { start: startGroup, end: endGroup } = expanded.trim;
			const last = band.facets.length - 1;
			if (last === 0) {
				// One facet carries both groups. Remove them in one pass: removing the
				// start group first would shift the end group's indices.
				removeInPlace({
					indices: [...startGroup, ...endGroup],
					target: newBands[b].facets[0].path
				});
			} else {
				removeInPlace({ indices: startGroup, target: newBands[b].facets[0].path });
				removeInPlace({ indices: endGroup, target: newBands[b].facets[last].path });
			}
		}
	}
	return newBands;
};
