import { Vector3 } from 'three';
import type { VoronoiEdge } from './types';
import type { EdgeProjection } from './project-edges-onto-surface';
import type { EdgeInsets } from './inset-types';
import { slerp, type CoordToDirection } from './edge-sampling';

/**
 * Center-out inset computation (the original spherical-assumption method), now producing the
 * shared EdgeInsets structure consumed by the tube assembly.
 */
export function computeEdgeInsetsCenterOut(params: {
	edges: VoronoiEdge[];
	edgeProjections: EdgeProjection[];
	relaxedSeeds: [number, number][];
	coordToDirection: CoordToDirection;
	center: Vector3;
	intersect: (direction: Vector3) => Vector3 | null;
	curveOffsetFactor: number;
	surfaceProjectionDivisions: number;
}): EdgeInsets[] {
	const {
		edges,
		edgeProjections,
		relaxedSeeds,
		coordToDirection,
		center,
		intersect,
		curveOffsetFactor,
		surfaceProjectionDivisions
	} = params;

	return edges.map((edge, edgeIndex) => {
		const edgePoints3d = edgeProjections[edgeIndex].edgePoints3d;
		const [cellIdxA, cellIdxB] = edge.cellIndices;
		const cellDirA = coordToDirection(
			relaxedSeeds[cellIdxA][0],
			relaxedSeeds[cellIdxA][1]
		).normalize();
		const cellDirB = coordToDirection(
			relaxedSeeds[cellIdxB][0],
			relaxedSeeds[cellIdxB][1]
		).normalize();

		const curvePointsA: Vector3[] = [];
		const curvePointsB: Vector3[] = [];
		const divsA: Vector3[][] = [];
		const divsB: Vector3[][] = [];

		for (const point3d of edgePoints3d) {
			const edgeDir = point3d.clone().sub(center).normalize();

			const curveHitA = intersect(slerp(edgeDir, cellDirA, curveOffsetFactor));
			const cA = curveHitA ?? point3d.clone();
			curvePointsA.push(cA);

			const curveHitB = intersect(slerp(edgeDir, cellDirB, curveOffsetFactor));
			const cB = curveHitB ?? point3d.clone();
			curvePointsB.push(cB);

			const divA: Vector3[] = [];
			const divB: Vector3[] = [];
			if (surfaceProjectionDivisions > 0) {
				const cADir = cA.clone().sub(center).normalize();
				const cBDir = cB.clone().sub(center).normalize();
				for (let d = 1; d <= surfaceProjectionDivisions; d++) {
					const t = d / (surfaceProjectionDivisions + 1);
					const hitA = intersect(slerp(cADir, edgeDir, t));
					if (hitA) divA.push(hitA);
					const hitB = intersect(slerp(edgeDir, cBDir, t));
					if (hitB) divB.push(hitB);
				}
			}
			divsA.push(divA);
			divsB.push(divB);
		}

		return { curvePointsA, curvePointsB, divsA, divsB };
	});
}
