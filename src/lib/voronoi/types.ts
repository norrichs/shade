import type {
	CrossSectionConfig,
	ProjectionBandConfig,
	SurfaceConfig,
	TransformConfig
} from '$lib/projection-geometry/types';

export type VoronoiMethod = 'spherical' | 'uv';

export type VoronoiConfig = {
	type: 'VoronoiConfig';
	meta: { transform: TransformConfig };
	surfaceConfig: SurfaceConfig;
	seedConfig: VoronoiSeedConfig;
	crossSectionConfig: CrossSectionConfig;
	bandConfig: ProjectionBandConfig;
	edgeDivisions: number;
	voronoiMethod: VoronoiMethod;
};

export type VoronoiSeedConfig = {
	type: 'VoronoiSeedConfig';
	seedMethod: SeedMethod;
	relaxationIterations: number;
};

export type SeedMethod = CenterProjectionSeedMethod;

export type CenterProjectionSeedMethod = {
	type: 'centerProjection';
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
