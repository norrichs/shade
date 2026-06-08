import type { Vector3 } from 'three';

/**
 * Per Voronoi edge, the two inset polylines (one per adjacent cell side) plus the
 * surface-projection intermediate points. Aligned index-for-index with that edge's
 * on-surface `edgePoints3d` from Phase 1.
 *  - curvePointsA[i] / curvePointsB[i]: inset point for sample i, cell-A / cell-B side.
 *  - divsA[i]: intermediate points ordered cA -> edge (exclusive ends).
 *  - divsB[i]: intermediate points ordered edge -> cB (exclusive ends).
 */
export type EdgeInsets = {
	curvePointsA: Vector3[];
	curvePointsB: Vector3[];
	divsA: Vector3[][];
	divsB: Vector3[][];
};
