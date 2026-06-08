import { Vector2, Vector3 } from 'three';

export type PlaneBasis = { u: Vector3; v: Vector3 };

/** Two orthonormal in-plane axes for a unit (or near-unit) normal. */
export function buildPlaneBasis(normal: Vector3): PlaneBasis {
	const n = normal.clone().normalize();
	const seed = Math.abs(n.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
	const u = seed.sub(n.clone().multiplyScalar(seed.dot(n))).normalize();
	const v = n.clone().cross(u).normalize();
	return { u, v };
}

/** Intersect the ray from `source` through `through` with the plane (planePoint, planeNormal). */
export function intersectRayPlane(
	source: Vector3,
	through: Vector3,
	planePoint: Vector3,
	planeNormal: Vector3
): Vector3 | null {
	const dir = through.clone().sub(source);
	const denom = planeNormal.dot(dir);
	if (Math.abs(denom) < 1e-12) return null;
	const t = planeNormal.dot(planePoint.clone().sub(source)) / denom;
	return source.clone().addScaledVector(dir, t);
}

/**
 * Flatten a 3D point onto the plane as seen from `source`: cast source->point, pierce the
 * plane, and express the pierce point in the 2D basis (origin = planePoint). Null if parallel.
 */
export function projectToPlane2D(
	point: Vector3,
	source: Vector3,
	planePoint: Vector3,
	planeNormal: Vector3,
	basis: PlaneBasis
): Vector2 | null {
	const hit = intersectRayPlane(source, point, planePoint, planeNormal);
	if (!hit) return null;
	const d = hit.sub(planePoint);
	return new Vector2(d.dot(basis.u), d.dot(basis.v));
}

/** Inverse of projectToPlane2D's basis step: a 2D plane coord back to its 3D position. */
export function plane2DToPoint3D(p2d: Vector2, planePoint: Vector3, basis: PlaneBasis): Vector3 {
	return planePoint.clone().addScaledVector(basis.u, p2d.x).addScaledVector(basis.v, p2d.y);
}
