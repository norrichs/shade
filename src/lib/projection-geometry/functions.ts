import type { BaseProjectionConfig } from './types';

export const getEdge = (
	projectionConfigs: BaseProjectionConfig[],
	address: [number, number, number]
) => {
	return projectionConfigs[address[0]].projectorConfig.polyhedron.polygons[address[1]].edges[
		address[2]
	];
};

export const getCrossSection = (
	projectionConfigs: BaseProjectionConfig[],
	address: [number, number, number]
) => {
	const index = getEdge(projectionConfigs, address).crossSectionCurve;

	return {
		crossSectionDef:
			projectionConfigs[address[0]].projectorConfig.polyhedron.crossSectionCurves[index],
		crossSectionIndex: index
	};
};
