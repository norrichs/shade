import type { MeshGraph } from './mesh-graph';
import type { GeodesicField } from './geodesic-solver';
import type { BoundaryChain } from './extract-boundaries';
import { OPENING } from '$lib/types';

// Rim corner ids live in a distinct negative namespace so they never collide with
// interior corner ids (>= 0) or the OPENING sentinel (-1).
function rimCorner(vertexId: number): number {
	return -(vertexId + 2);
}

/**
 * Split each rim loop into per-cell chains. A rim vertex's cell is its nearest-seed
 * label; consecutive same-label vertices form one chain bordering that cell on the
 * surface side and an opening on the other (`cellIndices = [cell, OPENING]`). The
 * loop is rotated to start at a label change so runs aren't split across the seam.
 */
export function buildRimChains(
	graph: MeshGraph,
	field: GeodesicField,
	loops: number[][]
): BoundaryChain[] {
	const chains: BoundaryChain[] = [];

	for (const loop of loops) {
		const n = loop.length;
		if (n < 2) continue;
		const labelAt = (k: number) => field[loop[k]].nearestSeed;

		let startOffset = 0;
		for (let i = 0; i < n; i++) {
			if (labelAt(i) !== labelAt((i - 1 + n) % n)) {
				startOffset = i;
				break;
			}
		}
		const order = Array.from({ length: n }, (_, k) => loop[(startOffset + k) % n]);

		let i = 0;
		while (i < n) {
			const cell = field[order[i]].nearestSeed;
			let j = i;
			while (j + 1 < n && field[order[j + 1]].nearestSeed === cell) j++;
			const run = order.slice(i, j + 1);
			if (cell >= 0 && run.length >= 2) {
				chains.push({
					vertices: [rimCorner(run[0]), rimCorner(run[run.length - 1])],
					cellIndices: [cell, OPENING],
					points: run.map((v) => graph.positions[v].clone()),
					normals: run.map((v) => graph.normals[v].clone())
				});
			}
			i = j + 1;
		}
	}

	return chains;
}
