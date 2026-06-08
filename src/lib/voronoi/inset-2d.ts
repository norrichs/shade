import { Vector2 } from 'three';

/**
 * The 2D inset primitive (homothety): move a boundary point a fraction `factor` of the
 * way toward the cell seed. This is the swappable seam — a future perpendicular/bezier
 * offset replaces this module without touching callers.
 */
export function insetPoint2D(point: Vector2, seed: Vector2, factor: number): Vector2 {
	return point.clone().lerp(seed, factor);
}

/**
 * `divisions` intermediate points between the inset point (inset = insetPoint2D(edge,...))
 * and the edge point, ordered inset -> edge. Point d sits at s = d/(divisions+1) of the way
 * from inset to edge. Used to populate the surface-projection tube's intermediate rings.
 */
export function insetIntermediates2D(
	edgePoint: Vector2,
	seed: Vector2,
	factor: number,
	divisions: number
): Vector2[] {
	const inset = insetPoint2D(edgePoint, seed, factor);
	const out: Vector2[] = [];
	for (let d = 1; d <= divisions; d++) {
		const s = d / (divisions + 1);
		out.push(inset.clone().lerp(edgePoint, s));
	}
	return out;
}
