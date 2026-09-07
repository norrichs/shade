/**
 * Threlte's pointer events report ALL meshes under the cursor (`ev.intersections`
 * is depth-sorted, nearest first). For selection we only want the nearest hit —
 * otherwise a click also lands on back-faces / occluded facets behind it.
 *
 * Returns true only when the event's own object is the nearest intersection.
 */
export const isNearestIntersection = (ev: {
	object?: unknown;
	intersections?: { object: unknown }[];
}): boolean => ev.intersections?.[0]?.object === ev.object;

/**
 * Snap a pointer hit to the nearest vertex of the mesh it hit.
 *
 * Reads the hit mesh's own position attribute rather than a typed geometry
 * wrapper, so one implementation serves globule bands, projection facets,
 * voronoi facets and anything else that becomes clickable later.
 *
 * Only the NEAREST intersection is honoured. Threlte reports every mesh under
 * the cursor in `ev.intersections`, depth-sorted; acting on a non-nearest hit
 * would place points on back-faces and occluded geometry. This is the same
 * guarantee `isNearestIntersection` gives selection.
 */
import { Vector3 } from 'three';
import type { BufferGeometry, Mesh } from 'three';

type PointerHit = {
	object?: unknown;
	point?: Vector3;
	intersections?: { object: unknown; point?: Vector3 }[];
};

const geometryOf = (object: unknown): BufferGeometry | null => {
	const geometry = (object as Mesh | undefined)?.geometry;
	return geometry && 'attributes' in geometry ? (geometry as BufferGeometry) : null;
};

export const nearestVertexFromEvent = (ev: PointerHit): Vector3 | null => {
	if (!isNearestIntersection(ev)) return null;
	if (!ev.point) return null;

	const mesh = ev.object as Mesh;
	const geometry = geometryOf(mesh);
	const position = geometry?.getAttribute('position');
	if (!position) return null;

	const candidate = new Vector3();
	let closest: Vector3 | null = null;
	let closestDistance = Infinity;

	for (let i = 0; i < position.count; i++) {
		candidate.fromBufferAttribute(position, i);
		// Vertices are stored in local space; the indicators are placed in world
		// space, so convert before comparing.
		if (mesh.matrixWorld) candidate.applyMatrix4(mesh.matrixWorld);
		const distance = candidate.distanceToSquared(ev.point);
		if (distance < closestDistance) {
			closestDistance = distance;
			closest = candidate.clone();
		}
	}

	return closest;
};
