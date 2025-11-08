import { getVector3 } from '$lib/util';
import { CubicBezierCurve, CurvePath, Vector2, Vector3 } from 'three';
import {
	getCrossSectionScale,
	getPolygonCenter,
	mapPointsToTriangle,
	preparePolygonConfig
} from './generate-projection';
import type {
	BaseProjectionConfig,
	CrossSectionConfigVector2,
	EdgeCurveConfigVector2,
	PolygonConfig
} from './types';
import type { BezierConfig } from '$lib/types';

export type EditablePolygon = PolygonConfig<
	Vector2,
	Vector2,
	EdgeCurveConfigVector2,
	CrossSectionConfigVector2
>;

const getEditablePolygon = ({
	config,
	polygonIndex,
	editContext
}: {
	config: BaseProjectionConfig;
	polygonIndex: number;
	editContext?: {
		canvas: { minX: number; minY: number; maxX: number; maxY: number };
		padding: number;
	};
}): EditablePolygon => {
	const {
		vertices: cfgVertices,
		edgeCurves,
		crossSectionCurves,
		polygons
	} = config.projectorConfig.polyhedron;
	const baseConfig = polygons[polygonIndex];
	const preparedPolygon = preparePolygonConfig(
		baseConfig,
		cfgVertices,
		edgeCurves,
		crossSectionCurves
	);
	const center = getPolygonCenter(preparedPolygon);
	const vertices = preparedPolygon.edges.map((edge) => {
		const vec = getVector3(edge.vertex1) as Vector3;
		vec.addScaledVector(center, -1);
		return vec;
	});
	let accum = 0;
	const angles = vertices
		.map((vec, i) => vertices[(i + vertices.length - 1) % vertices.length].angleTo(vec))
		.map((a) => {
			accum += a;
			return accum;
		})
		.map((a, _, arr) => a - arr[0]);

	const newCenter = new Vector2(0, 0);
	let vertices2 = [new Vector2(0, vertices[0].length())];
	for (let i = 1; i < vertices.length; i++) {
		vertices2.push(
			vertices2[0].clone().rotateAround(newCenter, angles[i]).setLength(vertices[i].length())
		);
	}
	if (editContext) {
		let { minX, minY, maxX, maxY } = editContext.canvas;
		minX += editContext.padding;
		minY += editContext.padding;
		maxX -= editContext.padding;
		maxY -= editContext.padding;

		let scaleFactor = 0;
		vertices2.forEach((v) => {
			let sf = 1;
			if (v.x < 0) sf = v.x / minX;
			if (v.x > 0) sf = v.x / maxX;
			if (v.y < 0) sf = v.y / minY;
			if (v.y > 0) sf = v.y / maxY;

			if (sf > scaleFactor) scaleFactor = sf;
		});
		scaleFactor = 1 / scaleFactor;
		vertices2 = vertices2.map((v) => v.set(v.x * scaleFactor, v.y * scaleFactor));
	}

	const edges: EdgeCurveConfigVector2[] = preparedPolygon.edges.map((edge, i) => {
		const vertex0 = vertices2[prev(vertices2, i)];
		const vertex1 = vertices2[i];
		let curveControlPoints = edge.widthCurve.curves
			.map((curve) => curve.points)
			.flat()
			.map((p) => new Vector2(p.x, p.y));
		curveControlPoints = mapPointsToTriangle(
			{ a: vertex0, b: vertex1, c: newCenter },
			curveControlPoints,
			edge.isDirectionMatched
		);
		const curves = new CurvePath<Vector2>();
		for (let i = 0; i < curveControlPoints.length; i += 4) {
			curves.add(
				new CubicBezierCurve(
					curveControlPoints[i],
					curveControlPoints[i + 1],
					curveControlPoints[i + 2],
					curveControlPoints[i + 3]
				)
			);
		}
		return {
			...edge,
			vertex0,
			vertex1,
			widthCurve: { ...edge.widthCurve, curves }
		};
	});
	return { ...preparedPolygon, edges };
};

const prev = (arr: unknown[], i: number): number => {
	return (i - 1 + arr.length) % arr.length;
};

const setPolygon = () => undefined;

const getEditableCrossSection = ({
	config,
	polygonIndex,
	edgeIndex,
	editContext
}: {
	config: BaseProjectionConfig;
	polygonIndex: number;
	edgeIndex: number;
	editContext?: {
		canvas: { minX: number; minY: number; maxX: number; maxY: number };
		padding: number;
	};
}) => {
	const { polyhedron } = config.projectorConfig;
	const edge = polyhedron.polygons[polygonIndex].edges[edgeIndex];
	const crossSectionConfig = polyhedron.crossSectionCurves[edge.crossSectionCurve];
	const { yScale, xScale } = getCrossSectionScale(crossSectionConfig.scaling);

	const curves = new CurvePath<Vector2>();
	crossSectionConfig.curves.forEach((curveConfig: BezierConfig) => {
		const vectors = curveConfig.points.map((p) => new Vector2(p.x * xScale, p.y * yScale));
		curves.add(new CubicBezierCurve(...vectors));
	});

	return { curves };
};

export const editPolygon = { get: getEditablePolygon, set: setPolygon };
export const editCrossSection = { get: getEditableCrossSection };
