# Voronoi Resampling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Voronoi tessellation as a new geometry generation method (sibling to projection) that produces tubes/bands/sections from seed points on a surface mesh.

**Architecture:** Adapter pattern — Voronoi generates `ProjectionEdge`-compatible output, then feeds into the existing downstream pipeline (`combineSections` → `generateProjectionBands` → `matchTubeEnds`/`matchFacets`). New code lives in `src/lib/voronoi/`, reusing projection's surface generation, band generation, and facet matching.

**Tech Stack:** d3-delaunay (Voronoi/Delaunay), Three.js (raycasting, Vector3, Triangle), existing projection pipeline functions.

**Spec:** `docs/superpowers/specs/2026-05-26-voronoi-resampling-design.md`

---

## File Structure

### New files
```
src/lib/voronoi/
  types.ts                         # VoronoiConfig, VoronoiSeedConfig, SeedMethod, VoronoiEdgeGraph
  generate-seeds.ts                # generateSeeds() — pluggable seed point generation
  uv-mapping.ts                    # toUV(), fromUV() — 3D ↔ spherical UV projection
  compute-voronoi.ts               # computeVoronoi() — d3-delaunay + Lloyd relaxation + edge extraction
  apply-cross-sections.ts          # applyCrossSectionsToEdge() — cross-section points at each sample
  generate-voronoi.ts              # makeVoronoi() — full pipeline: config → { tubes, surface }
  __tests__/
    generate-seeds.test.ts
    uv-mapping.test.ts
    compute-voronoi.test.ts
    apply-cross-sections.test.ts
    generate-voronoi.test.ts
src/components/controls/
  VoronoiControl.svelte            # Config UI panel
```

### Modified files
```
src/lib/types.ts                   # Add voronoiConfigs to SuperGlobuleConfig, SuperGlobule
src/lib/generate-superglobule.ts   # Add Voronoi pipeline alongside projection pipeline
src/lib/stores/workerStore.ts      # Add Voronoi rehydration + surface regeneration
src/lib/shades-config.ts           # Add default VoronoiConfig
src/routes/designer2/+page.svelte  # Add "Voronoi" option to SelectBar
```

---

## Task 1: Install d3-delaunay and add Voronoi types

**Files:**
- Create: `src/lib/voronoi/types.ts`
- Modify: `src/lib/types.ts:886-907`
- Modify: `package.json`

- [ ] **Step 1: Install d3-delaunay**

```bash
npm install d3-delaunay
npm install --save-dev @types/d3-delaunay
```

If `@types/d3-delaunay` doesn't exist (d3-delaunay v6+ ships its own types), skip the devDependency.

- [ ] **Step 2: Create `src/lib/voronoi/types.ts`**

```typescript
import type { BezierConfig, Point3 } from '$lib/types';
import type {
	CrossSectionConfig,
	ProjectionBandConfig,
	SurfaceConfig,
	TransformConfig
} from '$lib/projection-geometry/types';

export type VoronoiConfig = {
	type: 'VoronoiConfig';
	meta: { transform: TransformConfig };
	surfaceConfig: SurfaceConfig;
	seedConfig: VoronoiSeedConfig;
	crossSectionConfig: CrossSectionConfig;
	bandConfig: ProjectionBandConfig;
	edgeDivisions: number;
};

export type VoronoiSeedConfig = {
	type: 'VoronoiSeedConfig';
	seedMethod: SeedMethod;
	relaxationIterations: number;
};

export type SeedMethod = CenterProjectionSeedMethod;

export type CenterProjectionSeedMethod = {
	type: 'centerProjection';
	pointCount: number;
	seed: number;
};

export type VoronoiEdge = {
	vertices: [[number, number], [number, number]];
	cellIndices: [number, number];
};

export type VoronoiResult = {
	edges: VoronoiEdge[];
	seeds: [number, number][];
	vertices: [number, number][];
};
```

- [ ] **Step 3: Update `SuperGlobuleConfig` in `src/lib/types.ts`**

Add `voronoiConfigs` to `SuperGlobuleConfig` (line ~886):

```typescript
export type SuperGlobuleConfig = {
	type: 'SuperGlobuleConfig';
	id: Id;
	name?: string;
	subGlobuleConfigs: SubGlobuleConfig[];
	projectionConfigs: BaseProjectionConfig[];
	voronoiConfigs: VoronoiConfig[];
};
```

Add the import at the top of the file:

```typescript
import type { VoronoiConfig } from './voronoi/types';
```

Update `SuperGlobule` (line ~894) to include voronoi results:

```typescript
export type SuperGlobule = {
	type: 'SuperGlobule';
	superGlobuleConfigId: Id;
	name?: string;
	subGlobules: SubGlobule[];
	globuleTubes: Tube[];
	projections: {
		projection: Projection;
		polyhedron: Polyhedron;
		tubes: Tube[];
		surfaceProjectionTubes: Tube[];
		surface: Object3D;
	}[];
	voronoiResults: {
		tubes: Tube[];
		surface: Object3D;
	}[];
};
```

- [ ] **Step 4: Fix all TypeScript references to `SuperGlobuleConfig` and `SuperGlobule`**

Run `npm run check` to find all locations that construct or destructure these types. At minimum:

- `src/lib/generate-superglobule.ts`: Add `voronoiConfigs: []` defaults where `SuperGlobuleConfig` is created, add `voronoiResults: []` to `SuperGlobule` construction.
- `src/lib/shades-config.ts`: Add `voronoiConfigs: []` to `generateDefaultSuperGlobuleConfig()`.
- `src/lib/stores/workerStore.ts`: Add empty `voronoiResults` rehydration.
- Any other files that spread or construct these types.

For now, add empty arrays as placeholders — later tasks will populate them.

- [ ] **Step 5: Verify types compile**

```bash
npm run check
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/voronoi/types.ts src/lib/types.ts package.json package-lock.json
git commit -m "feat(voronoi): add VoronoiConfig types and update SuperGlobuleConfig"
```

---

## Task 2: Seed point generation

**Files:**
- Create: `src/lib/voronoi/generate-seeds.ts`
- Create: `src/lib/voronoi/__tests__/generate-seeds.test.ts`

- [ ] **Step 1: Write failing test for `generateSeeds`**

Create `src/lib/voronoi/__tests__/generate-seeds.test.ts`:

