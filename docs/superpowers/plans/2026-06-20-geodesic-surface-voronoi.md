# Geodesic Surface Voronoi Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a center-free, geodesic (along-surface) Voronoi pipeline that runs in parallel with the existing UV/spherical pipelines and produces the same `Tube[]`/`Band[]` output, so cells are undistorted on non-spherical geometry.

**Architecture:** A new `src/lib/voronoi/geodesic/` module computes Voronoi cells by multi-source Dijkstra over a welded mesh graph, extracts cell-boundary polylines via dual-edge tracing, and emits the exact intermediate shape (`VoronoiEdge[]` with synthetic corner keys + `EdgeProjection[]` + per-cell `seedPoints3d[]`) that the existing center-free local-projection inset and tube-assembly code already consume. `makeVoronoi` is refactored so its inset→tube→fill→partner-matching back-half is shared by both the existing center-based front-half and the new geodesic front-half, dispatched on `voronoiMethod === 'geodesic'`.

**Tech Stack:** TypeScript, Three.js (`Vector3`, `Object3D`), Jest. No new runtime dependencies.

---

## Background: what the geodesic front-half must produce

The existing back-half of `makeVoronoi` (src/lib/voronoi/generate-voronoi.ts:318-502) consumes exactly three things, all index-parallel where noted:

- `edges: VoronoiEdge[]` — `{ vertices: [[number,number],[number,number]], cellIndices: [number,number] }`. `cellIndices` is the real pair of cells a boundary separates. `vertices` is used **only as stable keys** (via `vertexKey` in curved-inset-2d.ts and for cell→edge grouping in local-projection.ts) — never as coordinates. So the geodesic path encodes each Voronoi corner as a unique integer `cid` packed as `[cid, 0]`; two edges meeting at the same corner share the same pair → same key.
- `edgeProjections: EdgeProjection[]` — `{ edgePoints3d: Vector3[]; normals: Vector3[] }`, parallel to `edges`. The real on-surface polyline + per-point surface normal.
- `seedPoints3d: (Vector3 | null)[]` — per-cell seed position on the surface (index = cell id).

`computeEdgeInsetsLocalProjection` (local-projection.ts:42) already takes precisely `{ edges, edgeProjections, seedPoints3d, surface, surfaceCenter, curveOffsetFactor, surfaceProjectionDivisions, curvedInset }` and is fully center-free (it uses `surfaceCenter` only to orient fitted plane normals outward — a bounding centroid works). So the geodesic path reuses it verbatim.

---

## File Structure

**New files:**

- `src/lib/voronoi/geodesic/mesh-graph.ts` — welded vertex/edge/face adjacency graph + per-vertex normals, built from `SurfaceTriangle[]`.
- `src/lib/voronoi/geodesic/geodesic-solver.ts` — `GeodesicSolver` interface + `DijkstraGeodesicSolver`.
- `src/lib/voronoi/geodesic/extract-boundaries.ts` — dual-edge tracing: labels → boundary chains (raw polylines + normals + corner ids + cell pairs).
- `src/lib/voronoi/geodesic/geodesic-voronoi.ts` — orchestrator: seeds → graph → solve (+Lloyd) → boundaries → resample → `{ edges, edgeProjections, seedPoints3d }`.
- `src/lib/voronoi/geodesic/__tests__/mesh-graph.test.ts`
- `src/lib/voronoi/geodesic/__tests__/geodesic-solver.test.ts`
- `src/lib/voronoi/geodesic/__tests__/extract-boundaries.test.ts`
- `src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts`
- `src/routes/sandbox-geodesic-voronoi/+page.svelte` — optional visual check (Task 10).

**Modified files:**

- `src/lib/voronoi/types.ts` — add `'geodesic'` to `VoronoiMethod`.
- `src/lib/voronoi/generate-voronoi.ts` — extract shared `assembleVoronoiTubes`; dispatch to geodesic front-half.
- `src/lib/voronoi/migrate-voronoi-config.ts` — coerce invalid combos when geodesic.
- `src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts` — coercion tests.
- `src/components/controls/VoronoiControl.svelte` — add "Geodesic" option; disable center-only controls.

---

## Task 1: Mesh graph (weld + adjacency + normals)

Builds a connectivity graph from surface triangles, welding coincident vertices by quantized position so UV seams don't disconnect the graph.

**Files:**

- Create: `src/lib/voronoi/geodesic/mesh-graph.ts`
- Test: `src/lib/voronoi/geodesic/__tests__/mesh-graph.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import { buildMeshGraph } from '../mesh-graph';
import type { SurfaceTriangle } from '$lib/voronoi/types';

const tri = (a: number[], b: number[], c: number[]): SurfaceTriangle => [
	new Vector3(...a),
	new Vector3(...b),
	new Vector3(...c)
];

describe('buildMeshGraph', () => {
	it('welds coincident vertices shared by two triangles', () => {
		// Two triangles sharing edge (0,0,0)-(1,0,0).
		const tris = [tri([0, 0, 0], [1, 0, 0], [0, 1, 0]), tri([1, 0, 0], [0, 0, 0], [1, 1, 0])];
		const g = buildMeshGraph(tris);
		// 4 unique positions despite 6 corner instances.
		expect(g.positions.length).toBe(4);
		expect(g.faces.length).toBe(2);
	});

	it('produces symmetric adjacency with Euclidean weights', () => {
		const tris = [tri([0, 0, 0], [2, 0, 0], [0, 2, 0])];
		const g = buildMeshGraph(tris);
		const a = 0;
		const neighborsOfA = g.adjacency[a];
		// Every neighbor lists `a` back, with matching weight.
		for (const { to, weight } of neighborsOfA) {
			const back = g.adjacency[to].find((n) => n.to === a);
			expect(back).toBeDefined();
			expect(back!.weight).toBeCloseTo(weight, 9);
		}
	});

	it('bridges a seam where two triangles use distinct-but-coincident vertex objects', () => {
		// Same geometry as the welding test but separate Vector3 instances at the seam.
		const tris = [tri([0, 0, 0], [1, 0, 0], [0, 1, 0]), tri([1, 0, 0], [0, 0, 0], [1, -1, 0])];
		const g = buildMeshGraph(tris);
		// Vertex at (0,0,0) must connect into both triangles.
		const origin = g.positions.findIndex((p) => p.length() < 1e-9);
		expect(origin).toBeGreaterThanOrEqual(0);
		expect(g.adjacency[origin].length).toBeGreaterThanOrEqual(3);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/mesh-graph.test.ts`
