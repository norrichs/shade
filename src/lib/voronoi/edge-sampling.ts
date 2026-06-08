import { Vector3 } from 'three';

export type CoordToDirection = (a: number, b: number) => Vector3;

export function sampleEdgeAsDirections(
	v0: [number, number],
	v1: [number, number],
	divisions: number,
	coordToDirection: CoordToDirection
): Vector3[] {
	const dir0 = coordToDirection(v0[0], v0[1]).normalize();
	const dir1 = coordToDirection(v1[0], v1[1]).normalize();
	const directions: Vector3[] = [];
	for (let i = 0; i <= divisions; i++) {
		const t = i / divisions;
		const dir = slerp(dir0, dir1, t);
		directions.push(dir);
	}
	return directions;
}

/**
 * Great-circle arc length (radians) of a Voronoi edge, measured as the angle
 * between its two vertices' surface directions. Used as a length proxy that is
 * consistent with the slerp-based sampling in sampleEdgeAsDirections.
 */
export function edgeArcLength(
	v0: [number, number],
	v1: [number, number],
	coordToDirection: CoordToDirection
): number {
	const d0 = coordToDirection(v0[0], v0[1]).normalize();
	const d1 = coordToDirection(v1[0], v1[1]).normalize();
	const dot = Math.max(-1, Math.min(1, d0.dot(d1)));
	return Math.acos(dot);
}

export function slerp(a: Vector3, b: Vector3, t: number): Vector3 {
	const dot = Math.max(-1, Math.min(1, a.dot(b)));
	const omega = Math.acos(dot);
	if (omega < 1e-10) {
		return a.clone().lerp(b, t);
	}
	const sinOmega = Math.sin(omega);
	const sa = Math.sin((1 - t) * omega) / sinOmega;
	const sb = Math.sin(t * omega) / sinOmega;
	return new Vector3(sa * a.x + sb * b.x, sa * a.y + sb * b.y, sa * a.z + sb * b.z);
}