```typescript
import { Vector3 } from 'three';
import { generateSeeds } from '../generate-seeds';
import type { CenterProjectionSeedMethod } from '../types';

const makeSphereIntersector = (radius: number) => {
	return (direction: Vector3): Vector3 | null => {
		return direction.clone().normalize().multiplyScalar(radius);
	};
};

describe('generateSeeds', () => {
	const method: CenterProjectionSeedMethod = {
		type: 'centerProjection',
		pointCount: 10,
		seed: 42
	};

	it('returns the requested number of seed points', () => {
		const intersect = makeSphereIntersector(5);
		const seeds = generateSeeds(method, new Vector3(0, 0, 0), intersect);
		expect(seeds).toHaveLength(10);
	});

	it('returns points on the sphere surface', () => {
		const intersect = makeSphereIntersector(5);
		const seeds = generateSeeds(method, new Vector3(0, 0, 0), intersect);
		seeds.forEach((seed) => {
			expect(seed.length()).toBeCloseTo(5, 4);
		});
	});

	it('produces deterministic results for the same seed', () => {
		const intersect = makeSphereIntersector(5);
		const seeds1 = generateSeeds(method, new Vector3(0, 0, 0), intersect);
		const seeds2 = generateSeeds(method, new Vector3(0, 0, 0), intersect);
		seeds1.forEach((s, i) => {
			expect(s.x).toBeCloseTo(seeds2[i].x, 10);
			expect(s.y).toBeCloseTo(seeds2[i].y, 10);
			expect(s.z).toBeCloseTo(seeds2[i].z, 10);
		});
	});

	it('produces different results for different seeds', () => {
		const intersect = makeSphereIntersector(5);
		const differentMethod = { ...method, seed: 99 };
		const seeds1 = generateSeeds(method, new Vector3(0, 0, 0), intersect);
		const seeds2 = generateSeeds(differentMethod, new Vector3(0, 0, 0), intersect);
		const allSame = seeds1.every(
			(s, i) =>
				Math.abs(s.x - seeds2[i].x) < 1e-10 &&
				Math.abs(s.y - seeds2[i].y) < 1e-10 &&
				Math.abs(s.z - seeds2[i].z) < 1e-10
		);
		expect(allSame).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- src/lib/voronoi/__tests__/generate-seeds.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `generateSeeds`**

Create `src/lib/voronoi/generate-seeds.ts`:

```typescript
import { Vector3 } from 'three';
import type { SeedMethod, CenterProjectionSeedMethod } from './types';

type SurfaceIntersector = (direction: Vector3) => Vector3 | null;

