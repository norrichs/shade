import type { ProjectionCutPattern, ProjectionPanelPattern, TubeCutPattern } from '$lib/types';

export type ProjectionRange = {
	projections?: number | [number] | [number, number];
	tubes?: number | [number] | [number, number];
	bands?: number | [number] | [number, number];
	facets?: number | [number] | [number, number];
};

const getIndices = (
	range?: number | [number] | [number, number],
	naturalRange: [number, number] = [0, 1]
) => {
	if (!range) return naturalRange;
	return typeof range === 'number' ? [range] : range;
};

export const sliceProjectionPanelPattern = (
	projectionPanelPattern: ProjectionPanelPattern,
	{ tubes, bands, facets }: ProjectionRange = {}
): ProjectionPanelPattern => {
	const sliced = {
		...projectionPanelPattern,
		tubes: projectionPanelPattern.tubes.slice(...getIndices(tubes)).map((tube) => ({
			...tube,
			bands: tube.bands
				.slice(...getIndices(bands))
				.map((band) => ({ ...band, panels: band.panels.slice(...getIndices(facets)) }))
		}))
	};

	return sliced;
};

export const sliceProjectionCutPattern = (
	patternTubes: TubeCutPattern[],
	{ tubes, bands, facets }: ProjectionRange = {}
): TubeCutPattern[] => {
	const tubeCount = patternTubes.length;
	const slicedTubes: TubeCutPattern[] = patternTubes
		.slice(...getIndices(tubes, [0, tubeCount]))
		.map((tube) => {
			const bandCount = tube.bands.length;
			return {
				...tube,
				bands: tube.bands.slice(...getIndices(bands, [0, bandCount])).map((band) => {
					const facetCount = band.facets.length;
					return {
						...band,
						facets: band.facets.slice(...getIndices(facets, [0, facetCount]))
					};
				})
			};
		});

	return slicedTubes;
};

// export const filterProjection = (
// 	projectionPanelPattern: ProjectionPanelPattern,
// 	{ projections, tubes, bands, facets }: ProjectionRange
// ) => {
// 	const filtered = projectionPanelPattern.tubes.slice(...getIndices(tubes)).map((tube) => ({
// 		...tube,
// 		bands: tube.bands
// 			.slice(...getIndices(bands))
// 			.map((band) => ({ ...band, panels: band.panels.slice(...getIndices(facets)) }))
// 	}));

// 	return filtered;
// };
