import { Object3D, Raycaster, Vector3 } from 'three';
import type { VoronoiEdge } from './types';
import { sampleEdgeAsDirections, type CoordToDirection } from './edge-sampling';

export type EdgeProjection = { edgePoints3d: Vector3[]; normals: Vector3[] };

/**
 * Phase 1 (shared): for every Voronoi edge, sample directions along the edge, raycast them
 * from `center` onto the surface to get on-surface points, and compute a per-point surface
 * normal. This is the center-out edge placement reused by both inset methods.
 */
export function projectEdgesOntoSurface(params: {
	edges: VoronoiEdge[];
	edgeDivisionCounts: number[];
	coordToDirection: CoordToDirection;
	center: Vector3;
	surface: Object3D;
	intersect: (direction: Vector3) => Vector3 | null;
}): EdgeProjection[] {
	const { edges, edgeDivisionCounts, coordToDirection, center, surface, intersect } = params;
	const normalRaycaster = new Raycaster(undefined, undefined, undefined, 2000);

	return edges.map((edge, edgeIndex) => {
		const directions = sampleEdgeAsDirections(
			edge.vertices[0],
			edge.vertices[1],
			edgeDivisionCounts[edgeIndex],
			coordToDirection
		);
		const edgePoints3d: Vector3[] = [];
		const normals: Vector3[] = [];

		for (const dir of directions) {
			const point3d = intersect(dir);
			if (!point3d) continue;
			edgePoints3d.push(point3d);

			normalRaycaster.set(center, dir.clone().normalize());
			const hits = normalRaycaster.intersectObject(surface, true);
			if (hits.length > 0 && hits[0].face) {
				normals.push(
					hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld).normalize()
				);
			} else {
				normals.push(dir.clone().normalize());
			}
		}

		return { edgePoints3d, normals };
	});
}
