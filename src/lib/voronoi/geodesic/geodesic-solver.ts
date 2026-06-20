import type { MeshGraph } from './mesh-graph';

export type GeodesicField = { nearestSeed: number; distance: number }[];

export interface GeodesicSolver {
	/**
	 * Multi-source shortest path. seedVertexIds[i] is the graph vertex for seed i;
	 * returns, per graph vertex, the nearest seed index and its distance. Vertices
	 * unreachable from any source get nearestSeed -1 and distance Infinity.
	 */
	solveMultiSource(seedVertexIds: number[]): GeodesicField;
}

/** Minimal binary min-heap over (vertex, dist) keyed by dist. */
class MinHeap {
	private v: number[] = [];
	private d: number[] = [];
	get size(): number {
		return this.v.length;
	}
	push(vertex: number, dist: number): void {
		this.v.push(vertex);
		this.d.push(dist);
		let i = this.v.length - 1;
		while (i > 0) {
			const p = (i - 1) >> 1;
			if (this.d[p] <= this.d[i]) break;
			this.swap(i, p);
			i = p;
		}
	}
	pop(): { vertex: number; dist: number } {
		const vertex = this.v[0];
		const dist = this.d[0];
		const lastV = this.v.pop()!;
		const lastD = this.d.pop()!;
		if (this.v.length > 0) {
			this.v[0] = lastV;
			this.d[0] = lastD;
			let i = 0;
			const n = this.v.length;
			for (;;) {
				const l = 2 * i + 1;
				const r = 2 * i + 2;
				let s = i;
				if (l < n && this.d[l] < this.d[s]) s = l;
				if (r < n && this.d[r] < this.d[s]) s = r;
				if (s === i) break;
				this.swap(i, s);
				i = s;
			}
		}
		return { vertex, dist };
	}
	private swap(i: number, j: number): void {
		[this.v[i], this.v[j]] = [this.v[j], this.v[i]];
		[this.d[i], this.d[j]] = [this.d[j], this.d[i]];
	}
}

export class DijkstraGeodesicSolver implements GeodesicSolver {
	constructor(private readonly graph: MeshGraph) {}

	solveMultiSource(seedVertexIds: number[]): GeodesicField {
		const n = this.graph.positions.length;
		const field: GeodesicField = new Array(n);
		for (let i = 0; i < n; i++) field[i] = { nearestSeed: -1, distance: Infinity };

		const heap = new MinHeap();
		seedVertexIds.forEach((vid, seedIndex) => {
			if (vid < 0 || vid >= n) return;
			if (0 < field[vid].distance) {
				field[vid] = { nearestSeed: seedIndex, distance: 0 };
				heap.push(vid, 0);
			}
		});

		while (heap.size > 0) {
			const { vertex, dist } = heap.pop();
			if (dist > field[vertex].distance) continue; // stale entry
			for (const { to, weight } of this.graph.adjacency[vertex]) {
				const nd = dist + weight;
				if (nd < field[to].distance) {
					field[to] = { nearestSeed: field[vertex].nearestSeed, distance: nd };
					heap.push(to, nd);
				}
			}
		}

		return field;
	}
}
