import { Vector3 } from 'three';
import type { SurfaceTriangle } from '../types';

export type GraphNeighbor = { to: number; weight: number };

export type MeshGraph = {
	/** Welded unique vertex positions, indexed by vertex id. */
	positions: Vector3[];
	/** Per-vertex outward unit normal (area-weighted average of incident faces). */
	normals: Vector3[];
	/** Triangles as welded vertex-id triples. */
	faces: [number, number, number][];
	/** adjacency[v] = neighbors of vertex v with Euclidean edge weight. */
	adjacency: GraphNeighbor[][];
};

const QUANTUM = 1e-5;

function keyOf(p: Vector3): string {
	const q = (n: number) => Math.round(n / QUANTUM);
	return `${q(p.x)},${q(p.y)},${q(p.z)}`;
}

/**
 * Build a welded connectivity graph from surface triangles. Vertices within QUANTUM
 * of each other collapse to one id, so UV/topology seams (which duplicate positions)
 * stay connected. Edge weights are Euclidean lengths; normals are area-weighted face
 * normal averages.
 */
export function buildMeshGraph(triangles: SurfaceTriangle[]): MeshGraph {
	const idByKey = new Map<string, number>();
	const positions: Vector3[] = [];
	const faces: [number, number, number][] = [];

	const idFor = (p: Vector3): number => {
		const k = keyOf(p);
		const existing = idByKey.get(k);
		if (existing !== undefined) return existing;
		const id = positions.length;
		idByKey.set(k, id);
		positions.push(p.clone());
		return id;
	};

	const normals: Vector3[] = [];
	const adjacency: GraphNeighbor[][] = [];
	// Per-vertex neighbor sets for O(1) dedup; high-valence vertices (e.g. sphere
	// poles) would make a linear .some() scan O(n^2) on dense meshes.
	const neighborSets: Set<number>[] = [];

	const ensureSlots = () => {
		while (normals.length < positions.length) normals.push(new Vector3());
		while (adjacency.length < positions.length) adjacency.push([]);
		while (neighborSets.length < positions.length) neighborSets.push(new Set());
	};

	const addEdge = (a: number, b: number) => {
		if (a === b) return;
		const w = positions[a].distanceTo(positions[b]);
		if (!neighborSets[a].has(b)) {
			neighborSets[a].add(b);
			adjacency[a].push({ to: b, weight: w });
		}
		if (!neighborSets[b].has(a)) {
			neighborSets[b].add(a);
			adjacency[b].push({ to: a, weight: w });
		}
	};

	for (const t of triangles) {
		const ia = idFor(t[0]);
		const ib = idFor(t[1]);
		const ic = idFor(t[2]);
		ensureSlots();
		if (ia === ib || ib === ic || ia === ic) continue; // degenerate after welding
		faces.push([ia, ib, ic]);

		// Area-weighted face normal accumulation.
		const ab = t[1].clone().sub(t[0]);
		const ac = t[2].clone().sub(t[0]);
		const faceNormal = ab.cross(ac); // length == 2 * area
		normals[ia].add(faceNormal);
		normals[ib].add(faceNormal);
		normals[ic].add(faceNormal);

		addEdge(ia, ib);
		addEdge(ib, ic);
		addEdge(ia, ic);
	}

	for (const n of normals) {
		if (n.lengthSq() < 1e-18) n.set(0, 0, 1);
		else n.normalize();
	}

	return { positions, normals, faces, adjacency };
}

/**
 * Trace the boundary (opening) loops of the mesh. A boundary edge is a welded edge
 * used by exactly one face; boundary edges chain into ordered vertex-id loops, one
 * per opening. A closed mesh (every edge shared by two faces) returns []. "Open" =
 * the returned array is non-empty.
 */
export function traceBoundaryLoops(graph: MeshGraph): number[][] {
	const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

	const incidence = new Map<string, number>();
	for (const [a, b, c] of graph.faces) {
		for (const [u, v] of [
			[a, b],
			[b, c],
			[c, a]
		] as const) {
			const k = key(u, v);
			incidence.set(k, (incidence.get(k) ?? 0) + 1);
		}
	}

	const boundaryAdj = new Map<number, number[]>();
	const seenEdge = new Set<string>();
	const link = (a: number, b: number) => {
		const l = boundaryAdj.get(a);
		if (l) l.push(b);
		else boundaryAdj.set(a, [b]);
	};
	for (const [a, b, c] of graph.faces) {
		for (const [u, v] of [
			[a, b],
			[b, c],
			[c, a]
		] as const) {
			const k = key(u, v);
			if (incidence.get(k) === 1 && !seenEdge.has(k)) {
				seenEdge.add(k);
				link(u, v);
				link(v, u);
			}
		}
	}

	const used = new Set<string>();
	const loops: number[][] = [];
	for (const start of boundaryAdj.keys()) {
		for (const first of boundaryAdj.get(start) ?? []) {
			if (used.has(key(start, first))) continue;
			const loop = [start];
			let prev = start;
			let cur = first;
			used.add(key(prev, cur));
			while (cur !== start) {
				loop.push(cur);
				const nexts = (boundaryAdj.get(cur) ?? []).filter(
					(n) => n !== prev && !used.has(key(cur, n))
				);
				if (nexts.length === 0) break;
				const nx = nexts[0];
				used.add(key(cur, nx));
				prev = cur;
				cur = nx;
			}
			if (loop.length >= 3) loops.push(loop);
		}
	}
	return loops;
}
