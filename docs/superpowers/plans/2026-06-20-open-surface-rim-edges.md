# Open-Surface Rim Edges (Asymmetric Tubes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the geodesic Voronoi pipeline, detect open surfaces topologically, trace each opening's rim split per-cell, and render a one-sided ("asymmetric") tube along each rim segment (bands on the surface side only).

**Architecture:** A surface is open iff its welded mesh graph has boundary edges (edges in exactly one face). `traceBoundaryLoops` finds the rim loops; `buildRimChains` splits each loop into per-cell `BoundaryChain`s tagged with an `OPENING = -1` sentinel cell index; the geodesic orchestrator appends these to the normal chains; the local-projection inset skips the sentinel side; and `assembleVoronoiTubes` builds a one-sided tube for sentinel edges.

**Tech Stack:** TypeScript, Three.js (`Vector3`, `Object3D`, `PlaneGeometry`), Jest. No new dependencies.

---

## Background: exact integration points (verified against current code)

- `mesh-graph.ts` exports `buildMeshGraph(triangles): MeshGraph` where `MeshGraph = { positions: Vector3[]; normals: Vector3[]; faces: [number,number,number][]; adjacency }`. No boundary notion exists.
- `geodesic-solver.ts` exports `GeodesicField = { nearestSeed: number; distance: number }[]`.
- `extract-boundaries.ts` exports `BoundaryChain = { vertices: [number,number]; cellIndices: [number,number]; points: Vector3[]; normals: Vector3[] }`.
- `geodesic-voronoi.ts` builds `const chains = extractBoundaries(graph, field)`, then `lengths`/`divisionCounts`, then `chains.forEach` emits `VoronoiEdge`s with `cellIndices: chain.cellIndices` and `vertices: [[chain.vertices[0],0],[chain.vertices[1],0]]`.
- `local-projection.ts` (`computeEdgeInsetsLocalProjection`) groups cells via `edges.forEach((edge, i) => { for (const cell of edge.cellIndices) { ... cellEdges.get(cell) ... } })`; per edge `isSideA = edges[ei].cellIndices[0] === cell` → writes `curvePointsA/divsA` else `curvePointsB/divsB`; every side defaults to the edge points.
- `generate-voronoi.ts` `assembleVoronoiTubes` per-edge loop builds `sectionsA`/`sectionsB` via `applyCrossSectionsToEdge(edgePoints3d, curvePointsX, normals, crossSectionConfig)`, `combineSections` → main tube, then a surface-projection tube. `applyCrossSectionsToEdge` returns `EdgeSection[]` where each has `crossSectionPoints: Vector3[]` (the profile at that edge point). A `Section` is `{ points: Vector3[] }`.

---

## File Structure

**New:**

- `src/lib/voronoi/geodesic/rim-edges.ts` — `buildRimChains`.
- `src/lib/voronoi/geodesic/__tests__/rim-edges.test.ts`

**Modified:**

- `src/lib/voronoi/geodesic/mesh-graph.ts` — add `traceBoundaryLoops` (+ test in existing `__tests__/mesh-graph.test.ts`).
- `src/lib/types.ts` — add `OPENING` sentinel.
- `src/lib/voronoi/geodesic/geodesic-voronoi.ts` — append rim chains (+ test in existing `__tests__/geodesic-voronoi.test.ts`).
- `src/lib/voronoi/local-projection.ts` — skip sentinel cell (+ test in existing `__tests__/local-projection.test.ts`).
- `src/lib/voronoi/generate-voronoi.ts` — one-sided tube for sentinel edges (+ test in existing `__tests__/generate-voronoi.test.ts`).

---

## Task 1: Boundary loop tracing in mesh-graph

**Files:**

- Modify: `src/lib/voronoi/geodesic/mesh-graph.ts`
- Test: `src/lib/voronoi/geodesic/__tests__/mesh-graph.test.ts`

- [ ] **Step 1: Write the failing test** (append inside the existing `describe('buildMeshGraph', ...)` is fine, or add a new `describe`)

