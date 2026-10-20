import type {
	Band,
	FacetOrientation,
	BezierConfig,
	Id,
	Point,
	Point3,
	GlobuleConfig
} from '#lib/types.js';
import type { CurvePath, Vector2, Vector3 } from 'three';

export type SphereConfig = {
	type: 'SphereConfig';
	radius: number;
	center: Point3;
};

export type CapsuleConfig = {
	type: 'CapsuleConfig';
	radius: number;
	center: Point3;
	height: number;
	capSegments: number;
	radialSegments: number;
	heightSegments: number;
};

/** Source-file axis that should become the app's up axis (+Z). */
export type UpAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

/**
 * Auto-fit applied to an imported mesh before the user transform:
 * rotate source-up to +Z, shift the bbox center to the origin, scale uniformly so
 * the largest bbox dimension equals `targetSize`. `offset` and `scale` are
 * computed (see mesh-import/normalize.ts) and stored so the fit is reproducible.
 */
export type ImportedMeshNormalize = {
	upAxis: UpAxis;
	targetSize: number;
	offset: Point3;
	scale: number;
};

/**
 * A surface loaded from a user's 3D file. The mesh itself is not in the config —
 * `assetId` (content hash) resolves it through mesh-import/asset-store.ts.
 */
type ImportedMeshConfig = {
	type: 'ImportedMeshConfig';
	assetId: string;
	fileName: string;
	normalize: ImportedMeshNormalize;
	/**
	 * Ray-cast center, in world space (used untransformed, like Sphere's center).
	 * Defaults to the origin = the fitted model center before the user transform.
	 */
	center: Point3;
	/** Present when `assetId` is a simplified derivative of `sourceAssetId`. */
	simplify?: { sourceAssetId: string; targetTriangles: number };
};

type SurfaceGeometryConfig = SphereConfig | CapsuleConfig | GlobuleConfig | ImportedMeshConfig;

export type SurfaceConfig = SurfaceGeometryConfig & {
	transform: TransformConfig | 'inherit';
};

export type ImportedSurfaceConfig = ImportedMeshConfig & {
	transform: TransformConfig | 'inherit';
};

export type VerticesConfig = Point3[];

export type VertexIndex = number;
export type CurveIndex = number;
export type LevelIndex = number;
export type PointIndex = number;

export type EdgeConfig<
	S extends undefined | VertexIndex | Point3 | Point,
	T extends VertexIndex | Point3 | Point,
	U extends CurveIndex | EdgeCurveConfig | EdgeCurveConfigVector2,
	V extends CurveIndex | CrossSectionConfig | CrossSectionConfigVector2
> = {
	vertex0: S;
	vertex1: T;
	isDirectionMatched: boolean;
	widthCurve: U;
	heightCurve?: U;
	crossSectionCurve: V;
};

// Validation:
//   - all points from edges must be in same plane
//   - edges[n].p1.point equals edges[(n+1) % edges.length].p0.point
export type PolygonConfig<
	S extends undefined | VertexIndex | Point3 | Point,
	T extends VertexIndex | Point3 | Point,
	U extends CurveIndex | EdgeCurveConfig | EdgeCurveConfigVector2,
	V extends CurveIndex | CrossSectionConfig | CrossSectionConfigVector2
> = {
	name: string;
	id: Id;
	edges: EdgeConfig<S, T, U, V>[];
};

export type CrossSectionScaling = {
	width: 'curve' | number;
	height: 'curve' | 'matchWidth' | number;
};

export type TransformConfig = {
	translate: Point3;
	scale: Point3;
	rotate: Point3;
};

export type PolyhedronConfig_Initial = PolyhedronConfig<
	undefined,
	VertexIndex,
	CurveIndex,
	CurveIndex
>;

export type PolyhedronConfig<
	S extends undefined | Point3,
	T extends VertexIndex | Point3,
	U extends CurveIndex | EdgeCurveConfig,
	V extends CurveIndex | CrossSectionConfig
> = {
	name: string;
	id: Id;
	polygons: PolygonConfig<S, T, U, V>[];
	// sampleMethod: CurveSampleMethod;
	crossSectionCurves: CrossSectionConfig[];
	edgeCurves: EdgeCurveConfig[];
	vertices: VerticesConfig;
	transform: TransformConfig | 'inherit';
	// edgeMap: EdgeMap;
};

type ManualDivisionsConfig =
	| { divisions: 2; divisionsArray: [number] }
	| { divisions: 3; divisionsArray: [number, number] }
	| { divisions: 4; divisionsArray: [number, number, number] }
	| { divisions: 5; divisionsArray: [number, number, number, number] }
	| { divisions: 6; divisionsArray: [number, number, number, number, number] }
	| { divisions: 7; divisionsArray: [number, number, number, number, number, number] }
	| { divisions: 8; divisionsArray: [number, number, number, number, number, number, number] }
	| {
			divisions: 9;
			divisionsArray: [number, number, number, number, number, number, number, number];
	  }
	| {
			divisions: 10;
			divisionsArray: [number, number, number, number, number, number, number, number, number];
	  };

export type ProjectionCurveSampleMethod =
	| { method: 'divideCurvePath'; divisions: number }
	| ({ method: 'manualDivisions' } & ManualDivisionsConfig);