Expected: FAIL — `buildMeshGraph` is not defined / module not found.

- [ ] **Step 3: Write the implementation**

```ts
import { Vector3 } from 'three';
import type { SurfaceTriangle } from '$lib/voronoi/types';

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/mesh-graph.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/geodesic/mesh-graph.ts src/lib/voronoi/geodesic/__tests__/mesh-graph.test.ts
git commit -m "feat(voronoi): add welded mesh graph for geodesic pipeline"
```

---

## Task 2: Geodesic solver (multi-source Dijkstra)

`GeodesicSolver` interface (clean seam for a future heat-method solver) with a binary-heap multi-source Dijkstra implementation.

**Files:**

- Create: `src/lib/voronoi/geodesic/geodesic-solver.ts`
- Test: `src/lib/voronoi/geodesic/__tests__/geodesic-solver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import { buildMeshGraph } from '../mesh-graph';
import { DijkstraGeodesicSolver } from '../geodesic-solver';
import type { SurfaceTriangle } from '$lib/voronoi/types';

/** A flat NxN grid of unit quads, each split into 2 triangles, in the z=0 plane. */
function gridMesh(n: number): SurfaceTriangle[] {
	const v = (x: number, y: number) => new Vector3(x, y, 0);
	const tris: SurfaceTriangle[] = [];
	for (let y = 0; y < n; y++) {
		for (let x = 0; x < n; x++) {
			tris.push([v(x, y), v(x + 1, y), v(x, y + 1)]);
			tris.push([v(x + 1, y), v(x + 1, y + 1), v(x, y + 1)]);
		}
	}
	return tris;
}

describe('DijkstraGeodesicSolver', () => {
	it('returns 0 distance at each source and nearest-source labels', () => {
		const g = buildMeshGraph(gridMesh(4));
		const solver = new DijkstraGeodesicSolver(g);
		// two sources: the corner near (0,0) and the corner near (4,4)
		const s0 = g.positions.findIndex((p) => p.distanceTo(new Vector3(0, 0, 0)) < 1e-6);
		const s1 = g.positions.findIndex((p) => p.distanceTo(new Vector3(4, 4, 0)) < 1e-6);
		const field = solver.solveMultiSource([s0, s1]);
		expect(field[s0].distance).toBeCloseTo(0, 9);
		expect(field[s1].distance).toBeCloseTo(0, 9);
		expect(field[s0].nearestSeed).toBe(0); // first source -> seed index 0
		expect(field[s1].nearestSeed).toBe(1);
	});

	it('labels each vertex by its nearest source', () => {
		const g = buildMeshGraph(gridMesh(4));
		const solver = new DijkstraGeodesicSolver(g);
		const s0 = g.positions.findIndex((p) => p.distanceTo(new Vector3(0, 0, 0)) < 1e-6);
		const s1 = g.positions.findIndex((p) => p.distanceTo(new Vector3(4, 4, 0)) < 1e-6);
		const field = solver.solveMultiSource([s0, s1]);
		const near00 = g.positions.findIndex((p) => p.distanceTo(new Vector3(1, 1, 0)) < 1e-6);
		const near44 = g.positions.findIndex((p) => p.distanceTo(new Vector3(3, 3, 0)) < 1e-6);
		expect(field[near00].nearestSeed).toBe(0);
		expect(field[near44].nearestSeed).toBe(1);
	});

	it('distance along grid edges from a single source is finite and monotone-ish', () => {
		const g = buildMeshGraph(gridMesh(3));
		const solver = new DijkstraGeodesicSolver(g);
		const s0 = g.positions.findIndex((p) => p.distanceTo(new Vector3(0, 0, 0)) < 1e-6);
		const field = solver.solveMultiSource([s0]);
		const far = g.positions.findIndex((p) => p.distanceTo(new Vector3(3, 3, 0)) < 1e-6);
		// Straight-line distance is sqrt(18) ~= 4.24; graph distance is >= that and finite.
		expect(field[far].distance).toBeGreaterThanOrEqual(Math.sqrt(18) - 1e-9);
		expect(Number.isFinite(field[far].distance)).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/geodesic-solver.test.ts`
