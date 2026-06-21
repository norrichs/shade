import { Vector3 } from 'three';

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