```ts
import { buildMeshGraph, traceBoundaryLoops } from '../mesh-graph';

describe('traceBoundaryLoops', () => {
	it('returns one loop around an open quad', () => {
		// Quad (0,0)-(1,0)-(1,1)-(0,1) as two triangles sharing edge (1,0)-(0,1).
		const g = buildMeshGraph([
			tri([0, 0, 0], [1, 0, 0], [0, 1, 0]),
			tri([1, 0, 0], [1, 1, 0], [0, 1, 0])
		]);
		const loops = traceBoundaryLoops(g);
		expect(loops.length).toBe(1);
		// The boundary loop visits the 4 distinct corner vertices.
		expect(new Set(loops[0]).size).toBe(4);
	});

	it('returns no loops for a closed mesh (tetrahedron)', () => {
		const g = buildMeshGraph([
			tri([0, 0, 0], [1, 0, 0], [0, 1, 0]),
			tri([0, 0, 0], [0, 1, 0], [0, 0, 1]),
			tri([0, 0, 0], [0, 0, 1], [1, 0, 0]),
			tri([1, 0, 0], [0, 0, 1], [0, 1, 0])
		]);
		expect(traceBoundaryLoops(g)).toEqual([]);
	});
});
```

(`tri` is the existing helper at the top of the test file.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/mesh-graph.test.ts -t traceBoundaryLoops`
Expected: FAIL — `traceBoundaryLoops` is not exported.

- [ ] **Step 3: Implement** (add to `mesh-graph.ts`)

```ts
/**
 * Trace the boundary (opening) loops of the mesh. A boundary edge is a welded edge
 * used by exactly one face; boundary edges chain into ordered vertex-id loops, one
 * per opening. A closed mesh (every edge shared by two faces) returns []. "Open" =
 * the returned array is non-empty.
 */
export function traceBoundaryLoops(graph: MeshGraph): number[][] {
	const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

	// Face-incidence count per undirected welded edge.
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

	// Undirected adjacency among boundary vertices (edges with incidence 1).
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

	// Walk loops by consuming each boundary edge once.
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
				if (nexts.length === 0) break; // open chain / pinch — stop
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/mesh-graph.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/geodesic/mesh-graph.ts src/lib/voronoi/geodesic/__tests__/mesh-graph.test.ts
git commit -m "feat(voronoi): trace mesh boundary loops for open surfaces"
```

---

## Task 2: Rim chains (`OPENING` sentinel + buildRimChains)

**Files:**

- Modify: `src/lib/types.ts` (add `OPENING`)
- Create: `src/lib/voronoi/geodesic/rim-edges.ts`
- Test: `src/lib/voronoi/geodesic/__tests__/rim-edges.test.ts`

- [ ] **Step 1: Add the sentinel to `types.ts`**

Add near the `PipelineGates`/`PipelineError` block:

```ts
// Sentinel cell index for the "opening" side of a rim (boundary-tracing) Voronoi
// edge: such an edge borders a real cell on one side and an opening on the other.
export const OPENING = -1;
```

- [ ] **Step 2: Write the failing test** (`rim-edges.test.ts`)

```ts
import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import { buildMeshGraph, traceBoundaryLoops } from '../mesh-graph';
import { buildRimChains } from '../rim-edges';
import { OPENING } from '$lib/types';
import type { SurfaceTriangle } from '$lib/voronoi/types';
import type { GeodesicField } from '../geodesic-solver';

const tri = (a: number[], b: number[], c: number[]): SurfaceTriangle => [
	new Vector3(...(a as [number, number, number])),
	new Vector3(...(b as [number, number, number])),
	new Vector3(...(c as [number, number, number]))
];

// Open quad; its single rim loop visits the 4 corners.
const quad = () =>
	buildMeshGraph([tri([0, 0, 0], [1, 0, 0], [0, 1, 0]), tri([1, 0, 0], [1, 1, 0], [0, 1, 0])]);

// Build a field that labels each vertex by a function of its position.
function fieldBy(g: ReturnType<typeof quad>, label: (p: Vector3) => number): GeodesicField {
	return g.positions.map((p) => ({ nearestSeed: label(p), distance: 1 }));
}

describe('buildRimChains', () => {
	it('splits a rim loop into per-cell chains tagged with OPENING', () => {
		const g = quad();
		// Cell 0 on the y=0 side, cell 1 on the y=1 side.
		const field = fieldBy(g, (p) => (p.y < 0.5 ? 0 : 1));
		const chains = buildRimChains(g, field, traceBoundaryLoops(g));
		const cells = chains.map((c) => c.cellIndices[0]).sort();
		expect(cells).toEqual([0, 1]);
		for (const c of chains) {
			expect(c.cellIndices[1]).toBe(OPENING);
			expect(c.points.length).toBeGreaterThanOrEqual(2);
			expect(c.normals.length).toBe(c.points.length);
		}
	});

	it('skips runs of unreachable (-1) vertices', () => {
		const g = quad();
		const field = fieldBy(g, (p) => (p.y < 0.5 ? 0 : -1));
		const chains = buildRimChains(g, field, traceBoundaryLoops(g));
		expect(chains.every((c) => c.cellIndices[0] >= 0)).toBe(true);
		expect(chains.some((c) => c.cellIndices[0] === 0)).toBe(true);
	});
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/rim-edges.test.ts`
Expected: FAIL — `buildRimChains` not defined.

- [ ] **Step 4: Implement** (`rim-edges.ts`)

```ts
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

		// Rotate so index 0 is the first vertex whose label differs from its predecessor.
		let startOffset = 0;
		for (let i = 0; i < n; i++) {
			if (labelAt(i) !== labelAt((i - 1 + n) % n)) {
				startOffset = i;
				break;
			}
		}
		const order = Array.from({ length: n }, (_, k) => loop[(startOffset + k) % n]);

		// Emit maximal same-label runs as chains.
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
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/rim-edges.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/voronoi/geodesic/rim-edges.ts src/lib/voronoi/geodesic/__tests__/rim-edges.test.ts
git commit -m "feat(voronoi): build per-cell rim chains with OPENING sentinel"
```

---

## Task 3: Append rim chains in the geodesic orchestrator

**Files:**

- Modify: `src/lib/voronoi/geodesic/geodesic-voronoi.ts`
- Test: `src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts`

- [ ] **Step 1: Write the failing test** (append to the existing `describe('generateGeodesicVoronoi', ...)`)

Add this helper near the top of the test file (next to `sphereMesh`):

```ts
/** Flat NxN grid in the z=0 plane — an OPEN surface (perimeter rim). */
function gridMesh(n: number): SurfaceTriangle[] {
	const v = (x: number, y: number) => new Vector3((x / n) * 2 - 1, (y / n) * 2 - 1, 0);
	const tris: SurfaceTriangle[] = [];
	for (let y = 0; y < n; y++) {
		for (let x = 0; x < n; x++) {
			tris.push([v(x, y), v(x + 1, y), v(x, y + 1)]);
			tris.push([v(x + 1, y), v(x + 1, y + 1), v(x, y + 1)]);
		}
	}
	return tris;
}
```

And the tests (note `import { OPENING } from '$lib/types';` at top):

```ts
it('emits opening-sentinel edges on an open surface', () => {
	const result = generateGeodesicVoronoi(baseConfig(), gridMesh(16));
	expect(result.edges.some((e) => e.cellIndices.includes(OPENING))).toBe(true);
});

it('emits no opening-sentinel edges on a closed surface', () => {
	const result = generateGeodesicVoronoi(baseConfig(), sphereMesh(24));
	expect(result.edges.some((e) => e.cellIndices.includes(OPENING))).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts -t sentinel`
Expected: FAIL — the open-surface test fails (no sentinel edges emitted yet).

- [ ] **Step 3: Implement** (`geodesic-voronoi.ts`)

Add to the mesh-graph import and the rim import:

```ts
import { buildMeshGraph, traceBoundaryLoops, type MeshGraph } from './mesh-graph';
import { buildRimChains } from './rim-edges';
```

Replace the single `const chains = extractBoundaries(graph, field)` line with:

```ts
// Cell-cell boundaries plus, for open surfaces, per-cell rim chains tracing the openings.
const cellChains = extractBoundaries(graph, field);
const rimChains = buildRimChains(graph, field, traceBoundaryLoops(graph));
const chains: BoundaryChain[] = [...cellChains, ...rimChains];
```

(The existing `lengths`/`divisionCounts`/`chains.forEach` emit code is unchanged — rim chains are `BoundaryChain`s and flow through it, carrying the `OPENING` sentinel in `cellIndices`.)

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/geodesic/geodesic-voronoi.ts src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts
git commit -m "feat(voronoi): append rim chains to geodesic Voronoi output"
```

---

## Task 4: Inset skips the opening sentinel

**Files:**

- Modify: `src/lib/voronoi/local-projection.ts`
- Test: `src/lib/voronoi/__tests__/local-projection.test.ts`

- [ ] **Step 1: Write the failing test** (append to the existing describe in `local-projection.test.ts`)

```ts
import { Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, DoubleSide } from 'three';
import { OPENING } from '$lib/types';

function planeSurface(): Object3D {
	const o = new Object3D();
	o.add(new Mesh(new PlaneGeometry(400, 400, 1, 1), new MeshBasicMaterial({ side: DoubleSide })));
	o.updateMatrixWorld(true);
	return o;
}

it('insets only the real-cell side for an opening-sentinel edge', () => {
	const surface = planeSurface();
	const edgePoints3d = [new Vector3(-50, 0, 0), new Vector3(0, 0, 0), new Vector3(50, 0, 0)];
	const normals = edgePoints3d.map(() => new Vector3(0, 0, 1));
	const insets = computeEdgeInsetsLocalProjection({
		edges: [
			{
				vertices: [
					[-2, 0],
					[-3, 0]
				],
				cellIndices: [0, OPENING]
			}
		],
		edgeProjections: [{ edgePoints3d, normals }],
		seedPoints3d: [new Vector3(0, 80, 0)], // cell 0 seed, off the edge toward +y
		surface,
		surfaceCenter: new Vector3(0, 0, -1000),
		curveOffsetFactor: 0.3,
		surfaceProjectionDivisions: 0,
		curvedInset: false
	});
	// Real side (A, since cellIndices[0] === 0) is inset toward the seed.
	expect(insets[0].curvePointsA.some((p, i) => p.distanceTo(edgePoints3d[i]) > 1e-6)).toBe(true);
	// Opening side (B) is NOT inset — it stays at the edge points.
	insets[0].curvePointsB.forEach((p, i) =>
		expect(p.distanceTo(edgePoints3d[i])).toBeLessThan(1e-6)
	);
});
```

(Match the import style the existing `local-projection.test.ts` uses for `Vector3` / `computeEdgeInsetsLocalProjection`; add only what's missing.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/local-projection.test.ts -t "opening-sentinel"`
Expected: FAIL — without the skip, cell `-1` is processed and insets the B (opening) side, so the "B stays at edge points" assertion fails.

- [ ] **Step 3: Implement** (`local-projection.ts`)

In the cell→edges grouping loop, skip the sentinel:

```ts
// cell -> list of its edge indices
const cellEdges = new Map<number, number[]>();
edges.forEach((edge, edgeIndex) => {
	for (const cell of edge.cellIndices) {
		if (cell < 0) continue; // OPENING sentinel — the opening side has no cell to inset toward
		const list = cellEdges.get(cell);
		if (list) list.push(edgeIndex);
		else cellEdges.set(cell, [edgeIndex]);
	}
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/local-projection.test.ts`
Expected: PASS (existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/local-projection.ts src/lib/voronoi/__tests__/local-projection.test.ts
git commit -m "feat(voronoi): skip OPENING sentinel in local-projection inset"
```

---

## Task 5: One-sided (asymmetric) tube for sentinel edges

**Files:**

- Modify: `src/lib/voronoi/generate-voronoi.ts`
- Test: `src/lib/voronoi/__tests__/generate-voronoi.test.ts`

- [ ] **Step 1: Write the failing test** (append to the existing `describe('makeVoronoi', ...)`)

This reuses the file's mocked `generateSurface`/`generateProjectionBands`. Add `import { OPENING } from '$lib/types';` and import the mocked fns so they can be inspected/overridden — the file already imports `makeVoronoi`; add:

```ts
import {
	generateSurface,
	generateProjectionBands
} from '$lib/projection-geometry/generate-projection';
import { Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, DoubleSide } from 'three';
```

Test:

```ts
it('builds a one-sided tube for rim (opening-sentinel) edges', () => {
	// Open plane surface -> geodesic produces both cell-cell and rim edges.
	const openSurface = new Object3D();
	openSurface.add(
		new Mesh(new PlaneGeometry(800, 800, 6, 6), new MeshBasicMaterial({ side: DoubleSide }))
	);
	openSurface.updateMatrixWorld(true);
	jest.mocked(generateSurface).mockReturnValueOnce(openSurface);

	const base = makeTestConfig();
	const config = {
		...base,
		voronoiMethod: 'geodesic' as const,
		insetMethod: 'localProjection' as const,
		seedConfig: {
			...base.seedConfig,
			seedMethod: { type: 'areaWeighted' as const, pointCount: 10, seed: 5 }
		}
	};

	jest.mocked(generateProjectionBands).mockClear();
	const result = makeVoronoi(config, { globule: 0 }, testSurfaceConfig);

	expect(result.tubes.length).toBeGreaterThan(0);
	for (const tube of result.tubes) expect(tube.bands.length).toBeGreaterThan(0);

	// The test cross-section samples 4 profile points. A symmetric (cell-cell) tube's
	// combined section has 4 + (4-1) = 7 points; a one-sided rim tube has exactly 4.
	const sectionPointCounts = jest
		.mocked(generateProjectionBands)
		.mock.calls.map((c) => (c[0] as { points: unknown[] }[])[0]?.points.length);
	expect(sectionPointCounts).toContain(4); // one-sided rim tube was built
	expect(sectionPointCounts).toContain(7); // normal two-sided tube still built
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/generate-voronoi.test.ts -t "one-sided tube"`
Expected: FAIL — without the branch, rim edges go through the symmetric path, so no section of length 4 is produced (the `toContain(4)` assertion fails).

- [ ] **Step 3: Implement** (`generate-voronoi.ts`)

Add the value import near the top (the file already imports types from `$lib/types`; add a value import):

```ts
import { OPENING } from '$lib/types';
```

In `assembleVoronoiTubes`, inside the per-edge loop, right after the `if (edgePoints3d.length < 2) continue;` line, insert the one-sided branch:

```ts
// One-sided (asymmetric) tube for rim edges: one side borders an opening, so
// only the surface side gets bands (no opening-side curve, no surface-projection tube).
const openingA = cellIdxA === OPENING;
const openingB = cellIdxB === OPENING;
if (openingA !== openingB) {
	const realCurve = openingA ? curvePointsB : curvePointsA;
	const sideSections = applyCrossSectionsToEdge(
		edgePoints3d,
		realCurve,
		normals,
		crossSectionConfig
	);
	const oneSided: Section[] = sideSections.map((s) => ({ points: s.crossSectionPoints }));
	const tubeAddress: GlobuleAddress_Tube = { ...address, tube: tubes.length };
	const bands = generateProjectionBands(
		oneSided,
		config.bandConfig.orientation,
		tubeAddress,
		config.bandConfig.tubeSymmetry
	);
	tubes.push({
		bands,
		sections: oneSided,
		orientation: config.bandConfig.orientation,
		address: tubeAddress
	});
	continue; // skip the symmetric main tube + surface-projection tube
}
```

(`Section`, `GlobuleAddress_Tube`, `applyCrossSectionsToEdge`, `generateProjectionBands`, `curvePointsA/B`, `cellIdxA/B`, `crossSectionConfig` are all already in scope in this function.)

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/generate-voronoi.test.ts`
Expected: PASS (existing + 1 new; the prior geodesic/closed-sphere tests still pass).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/generate-voronoi.ts src/lib/voronoi/__tests__/generate-voronoi.test.ts
git commit -m "feat(voronoi): one-sided asymmetric tube for rim edges"
```

---

## Final Verification

- [ ] `npm run test:unit` — full suite green.
- [ ] `npm run check` — no NEW type errors in the touched files (the repo has pre-existing errors elsewhere; ignore those).
- [ ] Manual: in the designer, set Method = Geodesic on an uncapped (open) globule. Confirm tubes now trace the rim of the opening with bands only on the surface side, and a capped globule / sphere / capsule shows no rim tubes.

---

## Notes for the implementer

- **Sentinel everywhere is `OPENING` (`-1`) from `$lib/types`.** It's a value import (not a type) in `rim-edges.ts`, `local-projection.ts` (skip), and `generate-voronoi.ts` (branch).
- **Rim corner ids are negative** (`rimCorner` = `-(vertexId+2)`) to avoid colliding with interior corner ids (`>= 0`) or `OPENING` (`-1`).
- **v1 scope:** one-sided tube only; no symmetric rim tube, no rim surface-projection tube, no enforced rim↔interior partner stitching (corner keys are provided so it's possible later). A single-cell rim (an entire opening bordering one cell) yields one nearly-closed chain with a one-segment gap at the seam — acceptable for v1.
- **Center-free invariant preserved:** rim detection and tracing use only mesh topology + the geodesic field; the inset's `surfaceCenter` use is unchanged (normal orientation only).