Expected: FAIL — `DijkstraGeodesicSolver` not defined.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/geodesic-solver.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/geodesic/geodesic-solver.ts src/lib/voronoi/geodesic/__tests__/geodesic-solver.test.ts
git commit -m "feat(voronoi): add multi-source Dijkstra geodesic solver"
```

---

## Task 3: Boundary extraction (dual-edge tracing)

Turn per-vertex nearest-seed labels into per-cell-pair boundary chains, each a raw polyline of 3D points + normals, with stable corner ids at the ends.

**Files:**

- Create: `src/lib/voronoi/geodesic/extract-boundaries.ts`
- Test: `src/lib/voronoi/geodesic/__tests__/extract-boundaries.test.ts`

**Algorithm:**

- For each face `(a,b,c)` with labels `(la,lb,lc)`:
  - all equal → interior, skip.
  - exactly two distinct labels (one vertex differs, e.g. `la==lb != lc`) → one boundary **segment** crossing the two differing mesh edges. Crossing point on edge `(vi:li, vj:lj)` (li≠lj) is at parameter `t = clamp((dj - di + L) / (2L), 0, 1)` where `L=|vi-vj|`, `di/dj` the geodesic distances — the point where the two cells' distances balance. Segment endpoints are the two edge-crossing points; segment separates cells `(li, lj)`.
  - three distinct labels → a **triple-point** at the face (the geodesic Voronoi corner; approximate as the distance-weighted point `sum(vi / di) / sum(1/di)`, falling back to centroid if any `di≈0`), plus three segments from the triple-point to each of the three edge-crossing points, each separating the corresponding cell pair.
- **Corner ids:** assign a stable id to each edge-crossing (keyed by the welded edge `min(vi,vj)-max(vi,vj)`) and to each triple-point (keyed by face index). A crossing shared by two adjacent faces gets the same id → chains stitch.
- **Stitch:** group segments by unordered cell-pair, then chain segments sharing corner ids into ordered polylines. Each maximal chain becomes one boundary with `vertices = [startCornerId, endCornerId]`.
- **Normals:** edge-crossing normal = lerp of the two endpoint vertex normals by `t`; triple-point normal = normalized average of the face's 3 vertex normals.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import { buildMeshGraph } from '../mesh-graph';
import { extractBoundaries } from '../extract-boundaries';
import type { SurfaceTriangle } from '$lib/voronoi/types';
import type { GeodesicField } from '../geodesic-solver';

const tri = (a: number[], b: number[], c: number[]): SurfaceTriangle => [
	new Vector3(...a),
	new Vector3(...b),
	new Vector3(...c)
];

describe('extractBoundaries', () => {
	it('produces one segment for a two-label triangle, midpoint-crossing when distances tie', () => {
		// Single triangle, vertices 0,1 in cell 0, vertex 2 in cell 1, all distance 1.
		const g = buildMeshGraph([tri([0, 0, 0], [2, 0, 0], [0, 2, 0])]);
		const field: GeodesicField = g.positions.map(() => ({ nearestSeed: 0, distance: 1 }));
		// label vertex nearest (0,2,0) as cell 1
		const v2 = g.positions.findIndex((p) => p.distanceTo(new Vector3(0, 2, 0)) < 1e-6);
		field[v2] = { nearestSeed: 1, distance: 1 };

		const chains = extractBoundaries(g, field);
		expect(chains.length).toBe(1);
		expect(new Set(chains[0].cellIndices)).toEqual(new Set([0, 1]));
		// Two crossing points; with equal distances, each sits at the edge midpoint.
		expect(chains[0].points.length).toBe(2);
		for (const p of chains[0].points) {
			// midpoints of the two edges incident to v2: (0,1,0) and (1,1,0)
			const isMid =
				p.distanceTo(new Vector3(0, 1, 0)) < 1e-6 || p.distanceTo(new Vector3(1, 1, 0)) < 1e-6;
			expect(isMid).toBe(true);
		}
	});

	it('shares an identical corner between adjacent cell-pair chains at a triple point', () => {
		// Two triangles meeting; three labels present -> a triple point shared by chains.
		const tris = [tri([0, 0, 0], [2, 0, 0], [1, 2, 0]), tri([2, 0, 0], [3, 2, 0], [1, 2, 0])];
		const g = buildMeshGraph(tris);
		const field: GeodesicField = g.positions.map((p) => {
			if (p.x < 1) return { nearestSeed: 0, distance: 1 };
			if (p.y > 1) return { nearestSeed: 2, distance: 1 };
			return { nearestSeed: 1, distance: 1 };
		});
		const chains = extractBoundaries(g, field);
		// Collect all corner ids; a triple point id should appear in >= 2 chains.
		const counts = new Map<number, number>();
		for (const c of chains)
			for (const cid of c.vertices) counts.set(cid, (counts.get(cid) ?? 0) + 1);
		const shared = [...counts.values()].some((n) => n >= 2);
		expect(shared).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/extract-boundaries.test.ts`
Expected: FAIL — `extractBoundaries` not defined.

- [ ] **Step 3: Write the implementation**

