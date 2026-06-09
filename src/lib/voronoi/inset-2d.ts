import { Vector2 } from 'three';

/**
 * The 2D inset primitive (homothety): move a boundary point a fraction `factor` of the
 * way toward the cell seed.
 */
export function insetPoint2D(point: Vector2, seed: Vector2, factor: number): Vector2 {
	return point.clone().lerp(seed, factor);
}

/**
 * `divisions` points evenly spaced strictly between `from` and `to`, ordered from->to.
 * Point d sits at s = d/(divisions+1) of the way from `from` to `to`.
 */
export function segmentIntermediates2D(from: Vector2, to: Vector2, divisions: number): Vector2[] {
	const out: Vector2[] = [];
	for (let d = 1; d <= divisions; d++) {
		const s = d / (divisions + 1);
		out.push(from.clone().lerp(to, s));
	}
	return out;
}

/**
 * `divisions` intermediate points between the inset point (insetPoint2D(edge,...)) and the
 * edge point, ordered inset -> edge. Used to populate the surface-projection tube rings.
 */
export function insetIntermediates2D(
	edgePoint: Vector2,
	seed: Vector2,
	factor: number,
	divisions: number
): Vector2[] {
	const inset = insetPoint2D(edgePoint, seed, factor);
	return segmentIntermediates2D(inset, edgePoint, divisions);
}
