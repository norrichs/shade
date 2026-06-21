import { Vector3 } from 'three';
import type { SurfaceProjector } from './smooth-chains';

/** Resample a polyline to exactly `count` points, evenly spaced by arc length.
 * Endpoints are preserved. Degenerate inputs (fewer than 2 points, count <= 1,
 * or zero total length) are returned as clones. */
export function resamplePolyline(points: Vector3[], count: number): Vector3[] {
	if (points.length < 2 || count <= 1) return points.map((p) => p.clone());
	const cum: number[] = [0];
	for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]));
	const total = cum[cum.length - 1];
	if (total < 1e-12) return points.map((p) => p.clone());
	const out: Vector3[] = [];
	for (let k = 0; k < count; k++) {
		const target = (k / (count - 1)) * total;
		let seg = 1;
		while (seg < cum.length - 1 && cum[seg] < target) seg++;
		const segLen = cum[seg] - cum[seg - 1];
		const t = segLen < 1e-12 ? 0 : (target - cum[seg - 1]) / segLen;
		out.push(points[seg - 1].clone().lerp(points[seg], t));
	}
	return out;
}

export type StraightenOptions = {
	/** Laplacian step fraction per iteration (0..1). 0.5 is stable. */
	stepFactor: number;
	/** Stop when the max interior point movement in an iteration falls below this. */
	tolerance: number;
	/** Hard cap on iterations. */
	cap: number;
};

/**
 * Straighten a polyline into a geodesic between its fixed endpoints by discrete
 * curve-shortening flow: each iteration nudges interior points toward the
 * midpoint of their neighbors, projects them to the nearest surface point, then
 * redistributes by arc length and re-projects. Converges to the local geodesic
 * (zero geodesic curvature — reads straight from the surface normal).
 *
 * Endpoints are never moved (shared corners stay put). Paths shorter than 4
 * points are returned as clones. Returns a new array the same length as `points`.
 */
export function straightenToGeodesic(
	points: Vector3[],
	projector: SurfaceProjector,
	opts: StraightenOptions
): Vector3[] {
	const n = points.length;
	if (n < 4) return points.map((p) => p.clone());
	const { stepFactor, tolerance, cap } = opts;

	let cur = points.map((p) => p.clone());
	for (let iter = 0; iter < cap; iter++) {
		// Jacobi Laplacian step on interior points, snapped to the surface.
		const next = cur.map((p) => p.clone());
		let maxMove = 0;
		for (let i = 1; i < n - 1; i++) {
			const mid = cur[i - 1].clone().add(cur[i + 1]).multiplyScalar(0.5);
			const moved = cur[i].clone().lerp(mid, stepFactor);
			const snapped = projector.projectClosest(moved).point;
			maxMove = Math.max(maxMove, snapped.distanceTo(cur[i]));
			next[i] = snapped;
		}
		// Redistribute evenly along the curve (curve-shortening bunches points),
		// then re-snap the interior. resamplePolyline preserves endpoints, and
		// next[0]/next[n-1] were never moved, so endpoints stay exact.
		const spread = resamplePolyline(next, n);
		for (let i = 1; i < n - 1; i++) spread[i] = projector.projectClosest(spread[i]).point;
		cur = spread;

		// Convergence signal is the Laplacian+snap displacement (the geodesic-
		// curvature term that drives straightening); the redistribution shuffle is
		// not counted. As the curve approaches a geodesic this term -> 0 regardless.
		if (maxMove < tolerance) break;
	}
	return cur;
}
