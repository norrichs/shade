import type {
	CrossSectionConfig,
	ProjectionBandConfig,
	TransformConfig
} from '$lib/projection-geometry/types';

export type VoronoiMethod = 'spherical' | 'uv' | 'geodesic';

export type InsetMethod = 'centerOut' | 'localProjection';

export type VoronoiConfig = {
	type: 'VoronoiConfig';
	meta: { transform: TransformConfig };
	seedConfig: VoronoiSeedConfig;
	crossSectionConfig: CrossSectionConfig;
	bandConfig: ProjectionBandConfig;
	// Adaptive edge divisions: [minDivisions, maxDivisions]. The shortest Voronoi
	// cell edge is divided by minDivisions, the longest by maxDivisions, and every
	// other edge by a count linearly interpolated between the two by its length.
	// Invariant: edgeDivisions[0] <= edgeDivisions[1].
	edgeDivisions: [number, number];
	curveOffsetFactor: number;
	surfaceProjectionDivisions: number;
	voronoiMethod: VoronoiMethod;
	insetMethod: InsetMethod;
	// When true (localProjection only), inset edges are drawn as per-corner quadratic
	// beziers instead of straight homothety lines. Ignored by other inset methods.
	curvedInset?: boolean;
	fillAll?: boolean;
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
