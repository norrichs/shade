import { Object3D, Raycaster, Vector3 } from 'three';

export type SurfaceHit = { point: Vector3; normalWorld: Vector3 };

const DEFAULT_TIE_EPSILON = 0.5;

/**
 * Pure selection rule. Among candidate hits, pick the one nearest the anchor (a known
 * trustworthy surface point). When several are within `tieEpsilon` of the nearest, prefer
 * the one whose world normal best agrees (|dot|) with the cell's plane normal.
 */
export function chooseHit(
	hits: SurfaceHit[],
	anchor: Vector3,
	cellNormal: Vector3,
	tieEpsilon: number = DEFAULT_TIE_EPSILON
): SurfaceHit | null {
	if (hits.length === 0) return null;
	const scored = hits.map((h) => ({ h, d: h.point.distanceTo(anchor) })).sort((a, b) => a.d - b.d);
	const best = scored[0].d;
	const tied = scored.filter((s) => s.d - best <= tieEpsilon);
	if (tied.length === 1) return tied[0].h;
	tied.sort(
		(a, b) => Math.abs(b.h.normalWorld.dot(cellNormal)) - Math.abs(a.h.normalWorld.dot(cellNormal))
	);
	return tied[0].h;
}

/**
 * Cast a ray from `source` through `through`, collect ALL surface intersections, and apply
 * chooseHit. Returns the chosen 3D point or null if the ray misses.
 */
export function selectSurfaceHit(params: {
	surface: Object3D;
	source: Vector3;
	through: Vector3;
	anchor: Vector3;
	cellNormal: Vector3;
	tieEpsilon?: number;
	raycaster?: Raycaster;
}): Vector3 | null {
	const { surface, source, through, anchor, cellNormal } = params;
	const raycaster = params.raycaster ?? new Raycaster();
	raycaster.far = Infinity;
	const dir = through.clone().sub(source);
	if (dir.lengthSq() < 1e-18) return null;
	raycaster.set(source, dir.normalize());
	const intersections = raycaster.intersectObject(surface, true);
	if (intersections.length === 0) return null;

	const hits: SurfaceHit[] = intersections.map((it) => {
		const normalWorld = it.face
			? it.face.normal.clone().transformDirection(it.object.matrixWorld).normalize()
			: dir.clone();
		return { point: it.point.clone(), normalWorld };
	});
	const chosen = chooseHit(hits, anchor, cellNormal, params.tieEpsilon);
	return chosen ? chosen.point.clone() : null;
}
