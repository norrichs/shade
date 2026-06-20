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

	const ensureSlots = () => {
		while (normals.length < positions.length) normals.push(new Vector3());
		while (adjacency.length < positions.length) adjacency.push([]);
	};

	const addEdge = (a: number, b: number) => {
		if (a === b) return;
		const w = positions[a].distanceTo(positions[b]);
		if (!adjacency[a].some((n) => n.to === b)) adjacency[a].push({ to: b, weight: w });
		if (!adjacency[b].some((n) => n.to === a)) adjacency[b].push({ to: a, weight: w });
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
