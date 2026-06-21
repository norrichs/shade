import { Vector3 } from 'three';
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
 * label; each maximal run of same-cell rim vertices becomes one chain bordering that
 * cell on the surface side and an opening on the other (`cellIndices = [cell, OPENING]`).
 *
 * Each run is padded on both ends with a transition point — the tie-point on the rim
 * edge where the two neighbouring cells' geodesic distances balance (the same point
 * where the interior cell-cell boundary reaches the rim). This means even a cell that
 * touches the rim at a single vertex yields a valid (>=2 point) chain, and adjacent
 * cells share the transition point so the rim is covered without gaps.
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

		const wrap = (k: number) => ((k % n) + n) % n;
		const vertexAt = (k: number) => loop[wrap(k)];
		const labelAt = (k: number) => field[vertexAt(k)].nearestSeed;

		// Tie-point on the rim edge between rim vertices k and k+1: the point where the
		// two cells' geodesic distances balance (matches interior-edge corners on the rim).
		const transitionAt = (k: number): { point: Vector3; normal: Vector3 } => {
			const a = vertexAt(k);
			const b = vertexAt(k + 1);
			const pa = graph.positions[a];
			const pb = graph.positions[b];
			const L = pa.distanceTo(pb);
			const da = field[a].distance;
			const db = field[b].distance;
			let t = L > 1e-12 ? (db - da + L) / (2 * L) : 0.5;
			t = Math.min(1, Math.max(0, t));
			return {
				point: pa.clone().lerp(pb, t),
				normal: graph.normals[a].clone().lerp(graph.normals[b], t).normalize()
			};
		};

		// Stable, shared corner id per rim edge (transition between vertices k and k+1),
		// in a namespace below rimCorner so it never collides.
		const transitionCorner = new Map<string, number>();
		const cornerOf = (k: number): number => {
			const a = vertexAt(k);
			const b = vertexAt(k + 1);
			const key = a < b ? `${a}:${b}` : `${b}:${a}`;
			let id = transitionCorner.get(key);
			if (id === undefined) {
				id = -(graph.positions.length + 2 + transitionCorner.size);
				transitionCorner.set(key, id);
			}
			return id;
		};

		// Find the first label change. If there is none, the whole rim borders one cell.
		let firstChange = -1;
		for (let i = 0; i < n; i++) {
			if (labelAt(i) !== labelAt(i - 1)) {
				firstChange = i;
				break;
			}
		}

		if (firstChange === -1) {
			const cell = labelAt(0);
			if (cell >= 0) {
				chains.push({
					vertices: [rimCorner(loop[0]), rimCorner(loop[0])],
					cellIndices: [cell, OPENING],
					points: loop.map((v) => graph.positions[v].clone()),
					normals: loop.map((v) => graph.normals[v].clone())
				});
			}
			continue;
		}

		// Walk runs starting at the first change, padding each with its boundary tie-points.
		let i = firstChange;
		let count = 0;
		while (count < n) {
			const cell = labelAt(i);
			let runLen = 1;
			while (count + runLen < n && labelAt(i + runLen) === cell) runLen++;
			const b = i + runLen - 1;

			if (cell >= 0) {
				const before = transitionAt(i - 1); // tie-point between vertex i-1 and i
				const after = transitionAt(b); // tie-point between vertex b and b+1
				const points: Vector3[] = [before.point];
				const normals: Vector3[] = [before.normal];
				for (let k = i; k <= b; k++) {
					points.push(graph.positions[vertexAt(k)].clone());
					normals.push(graph.normals[vertexAt(k)].clone());
				}
				points.push(after.point);
				normals.push(after.normal);
				chains.push({
					vertices: [cornerOf(i - 1), cornerOf(b)],
					cellIndices: [cell, OPENING],
					points,
					normals
				});
			}

			count += runLen;
			i += runLen;
		}
	}

	return chains;
}
