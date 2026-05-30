import type {
	CrossSectionConfig,
	ProjectionBandConfig,
	TransformConfig
} from '$lib/projection-geometry/types';

export type VoronoiMethod = 'spherical' | 'uv';

export type VoronoiConfig = {
	type: 'VoronoiConfig';
	meta: { transform: TransformConfig };
	seedConfig: VoronoiSeedConfig;
	crossSectionConfig: CrossSectionConfig;
	bandConfig: ProjectionBandConfig;
	edgeDivisions: number;
	curveOffsetFactor: number;
	surfaceProjectionDivisions: number;
	voronoiMethod: VoronoiMethod;
};

export type VoronoiSeedConfig = {
	type: 'VoronoiSeedConfig';
	seedMethod: SeedMethod;
	relaxationIterations: number;
};

export type SeedMethod = CenterProjectionSeedMethod | AreaWeightedSeedMethod;

export type CenterProjectionSeedMethod = {
	type: 'centerProjection';
	pointCount: number;
	seed: number;
};

export type AreaWeightedSeedMethod = {
	type: 'areaWeighted';
	pointCount: number;
	seed: number;
};

export type VoronoiEdge = {
	vertices: [[number, number], [number, number]];
	cellIndices: [number, number];
};

export type VoronoiResult = {
	edges: VoronoiEdge[];
	seeds: [number, number][];
	vertices: [number, number][];
};

// A surface facet as three world-space corners. Used only inside the geometry
// worker for area-weighted seed sampling; never serialized across postMessage.
export type SurfaceTriangle = [
	import('three').Vector3,
	import('three').Vector3,
	import('three').Vector3
];
