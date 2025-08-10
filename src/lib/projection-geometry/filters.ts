import type { ProjectionPanelPattern } from '$lib/types';

export type ProjectionRange = {
	projections?: number | [number] | [number, number];
	tubes?: number | [number] | [number, number];
	bands?: number | [number] | [number, number];
	facets?: number | [number] | [number, number];
};

const getIndices = (range?: number | [number] | [number, number]) => {
	if (!range) return [];
	return typeof range === 'number' ? [range] : range;
};

export const sliceProjectionPanelPattern = (
	projectionPanelPattern: ProjectionPanelPattern,
	{ tubes, bands, facets }: ProjectionRange
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
