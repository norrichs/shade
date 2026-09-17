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
import { layoutTesselation, placeUnitIndices, unitCounts, type IndexPlacement } from './layout';

const DEBUG_METADATA = true;

/** A spec's adjustment rules expanded from unit indices into tiled-path indices. */
export type ExpandedAdjustments = {
	withinBand: IndexPair[];
	acrossBands: IndexPair[];
	skipRemove: number[];
	/** Partner-matching target indices written at each band end. */
	partnerTargets: Record<BandEnd, number[]>;
	/** Partner-matching source indices read from a partner's joining end. */
	partnerSources: Record<BandEnd, number[]>;
	/** The start row's and end row's groups, removed by `endsTrimmed`. */
	trim: Record<BandEnd, number[]>;
};

/** Facet-to-facet joins along the band: the end row, in every column. */
const ALONG_BAND: IndexPlacement = { row: 'last', column: 'all' };
/** Band-to-band joins: every row, only in the column on the joining side. */
const ACROSS_BANDS: IndexPlacement = { row: 'all', column: 'side' };

/**
 * Expand a spec's unit-tile rules into indices of the `rows × columns` tiled
 * path, using the layout the generator assembles that path from. Each rule
 * lands only where the relationship it encodes exists:
 *
 * - `withinBand` joins this facet's end row to the next facet's start row: the
 *   last row (row 0 for start-group sources), every column.
 * - `acrossBands` and `skipRemove` join this band's side to its neighbour's:
 *   every row, in the column on the side the unit vertex lies on (this band's
 *   first column; the previous band's last column for its sources).
 * - Partner matching and end trimming name the start and end groups: row 0's
 *   start row and the last row's end row, every column.
 */
export const expandTesselationAdjustments = (
	spec: TiledPatternSpec,
	rows: number,
	columns: number
): ExpandedAdjustments => {
	const { unit, adjustments } = spec;
	const layout = layoutTesselation(unitCounts(unit), rows, columns);
	const place = (indices: number[], placement: IndexPlacement) =>
		placeUnitIndices(indices, unit, layout, placement);
	const placePairs = (pairs: IndexPair[], placement: IndexPlacement): IndexPair[] => {
		const sources = place(
			pairs.map((p) => p.source),
			placement
		);
		const targets = place(
			pairs.map((p) => p.target),
			placement
		);
		if (sources.length !== targets.length) {
			throw new Error('expanded pairs length mismatch');
		}
		return sources.map((source, i) => ({ source, target: targets[i] }));
	};
	const startGroup = Array.from({ length: unit.start.length }, (_, i) => i);
	const endGroup = Array.from(
		{ length: unit.end.length },
		(_, i) => unit.start.length + unit.middle.length + i
	);
	return {
		withinBand: placePairs(adjustments.withinBand, ALONG_BAND),
		acrossBands: placePairs(adjustments.acrossBands, ACROSS_BANDS),
		skipRemove: place(adjustments.skipRemove, ACROSS_BANDS),
		partnerTargets: {
			start: place(
				adjustments.partner.startEnd.map((p) => p.target),
				ALONG_BAND
			),
			end: place(
				adjustments.partner.endEnd.map((p) => p.target),
				ALONG_BAND
			)
		},
		partnerSources: {
			start: place(
				adjustments.partner.startEnd.map((p) => p.source),
				ALONG_BAND
			),
			end: place(
				adjustments.partner.endEnd.map((p) => p.source),
				ALONG_BAND
			)
		},
		trim: { start: place(startGroup, ALONG_BAND), end: place(endGroup, ALONG_BAND) }
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

					const partnerSources = expanded.partnerSources[partner.partnerEnd];
					const partnerTargets = expanded.partnerTargets[end];
					if (partnerSources.length !== partnerTargets.length) {
						throw new Error('partner pairs length mismatch');
					}
					const partnerPairs = partnerSources.map((source, i) => ({
						source,
						target: partnerTargets[i]
					}));

					replaceInPlace({
						pairs: partnerPairs,
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