export type CrossSectionConfig = {
	curves: BezierConfig[];
	center: Point;
	sampleMethod: ProjectionCurveSampleMethod;
	scaling: CrossSectionScaling;
	shouldSkewCurve: boolean;
};
type CrossSectionConfigVector2 = {
	curves: CurvePath<Vector2>;
	center: Vector2;
	sampleMethod: ProjectionCurveSampleMethod;
	scaling: CrossSectionScaling;
};

// validation notes: start and end points must be{ x: [0-1], y: 0} and { x: [same as start], y: 1}.

export type EdgeCurveConfig = {
	curves: BezierConfig[];
	sampleMethod: ProjectionCurveSampleMethod;
};
type EdgeCurveConfigVector2 = {
	curves: CurvePath<Vector2>;
	sampleMethod: ProjectionCurveSampleMethod;
};

export type ProjectionBandConfig = {
	orientation: FacetOrientation;
	tubeSymmetry?: 'axial' | 'lateral';
};

export type ProjectorConfig<
	S extends undefined | Point3,
	T extends VertexIndex | Point3,
	U extends CurveIndex | EdgeCurveConfig,
	V extends CurveIndex | CrossSectionConfig
> = {
	name: string;
	id: Id;
	polyhedron: PolyhedronConfig<S, T, U, V>;
};

export type SurfaceProjectionConfig = {
	divisions: number;
	fillAll?: boolean;
};

/**
 * How polyhedron edges are sampled before projection. Every field is optional:
 * a missing block or field means the edge curve decides, which is how configs
 * saved before these options render.
 */
export type EdgeSamplingConfig = {
	/**
	 * Curve shape: the edge curve's bezier, a constant offset toward the polygon center,
	 * or that offset with each polygon corner rounded (the Voronoi curved inset).
	 */
	curveSource?: 'edgeCurve' | 'offset' | 'curvedOffset';
	/** Fraction of the way from each edge point to the polygon center (0–1, exclusive). */
	curveOffset?: number;
	/** Division count per edge: the edge curve's own count, or adaptive by draped length. */
	divisionsSource?: 'edgeCurve' | 'adaptive';
	/** Adaptive [min, max]: the shortest draped edge gets min, the longest max. */
	edgeDivisions?: [number, number];
	/** Integer >= 1 multiplying every edge's division count, in either mode. */
	edgeDivisionsMultiplier?: number;
};

export type ProjectionConfig<
	S extends undefined | Point3,
	T extends VertexIndex | Point3,
	U extends CurveIndex | EdgeCurveConfig,
	V extends CurveIndex | CrossSectionConfig
> = {
	meta: { transform: TransformConfig };
	surfaceConfig: SurfaceConfig;
	projectorConfig: ProjectorConfig<S, T, U, V>;
	bandConfig: ProjectionBandConfig;
	surfaceProjectionConfig?: SurfaceProjectionConfig;
	edgeSampling?: EdgeSamplingConfig;
};

export type BaseProjectionConfig = ProjectionConfig<undefined, number, number, number>;

// ------------------------------------------
// Instantiated
// ------------------------------------------

export type Edge = {
	config: EdgeConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>;
	edgePoints: Vector3[];
	curvePoints: Vector3[];
};

export type Polygon = {
	edges: Edge[];
};

export type Polyhedron = {
	polygons: Polygon[];
};

export type Section = {
	points: Vector3[];
};

export type Tube = {
	bands: Band[];
	sections: Section[];
	orientation: FacetOrientation;
	address: GlobuleAddress_Tube;
	// refers to matching points and 'start of tube array', 'start of band'
	// for: tube = [band0, band1];  band0 = [facet0, facet1, facet2, facet3]; band1 = [facet4, facet5, facet6, facet7]
	// startStart === facet0, startEnd === facet1, endStart === facet4, endEnd === facet7
	// partners: TubePartnerAddresses;
};

// export type Section = {};

export type ProjectionEdge = {
	config: EdgeConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>;
	sections: {
		intersections: { edge: Vector3; curve: Vector3; divisions: Vector3[] };
		crossSectionPoints: Vector3[];
	}[];
	tubeAddress?: GlobuleAddress_Tube;
};

export type Projection = {
	polygons: {
		edges: ProjectionEdge[];
	}[];
	address: GlobuleAddress_Globule;
};

export type GlobuleAddress =
	| GlobuleAddress_Globule
	| GlobuleAddress_Tube
	| GlobuleAddress_Band
	| GlobuleAddress_Facet
	| GlobuleAddress_Quad
	| GlobuleAddress_BandPiece
	| GlobuleAddress_FacetEdge;

export type GlobuleAddress_Globule = {
	globule: number;
};

export type GlobuleAddress_Tube = GlobuleAddress_Globule & {
	tube: number;
};

export type GlobuleAddress_Band = GlobuleAddress_Tube & {
	band: number;
};

type GlobuleAddress_Quad = GlobuleAddress_Band & {
	quad: number;
};

/**
 * A piece of a split band. `band` stays stable so band-index-dependent logic
 * (the sort index, saved selections) is
 * unaffected; the piece index distinguishes siblings.
 */
export type GlobuleAddress_BandPiece = GlobuleAddress_Band & { piece: number };

export type GlobuleAddress_Facet = GlobuleAddress_Band & {
	facet: number;
};

export type GlobuleAddress_FacetEdge = GlobuleAddress_Facet & {
	edge: TriangleEdge;
};

export type TriangleEdge = `ab` | 'bc' | 'ac';
export type TriangleEdgePermissive = TriangleEdge | 'ba' | 'cb' | 'ca';
