import { Vector3 } from 'three';
import type { MeshGraph } from './mesh-graph';
import type { GeodesicField } from './geodesic-solver';

/** A raw (un-resampled) Voronoi boundary chain on the surface. */
export type BoundaryChain = {
	/**
	 * [startCornerId, endCornerId] — stable keys shared with adjacent chains so
	 * corners stitch. A closed-loop boundary (a cell fully enclosed by one other,
	 * which only arises with very few seeds) has both ids equal: vertices[0] ===
	 * vertices[1]. Consumers using these as stitch keys should treat that as a loop.
	 */
	vertices: [number, number];
	/** The two cells this chain separates. */
	cellIndices: [number, number];
	/** Ordered on-surface polyline points, start corner -> end corner. */
	points: Vector3[];
	/** Per-point unit normals, parallel to `points`. */
	normals: Vector3[];
};

type Node = { id: number; pos: Vector3; normal: Vector3 };
type Segment = { aNode: number; bNode: number; cellLo: number; cellHi: number };

function edgeKey(i: number, j: number): string {
	return i < j ? `e${i}:${j}` : `e${j}:${i}`;
}

const pairKey = (lo: number, hi: number): string => `${lo}:${hi}`;

export function extractBoundaries(graph: MeshGraph, field: GeodesicField): BoundaryChain[] {
	const nodes: Node[] = [];
	const nodeIdByKey = new Map<string, number>();

	const addNode = (key: string, pos: Vector3, normal: Vector3): number => {
		const existing = nodeIdByKey.get(key);
		if (existing !== undefined) return existing;
		const id = nodes.length;
		nodeIdByKey.set(key, id);
		nodes.push({ id, pos, normal });
		return id;
	};

	/** Compute or retrieve the crossing node on edge (i,j) between two cell labels. */
	const crossingNode = (i: number, j: number): number => {
		const key = edgeKey(i, j);
		const existing = nodeIdByKey.get(key);
		if (existing !== undefined) return existing;
		const pi = graph.positions[i];
		const pj = graph.positions[j];
		const L = pi.distanceTo(pj);
		const di = field[i].distance;
		const dj = field[j].distance;
		// t is the parameter on edge i→j where the two cells' distances balance:
		//   di + t*L = dj + (1-t)*L  →  t = (dj - di + L) / (2L)
		let t = L > 1e-12 ? (dj - di + L) / (2 * L) : 0.5;
		t = Math.min(1, Math.max(0, t));
		const pos = pi.clone().lerp(pj, t);
		const normal = graph.normals[i].clone().lerp(graph.normals[j], t).normalize();
		return addNode(key, pos, normal);
	};

	const segments: Segment[] = [];

	const pushSegment = (na: number, nb: number, c0: number, c1: number) => {
		if (na === nb) return;
		const lo = Math.min(c0, c1);
		const hi = Math.max(c0, c1);
		segments.push({ aNode: na, bNode: nb, cellLo: lo, cellHi: hi });
	};

	graph.faces.forEach((face, faceIndex) => {
		const [a, b, c] = face;
		const la = field[a].nearestSeed;
		const lb = field[b].nearestSeed;
		const lc = field[c].nearestSeed;
		// Skip faces with unresolved vertices (unreachable from seeds)
		if (la < 0 || lb < 0 || lc < 0) return;
		const distinct = new Set([la, lb, lc]);
		if (distinct.size === 1) return; // interior face

		if (distinct.size === 2) {
			// One vertex differs from the other two — find the "odd" vertex and
			// produce a segment crossing the two edges incident to it.
			let odd: number, p: number, q: number;
			if (la === lb) {
				odd = c;
				p = a;
				q = b;
			} else if (lb === lc) {
				odd = a;
				p = b;
				q = c;
			} else {
				// la === lc, lb is odd
				odd = b;
				p = a;
				q = c;
			}
			const n1 = crossingNode(p, odd);
			const n2 = crossingNode(q, odd);
			pushSegment(n1, n2, field[p].nearestSeed, field[odd].nearestSeed);
			return;
		}

		// Three distinct labels — compute triple point, then three segments to edge crossings.
		const pa = graph.positions[a];
		const pb = graph.positions[b];
		const pc = graph.positions[c];
		const da = field[a].distance;
		const db = field[b].distance;
		const dc = field[c].distance;

		let tp: Vector3;
		if (da < 1e-9 || db < 1e-9 || dc < 1e-9) {
			// Fallback to centroid if any vertex is a seed (distance ≈ 0)
			tp = pa.clone().add(pb).add(pc).divideScalar(3);
		} else {
			const wa = 1 / da;
			const wb = 1 / db;
			const wc = 1 / dc;
			tp = pa
				.clone()
				.multiplyScalar(wa)
				.addScaledVector(pb, wb)
				.addScaledVector(pc, wc)
				.divideScalar(wa + wb + wc);
		}

		const tpNormal = graph.normals[a]
			.clone()
			.add(graph.normals[b])
			.add(graph.normals[c])
			.normalize();
		const tpNode = addNode(`t${faceIndex}`, tp, tpNormal);

		const nAB = crossingNode(a, b);
		const nBC = crossingNode(b, c);
		const nAC = crossingNode(a, c);

		pushSegment(tpNode, nAB, la, lb);
		pushSegment(tpNode, nBC, lb, lc);
		pushSegment(tpNode, nAC, la, lc);
	});

	// Stitch segments into chains grouped by cell pair.
	const byPair = new Map<string, Segment[]>();
	for (const s of segments) {
		const k = pairKey(s.cellLo, s.cellHi);
		const list = byPair.get(k);
		if (list) list.push(s);
		else byPair.set(k, [s]);
	}

	const chains: BoundaryChain[] = [];

	for (const [, segs] of byPair) {
		const cellLo = segs[0].cellLo;
		const cellHi = segs[0].cellHi;

		// Build adjacency list for this cell pair's segment graph.
		const nbr = new Map<number, number[]>();
		const link = (x: number, y: number) => {
			const l = nbr.get(x);
			if (l) l.push(y);
			else nbr.set(x, [y]);
		};
		for (const s of segs) {
			link(s.aNode, s.bNode);
			link(s.bNode, s.aNode);
		}

		const used = new Set<string>();
		const segKey = (x: number, y: number) => (x < y ? `${x}-${y}` : `${y}-${x}`);

		// Prefer to start walks from degree-1 endpoints (chain ends) to avoid mid-chain starts.
		const endNodes = [...nbr.keys()].filter((id) => (nbr.get(id) ?? []).length === 1);
		const seeds = endNodes.length > 0 ? endNodes : [...nbr.keys()];

		for (const start of seeds) {
			for (const first of nbr.get(start) ?? []) {
				if (used.has(segKey(start, first))) continue;
				const order: number[] = [start];
				let prev = start;
				let cur = first;
				used.add(segKey(prev, cur));
				order.push(cur);

				// Walk until no unused forward edge exists.
				for (;;) {
					const candidates = (nbr.get(cur) ?? []).filter(
						(nx) => nx !== prev && !used.has(segKey(cur, nx))
					);
					if (candidates.length === 0) break;
					const nx = candidates[0];
					used.add(segKey(cur, nx));
					order.push(nx);
					prev = cur;
					cur = nx;
				}

				if (order.length < 2) continue;
				const points = order.map((id) => nodes[id].pos.clone());
				const normals = order.map((id) => nodes[id].normal.clone());
				chains.push({
					vertices: [order[0], order[order.length - 1]],
					cellIndices: [cellLo, cellHi],
					points,
					normals
				});
			}
		}
	}

	return chains;
}