function mulberry32(seed: number): () => number {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function randomUnitVector(random: () => number): Vector3 {
	const theta = random() * Math.PI * 2;
	const z = random() * 2 - 1;
	const r = Math.sqrt(1 - z * z);
	return new Vector3(r * Math.cos(theta), r * Math.sin(theta), z);
}

function generateCenterProjectionSeeds(
	method: CenterProjectionSeedMethod,
	center: Vector3,
	intersect: SurfaceIntersector
): Vector3[] {
	const random = mulberry32(method.seed);
	const seeds: Vector3[] = [];

	let attempts = 0;
	const maxAttempts = method.pointCount * 10;

	while (seeds.length < method.pointCount && attempts < maxAttempts) {
		const direction = randomUnitVector(random);
		const point = intersect(direction);
		if (point) {
			seeds.push(point);
		}
		attempts++;
	}

	return seeds;
}

export function generateSeeds(
	method: SeedMethod,
	center: Vector3,
	intersect: SurfaceIntersector
): Vector3[] {
	switch (method.type) {
		case 'centerProjection':
			return generateCenterProjectionSeeds(method, center, intersect);
		default:
			throw new Error(`Unknown seed method: ${(method as SeedMethod).type}`);
	}
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:unit -- src/lib/voronoi/__tests__/generate-seeds.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/generate-seeds.ts src/lib/voronoi/__tests__/generate-seeds.test.ts
git commit -m "feat(voronoi): add seed point generation with seeded PRNG"
```

---

## Task 3: UV mapping (3D ↔ spherical projection)

**Files:**
- Create: `src/lib/voronoi/uv-mapping.ts`
- Create: `src/lib/voronoi/__tests__/uv-mapping.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/voronoi/__tests__/uv-mapping.test.ts`:

```typescript
import { Vector3 } from 'three';
import { toUV, fromUVToDirection } from '../uv-mapping';

describe('toUV', () => {
	const center = new Vector3(0, 0, 0);

	it('maps +X axis to u=0.25, v=0.5', () => {
		const [u, v] = toUV(new Vector3(1, 0, 0), center);
		expect(u).toBeCloseTo(0.25, 5);
		expect(v).toBeCloseTo(0.5, 5);
	});

	it('maps +Z axis (north pole) to v=0', () => {
		const [u, v] = toUV(new Vector3(0, 0, 1), center);
		expect(v).toBeCloseTo(0, 5);
	});

	it('maps -Z axis (south pole) to v=1', () => {
		const [u, v] = toUV(new Vector3(0, 0, -1), center);
		expect(v).toBeCloseTo(1, 5);
	});

	it('maps +Y axis to u=0.5, v=0.5', () => {
		const [u, v] = toUV(new Vector3(0, 1, 0), center);
		expect(u).toBeCloseTo(0.5, 5);
		expect(v).toBeCloseTo(0.5, 5);
	});

	it('produces values in [0, 1] range', () => {
		const points = [
			new Vector3(1, 1, 1),
			new Vector3(-1, 0, 0.5),
			new Vector3(0, -1, -0.5),
			new Vector3(3, -2, 7)
		];
		points.forEach((p) => {
			const [u, v] = toUV(p, center);
			expect(u).toBeGreaterThanOrEqual(0);
			expect(u).toBeLessThanOrEqual(1);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
		});
	});
});

describe('fromUVToDirection', () => {
	it('round-trips a point on the equator', () => {
		const original = new Vector3(5, 0, 0);
		const center = new Vector3(0, 0, 0);
		const [u, v] = toUV(original, center);
		const direction = fromUVToDirection(u, v);
		const restored = direction.multiplyScalar(original.length());
		expect(restored.x).toBeCloseTo(original.x, 4);
		expect(restored.y).toBeCloseTo(original.y, 4);
		expect(restored.z).toBeCloseTo(original.z, 4);
	});

	it('round-trips arbitrary 3D points', () => {
		const center = new Vector3(0, 0, 0);
		const points = [
			new Vector3(1, 2, 3),
			new Vector3(-4, 1, -2),
			new Vector3(0.5, 0.5, 0.5)
		];
		points.forEach((original) => {
			const [u, v] = toUV(original, center);
			const direction = fromUVToDirection(u, v);
			const restored = direction.multiplyScalar(original.length());
			expect(restored.x).toBeCloseTo(original.x, 4);
			expect(restored.y).toBeCloseTo(original.y, 4);
			expect(restored.z).toBeCloseTo(original.z, 4);
		});
	});
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test:unit -- src/lib/voronoi/__tests__/uv-mapping.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement UV mapping**

Create `src/lib/voronoi/uv-mapping.ts`:

```typescript
import { Vector3 } from 'three';

export function toUV(point: Vector3, center: Vector3): [number, number] {
	const dir = point.clone().sub(center).normalize();
	const phi = Math.acos(Math.max(-1, Math.min(1, dir.z)));
	const theta = Math.atan2(dir.y, dir.x);
	const u = (theta + Math.PI) / (2 * Math.PI);
	const v = phi / Math.PI;
	return [u, v];
}

export function fromUVToDirection(u: number, v: number): Vector3 {
	const theta = u * 2 * Math.PI - Math.PI;
	const phi = v * Math.PI;
	const sinPhi = Math.sin(phi);
	return new Vector3(
		sinPhi * Math.cos(theta),
		sinPhi * Math.sin(theta),
		Math.cos(phi)
	);
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:unit -- src/lib/voronoi/__tests__/uv-mapping.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/uv-mapping.ts src/lib/voronoi/__tests__/uv-mapping.test.ts
git commit -m "feat(voronoi): add spherical UV mapping with round-trip support"
```

---

## Task 4: Voronoi computation with d3-delaunay and Lloyd relaxation

**Files:**
- Create: `src/lib/voronoi/compute-voronoi.ts`
- Create: `src/lib/voronoi/__tests__/compute-voronoi.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/voronoi/__tests__/compute-voronoi.test.ts`:

```typescript
import { computeVoronoi, lloydRelax } from '../compute-voronoi';

describe('computeVoronoi', () => {
	const seeds: [number, number][] = [
		[0.2, 0.3],
		[0.5, 0.5],
		[0.8, 0.3],
		[0.5, 0.8]
	];

	it('returns edges connecting voronoi vertices', () => {
		const result = computeVoronoi(seeds);
		expect(result.edges.length).toBeGreaterThan(0);
		result.edges.forEach((edge) => {
			expect(edge.vertices).toHaveLength(2);
			expect(edge.vertices[0]).toHaveLength(2);
			expect(edge.vertices[1]).toHaveLength(2);
		});
	});

	it('each edge references two adjacent cells', () => {
		const result = computeVoronoi(seeds);
		result.edges.forEach((edge) => {
			expect(edge.cellIndices).toHaveLength(2);
			expect(edge.cellIndices[0]).not.toBe(edge.cellIndices[1]);
			expect(edge.cellIndices[0]).toBeGreaterThanOrEqual(0);
			expect(edge.cellIndices[1]).toBeGreaterThanOrEqual(0);
			expect(edge.cellIndices[0]).toBeLessThan(seeds.length);
			expect(edge.cellIndices[1]).toBeLessThan(seeds.length);
		});
	});

	it('returns the original seeds', () => {
		const result = computeVoronoi(seeds);
		expect(result.seeds).toEqual(seeds);
	});
});

describe('lloydRelax', () => {
	it('moves seeds toward cell centroids', () => {
		const seeds: [number, number][] = [
			[0.1, 0.1],
			[0.9, 0.1],
			[0.1, 0.9],
			[0.9, 0.9]
		];
		const relaxed = lloydRelax(seeds, 5);
		expect(relaxed).toHaveLength(seeds.length);
		relaxed.forEach(([u, v]) => {
			expect(u).toBeGreaterThan(0);
			expect(u).toBeLessThan(1);
			expect(v).toBeGreaterThan(0);
			expect(v).toBeLessThan(1);
		});
	});

	it('returns seeds unchanged when iterations is 0', () => {
		const seeds: [number, number][] = [
			[0.2, 0.3],
			[0.8, 0.7]
		];
		const relaxed = lloydRelax(seeds, 0);
		expect(relaxed).toEqual(seeds);
	});

	it('produces more uniform spacing after relaxation', () => {
		const clustered: [number, number][] = [
			[0.1, 0.1],
			[0.12, 0.11],
			[0.9, 0.9],
			[0.88, 0.91]
		];
		const relaxed = lloydRelax(clustered, 20);

		const distanceBefore = Math.hypot(
			clustered[0][0] - clustered[1][0],
			clustered[0][1] - clustered[1][1]
		);
		const distanceAfter = Math.hypot(
			relaxed[0][0] - relaxed[1][0],
			relaxed[0][1] - relaxed[1][1]
		);
		expect(distanceAfter).toBeGreaterThan(distanceBefore);
	});
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test:unit -- src/lib/voronoi/__tests__/compute-voronoi.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement Voronoi computation**

Create `src/lib/voronoi/compute-voronoi.ts`:

```typescript
import { Delaunay } from 'd3-delaunay';
import type { VoronoiEdge, VoronoiResult } from './types';

// NOTE: V1 does not handle UV seam wrapping. Seeds near the seam boundary (u≈0 or u≈1)
// may produce distorted cells. Future improvement: duplicate seeds across the seam before
// computing Voronoi, then clip/merge the results.
const UV_BOUNDS: [number, number, number, number] = [0, 0, 1, 1];

export function computeVoronoi(seeds: [number, number][]): VoronoiResult {
	const flat = seeds.flat();
	const delaunay = new Delaunay(flat);
	const voronoi = delaunay.voronoi(UV_BOUNDS);

	const edges: VoronoiEdge[] = [];
	const vertexSet = new Map<string, number>();
	const vertices: [number, number][] = [];

	const getVertexIndex = (x: number, y: number): number => {
		const key = `${x.toFixed(10)},${y.toFixed(10)}`;
		let idx = vertexSet.get(key);
		if (idx === undefined) {
			idx = vertices.length;
			vertices.push([x, y]);
			vertexSet.set(key, idx);
		}
		return idx;
	};

	for (let cellIdx = 0; cellIdx < seeds.length; cellIdx++) {
		const cell = voronoi.cellPolygon(cellIdx);
		if (!cell) continue;

		for (let i = 0; i < cell.length - 1; i++) {
			const [x0, y0] = cell[i];
			const [x1, y1] = cell[i + 1];

			const neighborIdx = findNeighborSharingEdge(
				voronoi,
				seeds.length,
				cellIdx,
				[x0, y0],
				[x1, y1]
			);
			if (neighborIdx === -1 || neighborIdx < cellIdx) continue;

			edges.push({
				vertices: [
					[x0, y0],
					[x1, y1]
				],
				cellIndices: [cellIdx, neighborIdx]
			});
		}
	}

	return { edges, seeds, vertices };
}

function findNeighborSharingEdge(
	voronoi: ReturnType<Delaunay<Float64Array>['voronoi']>,
	cellCount: number,
	cellIdx: number,
	v0: [number, number],
	v1: [number, number]
): number {
	const neighbors = voronoi.delaunay.neighbors(cellIdx);
	for (const nIdx of neighbors) {
		const neighborCell = voronoi.cellPolygon(nIdx);
		if (!neighborCell) continue;

		for (let j = 0; j < neighborCell.length - 1; j++) {
			const [nx0, ny0] = neighborCell[j];
			const [nx1, ny1] = neighborCell[j + 1];

			const edgeMatch =
				(close(nx0, v1[0]) && close(ny0, v1[1]) && close(nx1, v0[0]) && close(ny1, v0[1])) ||
				(close(nx0, v0[0]) && close(ny0, v0[1]) && close(nx1, v1[0]) && close(ny1, v1[1]));

			if (edgeMatch) return nIdx;
		}
	}
	return -1;
}

const EPSILON = 1e-8;
function close(a: number, b: number): boolean {
	return Math.abs(a - b) < EPSILON;
}

export function lloydRelax(
	seeds: [number, number][],
	iterations: number
): [number, number][] {
	if (iterations === 0) return seeds;

	let current = seeds.slice();

	for (let iter = 0; iter < iterations; iter++) {
		const flat = current.flat();
		const delaunay = new Delaunay(flat);
		const voronoi = delaunay.voronoi(UV_BOUNDS);

		const next: [number, number][] = current.map((seed, i) => {
			const cell = voronoi.cellPolygon(i);
			if (!cell || cell.length < 3) return seed;

			let cx = 0;
			let cy = 0;
			let area = 0;

			for (let j = 0; j < cell.length - 1; j++) {
				const [x0, y0] = cell[j];
				const [x1, y1] = cell[j + 1];
				const cross = x0 * y1 - x1 * y0;
				cx += (x0 + x1) * cross;
				cy += (y0 + y1) * cross;
				area += cross;
			}

			area /= 2;
			if (Math.abs(area) < 1e-12) return seed;

			cx /= 6 * area;
			cy /= 6 * area;

			cx = Math.max(0.001, Math.min(0.999, cx));
			cy = Math.max(0.001, Math.min(0.999, cy));

			return [cx, cy];
		});

		current = next;
	}

	return current;
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:unit -- src/lib/voronoi/__tests__/compute-voronoi.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/compute-voronoi.ts src/lib/voronoi/__tests__/compute-voronoi.test.ts
git commit -m "feat(voronoi): add d3-delaunay Voronoi computation with Lloyd relaxation"
```

---

## Task 5: Cross-section application for Voronoi edges

**Files:**
- Create: `src/lib/voronoi/apply-cross-sections.ts`
- Create: `src/lib/voronoi/__tests__/apply-cross-sections.test.ts`

This module takes sampled 3D points along a Voronoi edge plus a "curve" offset direction and applies cross-section geometry at each sample — producing the same `ProjectionEdge.sections` structure that the projection pipeline generates.

- [ ] **Step 1: Write failing tests**

Create `src/lib/voronoi/__tests__/apply-cross-sections.test.ts`:

```typescript
import { Vector3, Vector2 } from 'three';
import { applyCrossSectionsToEdge } from '../apply-cross-sections';
import type { CrossSectionConfig } from '$lib/projection-geometry/types';

const makeSimpleCrossSection = (): CrossSectionConfig => ({
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig2', x: 0, y: 0 },
				{ type: 'PointConfig2', x: 0.33, y: 0 },
				{ type: 'PointConfig2', x: 0.66, y: 0 },
				{ type: 'PointConfig2', x: 1, y: 0 }
			]
		}
	],
	center: { x: 0.5, y: 0 },
	sampleMethod: { method: 'divideCurvePath', divisions: 3 },
	scaling: { width: 10, height: 10 },
	shouldSkewCurve: false
});

describe('applyCrossSectionsToEdge', () => {
	it('returns one section per sample point', () => {
		const edgePoints = [
			new Vector3(0, 0, 0),
			new Vector3(1, 0, 0),
			new Vector3(2, 0, 0)
		];
		const curvePoints = [
			new Vector3(0, 1, 0),
			new Vector3(1, 1, 0),
			new Vector3(2, 1, 0)
		];
		const normals = [
			new Vector3(0, 0, 1),
			new Vector3(0, 0, 1),
			new Vector3(0, 0, 1)
		];

		const sections = applyCrossSectionsToEdge(
			edgePoints,
			curvePoints,
			normals,
			makeSimpleCrossSection()
		);

		expect(sections).toHaveLength(3);
	});

	it('each section has intersections and crossSectionPoints', () => {
		const edgePoints = [new Vector3(0, 0, 0)];
		const curvePoints = [new Vector3(0, 5, 0)];
		const normals = [new Vector3(0, 0, 1)];

		const sections = applyCrossSectionsToEdge(
			edgePoints,
			curvePoints,
			normals,
			makeSimpleCrossSection()
		);

		expect(sections[0].intersections.edge).toBeDefined();
		expect(sections[0].intersections.curve).toBeDefined();
		expect(sections[0].crossSectionPoints.length).toBeGreaterThan(0);
	});

	it('cross-section points are centered on the edge point', () => {
		const edgePoints = [new Vector3(10, 0, 0)];
		const curvePoints = [new Vector3(10, 5, 0)];
		const normals = [new Vector3(0, 0, 1)];

		const sections = applyCrossSectionsToEdge(
			edgePoints,
			curvePoints,
			normals,
			makeSimpleCrossSection()
		);

		const centroid = new Vector3();
		sections[0].crossSectionPoints.forEach((p) => centroid.add(p));
		centroid.divideScalar(sections[0].crossSectionPoints.length);

		expect(centroid.x).toBeCloseTo(10, 1);
	});
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test:unit -- src/lib/voronoi/__tests__/apply-cross-sections.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement cross-section application**

Create `src/lib/voronoi/apply-cross-sections.ts`:

```typescript
import { Vector3 } from 'three';
import type { CrossSectionConfig, ProjectionEdge } from '$lib/projection-geometry/types';
import {
	getPoints,
	getCrossSectionScale
} from '$lib/projection-geometry/generate-projection';

type EdgeSection = ProjectionEdge['sections'][number];

export function applyCrossSectionsToEdge(
	edgePoints: Vector3[],
	curvePoints: Vector3[],
	normals: Vector3[],
	crossSectionConfig: CrossSectionConfig
): EdgeSection[] {
	const definitionPoints = getPoints(
		crossSectionConfig.curves,
		crossSectionConfig.sampleMethod
	);
	const xMax = definitionPoints.reduce((max, p) => Math.max(max, p.x), 0);
	const normalizedPoints = definitionPoints.map((p) => p.clone().set(p.x / xMax, p.y));

	const xDirection = new Vector3();
	const yDirection = new Vector3();
	const nearestPoint = new Vector3();

	return edgePoints.map((edgePoint, i): EdgeSection => {
		const curvePoint = curvePoints[i];
		const normal = normals[i];

		if (crossSectionConfig.shouldSkewCurve) {
			xDirection.copy(curvePoint).sub(edgePoint).normalize();
		} else {
			const edgeToCurve = new Vector3().copy(curvePoint).sub(edgePoint);
			const normalComponent = normal.clone().multiplyScalar(edgeToCurve.dot(normal));
			xDirection.copy(edgeToCurve).sub(normalComponent).normalize();
		}
		yDirection.copy(normal).normalize();

		const baseScalingLength = edgePoint.distanceTo(curvePoint);
		const { xScale, yScale } = getCrossSectionScale(
			crossSectionConfig.scaling,
			baseScalingLength
		);

		const crossSectionPoints = normalizedPoints.map((p) =>
			edgePoint
				.clone()
				.addScaledVector(xDirection, (p.x - crossSectionConfig.center.x) * xScale)
				.addScaledVector(yDirection, (p.y - crossSectionConfig.center.y) * yScale)
		);

		return {
			intersections: { edge: edgePoint.clone(), curve: curvePoint.clone() },
			crossSectionPoints
		};
	});
}
```

- [ ] **Step 4: Verify `getPoints` and `getCrossSectionScale` are exported**

Check that `generate-projection.ts` exports both functions. They should already be exported (confirmed: lines 400 and 412 have `export const`). If not, add `export` to them.

- [ ] **Step 5: Run tests**

```bash
npm run test:unit -- src/lib/voronoi/__tests__/apply-cross-sections.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/voronoi/apply-cross-sections.ts src/lib/voronoi/__tests__/apply-cross-sections.test.ts
git commit -m "feat(voronoi): add cross-section application for Voronoi edges"
```

---

## Task 6: Main pipeline — `makeVoronoi`

**Files:**
- Create: `src/lib/voronoi/generate-voronoi.ts`
- Create: `src/lib/voronoi/__tests__/generate-voronoi.test.ts`

This is the full pipeline: VoronoiConfig → surface + seeds → UV + relaxation → Voronoi edges → 3D edge sampling → cross-sections → `combineSections` → `generateProjectionBands` → `matchTubeEnds`/`matchFacets` → `{ tubes, surface }`.

- [ ] **Step 1: Write failing integration test**

Create `src/lib/voronoi/__tests__/generate-voronoi.test.ts`:

```typescript
import { makeVoronoi } from '../generate-voronoi';
import type { VoronoiConfig } from '../types';
import { getDefaultSurfaceConfig } from '$lib/projection-geometry/surface-definitions';
import type { GlobuleAddress } from '$lib/projection-geometry/types';

const makeTestConfig = (): VoronoiConfig => ({
	type: 'VoronoiConfig',
	meta: {
		transform: {
			translate: { x: 0, y: 0, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			rotate: { x: 0, y: 0, z: 0 }
		}
	},
	surfaceConfig: getDefaultSurfaceConfig(),
	seedConfig: {
		type: 'VoronoiSeedConfig',
		seedMethod: {
			type: 'centerProjection',
			pointCount: 8,
			seed: 42
		},
		relaxationIterations: 3
	},
	crossSectionConfig: {
		curves: [
			{
				type: 'BezierConfig',
				points: [
					{ type: 'PointConfig2', x: 0, y: 0 },
					{ type: 'PointConfig2', x: 0.33, y: 0 },
					{ type: 'PointConfig2', x: 0.66, y: 0 },
					{ type: 'PointConfig2', x: 1, y: 0 }
				]
			}
		],
		center: { x: 0.5, y: 0 },
		sampleMethod: { method: 'divideCurvePath', divisions: 3 },
		scaling: { width: 5, height: 5 },
		shouldSkewCurve: false
	},
	bandConfig: {
		orientation: 'axial-right',
		tubeSymmetry: 'lateral'
	},
	edgeDivisions: 4
});

describe('makeVoronoi', () => {
	it('returns tubes and surface', () => {
		const address: GlobuleAddress = { globule: 0 };
		const result = makeVoronoi(makeTestConfig(), address);
		expect(result.tubes).toBeDefined();
		expect(result.surface).toBeDefined();
		expect(Array.isArray(result.tubes)).toBe(true);
	});

	it('generates at least one tube', () => {
		const address: GlobuleAddress = { globule: 0 };
		const result = makeVoronoi(makeTestConfig(), address);
		expect(result.tubes.length).toBeGreaterThan(0);
	});

	it('each tube has bands with facets', () => {
		const address: GlobuleAddress = { globule: 0 };
		const result = makeVoronoi(makeTestConfig(), address);
		result.tubes.forEach((tube) => {
			expect(tube.bands.length).toBeGreaterThan(0);
			tube.bands.forEach((band) => {
				expect(band.facets.length).toBeGreaterThan(0);
			});
		});
	});

	it('each tube has sections with points', () => {
		const address: GlobuleAddress = { globule: 0 };
		const result = makeVoronoi(makeTestConfig(), address);
		result.tubes.forEach((tube) => {
			expect(tube.sections.length).toBeGreaterThan(0);
			tube.sections.forEach((section) => {
				expect(section.points.length).toBeGreaterThan(0);
			});
		});
	});

	it('facets have triangle geometry', () => {
		const address: GlobuleAddress = { globule: 0 };
		const result = makeVoronoi(makeTestConfig(), address);
		const facet = result.tubes[0].bands[0].facets[0];
		expect(facet.triangle).toBeDefined();
		expect(facet.triangle.a).toBeDefined();
		expect(facet.triangle.b).toBeDefined();
		expect(facet.triangle.c).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test:unit -- src/lib/voronoi/__tests__/generate-voronoi.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `makeVoronoi`**

Create `src/lib/voronoi/generate-voronoi.ts`:

```typescript
import { Vector3, Raycaster, type Object3D } from 'three';
import type { VoronoiConfig } from './types';
import type {
	GlobuleAddress,
	GlobuleAddress_Tube,
	ProjectionEdge,
	Tube,
	Section,
	EdgeConfig,
	CrossSectionConfig,
	EdgeCurveConfig
} from '$lib/projection-geometry/types';
import type { Point3 } from '$lib/types';
import {
	generateSurface,
	generateProjectionBands,
	getEdgeMatchedTriangles,
	getEdge
} from '$lib/projection-geometry/generate-projection';
import { generateSeeds } from './generate-seeds';
import { toUV, fromUVToDirection } from './uv-mapping';
import { computeVoronoi, lloydRelax } from './compute-voronoi';
import { applyCrossSectionsToEdge } from './apply-cross-sections';

export function makeVoronoi(
	config: VoronoiConfig,
	address: GlobuleAddress
): { tubes: Tube[]; surface: Object3D } {
	const surface = generateSurface(config.surfaceConfig);

	const center = getSurfaceCenter(config.surfaceConfig);
	const raycaster = new Raycaster(undefined, undefined, undefined, 2000);

	const intersect = (direction: Vector3): Vector3 | null => {
		raycaster.set(center, direction.clone().normalize());
		const hits = raycaster.intersectObject(surface, true);
		return hits.length > 0 ? hits[0].point.clone() : null;
	};

	const seeds3D = generateSeeds(config.seedConfig.seedMethod, center, intersect);
	let seedsUV = seeds3D.map((s) => toUV(s, center));

	seedsUV = lloydRelax(seedsUV, config.seedConfig.relaxationIterations);

	const voronoiResult = computeVoronoi(seedsUV);

	const edgePairs = buildEdgePairs(
		voronoiResult,
		seedsUV,
		center,
		surface,
		raycaster,
		config
	);

	const { orientation, tubeSymmetry } = config.bandConfig;
	const tubes: Tube[] = [];

	for (let i = 0; i < edgePairs.length; i++) {
		const [edge0, edge1] = edgePairs[i];
		const tubeAddress: GlobuleAddress_Tube = { ...address, tube: i };

		edge0.tubeAddress = tubeAddress;
		edge1.tubeAddress = tubeAddress;

		const sections = combineSections(edge0, edge1);
		const bands = generateProjectionBands(sections, orientation, tubeAddress, tubeSymmetry);
		tubes.push({
			bands,
			sections,
			orientation,
			address: tubeAddress
		});
	}

	matchTubeEnds(tubes);
	matchFacets(tubes);

	return { tubes, surface };
}

function getSurfaceCenter(surfaceConfig: VoronoiConfig['surfaceConfig']): Vector3 {
	if (surfaceConfig.type === 'GlobuleConfig') {
		return new Vector3(0, 0, 0);
	}
	const c = surfaceConfig.center;
	return new Vector3(c.x, c.y, c.z);
}

function buildEdgePairs(
	voronoiResult: ReturnType<typeof computeVoronoi>,
	seedsUV: [number, number][],
	center: Vector3,
	surface: Object3D,
	raycaster: Raycaster,
	config: VoronoiConfig
): [ProjectionEdge, ProjectionEdge][] {
	const { edgeDivisions, crossSectionConfig } = config;

	return voronoiResult.edges.map((voronoiEdge) => {
		const [v0uv, v1uv] = voronoiEdge.vertices;
		const [cellA, cellB] = voronoiEdge.cellIndices;
		const cellCenterA = seedsUV[cellA];
		const cellCenterB = seedsUV[cellB];

		const edgePoints: Vector3[] = [];
		const curvePointsA: Vector3[] = [];
		const curvePointsB: Vector3[] = [];
		const normals: Vector3[] = [];

		for (let d = 0; d <= edgeDivisions; d++) {
			const t = d / edgeDivisions;
			const u = v0uv[0] + t * (v1uv[0] - v0uv[0]);
			const v = v0uv[1] + t * (v1uv[1] - v0uv[1]);

			const direction = fromUVToDirection(u, v);
			raycaster.set(center, direction);
			const hits = raycaster.intersectObject(surface, true);
			if (hits.length === 0) continue;
			const edgePoint = hits[0].point.clone();
			const normal = hits[0].face
				? new Vector3().copy(hits[0].face.normal)
				: edgePoint.clone().normalize();

			const dirA = fromUVToDirection(cellCenterA[0], cellCenterA[1]);
			raycaster.set(center, dirA);
			const hitsA = raycaster.intersectObject(surface, true);
			const cellPoint3dA = hitsA.length > 0 ? hitsA[0].point.clone() : edgePoint.clone();

			const dirB = fromUVToDirection(cellCenterB[0], cellCenterB[1]);
			raycaster.set(center, dirB);
			const hitsB = raycaster.intersectObject(surface, true);
			const cellPoint3dB = hitsB.length > 0 ? hitsB[0].point.clone() : edgePoint.clone();

			const offsetA = cellPoint3dA.clone().sub(edgePoint).normalize();
			const offsetB = cellPoint3dB.clone().sub(edgePoint).normalize();

			const curveDistA = edgePoint.distanceTo(cellPoint3dA) * 0.3;
			const curveDistB = edgePoint.distanceTo(cellPoint3dB) * 0.3;

			curvePointsA.push(edgePoint.clone().addScaledVector(offsetA, curveDistA));
			curvePointsB.push(edgePoint.clone().addScaledVector(offsetB, curveDistB));
			edgePoints.push(edgePoint);
			normals.push(normal);
		}

		const sectionsA = applyCrossSectionsToEdge(
			edgePoints,
			curvePointsA,
			normals,
			crossSectionConfig
		);
		const sectionsB = applyCrossSectionsToEdge(
			edgePoints,
			curvePointsB,
			normals,
			crossSectionConfig
		);

		const dummyEdgeConfig: EdgeConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig> = {
			vertex0: { x: 0, y: 0, z: 0 },
			vertex1: { x: 0, y: 0, z: 0 },
			isDirectionMatched: true,
			widthCurve: { curves: [], sampleMethod: { method: 'divideCurvePath', divisions: 1 } },
			crossSectionCurve: crossSectionConfig
		};

		const edgeA: ProjectionEdge = {
			config: { ...dummyEdgeConfig, isDirectionMatched: true },
			sections: sectionsA
		};
		const edgeB: ProjectionEdge = {
			config: { ...dummyEdgeConfig, isDirectionMatched: true },
			sections: sectionsB
		};

		return [edgeA, edgeB] as [ProjectionEdge, ProjectionEdge];
	});
}

function combineSections(edge0: ProjectionEdge, edge1: ProjectionEdge): Section[] {
	const first = edge0.config.isDirectionMatched
		? edge0
		: { ...edge0, sections: edge0.sections.slice().reverse() };
	const second = edge1.config.isDirectionMatched
		? edge1
		: { ...edge1, sections: edge1.sections.slice().reverse() };

	return first.sections.map((section, i): Section => {
		const comboSection = {
			points: [
				...section.crossSectionPoints,
				...second.sections[i].crossSectionPoints.slice().reverse().slice(1)
			]
		};
		return !edge1.config.isDirectionMatched
			? comboSection
			: { ...comboSection, points: comboSection.points.slice().reverse() };
	});
}

function matchTubeEnds(tubes: Tube[]) {
	const endFacets: { facet: typeof tubes[0]['bands'][0]['facets'][0]; tubeIdx: number }[] = [];
	tubes.forEach((tube, tubeIdx) =>
		tube.bands.forEach((band) =>
			band.facets.forEach((facet, f, facets) => {
				if (f === 0 || f === facets.length - 1) {
					endFacets.push({ facet, tubeIdx });
				}
			})
		)
	);

	tubes.forEach((tube, t) =>
		tube.bands.forEach((band, b) => {
			const firstFacet = band.facets[0];
			const lastFacet = band.facets[band.facets.length - 1];

			[firstFacet, lastFacet].forEach((facet) => {
				if (!facet.address) return;
				const edgeToMatch = getEdge('base', facet === firstFacet ? 'even' : band.facets.length - 1, facet.orientation);

				for (const { facet: candidate, tubeIdx } of endFacets) {
					if (tubeIdx === t) continue;
					if (!candidate.address) continue;
					const match = getEdgeMatchedTriangles(facet.triangle, candidate.triangle, edgeToMatch);
					if (match) {
						const newMeta: Record<string, { partner: object }> = {};
						newMeta[match.t0] = {
							partner: { ...candidate.address, edge: match.t1 }
						};
						facet.meta = facet.meta ? { ...facet.meta, ...newMeta } : (newMeta as typeof facet.meta);
						break;
					}
				}
			});
		})
	);
}

function matchFacets(tubes: Tube[]) {
	// Import and call the existing getFacetEdgeMeta logic
	// For Voronoi, we reuse the same facet matching as projection
	tubes.forEach((tube) =>
		tube.bands.forEach((band) =>
			band.facets.forEach((facet) => {
				if (!facet.address) return;
				if (!facet.meta) {
					facet.meta = { ab: { partner: {} }, bc: { partner: {} }, ac: { partner: {} } } as typeof facet.meta;
				}
				// Internal facet partners (within band) are computed by band position
				const f = facet.address.facet;
				const isEven = f % 2 === 0;
				const bandCount = tube.bands.length;
				const b = facet.address.band;

				const bandOffset = (facet.orientation === 'axial-left' ? -1 : 1) * (isEven ? -1 : 1);
				const partnerBand = (b + bandOffset + bandCount) % bandCount;
				const partnerBandOrientation = tube.bands[partnerBand]?.orientation ?? facet.orientation;
				const facetOffset = (isEven ? 1 : -1) * (partnerBandOrientation === facet.orientation ? 1 : 0);
				const partnerFacet = f + facetOffset;

				const second = getEdge('second', f, facet.orientation);
				const outer = getEdge('outer', f, facet.orientation);
				const pOuter = getEdge('outer', f, partnerBandOrientation);

				const isFirst = f === 0;
				const isLast = f === band.facets.length - 1;

				if (!isFirst && facet.meta) {
					const base = getEdge('base', f, facet.orientation);
					(facet.meta as Record<string, { partner: object }>)[base] = {
						partner: { ...facet.address, facet: f - 1, edge: getEdge('second', f - 1, facet.orientation) }
					};
				}
				if (!isLast && facet.meta) {
					(facet.meta as Record<string, { partner: object }>)[second] = {
						partner: { ...facet.address, facet: f + 1, edge: second }
					};
				}
				if (facet.meta) {
					(facet.meta as Record<string, { partner: object }>)[outer] = {
						partner: { ...facet.address, band: partnerBand, facet: partnerFacet, edge: pOuter }
					};
				}
			})
		)
	);
}
```

**Important:** The `matchTubeEnds` and `matchFacets` functions above are local reimplementations. The preferred approach is to export the existing functions from `generate-projection.ts` (they are currently un-exported `const` functions at lines 1041 and 844). Add `export` to both in `generate-projection.ts`, then replace the local implementations with imports:

```typescript
import { matchTubeEnds, matchFacets } from '$lib/projection-geometry/generate-projection';
```

Also export `getEdgeMatchedTriangles` (line 1156) if not already exported (it is — confirmed). Try this first; only fall back to the local reimplementations if the imports cause circular dependency or test issues.

- [ ] **Step 4: Run tests**

```bash
npm run test:unit -- src/lib/voronoi/__tests__/generate-voronoi.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Fix any issues**

If tests fail, debug by checking:
- Surface generation works (check `getDefaultSurfaceConfig()` returns a valid sphere config)
- Raycasting hits the surface (ensure BVH is applied)
- UV mapping and Voronoi edge extraction produce valid edges
- Cross-section application produces non-empty sections

- [ ] **Step 6: Commit**

```bash
git add src/lib/voronoi/generate-voronoi.ts src/lib/voronoi/__tests__/generate-voronoi.test.ts
git commit -m "feat(voronoi): add makeVoronoi pipeline — full config to tubes generation"
```

---

## Task 7: Worker and store integration

**Files:**
- Modify: `src/lib/generate-superglobule.ts`
- Modify: `src/lib/stores/workerStore.ts`
- Modify: `src/lib/shades-config.ts`

- [ ] **Step 1: Add `makeVoronoi` to `generate-superglobule.ts`**

In `src/lib/generate-superglobule.ts`, add the Voronoi pipeline alongside the projection pipeline:

Add import at top:
```typescript
import { makeVoronoi } from './voronoi/generate-voronoi';
```

Modify `generateSuperGlobule` function (after line 35, before constructing `superGlobule`):

```typescript
export const generateSuperGlobule = (superConfig: SuperGlobuleConfig): SuperGlobule => {
	// Old Globule Pipeline
	const subGlobules: SubGlobule[] = recombineSubGlobules(
		superConfig.subGlobuleConfigs.map((sgc, index) => generateSubGlobule(sgc, index)).flat()
	);

	// New Globule Tube Pipeline
	const globuleTubes = superConfig.subGlobuleConfigs
		.map((sgc, index) => generateSubGlobuleTubes(sgc, index))
		.flat();

	// Projection Tube pipeline
	const projections = superConfig.projectionConfigs.map((config, i) => {
		return makeProjection(config, { globule: i });
	});

	// Voronoi Tube pipeline
	const voronoiResults = (superConfig.voronoiConfigs ?? []).map((config, i) => {
		return makeVoronoi(config, { globule: i });
	});

	const superGlobule: SuperGlobule = {
		type: 'SuperGlobule',
		superGlobuleConfigId: superConfig.id,
		name: superConfig.name,
		globuleTubes,
		subGlobules,
		projections,
		voronoiResults
	};
	return superGlobule;
};
```

- [ ] **Step 2: Add Voronoi rehydration to `workerStore.ts`**

In `rehydrateSuperGlobule` function (after the subGlobules rehydration, before the return):

```typescript
	// Rehydrate voronoiResults
	const voronoiResults = (result.voronoiResults ?? []).map((voronoiResult) => ({
		...voronoiResult,
		tubes: voronoiResult.tubes.map((tube) => ({
			...tube,
			sections: tube.sections.map((section) => ({
				points: section.points.map(rehydrateVector3)
			})),
			bands: tube.bands.map((band) => ({
				...band,
				facets: band.facets.map((facet) => ({
					...facet,
					triangle: rehydrateTriangle(
						facet.triangle as unknown as Parameters<typeof rehydrateTriangle>[0]
					)
				}))
			}))
		}))
	}));
```

Update the return statement to include `voronoiResults`:
```typescript
	return {
		...result,
		projections,
		globuleTubes,
		subGlobules,
		voronoiResults
	};
```

Also add surface regeneration after the projection surface regeneration (after line 197):
```typescript
		// Regenerate Voronoi surfaces
		(resolver.config.voronoiConfigs ?? []).forEach((voronoiConfig, i) => {
			if (rehydrated.voronoiResults?.[i]) {
				rehydrated.voronoiResults[i].surface = generateSurface(voronoiConfig.surfaceConfig);
			}
		});
```

- [ ] **Step 3: Add default VoronoiConfig to `shades-config.ts`**

Add import:
```typescript
import type { VoronoiConfig } from './voronoi/types';
```

Add default config (near the projection defaults):
```typescript
export const defaultVoronoiConfig: VoronoiConfig = {
	type: 'VoronoiConfig',
	meta: {
		transform: {
			translate: { x: 0, y: 0, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			rotate: { x: 0, y: 0, z: 0 }
		}
	},
	surfaceConfig: getDefaultSurfaceConfig(),
	seedConfig: {
		type: 'VoronoiSeedConfig',
		seedMethod: {
			type: 'centerProjection',
			pointCount: 12,
			seed: 42
		},
		relaxationIterations: 5
	},
	crossSectionConfig: {
		curves: [
			{
				type: 'BezierConfig',
				points: [
					{ type: 'PointConfig2', x: 0, y: 0 },
					{ type: 'PointConfig2', x: 0.33, y: 0 },
					{ type: 'PointConfig2', x: 0.66, y: 0 },
					{ type: 'PointConfig2', x: 1, y: 0 }
				]
			}
		],
		center: { x: 0.5, y: 0 },
		sampleMethod: { method: 'divideCurvePath', divisions: 4 },
		scaling: { width: 8, height: 8 },
		shouldSkewCurve: false
	},
	bandConfig: {
		orientation: 'axial-right',
		tubeSymmetry: 'lateral'
	},
	edgeDivisions: 6
};
```

You'll need to import `getDefaultSurfaceConfig` from the projection surface definitions if not already imported. Ensure the `generateDefaultSuperGlobuleConfig` function includes `voronoiConfigs: []` (added in Task 1).

- [ ] **Step 4: Verify everything compiles**

```bash
npm run check
```

Expected: No errors.

- [ ] **Step 5: Run all unit tests**

```bash
npm run test:unit
```

Expected: All existing + new tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/generate-superglobule.ts src/lib/stores/workerStore.ts src/lib/shades-config.ts
git commit -m "feat(voronoi): integrate Voronoi pipeline into worker and stores"
```

---

## Task 8: UI — VoronoiControl and designer2 integration

**Files:**
- Create: `src/components/controls/VoronoiControl.svelte`
- Modify: `src/routes/designer2/+page.svelte`

- [ ] **Step 1: Create `VoronoiControl.svelte`**

Create `src/components/controls/VoronoiControl.svelte`:

```svelte
<script lang="ts">
	import { superConfigStore } from '$lib/stores/superGlobuleStores';
	import { defaultVoronoiConfig } from '$lib/shades-config';
	import type { VoronoiConfig } from '$lib/voronoi/types';

	let configs: VoronoiConfig[] = $derived($superConfigStore.voronoiConfigs ?? []);

	function addVoronoi() {
		$superConfigStore = {
			...$superConfigStore,
			voronoiConfigs: [...($superConfigStore.voronoiConfigs ?? []), { ...defaultVoronoiConfig }]
		};
	}

	function removeVoronoi(index: number) {
		const updated = [...($superConfigStore.voronoiConfigs ?? [])];
		updated.splice(index, 1);
		$superConfigStore = {
			...$superConfigStore,
			voronoiConfigs: updated
		};
	}

	function updateConfig(index: number, field: string, value: number) {
		const updated = [...($superConfigStore.voronoiConfigs ?? [])];
		if (field === 'pointCount') {
			updated[index] = {
				...updated[index],
				seedConfig: {
					...updated[index].seedConfig,
					seedMethod: { ...updated[index].seedConfig.seedMethod, pointCount: value }
				}
			};
		} else if (field === 'seed') {
			updated[index] = {
				...updated[index],
				seedConfig: {
					...updated[index].seedConfig,
					seedMethod: { ...updated[index].seedConfig.seedMethod, seed: value }
				}
			};
		} else if (field === 'relaxationIterations') {
			updated[index] = {
				...updated[index],
				seedConfig: { ...updated[index].seedConfig, relaxationIterations: value }
			};
		} else if (field === 'edgeDivisions') {
			updated[index] = { ...updated[index], edgeDivisions: value };
		}
		$superConfigStore = { ...$superConfigStore, voronoiConfigs: updated };
	}

	function randomizeSeed(index: number) {
		updateConfig(index, 'seed', Math.floor(Math.random() * 100000));
	}
</script>

<section>
	<header>
		<h3>Voronoi Configs</h3>
		<button onclick={addVoronoi}>Add Voronoi</button>
	</header>

	{#each configs as config, i}
		<div class="config-block">
			<div class="config-header">
				<span>Voronoi {i}</span>
				<button onclick={() => removeVoronoi(i)}>Remove</button>
			</div>

			<label>
				Point Count
				<input
					type="range"
					min="4"
					max="50"
					value={config.seedConfig.seedMethod.pointCount}
					oninput={(e) => updateConfig(i, 'pointCount', Number(e.currentTarget.value))}
				/>
				<span>{config.seedConfig.seedMethod.pointCount}</span>
			</label>

			<label>
				Seed
				<input
					type="number"
					value={config.seedConfig.seedMethod.seed}
					oninput={(e) => updateConfig(i, 'seed', Number(e.currentTarget.value))}
				/>
				<button onclick={() => randomizeSeed(i)}>Randomize</button>
			</label>

			<label>
				Relaxation Iterations
				<input
					type="range"
					min="0"
					max="20"
					value={config.seedConfig.relaxationIterations}
					oninput={(e) => updateConfig(i, 'relaxationIterations', Number(e.currentTarget.value))}
				/>
				<span>{config.seedConfig.relaxationIterations}</span>
			</label>

			<label>
				Edge Divisions
				<input
					type="range"
					min="2"
					max="20"
					value={config.edgeDivisions}
					oninput={(e) => updateConfig(i, 'edgeDivisions', Number(e.currentTarget.value))}
				/>
				<span>{config.edgeDivisions}</span>
			</label>
		</div>
	{/each}

	{#if configs.length === 0}
		<p>No Voronoi configs. Click "Add Voronoi" to start.</p>
	{/if}
</section>

<style>
	section {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.config-block {
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.config-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-weight: bold;
	}
	label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}
	label span {
		min-width: 30px;
		text-align: right;
	}
</style>
```

- [ ] **Step 2: Add "Voronoi" to designer2 SelectBar**

Modify `src/routes/designer2/+page.svelte`:

Add import (near other component imports):
```typescript
import VoronoiControl from '../../components/controls/VoronoiControl.svelte';
```

Add `{ name: 'Voronoi' }` to the SelectBar options array (after `{ name: 'Projection' }`):
```typescript
options={[
	{ name: 'Silhouette', value: 'SilhouetteConfig' },
	{ name: 'Depth', value: 'DepthCurveConfig' },
	{ name: 'Spine', value: 'SpineCurveConfig' },
	{ name: 'Shape', value: 'ShapeConfig' },
	{ name: 'Projection' },
	{ name: 'Voronoi' },
	{ name: 'Levels' },
	{ name: 'Struts' },
	{ name: 'Cut' },
	{ name: 'Pattern' },
	{ name: 'Super' }
]}
```

Add conditional render (after the ProjectionControl block):
```svelte
{:else if showControl?.name === 'Voronoi'}
	<VoronoiControl />
```

- [ ] **Step 3: Ensure Voronoi tubes render in 3D viewport**

In `src/lib/stores/superGlobuleStores.ts`, find the derived store that extracts tubes from `SuperGlobule` for rendering. It's likely a `derived()` store that maps over `superGlobule.projections` to collect all tubes. Add voronoi tubes to that collection:

```bash
grep -n "projections.*tubes\|\.tubes\b" src/lib/stores/superGlobuleStores.ts
```

At the location where projection tubes are collected (e.g., `superGlobule.projections.flatMap(p => p.tubes)`), append voronoi tubes:

```typescript
const allTubes = [
	...superGlobule.projections.flatMap(p => p.tubes),
	...(superGlobule.voronoiResults ?? []).flatMap(r => r.tubes)
];
```

If the renderer instead iterates `projections` directly to get surfaces and tubes together, add a parallel iteration for `voronoiResults`. The voronoi surfaces are in `voronoiResults[].surface`.

- [ ] **Step 4: Verify type check**

```bash
npm run check
```

Expected: No errors.

- [ ] **Step 5: Start dev server and test**

```bash
npm run dev
```

1. Open the app in browser
2. Navigate to designer2
3. Click "Voronoi" in the SelectBar
4. Click "Add Voronoi"
5. Adjust sliders and verify the 3D viewport updates
6. Verify no console errors

- [ ] **Step 6: Commit**

```bash
git add src/components/controls/VoronoiControl.svelte src/routes/designer2/+page.svelte src/lib/stores/superGlobuleStores.ts
git commit -m "feat(voronoi): add VoronoiControl UI and designer2 integration"
```

---

## Task 9: End-to-end verification and cleanup

- [ ] **Step 1: Run all unit tests**

```bash
npm run test:unit
```

Expected: All tests pass.

- [ ] **Step 2: Run type check**

```bash
npm run check
```

Expected: No errors.

- [ ] **Step 3: Run linter**

```bash
npm run lint
```

Fix any lint issues.

- [ ] **Step 4: Manual testing in browser**

```bash
npm run dev
```

Verify:
1. Default config (no voronoi) still works — projections render correctly
2. Add a Voronoi config → tubes appear in 3D viewport
3. Adjust point count → geometry changes (more/fewer cells)
4. Adjust relaxation → cells become more uniform
5. Randomize seed → different pattern
6. Adjust edge divisions → tube smoothness changes
7. Switch to pattern view → flattened patterns render (if cut pattern is configured)
8. No console errors throughout

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat(voronoi): end-to-end verification and cleanup"
```
