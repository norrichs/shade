import { Raycaster, Vector2, Vector3, type Object3D } from 'three';
import { buildCellCurvedInsets2d, type CurvedCellEdge } from '$lib/voronoi/curved-inset-2d';
import {
	normalizeEdgeDivisions,
	normalizeEdgeDivisionsMultiplier
} from '$lib/voronoi/edge-divisions';
import type { EdgeSamplingConfig } from './types';

/**
 * Edge sampling options for the polyhedron surface projection, mirroring the
 * Voronoi pipeline's curve offset and adaptive edge divisions.
 */

export type ResolvedEdgeSampling = Required<EdgeSamplingConfig>;

// Offset and divisions defaults match `defaultVoronoiConfig`.
export const DEFAULT_EDGE_SAMPLING: ResolvedEdgeSampling = {
	curveSource: 'edgeCurve',
	curveOffset: 0.3,
	divisionsSource: 'edgeCurve',
	edgeDivisions: [6, 6],
	edgeDivisionsMultiplier: 1
};

const MIN_CURVE_OFFSET = 0.01;
const MAX_CURVE_OFFSET = 0.99;

/** Fill missing fields with defaults and clamp the rest to their invariants. */
export const resolveEdgeSampling = (config?: EdgeSamplingConfig): ResolvedEdgeSampling => {
	const merged = { ...DEFAULT_EDGE_SAMPLING, ...config };
	const offset = Number.isFinite(merged.curveOffset)
		? merged.curveOffset
		: DEFAULT_EDGE_SAMPLING.curveOffset;
	return {
		curveSource: merged.curveSource,
		curveOffset: Math.min(MAX_CURVE_OFFSET, Math.max(MIN_CURVE_OFFSET, offset)),
		divisionsSource: merged.divisionsSource,
		edgeDivisions: normalizeEdgeDivisions(merged.edgeDivisions),
		edgeDivisionsMultiplier: normalizeEdgeDivisionsMultiplier(merged.edgeDivisionsMultiplier)
	};
};

/** Constant-offset curve: each edge point moved `offset` of the way to the polygon center. */
export const offsetCurvePoints = (
	edgePoints: Vector3[],
	center: Vector3,
	offset: number
): Vector3[] => edgePoints.map((p) => p.clone().lerp(center, offset));

/**
 * Curved-offset curve for a whole polygon, the polyhedron version of the Voronoi
 * curved inset: the polygon is the cell and its center the seed. In the polygon's
 * plane each corner gets a quadratic bezier from one edge's straight-inset midpoint,
 * controlled by the inset corner, to the next edge's inset midpoint; each edge takes
 * its half of the two corner curves, split on the corner-to-center line, so the inner
 * line is continuous around the polygon and rounds every corner.
 *
 * `edgePoints` are the polygon's edges in order, each sampled from its start vertex
 * to its end vertex. Returns per edge one inner point per edge point, or null where
 * the edge can't form a full corner pair (the caller keeps the straight offset).
 */
export const curvedOffsetCurvePoints = (
	edgePoints: Vector3[][],
	center: Vector3,
	offset: number
): (Vector3[] | null)[] => {
	const { u, w } = polygonPlaneBasis(edgePoints, center);
	const to2d = (p: Vector3) => {
		const d = p.clone().sub(center);
		return new Vector2(d.dot(u), d.dot(w));
	};
	const to3d = (p: Vector2) => center.clone().addScaledVector(u, p.x).addScaledVector(w, p.y);

	const vertexPos2d = new Map<string, Vector2>();
	const edges: CurvedCellEdge[] = [];
	edgePoints.forEach((pts, edgeId) => {
		if (pts.length < 2) return;
		const start = pts[0];
		const end = pts[pts.length - 1];
		const vKeyStart = vertexKey(start);
		const vKeyEnd = vertexKey(end);
		vertexPos2d.set(vKeyStart, to2d(start));
		vertexPos2d.set(vKeyEnd, to2d(end));
		edges.push({ edgeId, vKeyStart, vKeyEnd, sampleCount: pts.length });
	});

	const curved = buildCellCurvedInsets2d({
		edges,
		vertexPos2d,
		seed2d: new Vector2(0, 0),
		curveOffsetFactor: offset
	});
	return edgePoints.map((_, edgeId) => curved.get(edgeId)?.map(to3d) ?? null);
};

/** Orthonormal in-plane axes for a polygon, from its Newell normal. */
const polygonPlaneBasis = (edgePoints: Vector3[][], center: Vector3) => {
	const vertices = edgePoints.filter((pts) => pts.length > 0).map((pts) => pts[0]);
	const normal = new Vector3();
	vertices.forEach((a, i) => {
		const b = vertices[(i + 1) % vertices.length];
		normal.x += (a.y - b.y) * (a.z + b.z);
		normal.y += (a.z - b.z) * (a.x + b.x);
		normal.z += (a.x - b.x) * (a.y + b.y);
	});
	normal.normalize();
	const u = (vertices[0] ?? center).clone().sub(center);
	u.addScaledVector(normal, -u.dot(normal)).normalize();
	const w = new Vector3().crossVectors(normal, u);
	return { u, w };
};

const KEY_PRECISION = 4;

const vertexKey = (v: Vector3) =>
	v
		.toArray()
		.map((n) => n.toFixed(KEY_PRECISION))
		.join(',');

/** Direction-independent key for a polyhedron edge, so both polygons sharing it agree. */
export const edgeKey = (v0: Vector3, v1: Vector3): string => {
	const a = vertexKey(v0);
	const b = vertexKey(v1);
	return a < b ? `${a}|${b}` : `${b}|${a}`;
};

const DRAPE_SAMPLES = 16;
const RAY_FAR = 2000;

/**
 * Length of the path an edge traces on the surface. Points along the straight edge
 * are ray-cast from the projection center exactly as `generateProjection` casts
 * edge points; the hits form a polyline whose length is returned. If any ray
 * misses, the straight edge length stands in so a count is never missing.
 */
export const drapedEdgeLength = ({
	v0,
	v1,
	surface,
	center,
	samples = DRAPE_SAMPLES
}: {
	v0: Vector3;
	v1: Vector3;
	surface: Object3D;
	center: Vector3;
	samples?: number;
}): number => {
	const raycaster = new Raycaster(undefined, undefined, undefined, RAY_FAR);
	const point = new Vector3();
	const direction = new Vector3();
	let previous: Vector3 | null = null;
	let length = 0;
	for (let i = 0; i <= samples; i++) {
		point.copy(v0).lerp(v1, i / samples);
		direction.copy(center).add(point).normalize();
		raycaster.set(center, direction);
		const hit = raycaster.intersectObject(surface, true)[0];
		if (!hit) return v0.distanceTo(v1);
		if (previous) length += previous.distanceTo(hit.point);
		previous = hit.point.clone();
	}
	return length;
};
