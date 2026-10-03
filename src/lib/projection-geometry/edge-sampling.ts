import { Raycaster, Vector3, type Object3D } from 'three';
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

const KEY_PRECISION = 4;

/** Direction-independent key for a polyhedron edge, so both polygons sharing it agree. */
export const edgeKey = (v0: Vector3, v1: Vector3): string => {
	const a = v0
		.toArray()
		.map((n) => n.toFixed(KEY_PRECISION))
		.join(',');
	const b = v1
		.toArray()
		.map((n) => n.toFixed(KEY_PRECISION))
		.join(',');
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
