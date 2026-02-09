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

/**
 * Resolve a ProjectionRange dimension into concrete [start, end) indices.
 * Expands the range by `expand` on each side (clamped to [0, total]).
 */
export const resolveRangeIndices = (
	range: ProjectionRange['tubes'],
	total: number,
	expand: number = 0
): [number, number] => {
	let start: number;
	let end: number;
	if (range === undefined) {
		start = 0;
		end = total;
	} else if (typeof range === 'number') {
		start = range;
		end = range + 1;
	} else if (range.length === 1) {
		start = range[0];
		end = total;
	} else {
		start = range[0];
		end = range[1];
	}
	return [Math.max(0, start - expand), Math.min(total, end + expand)];
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
