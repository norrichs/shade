/**
 * Preview utilities for immediate 2D preview updates without full 3D regeneration.
 *
 * These functions generate minimal geometry structures from config and reuse
 * existing geometric algorithms from generate-projection.ts and path-editor.ts.
 *
 * Key principle: NO algorithm duplication - always reuse existing functions.
 */

import { Vector3 } from 'three';
import type {
	PolygonConfig,
	EdgeConfig,
	EdgeCurveConfig,
	CrossSectionConfig,
	TransformConfig,
	Polygon,
	Edge
} from './types';
import type { Point3 } from '$lib/types';
import { getPoints, getMatrix4, mapPointsToTriangle } from './generate-projection';
import { getVector3 } from '$lib/util';

/**
 * Generates a Polygon object from config (without full 3D generation).
 *
 * This produces the minimal structure needed by flattenPolygon() by:
 * 1. Sampling edge curves to get curve points (REUSES getPoints)
 * 2. Creating straight line edge points between vertices
 * 3. Wrapping in Polygon/Edge structure
 *
 * The result can be passed directly to flattenPolygon() from path-editor.ts.
 *
 * @param polygonConfig - Prepared polygon config (use preparePolygonConfig first)
 * @param transformConfig - Scale/translate transform to apply
 * @returns Polygon with edgePoints and curvePoints ready for flattening
 */
export function generatePolygonFromConfig(
	polygonConfig: PolygonConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>,
	transformConfig: TransformConfig
): Polygon {
	const transformMatrix = getMatrix4(transformConfig);

	// Compute polygon center (centroid of all vertices)
	// This matches the logic in generateEdge which receives center as a parameter
	const allVertices: Vector3[] = [];
	polygonConfig.edges.forEach((edgeConfig) => {
		const [v0] = getVector3([edgeConfig.vertex0]) as Vector3[];
		v0.applyMatrix4(transformMatrix);
		allVertices.push(v0);
	});

	const polygonCenter = new Vector3();
	allVertices.forEach((v) => polygonCenter.add(v));
	polygonCenter.divideScalar(allVertices.length);

	const edges: Edge[] = polygonConfig.edges.map((edgeConfig) => {
		const { vertex0, vertex1, widthCurve, isDirectionMatched } = edgeConfig;
		const { divisions } = widthCurve.sampleMethod;

		// Apply transform to vertices - REUSES getVector3 from util
		const [v0, v1] = getVector3([vertex0, vertex1]) as Vector3[];
		v0.applyMatrix4(transformMatrix);
		v1.applyMatrix4(transformMatrix);

		// Generate edge points (straight line between vertices)
		const edgePoints: Vector3[] = [];
		for (let i = 0; i <= divisions; i++) {
			edgePoints.push(v0.clone().lerp(v1, i / divisions));
		}

		// Generate curve points (sample bezier) - REUSES getPoints
		const definitionPoints = getPoints(widthCurve.curves, widthCurve.sampleMethod);

		// Map 2D curve points to 3D triangle (v0, v1, polygonCenter)
		// This matches generateEdge logic which uses the polygon center
		// REUSES mapPointsToTriangle from generate-projection.ts
		const curvePoints = mapPointsToTriangle<Vector3>(
			{ a: v0, b: v1, c: polygonCenter },
			definitionPoints,
			isDirectionMatched
		);

		return {
			config: edgeConfig,
			edgePoints,
			curvePoints
		};
	});

	return { edges };
}

/**
 * Generates SVG path string for cross-section preview.
 *
 * This mirrors the path generation logic from getCrossSectionPath() but
 * operates directly on config without needing generated tube geometry.
 *
 * REUSES: getPoints() from generate-projection.ts for bezier sampling
 *
 * @param crossSectionConfig - Cross-section curve and scaling config
 * @returns SVG path string (e.g., "M 0 0 L 10 5 L 5 10 Z")
 */
export function generateCrossSectionPath(crossSectionConfig: CrossSectionConfig): string {
	// Sample the curve - REUSES getPoints()
	const points = getPoints(crossSectionConfig.curves, crossSectionConfig.sampleMethod);

	if (points.length === 0) return '';

	// Apply scaling
	const { width, height } = crossSectionConfig.scaling;
	const xScale = typeof width === 'number' ? width : 50;
	const yScale = typeof height === 'number' ? height : typeof height === 'string' ? xScale : height;

	// Convert to SVG path with scaling applied
	const scaledPoints = points.map((p) => ({
		x: p.x * xScale,
		y: p.y * yScale
	}));

	// Generate path string
	const pathString = scaledPoints.reduce((path, p, i) => {
		return i === 0 ? `M ${p.x} ${p.y}` : `${path} L ${p.x} ${p.y}`;
	}, '');

	return `${pathString} Z`;
}
