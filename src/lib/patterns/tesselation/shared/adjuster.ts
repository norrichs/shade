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
	replaceInPlace,
	retarget
} from './helpers';

const DEBUG_METADATA = true;

const retargetPairs = (
	pairs: IndexPair[],
	rows: number,
	columns: number,
	startCount: number,
	middleCount: number,
	endCount: number
): IndexPair[] => {
	const sources = retarget(
		pairs.map((p) => p.source),
		rows,
		columns,
		startCount,
		middleCount,
		endCount
	);
	const targets = retarget(
		pairs.map((p) => p.target),
		rows,
		columns,
		startCount,
		middleCount,
		endCount
	);
	if (sources.length !== targets.length) {
		throw new Error('retargetPairs length mismatch');
	}
	return sources.map((s, i) => ({ source: s, target: targets[i] }));
};

/**
 * The band ends that facet `f` of a `facetCount`-facet band carries: `start` on
 * the first facet, `end` on the last, both on the only facet of a one-facet band.
 */
export const bandEndsAtFacet = (f: number, facetCount: number): BandEnd[] => [
	...(f === 0 ? (['start'] as const) : []),
	...(f === facetCount - 1 ? (['end'] as const) : [])
];

/** The spec's partner pairs for one band end (its targets, or a partner's sources). */
const partnerPairsAt = (spec: TiledPatternSpec, end: BandEnd): IndexPair[] =>
	end === 'start' ? spec.adjustments.partner.startEnd : spec.adjustments.partner.endEnd;

export const adjustTesselation = (
	bands: BandCutPattern[],
	tiledPatternConfig: TiledPatternConfig,
	tubes: TubeCutPattern[],
	spec: TiledPatternSpec
) => {
	const {
		config: { endLooped, endsMatched, endsTrimmed, rowCount: rows = 1, columnCount: columns = 1 }
	} = tiledPatternConfig;
	const startCount = spec.unit.start.length;
	const middleCount = spec.unit.middle.length;
	const endCount = spec.unit.end.length;

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

		const withinBandPairs = retargetPairs(
			spec.adjustments.withinBand,
			rows,
			columns,
			startCount,
			middleCount,
			endCount
		);
		const acrossBandsPairs = retargetPairs(
			spec.adjustments.acrossBands,
			rows,
			columns,
			startCount,
			middleCount,
			endCount
		);
		const skipRemoveIndices = retarget(
			spec.adjustments.skipRemove,
			rows,
			columns,
			startCount,
			middleCount,
			endCount
		);

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

					const partnerSources = partnerPairsAt(spec, partner.partnerEnd).map((p) => p.source);
					const partnerTargets = partnerPairsAt(spec, end).map((p) => p.target);
					const partnerPairs = partnerSources.map((source, i) => ({
						source,
						target: partnerTargets[i]
					}));

					replaceInPlace({
						pairs: retargetPairs(partnerPairs, rows, columns, startCount, middleCount, endCount),
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
			const expand = (canonical: number[]) =>
				retarget(canonical, rows, columns, startCount, middleCount, endCount);
			const startGroup =
				startCount > 0 ? expand(Array.from({ length: startCount }, (_, i) => i)) : [];
			const endGroup =
				endCount > 0
					? expand(Array.from({ length: endCount }, (_, i) => startCount + middleCount + i))
					: [];
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