```ts
import { Vector3 } from 'three';
import type { MeshGraph } from './mesh-graph';
import type { GeodesicField } from './geodesic-solver';

/** A raw (un-resampled) Voronoi boundary chain on the surface. */
export type BoundaryChain = {
	/** [startCornerId, endCornerId] — stable keys shared with adjacent chains. */
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

	// Edge-crossing node between vertices i and j (different labels).
	const crossingNode = (i: number, j: number): number => {
		const key = edgeKey(i, j);
		const existing = nodeIdByKey.get(key);
		if (existing !== undefined) return existing;
		const pi = graph.positions[i];
		const pj = graph.positions[j];
		const L = pi.distanceTo(pj);
		const di = field[i].distance;
		const dj = field[j].distance;
		// Balance point: di + t*L == dj + (1-t)*L  ->  t = (dj - di + L) / (2L).
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
		if (la < 0 || lb < 0 || lc < 0) return; // unreachable region
		const distinct = new Set([la, lb, lc]);
		if (distinct.size === 1) return;

		if (distinct.size === 2) {
			// Find the odd-one-out vertex; the two edges incident to it are crossed.
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
				odd = b;
				p = a;
				q = c;
			}
			const n1 = crossingNode(p, odd);
			const n2 = crossingNode(q, odd);
			pushSegment(n1, n2, field[p].nearestSeed, field[odd].nearestSeed);
			return;
		}

		// Three labels: triple point + three spokes.
		const pa = graph.positions[a];
		const pb = graph.positions[b];
		const pc = graph.positions[c];
		const da = field[a].distance;
		const db = field[b].distance;
		const dc = field[c].distance;
		let tp: Vector3;
		if (da < 1e-9 || db < 1e-9 || dc < 1e-9) {
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

	// Stitch segments per cell-pair into ordered chains.
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

		// Build adjacency over nodes within this pair.
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

		// Walk chains starting from endpoints (degree 1) first, then any leftover loops.
		const starts = [...nbr.keys()].filter((id) => (nbr.get(id) ?? []).length === 1);
		const seeds = starts.length > 0 ? starts : [...nbr.keys()];

		for (const start of seeds) {
			for (const first of nbr.get(start) ?? []) {
				if (used.has(segKey(start, first))) continue;
				const order: number[] = [start];
				let prev = start;
				let cur = first;
				used.add(segKey(prev, cur));
				order.push(cur);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/extract-boundaries.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/geodesic/extract-boundaries.ts src/lib/voronoi/geodesic/__tests__/extract-boundaries.test.ts
git commit -m "feat(voronoi): add dual-edge boundary extraction for geodesic Voronoi"
```

---

## Task 4: Geodesic Voronoi orchestrator

Ties seeds → graph → solve (+ optional Lloyd) → boundaries → resample into the `{ edges, edgeProjections, seedPoints3d }` shape the back-half consumes.

**Files:**

- Create: `src/lib/voronoi/geodesic/geodesic-voronoi.ts`
- Test: `src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts`

**Notes:**

- Seeds are area-weighted (center-free); snapped to nearest graph vertex.
- Lloyd: repeat `relaxationIterations` times — solve, then move each cell's seed to the centroid of the vertices labeled to it, re-snap to nearest graph vertex; final solve after the loop.
- `vertices` of each emitted `VoronoiEdge` packs the chain's corner ids as `[cid, 0]` so `vertexKey` sees a shared key at shared corners.
- Resample each chain's polyline to its adaptive division count (reuse `computeAdaptiveEdgeDivisions` over chain 3D lengths) by arc length, interpolating normals.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import type { SurfaceTriangle, VoronoiConfig } from '$lib/voronoi/types';
import { defaultVoronoiConfig } from '$lib/shades-config';
import { generateGeodesicVoronoi } from '../geodesic-voronoi';

/** Icosphere-ish: reuse a fine grid folded is overkill; use a UV sphere sampling. */
function sphereMesh(seg: number): SurfaceTriangle[] {
	const v = (i: number, j: number) => {
		const u = (i / seg) * Math.PI * 2;
		const t = (j / seg) * Math.PI;
		return new Vector3(Math.sin(t) * Math.cos(u), Math.cos(t), Math.sin(t) * Math.sin(u));
	};
	const tris: SurfaceTriangle[] = [];
	for (let j = 0; j < seg; j++) {
		for (let i = 0; i < seg; i++) {
			tris.push([v(i, j), v(i + 1, j), v(i, j + 1)]);
			tris.push([v(i + 1, j), v(i + 1, j + 1), v(i, j + 1)]);
		}
	}
	return tris;
}

// Base on the real default so bandConfig/crossSectionConfig stay type-valid; override
// only what the geodesic path reads (seeds, edgeDivisions, method).
const baseConfig = (): VoronoiConfig => ({
	...defaultVoronoiConfig,
	seedConfig: {
		...defaultVoronoiConfig.seedConfig,
		seedMethod: { type: 'areaWeighted', pointCount: 8, seed: 42 },
		relaxationIterations: 0
	},
	edgeDivisions: [4, 4],
	voronoiMethod: 'geodesic',
	insetMethod: 'localProjection'
});

