import type { BandCutPattern, CutPattern, TiledPatternConfig, TubeCutPattern } from '$lib/types';
import { getAngle, rotatePS, translatePS } from '../../utils';
import type { IndexPair, TiledPatternSpec } from '../../spec-types';
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

export const adjustShieldTesselation = (
	bands: BandCutPattern[],
	tiledPatternConfig: TiledPatternConfig,
	tubes: TubeCutPattern[],
	spec: TiledPatternSpec
) => {
	const {
		config: { endLooped, endsMatched, rowCount: rows = 1, columnCount: columns = 1 }
	} = tiledPatternConfig;
	const startCount = spec.unit.start.length;
	const middleCount = spec.unit.middle.length;
	const endCount = spec.unit.end.length;

	const newBands = structuredClone(bands);
	for (let b = 0; b < bands.length; b++) {
		const band = bands[b];

		const prevBandPaths = bands[(bands.length + b - 1) % bands.length].facets.map(
			(facet: CutPattern, f) => {
				const { path, quad } = facet;
				const referenceQuad = band.facets[f].quad;
				if (!quad || !referenceQuad) throw new Error('missing quad');

				const offset = { x: referenceQuad.a.x - quad.b.x, y: referenceQuad.a.y - quad.b.y };
				const angle = getAngle(referenceQuad.a, referenceQuad.d) - getAngle(quad.b, quad.c);

				let newPath = translatePS(structuredClone(path), offset.x, offset.y);
				newPath = rotatePS(newPath, angle, referenceQuad.a);

				return newPath;
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
			if (doEndMatching && endsMatched && (f === 0 || f === band.facets.length - 1)) {
				const partner = getTransformedPartnerCutPattern(
					band as BandCutPattern,
					f,
					tubes,
					tiledPatternConfig.config.endsMatched
				);
				if (partner) {
					newBands[b].meta = {
						...newBands[b].meta,
						...(f === 0
							? { translatedStartPartnerFacet: partner }
							: { translatedEndPartnerFacet: partner })
					} as BandCutPattern['meta'];

					const partnerSources =
						Number(partner.label) === 0
							? spec.adjustments.partner.startEnd.map((p) => p.source)
							: spec.adjustments.partner.endEnd.map((p) => p.source);
					const partnerTargets =
						f === 0
							? spec.adjustments.partner.startEnd.map((p) => p.target)
							: spec.adjustments.partner.endEnd.map((p) => p.target);
					const partnerPairs = partnerSources.map((source, i) => ({
						source,
						target: partnerTargets[i]
					}));

					replaceInPlace({
						pairs: retargetPairs(partnerPairs, rows, columns, startCount, middleCount, endCount),
						target: newBands[b].facets[f].path,
						source: partner.path
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

			replaceInPlace({
				pairs: acrossBandsPairs,
				target: newBands[b].facets[f].path,
				source: prevBandPaths[f]
			});

			const shouldRemove = evaluateSkipEdge(
				tiledPatternConfig.config.skipEdges || 'none',
				f,
				band.facets.length - 1
			);

			if (shouldRemove) {
				removeInPlace({ indices: skipRemoveIndices, target: newBands[b].facets[f].path });
			}
		}
	}
	return newBands;
};
