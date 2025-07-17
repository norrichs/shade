import type { Band, BandOrientation, BezierConfig, Id, Point, Point3 } from '$lib/types';
import type { CubicBezierCurve, CurvePath, Vector2, Vector3 } from 'three';

export type SphereConfig = {
	type: 'SphereConfig';
	radius: number;
	center: Point3;
};

export type SurfaceGeometryConfig = SphereConfig;

export type SurfaceConfig = SurfaceGeometryConfig & {
	transform: TransformConfig | 'inherit';
};

// Validation:
//   - curve[0].points[0].x === curve[curve.length-1].points[3].x
//   - curve[0].points[0].x < 1
//   - curve[0].y === 0, curve[curve.length-1].points[3].y === 1
export type OldEdgeConfig = {
	p0: Point3;
	p1: Point3;
	widthCurve: BezierConfig[];
	heightCurve?: BezierConfig[];
};

export type VerticesConfig = Point3[];

export type VertexIndex = number;
export type CurveIndex = number;

export type EdgeConfig<
	S extends undefined | Point3 | Point,
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
	S extends undefined | Point3 | Point,
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

type PolygonIndex = number;
type EdgeIndex = number;

export type EdgeMap = {
	edgePairs: [[PolygonIndex, EdgeIndex], [PolygonIndex, EdgeIndex]][];
};

export type TransformConfig = {
	translate: Point3;
	scale: Point3;
	rotate: Point3;
};

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

export type CurveSampleMethod = { method: 'divideCurvePath'; divisions: number };

export type CrossSectionConfig = {
	curves: BezierConfig[];
	center: Point;
	sampleMethod: CurveSampleMethod;
	scaling: CrossSectionScaling;
};
export type CrossSectionConfigVector2 = {
	curves: CurvePath<Vector2>;
	center: Vector2;
	sampleMethod: CurveSampleMethod;
	scaling: CrossSectionScaling;
};

// validation notes: start and end points must be{ x: [0-1], y: 0} and { x: [same as start], y: 1}.

export type EdgeCurveConfig = {
	curves: BezierConfig[];
	sampleMethod: CurveSampleMethod;
};
export type EdgeCurveConfigVector2= {
	curves: CurvePath<Vector2>;
	sampleMethod: CurveSampleMethod;
}

export type ProjectionBandConfig = {
	orientation: BandOrientation;
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

export type Section = Vector3[];

export type Tube = {
	bands: Band[];
	sections: Section[];
};

// export type Section = {};

export type ProjectionEdge = {
	config: EdgeConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>;
	sections: {
		intersections: { edge: Vector3; curve: Vector3 };
		crossSectionPoints: Vector3[];
	}[];
};

export type Projection = {
	polygons: {
		edges: ProjectionEdge[];
	}[];
};