describe('generateGeodesicVoronoi', () => {
	it('emits parallel edges/edgeProjections and per-cell seed points', () => {
		const tris = sphereMesh(24);
		const result = generateGeodesicVoronoi(baseConfig(), tris);
		expect(result.edges.length).toBeGreaterThan(0);
		expect(result.edgeProjections.length).toBe(result.edges.length);
		expect(result.seedPoints3d.length).toBe(8);
		// Each edge has >= 2 sampled points and matching normals.
		for (let i = 0; i < result.edges.length; i++) {
			const proj = result.edgeProjections[i];
			expect(proj.edgePoints3d.length).toBeGreaterThanOrEqual(2);
			expect(proj.normals.length).toBe(proj.edgePoints3d.length);
		}
	});

	it('shares corner keys between edges meeting at a Voronoi corner', () => {
		const tris = sphereMesh(24);
		const result = generateGeodesicVoronoi(baseConfig(), tris);
		const counts = new Map<number, number>();
		for (const e of result.edges) {
			for (const v of e.vertices) counts.set(v[0], (counts.get(v[0]) ?? 0) + 1);
		}
		// On a closed surface every corner is a triple point -> shared by >= 2 edges.
		expect([...counts.values()].some((n) => n >= 2)).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts`
Expected: FAIL — `generateGeodesicVoronoi` not defined.

- [ ] **Step 3: Write the implementation**

```ts
import { Vector3 } from 'three';
import type { SurfaceTriangle, VoronoiConfig, VoronoiEdge } from '$lib/voronoi/types';
import { generateAreaWeightedSeeds } from '$lib/voronoi/generate-seeds';
import type { EdgeProjection } from '$lib/voronoi/project-edges-onto-surface';
import { computeAdaptiveEdgeDivisions } from '$lib/voronoi/edge-divisions';
import { buildMeshGraph, type MeshGraph } from './mesh-graph';
import { DijkstraGeodesicSolver, type GeodesicField } from './geodesic-solver';
import { extractBoundaries, type BoundaryChain } from './extract-boundaries';

export type GeodesicVoronoiResult = {
	edges: VoronoiEdge[];
	edgeProjections: EdgeProjection[];
	seedPoints3d: (Vector3 | null)[];
};

function nearestVertex(graph: MeshGraph, p: Vector3): number {
	let best = -1;
	let bestD = Infinity;
	for (let i = 0; i < graph.positions.length; i++) {
		const d = graph.positions[i].distanceToSquared(p);
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	}
	return best;
}

/** Polyline arc length of a 3D point list. */
function polylineLength(points: Vector3[]): number {
	let len = 0;
	for (let i = 1; i < points.length; i++) len += points[i].distanceTo(points[i - 1]);
	return len;
}

/** Resample a polyline (+parallel normals) to `count` points by arc length. */
function resample(
	points: Vector3[],
	normals: Vector3[],
	count: number
): { points: Vector3[]; normals: Vector3[] } {
	if (points.length <= 2 || count <= 2) {
		return { points: points.map((p) => p.clone()), normals: normals.map((n) => n.clone()) };
	}
	const cum: number[] = [0];
	for (let i = 1; i < points.length; i++)
		cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]));
	const total = cum[cum.length - 1];
	if (total < 1e-12) {
		return { points: points.map((p) => p.clone()), normals: normals.map((n) => n.clone()) };
	}
	const outP: Vector3[] = [];
	const outN: Vector3[] = [];
	for (let k = 0; k < count; k++) {
		const target = (k / (count - 1)) * total;
		let seg = 1;
		while (seg < cum.length - 1 && cum[seg] < target) seg++;
		const segLen = cum[seg] - cum[seg - 1];
		const t = segLen < 1e-12 ? 0 : (target - cum[seg - 1]) / segLen;
		outP.push(points[seg - 1].clone().lerp(points[seg], t));
		outN.push(normals[seg - 1].clone().lerp(normals[seg], t).normalize());
	}
	return { points: outP, normals: outN };
}

/** Geodesic centroid (approx): mean of vertices labeled to each cell, re-snapped. */
function relaxSeeds(graph: MeshGraph, field: GeodesicField, cellCount: number): number[] {
	const acc = Array.from({ length: cellCount }, () => new Vector3());
	const counts = new Array(cellCount).fill(0);
	for (let v = 0; v < graph.positions.length; v++) {
		const s = field[v].nearestSeed;
		if (s < 0) continue;
		acc[s].add(graph.positions[v]);
		counts[s]++;
	}
	const next: number[] = [];
	for (let s = 0; s < cellCount; s++) {
		if (counts[s] === 0) {
			next.push(-1);
			continue;
		}
		next.push(nearestVertex(graph, acc[s].divideScalar(counts[s])));
	}
	return next;
}

export function generateGeodesicVoronoi(
	config: VoronoiConfig,
	surfaceTriangles: SurfaceTriangle[]
): GeodesicVoronoiResult {
	const graph = buildMeshGraph(surfaceTriangles);
	const solver = new DijkstraGeodesicSolver(graph);

	// Seeds: area-weighted (center-free), snapped to graph vertices.
	const sm = config.seedConfig.seedMethod;
	const seedMethod =
		sm.type === 'areaWeighted'
			? sm
			: { type: 'areaWeighted' as const, pointCount: sm.pointCount, seed: sm.seed };
	const seeds3d = generateAreaWeightedSeeds(seedMethod, surfaceTriangles);
	let seedVerts = seeds3d.map((p) => nearestVertex(graph, p));
	const cellCount = seedVerts.length;

	// Lloyd relaxation (reuse the existing relaxationIterations setting).
	let field = solver.solveMultiSource(seedVerts);
	const iters = Math.max(0, Math.floor(config.seedConfig.relaxationIterations ?? 0));
	for (let it = 0; it < iters; it++) {
		const relaxed = relaxSeeds(graph, field, cellCount);
		// Keep any cell that collapsed (-1) at its previous vertex.
		seedVerts = relaxed.map((v, i) => (v >= 0 ? v : seedVerts[i]));
		field = solver.solveMultiSource(seedVerts);
	}

	const seedPoints3d: (Vector3 | null)[] = seedVerts.map((v) =>
		v >= 0 ? graph.positions[v].clone() : null
	);

	// Boundaries -> resample to adaptive divisions.
	const chains: BoundaryChain[] = extractBoundaries(graph, field);
	const lengths = chains.map((c) => polylineLength(c.points));
	const divisionCounts = computeAdaptiveEdgeDivisions(lengths, config.edgeDivisions);

	const edges: VoronoiEdge[] = [];
	const edgeProjections: EdgeProjection[] = [];
	chains.forEach((chain, i) => {
		const { points, normals } = resample(chain.points, chain.normals, divisionCounts[i]);
		if (points.length < 2) return;
		edges.push({
			vertices: [
				[chain.vertices[0], 0],
				[chain.vertices[1], 0]
			],
			cellIndices: chain.cellIndices
		});
		edgeProjections.push({ edgePoints3d: points, normals });
	});

	return { edges, edgeProjections, seedPoints3d };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/geodesic/geodesic-voronoi.ts src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts
git commit -m "feat(voronoi): add geodesic Voronoi orchestrator"
```

---

## Task 5: Add `'geodesic'` to the method type

**Files:**

- Modify: `src/lib/voronoi/types.ts:7`

- [ ] **Step 1: Edit the union**

Change:

```ts
export type VoronoiMethod = 'spherical' | 'uv';
```

to:

```ts
export type VoronoiMethod = 'spherical' | 'uv' | 'geodesic';
```

- [ ] **Step 2: Verify types still compile**

Run: `npm run check`
Expected: PASS (no new type errors). The `computeVoronoiFromSeeds` switch in generate-voronoi.ts already defaults non-spherical to the UV branch, but Task 7 routes `'geodesic'` away before that point, so no exhaustiveness break.

- [ ] **Step 3: Commit**

```bash
git add src/lib/voronoi/types.ts
git commit -m "feat(voronoi): add 'geodesic' voronoi method type"
```

---

## Task 6: Refactor `makeVoronoi` back-half into `assembleVoronoiTubes`

Extract the shared inset→tube→fill→partner-matching tail so both pipelines use one copy. Pure refactor — no behavior change; the existing `generate-voronoi.test.ts` is the safety net.

**Files:**

- Modify: `src/lib/voronoi/generate-voronoi.ts`

- [ ] **Step 1: Run the existing voronoi tests to capture green baseline**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/generate-voronoi.test.ts`
Expected: PASS. Record the passing test count.

- [ ] **Step 2: Add the shared back-half function**

Add this function to generate-voronoi.ts (above `makeVoronoi`). Its body is the **existing lines 293-499** of `makeVoronoi` (the tube-build loop, the `fillAll` block, and the two partner-matching `try/catch` blocks) moved verbatim, with two parameterizations:

1. it receives `edges`, `edgeProjections`, `edgeInsets`, `address`, `config`, `surfaceCenter`, and `cellApex` instead of reading locals;
2. the `fillAll` apex source changes from `intersect(coordToDirection(seed))` to the passed-in `cellApex[cellIndex]`.

```ts
function assembleVoronoiTubes(params: {
	edges: VoronoiEdge[];
	edgeProjections: EdgeProjection[];
	edgeInsets: EdgeInsets[];
	address: GlobuleAddress;
	config: VoronoiConfig;
	surfaceCenter: Vector3;
	/** Per-cell apex for fillAll (cell seed on surface). */
	cellApex: (Vector3 | undefined)[];
}): { tubes: Tube[]; surfaceProjectionTubes: Tube[] } {
	const { edges, edgeProjections, edgeInsets, address, config, surfaceCenter, cellApex } = params;
	const center = surfaceCenter;

	const tubes: Tube[] = [];
	const surfaceProjectionTubes: Tube[] = [];
	const spFillMeta: { firstCell: number; lastCell: number }[] = [];
	const crossSectionConfig = config.crossSectionConfig;
	const dummyEdgeConfig = makeDummyEdgeConfig(crossSectionConfig);

	for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
		const voronoiEdge = edges[edgeIndex];
		// ... existing loop body verbatim (lines 345-433): build sectionsA/B, tubes,
		// surfaceProjectionTubes, spFillMeta. Uses edgeProjections[edgeIndex] and
		// edgeInsets[edgeIndex]. The spReversed winding test already uses `center`.
	}

	try {
		matchTubeEnds(tubes);
		matchFacets(tubes);
	} catch (error) {
		console.error('Voronoi partner matching error:', error);
	}

	if (config.fillAll) {
		const averageOf = (pts: Vector3[]): Vector3 =>
			pts.reduce((acc, p) => acc.add(p.clone()), new Vector3()).divideScalar(pts.length);
		surfaceProjectionTubes.forEach((tube, t) => {
			const meta = spFillMeta[t];
			const firstEdge = outerBorderPolyline(tube.sections, 'first');
			const lastEdge = outerBorderPolyline(tube.sections, 'last');
			const firstApex =
				cellApex[meta.firstCell] ?? (firstEdge.length ? averageOf(firstEdge) : undefined);
			const lastApex =
				cellApex[meta.lastCell] ?? (lastEdge.length ? averageOf(lastEdge) : undefined);
			// ... existing fill-band build verbatim (lines 467-490), using center as projCenter.
		});
	}

	try {
		matchTubeEnds(surfaceProjectionTubes);
		matchFacets(surfaceProjectionTubes);
	} catch (error) {
		console.error('Voronoi surface projection partner matching error:', error);
	}

	return { tubes, surfaceProjectionTubes };
}
```

> **Implementer note:** copy the real loop/fill bodies from the current file rather than retyping. The only line-level edits inside the moved code are (a) deleting the now-parameterized `const crossSectionConfig`/`const dummyEdgeConfig` re-declarations if duplicated, and (b) replacing the old per-cell `cellApex` computation block (lines 451-456) — that moves to the caller.

- [ ] **Step 3: Rewrite the center-based `makeVoronoi` to call it**

Replace the body of `makeVoronoi` after `edgeInsets` is computed with:

```ts
// Per-cell apex for fillAll: ray-cast the seed direction onto the surface.
const cellApex: (Vector3 | undefined)[] = relaxedSeeds.map((seed) => {
	const hit = intersect(coordToDirection(seed[0], seed[1]));
	if (!hit) console.warn('fillAll: cell seed ray missed surface; using averaged border point');
	return hit ?? undefined;
});

const { tubes, surfaceProjectionTubes } = assembleVoronoiTubes({
	edges: voronoiResult.edges,
	edgeProjections,
	edgeInsets,
	address,
	config,
	surfaceCenter: center,
	cellApex
});

return { tubes, surfaceProjectionTubes, surface };
```

Keep the adaptive-division / `projectEdgesOntoSurface` / `computeEdgeInsets*` computation above unchanged.

- [ ] **Step 4: Run the existing tests to verify no regression**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/generate-voronoi.test.ts`
Expected: PASS with the same count as Step 1.

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/voronoi/generate-voronoi.ts
git commit -m "refactor(voronoi): extract shared assembleVoronoiTubes back-half"
```

---

## Task 7: Dispatch `makeVoronoi` to the geodesic front-half

**Files:**

- Modify: `src/lib/voronoi/generate-voronoi.ts`
- Test: `src/lib/voronoi/__tests__/generate-voronoi.test.ts` (add a geodesic case)

- [ ] **Step 1: Write the failing test**

Add to generate-voronoi.test.ts (mirror the existing test's surfaceConfig/config builders; set `voronoiMethod: 'geodesic'`, `insetMethod: 'localProjection'`, `seedMethod: { type: 'areaWeighted', pointCount: 8, seed: 7 }`):

```ts
it('generates tubes via the geodesic pipeline (center-free)', () => {
	const config = makeVoronoiConfig({
		voronoiMethod: 'geodesic',
		insetMethod: 'localProjection',
		seedMethod: { type: 'areaWeighted', pointCount: 8, seed: 7 }
	});
	const result = makeVoronoi(config, { globule: 0 }, sphereSurfaceConfig());
	expect(result.tubes.length).toBeGreaterThan(0);
	for (const tube of result.tubes) {
		expect(tube.bands.length).toBeGreaterThan(0);
		for (const band of tube.bands) expect(band.facets.length).toBeGreaterThan(0);
	}
});
```

> **Implementer note:** if the test file lacks `makeVoronoiConfig`/`sphereSurfaceConfig` helpers, reuse whatever config + surfaceConfig the existing passing tests in this file already build, overriding only the three fields above.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/generate-voronoi.test.ts -t geodesic`
Expected: FAIL — geodesic path not wired; currently falls through to the UV branch and produces center-projected output (or wrong structure).

- [ ] **Step 3: Add the dispatch + geodesic front-half**

Add imports at the top of generate-voronoi.ts:

```ts
import { generateGeodesicVoronoi } from './geodesic/geodesic-voronoi';
```

Insert this branch in `makeVoronoi` immediately after `const surfaceTriangles = extractSurfaceTriangles(surface);` (so geodesic never touches the center-based seed/voronoi/projection code):

```ts
if (config.voronoiMethod === 'geodesic') {
	const { edges, edgeProjections, seedPoints3d } = generateGeodesicVoronoi(
		config,
		surfaceTriangles
	);
	const edgeInsets = computeEdgeInsetsLocalProjection({
		edges,
		edgeProjections,
		seedPoints3d,
		surface,
		surfaceCenter: center,
		curveOffsetFactor: config.curveOffsetFactor ?? DEFAULT_CURVE_OFFSET_FACTOR,
		surfaceProjectionDivisions: config.surfaceProjectionDivisions ?? 0,
		curvedInset: config.curvedInset ?? false
	});
	const cellApex: (Vector3 | undefined)[] = seedPoints3d.map((p) => p ?? undefined);
	const { tubes, surfaceProjectionTubes } = assembleVoronoiTubes({
		edges,
		edgeProjections,
		edgeInsets,
		address,
		config,
		surfaceCenter: center,
		cellApex
	});
	return { tubes, surfaceProjectionTubes, surface };
}
```

- [ ] **Step 4: Run the geodesic test**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/generate-voronoi.test.ts -t geodesic`
Expected: PASS.

- [ ] **Step 5: Run the whole voronoi suite + type-check**

Run: `npm run test:unit -- src/lib/voronoi && npm run check`
Expected: PASS (existing tests unchanged, geodesic added).

- [ ] **Step 6: Commit**

```bash
git add src/lib/voronoi/generate-voronoi.ts src/lib/voronoi/__tests__/generate-voronoi.test.ts
git commit -m "feat(voronoi): wire geodesic front-half into makeVoronoi"
```

---

## Task 8: Migration — coerce invalid combos for geodesic

When `voronoiMethod === 'geodesic'`, force `seedMethod → areaWeighted` and `insetMethod → localProjection` (the center-based modes are invalid for geodesic).

**Files:**

- Modify: `src/lib/voronoi/migrate-voronoi-config.ts`
- Test: `src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('coerces seed + inset methods to center-free choices when geodesic', () => {
	const cfg = normalizeVoronoiConfig({
		// minimal SuperGlobuleConfig carrying a geodesic voronoiConfig with bad combos
		...baseSuperConfig(),
		voronoiConfig: {
			...baseVoronoiConfig(),
			voronoiMethod: 'geodesic',
			insetMethod: 'centerOut',
			seedConfig: {
				type: 'VoronoiSeedConfig',
				seedMethod: { type: 'centerProjection', pointCount: 10, seed: 3 },
				relaxationIterations: 2
			}
		}
	});
	const v = cfg.voronoiConfig!;
	expect(v.insetMethod).toBe('localProjection');
	expect(v.seedConfig.seedMethod.type).toBe('areaWeighted');
	expect(v.seedConfig.seedMethod.pointCount).toBe(10); // preserved
	expect(v.seedConfig.seedMethod.seed).toBe(3); // preserved
});
```

> **Implementer note:** reuse the existing test file's helpers for building a base config; if none exist, construct from `defaultVoronoiConfig` imported from `$lib/shades-config`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts -t geodesic`
Expected: FAIL — no coercion yet.

- [ ] **Step 3: Add the coercion**

In `normalizeVoronoiConfig`, after building `voronoiConfig`, add:

```ts
if (voronoiConfig.voronoiMethod === 'geodesic') {
	const sm = voronoiConfig.seedConfig.seedMethod;
	voronoiConfig.insetMethod = 'localProjection';
	voronoiConfig.seedConfig = {
		...voronoiConfig.seedConfig,
		seedMethod:
			sm.type === 'areaWeighted'
				? sm
				: { type: 'areaWeighted', pointCount: sm.pointCount, seed: sm.seed }
	};
}
```

(Convert the `const voronoiConfig` to a `let`, or build a coerced copy — either is fine as long as the returned object reflects the coercion.)

- [ ] **Step 4: Run to verify it passes + full migration suite**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts`
Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/migrate-voronoi-config.ts src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts
git commit -m "feat(voronoi): coerce geodesic configs to center-free seed/inset methods"
```

---

## Task 9: UI — add "Geodesic" option and disable center-only controls

**Files:**

- Modify: `src/components/controls/VoronoiControl.svelte`

- [ ] **Step 1: Add the method option**

In the "Method" `<select>` (VoronoiControl.svelte:104-110), add:

```svelte
<option value="geodesic">Geodesic (center-free)</option>
```

- [ ] **Step 2: Disable center-only controls when geodesic**

Add a derived flag in the `<script>` block:

```ts
let isGeodesic = $derived((config.voronoiMethod ?? 'spherical') === 'geodesic');
```

Then disable the Seed Method and Inset Method selects when geodesic (they are forced to areaWeighted / localProjection). On the Seed Method `<select>` (line 93) and Inset Method `<select>` (line 115) add:

```svelte
disabled={isGeodesic}
```

And update the Curved Inset checkbox's `disabled` (line 128) so geodesic (which always uses localProjection) keeps it enabled:

```svelte
disabled={!isGeodesic && (config.insetMethod ?? 'centerOut') !== 'localProjection'}
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run check && npm run lint`
Expected: PASS.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `npm run dev`, open the designer, set Method = "Geodesic (center-free)", confirm geometry regenerates and Seed/Inset selects are disabled. (The worker path is unchanged — `makeVoronoi` already runs in the worker.)

- [ ] **Step 5: Commit**

```bash
git add src/components/controls/VoronoiControl.svelte
git commit -m "feat(voronoi): expose geodesic method in VoronoiControl"
```

---

## Task 10 (optional): Sandbox route for visual verification

A throwaway isolated page to eyeball geodesic cells without the full designer.

**Files:**

- Create: `src/routes/sandbox-geodesic-voronoi/+page.svelte`

- [ ] **Step 1: Create the page**

Render `ThreeRenderer` (or the existing geometry component) fed by a hard-coded geodesic `SuperGlobuleConfig` (copy the designer's wiring; set `voronoiConfig.voronoiMethod='geodesic'`). Mirror an existing route that already renders voronoi geometry; keep it minimal.

- [ ] **Step 2: Smoke test**

Run: `npm run dev`, visit `/sandbox-geodesic-voronoi`, confirm cells render and look undistorted on a non-spherical surface (e.g. capsule).

- [ ] **Step 3: Commit**

```bash
git add src/routes/sandbox-geodesic-voronoi/+page.svelte
git commit -m "chore(voronoi): add geodesic Voronoi sandbox route"
```

---

## Final Verification

- [ ] Run the full unit suite: `npm run test:unit`
- [ ] Type-check: `npm run check`
- [ ] Lint: `npm run lint`
- [ ] Format: `npm run format`
- [ ] Manual: designer with Method = Geodesic on sphere AND capsule surfaces; confirm cells are undistorted relative to center on the capsule (the core goal). Confirm SVG/cut-pattern export still works from geodesic tubes (the back-half is shared, so pattern generation is unchanged).

---

## Notes for the implementer

- **No center projection anywhere in the geodesic front-half.** Seeds are area-weighted, distances are along-surface, boundaries are extracted from mesh connectivity. `center` is passed to the shared back-half only as `surfaceCenter` for outward normal orientation in `fitPlane` and as `projCenter` for fill winding — neither reintroduces center-relative distortion of cells.
- **`vertices` are keys, not coordinates.** Never feed geodesic edge `vertices` to `edgeArcLength`/`sampleEdgeAsDirections`/`coordToDirection` — those are center-based and are bypassed for geodesic.
- **Worker compatibility:** all new code is pure TS over `Vector3`/arrays and runs inside the existing worker via `makeVoronoi`; nothing new is serialized across `postMessage`.
- **Future seams (out of scope):** swap `DijkstraGeodesicSolver` for a heat-method solver behind `GeodesicSolver`; replace nearest-vertex seed snapping with virtual-node sources; build the independent volumetric foam pipeline on a separate 3D Euclidean bisector-clipping core.

```

```
