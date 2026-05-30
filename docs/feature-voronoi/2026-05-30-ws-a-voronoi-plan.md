# WS-A Voronoi (Area-Weighted Seeds + Single Config + Floating Editor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an area-weighted surface seed method (new default) to the Voronoi feature, collapse the multi-`voronoiConfigs[]` model to a single optional `voronoiConfig`, and move the config UI into a floating editor that boots with one randomly-seeded default config.

**Architecture:** Seed generation gains a pure `generateAreaWeightedSeeds` that samples points on supplied surface triangles proportional to facet area; `makeVoronoi` extracts those triangles from the `Object3D` surface it already builds and threads them through `generateSeeds`. The config hierarchy (`SuperGlobuleConfig.voronoiConfigs` → `voronoiConfig?`, `SuperGlobule.voronoiResults` → `voronoiResult?`) is made singular across types, generation, the worker boundary, rehydration, stores, and components. A reusable `Floater.svelte` hosts `VoronoiControl.svelte`, and a pure store-hydration normalizer migrates persisted state and injects a randomly-seeded default config on boot.

**Tech Stack:** SvelteKit + Three.js (Vector3, Object3D, Mesh, BufferGeometry) + TypeScript; geometry runs in a Web Worker (keep new data serialization-safe); Jest for unit tests; `npm run check` for type checking.

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `src/lib/voronoi/types.ts` | Modify | Add `AreaWeightedSeedMethod`, widen `SeedMethod` union, add `SurfaceTriangle` type |
| `src/lib/voronoi/generate-seeds.ts` | Modify | Add cumulative-area table builder + `generateAreaWeightedSeeds`; widen `generateSeeds` signature with `surfaceTriangles` |
| `src/lib/voronoi/__tests__/generate-seeds.test.ts` | Modify | Add tests for area table builder + area-weighted seeds; update existing `generateSeeds` calls to new arity |
| `src/lib/voronoi/extract-surface-triangles.ts` | Create | Pure helper: traverse an `Object3D` and return its world-space `SurfaceTriangle[]` |
| `src/lib/voronoi/__tests__/extract-surface-triangles.test.ts` | Create | Tests for triangle extraction from a `Mesh` |
| `src/lib/voronoi/generate-voronoi.ts` | Modify | Extract surface triangles, pass to `generateSeeds` |
| `src/lib/voronoi/migrate-voronoi-config.ts` | Create | Pure normalizer: collapse `voronoiConfigs[]`/legacy into a single `voronoiConfig` + boot default |
| `src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts` | Create | Tests for the normalizer |
| `src/lib/types.ts` | Modify | `SuperGlobuleConfig.voronoiConfigs` → `voronoiConfig?`; `SuperGlobule.voronoiResults` → `voronoiResult?` |
| `src/lib/shades-config.ts` | Modify | `defaultVoronoiConfig` seed method → `areaWeighted`; drop `voronoiConfigs: []` from defaults |
| `src/lib/generate-superglobule.ts` | Modify | Build single `voronoiResult` instead of mapping an array |
| `src/lib/workers/super-globule.worker.ts` | Modify | Serialize single `voronoiResult` |
| `src/lib/stores/workerStore.ts` | Modify | Rehydrate + regenerate surface for single `voronoiResult` |
| `src/lib/stores/superGlobuleStores.ts` | Modify | Read `voronoiResult` directly; apply normalizer in hydration |
| `src/components/projection/ProjectionGeometryComponent.svelte` | Modify | Read single `voronoiResult` |
| `src/components/controls/VoronoiControl.svelte` | Modify | Edit single `voronoiConfig`; drop add/remove; expose seed-method selector |
| `src/routes/designer2/+page.svelte` | Modify | Replace SelectBar `Voronoi` branch with a `Floater`-hosted `VoronoiControl` toggle |

---

## Conventions verified

- Unit tests: Jest, colocated under `src/lib/voronoi/__tests__/*.test.ts`. Run one file: `npm run test:unit -- <path>`.
- Type check: `npm run check`.
- `mulberry32` exists in `generate-seeds.ts` (private). The area-weighted method reuses it within the same file.
- Surface is an `Object3D` built by `generateSurface` (`src/lib/projection-geometry/generate-projection.ts:222`); it contains `Mesh` children with `BufferGeometry`. `makeVoronoi` already holds it as `const surface` (`generate-voronoi.ts:293`).
- Three.js `Vector3`/`Triangle` do not serialize through `postMessage`; `SurfaceTriangle` is `[Vector3, Vector3, Vector3]` and is used **only inside the worker** (never crosses the boundary), so it is safe.

---

## Resolved open implementation details

- **Surface-triangle source:** the local `surface: Object3D` already built in `makeVoronoi` (`generate-voronoi.ts:293`). New helper `extractSurfaceTriangles(surface)` traverses it, reads each `Mesh`'s position attribute in world space (`Mesh.localToWorld`), and emits one `SurfaceTriangle` per triangle (indexed or non-indexed).
- **Barycentric scheme from `t`:** deterministic, single-`t` mapping. Given `t ∈ [0,1)`, set `u = t`, `v = (t * 7919) mod 1` (7919 is a prime, decorrelates the two coords from one draw). If `u + v > 1`, reflect: `u = 1 - u`, `v = 1 - v`. Point `= a + u·(b−a) + v·(c−a)`. This always lies inside the triangle, so the seed is on the surface with no ray-cast.
- **`AREA_SCALE`:** `1000`. Typical facet areas in this project are O(1)–O(100) world units²; `floor(area * 1000)` yields integer widths in the hundreds–hundred-thousands, with `Math.max(1, …)` guarding degenerate facets.
- **Floating-panel component:** `src/components/modal/Floater.svelte` (existing). It takes `{ onClose, title, showFloater, content }` where `content` is a `Component`. We pass `VoronoiControl` as `content`.
- **Config-migration normalizer location:** new pure module `src/lib/voronoi/migrate-voronoi-config.ts`, invoked in `superConfigStore`'s initializer in `superGlobuleStores.ts`.

---

### Task 1: Add area-weighted seed types

**Files:**
- Modify: `src/lib/voronoi/types.ts` (union at line 27; add new types after line 33)
- Test path: type-checked via `npm run check` (pure type change; behavioral tests land in Task 3)

Steps:

- [ ] Add the `SurfaceTriangle` type and `AreaWeightedSeedMethod`, and widen `SeedMethod`. Edit `src/lib/voronoi/types.ts`:

  Replace:
  ```ts
  export type SeedMethod = CenterProjectionSeedMethod;

  export type CenterProjectionSeedMethod = {
  	type: 'centerProjection';
  	pointCount: number;
  	seed: number;
  };
  ```
  with:
  ```ts
  export type SeedMethod = CenterProjectionSeedMethod | AreaWeightedSeedMethod;

  export type CenterProjectionSeedMethod = {
  	type: 'centerProjection';
  	pointCount: number;
  	seed: number;
  };

  export type AreaWeightedSeedMethod = {
  	type: 'areaWeighted';
  	pointCount: number;
  	seed: number;
  };
  ```

- [ ] Add a `SurfaceTriangle` type at the end of the file (after the `VoronoiResult` type, line 44). Append:
  ```ts
  // A surface facet as three world-space corners. Used only inside the geometry
  // worker for area-weighted seed sampling; never serialized across postMessage.
  export type SurfaceTriangle = [
  	import('three').Vector3,
  	import('three').Vector3,
  	import('three').Vector3
  ];
  ```

- [ ] Run the type check: `npm run check` — expected: passes (no new errors introduced by the type additions; existing `generateSeeds` still compiles because the new union member is structurally distinct).

- [ ] Commit:
  ```bash
  git add src/lib/voronoi/types.ts
  git commit -m "feat(voronoi): add AreaWeightedSeedMethod and SurfaceTriangle types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 2: Cumulative-area table builder (TDD)

**Files:**
- Modify: `src/lib/voronoi/generate-seeds.ts` (add `triangleArea` + `buildAreaTable` + `AREA_SCALE`)
- Test: `src/lib/voronoi/__tests__/generate-seeds.test.ts`

Steps:

- [ ] Write the failing test. Append to `src/lib/voronoi/__tests__/generate-seeds.test.ts`:
  ```ts
  import { buildAreaTable, AREA_SCALE } from '../generate-seeds';
  import type { SurfaceTriangle } from '../types';

  const tri = (
  	ax: number, ay: number, az: number,
  	bx: number, by: number, bz: number,
  	cx: number, cy: number, cz: number
  ): SurfaceTriangle => [
  	new Vector3(ax, ay, az),
  	new Vector3(bx, by, bz),
  	new Vector3(cx, cy, cz)
  ];

  describe('buildAreaTable', () => {
  	// Right triangle in XY plane with legs 2 and 2 -> area 2.
  	const small = tri(0, 0, 0, 2, 0, 0, 0, 2, 0);
  	// Right triangle in XY plane with legs 4 and 4 -> area 8.
  	const large = tri(0, 0, 0, 4, 0, 0, 0, 4, 0);

  	it('produces one entry per triangle with width = floor(area * AREA_SCALE), min 1', () => {
  		const { entries } = buildAreaTable([small, large]);
  		expect(entries).toHaveLength(2);
  		expect(entries[0].width).toBe(Math.floor(2 * AREA_SCALE));
  		expect(entries[1].width).toBe(Math.floor(8 * AREA_SCALE));
  	});

  	it('produces monotonically increasing keyStart values and a totalArea equal to the sum of widths', () => {
  		const { entries, totalArea } = buildAreaTable([small, large]);
  		expect(entries[0].keyStart).toBe(0);
  		expect(entries[1].keyStart).toBe(entries[0].width);
  		expect(totalArea).toBe(entries[0].width + entries[1].width);
  	});

  	it('floors degenerate (zero-area) triangles to width 1', () => {
  		const degenerate = tri(0, 0, 0, 1, 0, 0, 2, 0, 0); // collinear -> area 0
  		const { entries } = buildAreaTable([degenerate]);
  		expect(entries[0].width).toBe(1);
  	});
  });
  ```

- [ ] Run it: `npm run test:unit -- src/lib/voronoi/__tests__/generate-seeds.test.ts` — expected failure: `Cannot find module '../generate-seeds'` exports `buildAreaTable`/`AREA_SCALE` (TS/Jest reports `buildAreaTable is not a function` / export not found).

- [ ] Write the minimal implementation. In `src/lib/voronoi/generate-seeds.ts`, change the imports line 2 and add the builder. Replace:
  ```ts
  import type { SeedMethod, CenterProjectionSeedMethod } from './types';
  ```
  with:
  ```ts
  import type {
  	SeedMethod,
  	CenterProjectionSeedMethod,
  	AreaWeightedSeedMethod,
  	SurfaceTriangle
  } from './types';

  export const AREA_SCALE = 1000;

  export type AreaTableEntry = {
  	keyStart: number;
  	width: number;
  	triangle: SurfaceTriangle;
  };

  export function triangleArea(triangle: SurfaceTriangle): number {
  	const [a, b, c] = triangle;
  	const ab = b.clone().sub(a);
  	const ac = c.clone().sub(a);
  	return ab.cross(ac).length() / 2;
  }

  export function buildAreaTable(triangles: SurfaceTriangle[]): {
  	entries: AreaTableEntry[];
  	totalArea: number;
  } {
  	const entries: AreaTableEntry[] = [];
  	let cumulative = 0;
  	for (const triangle of triangles) {
  		const width = Math.max(1, Math.floor(triangleArea(triangle) * AREA_SCALE));
  		entries.push({ keyStart: cumulative, width, triangle });
  		cumulative += width;
  	}
  	return { entries, totalArea: cumulative };
  }
  ```

- [ ] Run the test: `npm run test:unit -- src/lib/voronoi/__tests__/generate-seeds.test.ts` — expected: the three `buildAreaTable` tests pass (the pre-existing `generateSeeds` tests still pass; arity unchanged so far).

- [ ] Commit:
  ```bash
  git add src/lib/voronoi/generate-seeds.ts src/lib/voronoi/__tests__/generate-seeds.test.ts
  git commit -m "feat(voronoi): add cumulative-area table builder for seed sampling

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 3: `generateAreaWeightedSeeds` + widened `generateSeeds` (TDD)

**Files:**
- Modify: `src/lib/voronoi/generate-seeds.ts` (add `generateAreaWeightedSeeds`, binary search; update `generateSeeds` signature + switch)
- Test: `src/lib/voronoi/__tests__/generate-seeds.test.ts`

Steps:

- [ ] Update the existing `generateSeeds` calls in the test for the new 4th argument, and add area-weighted tests. First, edit the existing `centerProjection` tests so each `generateSeeds(method, center, intersect)` call becomes `generateSeeds(method, center, intersect, [])`. Replace each of the five occurrences:
  ```ts
  generateSeeds(method, new Vector3(0, 0, 0), intersect)
  ```
  with:
  ```ts
  generateSeeds(method, new Vector3(0, 0, 0), intersect, [])
  ```
  and the one differing-seed occurrence:
  ```ts
  generateSeeds(differentMethod, new Vector3(0, 0, 0), intersect)
  ```
  with:
  ```ts
  generateSeeds(differentMethod, new Vector3(0, 0, 0), intersect, [])
  ```

- [ ] Append the area-weighted tests to `src/lib/voronoi/__tests__/generate-seeds.test.ts`:
  ```ts
  import { generateAreaWeightedSeeds } from '../generate-seeds';
  import type { AreaWeightedSeedMethod } from '../types';

  function pointInTriangle(p: Vector3, t: SurfaceTriangle, eps = 1e-6): boolean {
  	const [a, b, c] = t;
  	const v0 = c.clone().sub(a);
  	const v1 = b.clone().sub(a);
  	const v2 = p.clone().sub(a);
  	const dot00 = v0.dot(v0);
  	const dot01 = v0.dot(v1);
  	const dot02 = v0.dot(v2);
  	const dot11 = v1.dot(v1);
  	const dot12 = v1.dot(v2);
  	const denom = dot00 * dot11 - dot01 * dot01;
  	if (Math.abs(denom) < eps) return false;
  	const u = (dot11 * dot02 - dot01 * dot12) / denom;
  	const v = (dot00 * dot12 - dot01 * dot02) / denom;
  	return u >= -eps && v >= -eps && u + v <= 1 + eps;
  }

  describe('generateAreaWeightedSeeds', () => {
  	const small = tri(0, 0, 0, 2, 0, 0, 0, 2, 0);
  	const large = tri(10, 0, 0, 14, 0, 0, 10, 4, 0);

  	const method: AreaWeightedSeedMethod = {
  		type: 'areaWeighted',
  		pointCount: 40,
  		seed: 42
  	};

  	it('returns exactly pointCount seeds', () => {
  		const seeds = generateAreaWeightedSeeds(method, [small, large]);
  		expect(seeds).toHaveLength(40);
  	});

  	it('is deterministic for the same seed', () => {
  		const a = generateAreaWeightedSeeds(method, [small, large]);
  		const b = generateAreaWeightedSeeds(method, [small, large]);
  		a.forEach((s, i) => {
  			expect(s.x).toBeCloseTo(b[i].x, 10);
  			expect(s.y).toBeCloseTo(b[i].y, 10);
  			expect(s.z).toBeCloseTo(b[i].z, 10);
  		});
  	});

  	it('places every seed on a surface triangle', () => {
  		const seeds = generateAreaWeightedSeeds(method, [small, large]);
  		seeds.forEach((s) => {
  			expect(pointInTriangle(s, small) || pointInTriangle(s, large)).toBe(true);
  		});
  	});

  	it('assigns proportionally more seeds to the larger-area triangle', () => {
  		// small area = 2, large area = 8 -> large should get ~4x the seeds.
  		const seeds = generateAreaWeightedSeeds({ ...method, pointCount: 400 }, [small, large]);
  		const inSmall = seeds.filter((s) => pointInTriangle(s, small)).length;
  		const inLarge = seeds.filter((s) => pointInTriangle(s, large)).length;
  		expect(inLarge).toBeGreaterThan(inSmall * 2);
  	});

  	it('returns no seeds when given no triangles', () => {
  		expect(generateAreaWeightedSeeds(method, [])).toEqual([]);
  	});
  });
  ```

- [ ] Run it: `npm run test:unit -- src/lib/voronoi/__tests__/generate-seeds.test.ts` — expected failure: `generateAreaWeightedSeeds is not a function` / export not found; the centerProjection tests still pass.

- [ ] Write the implementation. In `src/lib/voronoi/generate-seeds.ts`, add the binary search + sampler, then widen `generateSeeds`. Add after `buildAreaTable`:
  ```ts
  function findEntry(entries: AreaTableEntry[], r: number): AreaTableEntry {
  	let lo = 0;
  	let hi = entries.length - 1;
  	while (lo < hi) {
  		const mid = (lo + hi) >> 1;
  		const entry = entries[mid];
  		if (r < entry.keyStart) {
  			hi = mid - 1;
  		} else if (r >= entry.keyStart + entry.width) {
  			lo = mid + 1;
  		} else {
  			return entry;
  		}
  	}
  	return entries[lo];
  }

  function barycentricPoint(triangle: SurfaceTriangle, t: number): Vector3 {
  	const [a, b, c] = triangle;
  	let u = t;
  	let v = (t * 7919) % 1;
  	if (u + v > 1) {
  		u = 1 - u;
  		v = 1 - v;
  	}
  	return a
  		.clone()
  		.addScaledVector(b.clone().sub(a), u)
  		.addScaledVector(c.clone().sub(a), v);
  }

  export function generateAreaWeightedSeeds(
  	method: AreaWeightedSeedMethod,
  	surfaceTriangles: SurfaceTriangle[]
  ): Vector3[] {
  	if (surfaceTriangles.length === 0) return [];
  	const { entries, totalArea } = buildAreaTable(surfaceTriangles);
  	const random = mulberry32(method.seed);
  	const seeds: Vector3[] = [];
  	for (let i = 0; i < method.pointCount; i++) {
  		const r = Math.floor(random() * totalArea);
  		const entry = findEntry(entries, r);
  		const t = (r - entry.keyStart) / entry.width;
  		seeds.push(barycentricPoint(entry.triangle, t));
  	}
  	return seeds;
  }
  ```

- [ ] Widen `generateSeeds`. Replace:
  ```ts
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
  with:
  ```ts
  export function generateSeeds(
  	method: SeedMethod,
  	center: Vector3,
  	intersect: SurfaceIntersector,
  	surfaceTriangles: SurfaceTriangle[]
  ): Vector3[] {
  	switch (method.type) {
  		case 'centerProjection':
  			return generateCenterProjectionSeeds(method, center, intersect);
  		case 'areaWeighted':
  			return generateAreaWeightedSeeds(method, surfaceTriangles);
  		default:
  			throw new Error(`Unknown seed method: ${(method as SeedMethod).type}`);
  	}
  }
  ```

- [ ] Run the test: `npm run test:unit -- src/lib/voronoi/__tests__/generate-seeds.test.ts` — expected: all tests pass (centerProjection + area-weighted).

- [ ] Run the type check: `npm run check` — expected: it reports the now-outdated `generateSeeds` call in `generate-voronoi.ts:298` (missing 4th arg). That is fixed in Task 5. Note the error and proceed (do not "fix" it yet).

- [ ] Commit:
  ```bash
  git add src/lib/voronoi/generate-seeds.ts src/lib/voronoi/__tests__/generate-seeds.test.ts
  git commit -m "feat(voronoi): add area-weighted seed sampling

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 4: Surface-triangle extraction helper (TDD)

**Files:**
- Create: `src/lib/voronoi/extract-surface-triangles.ts`
- Test: `src/lib/voronoi/__tests__/extract-surface-triangles.test.ts`

Steps:

- [ ] Write the failing test. Create `src/lib/voronoi/__tests__/extract-surface-triangles.test.ts`:
  ```ts
  import { BufferGeometry, BufferAttribute, Mesh, Object3D, Vector3 } from 'three';
  import { extractSurfaceTriangles } from '../extract-surface-triangles';

  function makeQuadMesh(): Mesh {
  	// Two triangles forming a unit quad in the XY plane.
  	const positions = new Float32Array([
  		0, 0, 0,
  		1, 0, 0,
  		1, 1, 0,
  		0, 0, 0,
  		1, 1, 0,
  		0, 1, 0
  	]);
  	const geometry = new BufferGeometry();
  	geometry.setAttribute('position', new BufferAttribute(positions, 3));
  	return new Mesh(geometry);
  }

  describe('extractSurfaceTriangles', () => {
  	it('extracts one SurfaceTriangle per geometry triangle', () => {
  		const object = new Object3D();
  		object.add(makeQuadMesh());
  		object.updateMatrixWorld(true);
  		const triangles = extractSurfaceTriangles(object);
  		expect(triangles).toHaveLength(2);
  		expect(triangles[0]).toHaveLength(3);
  		expect(triangles[0][0]).toBeInstanceOf(Vector3);
  	});

  	it('returns triangle corners in world space (applies parent transform)', () => {
  		const object = new Object3D();
  		const mesh = makeQuadMesh();
  		mesh.position.set(10, 0, 0);
  		object.add(mesh);
  		object.updateMatrixWorld(true);
  		const triangles = extractSurfaceTriangles(object);
  		expect(triangles[0][0].x).toBeCloseTo(10, 5);
  	});

  	it('supports indexed geometry', () => {
  		const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]);
  		const geometry = new BufferGeometry();
  		geometry.setAttribute('position', new BufferAttribute(positions, 3));
  		geometry.setIndex([0, 1, 2, 1, 3, 2]);
  		const mesh = new Mesh(geometry);
  		const object = new Object3D();
  		object.add(mesh);
  		object.updateMatrixWorld(true);
  		const triangles = extractSurfaceTriangles(object);
  		expect(triangles).toHaveLength(2);
  	});

  	it('returns an empty array for an object with no meshes', () => {
  		expect(extractSurfaceTriangles(new Object3D())).toEqual([]);
  	});
  });
  ```

- [ ] Run it: `npm run test:unit -- src/lib/voronoi/__tests__/extract-surface-triangles.test.ts` — expected failure: `Cannot find module '../extract-surface-triangles'`.

- [ ] Write the implementation. Create `src/lib/voronoi/extract-surface-triangles.ts`:
  ```ts
  import { Mesh, Object3D, Vector3 } from 'three';
  import type { SurfaceTriangle } from './types';

  /**
   * Traverses an Object3D and returns every triangle of its meshes in world
   * space. Supports both indexed and non-indexed BufferGeometry. Used by the
   * area-weighted seed sampler; runs inside the geometry worker.
   */
  export function extractSurfaceTriangles(object: Object3D): SurfaceTriangle[] {
  	const triangles: SurfaceTriangle[] = [];

  	object.traverse((child) => {
  		if (!(child instanceof Mesh) || !child.geometry) return;
  		const geometry = child.geometry;
  		const position = geometry.getAttribute('position');
  		if (!position) return;

  		child.updateWorldMatrix(true, false);
  		const matrixWorld = child.matrixWorld;

  		const cornerAt = (vertexIndex: number): Vector3 =>
  			new Vector3(
  				position.getX(vertexIndex),
  				position.getY(vertexIndex),
  				position.getZ(vertexIndex)
  			).applyMatrix4(matrixWorld);

  		const index = geometry.getIndex();
  		const count = index ? index.count : position.count;
  		for (let i = 0; i + 2 < count + 1 && i + 2 < count; i += 3) {
  			const ia = index ? index.getX(i) : i;
  			const ib = index ? index.getX(i + 1) : i + 1;
  			const ic = index ? index.getX(i + 2) : i + 2;
  			triangles.push([cornerAt(ia), cornerAt(ib), cornerAt(ic)]);
  		}
  	});

  	return triangles;
  }
  ```

- [ ] Run the test: `npm run test:unit -- src/lib/voronoi/__tests__/extract-surface-triangles.test.ts` — expected: all four tests pass.

- [ ] Commit:
  ```bash
  git add src/lib/voronoi/extract-surface-triangles.ts src/lib/voronoi/__tests__/extract-surface-triangles.test.ts
  git commit -m "feat(voronoi): add world-space surface triangle extraction

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 5: Thread surface triangles through `makeVoronoi`

**Files:**
- Modify: `src/lib/voronoi/generate-voronoi.ts` (imports line 16; seed call line 298)
- Test: `src/lib/voronoi/__tests__/generate-voronoi.test.ts` (verify existing suite still passes)

Steps:

- [ ] Add the import. In `src/lib/voronoi/generate-voronoi.ts`, after line 16 (`import { generateSeeds } from './generate-seeds';`) add:
  ```ts
  import { extractSurfaceTriangles } from './extract-surface-triangles';
  ```

- [ ] Pass extracted triangles into `generateSeeds`. Replace (line 297-298):
  ```ts
  	// Step 1: Generate seeds on surface
  	const seeds3d = generateSeeds(config.seedConfig.seedMethod, center, intersect);
  ```
  with:
  ```ts
  	// Step 1: Generate seeds on surface
  	const surfaceTriangles = extractSurfaceTriangles(surface);
  	const seeds3d = generateSeeds(
  		config.seedConfig.seedMethod,
  		center,
  		intersect,
  		surfaceTriangles
  	);
  ```

- [ ] Run the existing voronoi suite: `npm run test:unit -- src/lib/voronoi/__tests__/generate-voronoi.test.ts` — expected: passes (the existing default config uses `centerProjection` until Task 7, so behavior is unchanged here; the new arg is ignored by that method).

- [ ] Run the type check: `npm run check` — expected: the Task 3 `generate-voronoi.ts` arity error is now resolved; no new voronoi-module errors. (Type errors about `voronoiConfigs`/`voronoiResults` are addressed in Tasks 6, 8–11.)

- [ ] Commit:
  ```bash
  git add src/lib/voronoi/generate-voronoi.ts
  git commit -m "feat(voronoi): thread surface triangles into seed generation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 6: Single-config type migration (`types.ts` + default config)

**Files:**
- Modify: `src/lib/types.ts` (line 913, lines 929-933)
- Modify: `src/lib/shades-config.ts` (lines 611, 665, 695-699)
- Test path: type-checked via `npm run check` (behavioral coverage in Tasks 7–11)

Steps:

- [ ] In `src/lib/types.ts`, change `SuperGlobuleConfig`. Replace:
  ```ts
  	voronoiConfigs: VoronoiConfig[];
  ```
  with:
  ```ts
  	voronoiConfig?: VoronoiConfig;
  ```

- [ ] In `src/lib/types.ts`, change `SuperGlobule`. Replace:
  ```ts
  	voronoiResults: {
  		tubes: Tube[];
  		surfaceProjectionTubes: Tube[];
  		surface: Object3D;
  	}[];
  ```
  with:
  ```ts
  	voronoiResult?: {
  		tubes: Tube[];
  		surfaceProjectionTubes: Tube[];
  		surface: Object3D;
  	};
  ```

- [ ] In `src/lib/shades-config.ts`, switch the default seed method to area-weighted. Replace:
  ```ts
  		seedMethod: {
  			type: 'centerProjection',
  			pointCount: 12,
  			seed: 42
  		},
  ```
  with:
  ```ts
  		seedMethod: {
  			type: 'areaWeighted',
  			pointCount: 12,
  			seed: 42
  		},
  ```

- [ ] In `src/lib/shades-config.ts`, drop `voronoiConfigs: []` from `generateSuperGlobuleConfigWrapper` (line 611). Replace:
  ```ts
  		subGlobuleConfigs: [generateSubGlobuleConfigWrapper(globule)],
  		projectionConfigs: [],
  		voronoiConfigs: []
  	};
  ```
  with:
  ```ts
  		subGlobuleConfigs: [generateSubGlobuleConfigWrapper(globule)],
  		projectionConfigs: []
  	};
  ```

- [ ] In `src/lib/shades-config.ts`, drop `voronoiConfigs: []` from `generateDefaultSuperGlobuleConfig` (line 665). Replace:
  ```ts
  		projectionConfigs: [defaultProjectionConfig],
  		voronoiConfigs: []
  	};
  ```
  with:
  ```ts
  		projectionConfigs: [defaultProjectionConfig]
  	};
  ```

- [ ] Run the type check: `npm run check` — expected: errors remain only in the not-yet-migrated consumers (`generate-superglobule.ts`, `super-globule.worker.ts`, `workerStore.ts`, `superGlobuleStores.ts`, `VoronoiControl.svelte`, `ProjectionGeometryComponent.svelte`). These are fixed in Tasks 7–13. Confirm there are no `types.ts`/`shades-config.ts` errors.

- [ ] Commit:
  ```bash
  git add src/lib/types.ts src/lib/shades-config.ts
  git commit -m "refactor(voronoi): collapse voronoiConfigs[] to single voronoiConfig in types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 7: Single-result generation in `generate-superglobule.ts`

**Files:**
- Modify: `src/lib/generate-superglobule.ts` (lines 51-67)
- Test path: `npm run check` + verify `src/lib/voronoi/__tests__/generate-voronoi.test.ts` unaffected

Steps:

- [ ] Replace the array-based voronoi region (lines 51-67). Replace:
  ```ts
  	// Voronoi Tube pipeline
  	const projectionSurfaceConfig = resolvedProjectionConfigs[0]?.surfaceConfig;
  	const voronoiResults = projectionSurfaceConfig
  		? (superConfig.voronoiConfigs ?? []).map((config, i) => {
  				return makeVoronoi(config, { globule: i }, projectionSurfaceConfig);
  			})
  		: [];

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
  ```
  with:
  ```ts
  	// Voronoi Tube pipeline (single config)
  	const projectionSurfaceConfig = resolvedProjectionConfigs[0]?.surfaceConfig;
  	const voronoiResult =
  		projectionSurfaceConfig && superConfig.voronoiConfig
  			? makeVoronoi(superConfig.voronoiConfig, { globule: 0 }, projectionSurfaceConfig)
  			: undefined;

  	const superGlobule: SuperGlobule = {
  		type: 'SuperGlobule',
  		superGlobuleConfigId: superConfig.id,
  		name: superConfig.name,
  		globuleTubes,
  		subGlobules,
  		projections,
  		voronoiResult
  	};
  	return superGlobule;
  ```

- [ ] Run the type check: `npm run check` — expected: no errors in `generate-superglobule.ts`; remaining errors are in the worker, workerStore, stores, and components (Tasks 8–13).

- [ ] Commit:
  ```bash
  git add src/lib/generate-superglobule.ts
  git commit -m "refactor(voronoi): build single voronoiResult in generateSuperGlobule

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 8: Worker serialization for single result

**Files:**
- Modify: `src/lib/workers/super-globule.worker.ts` (lines 67-70)
- Test path: `npm run check`

Steps:

- [ ] Replace the `voronoiResults` serialization block. Replace:
  ```ts
  		voronoiResults: (superGlobule.voronoiResults ?? []).map((result) => ({
  			...result,
  			surface: null as unknown as typeof result.surface
  		}))
  ```
  with:
  ```ts
  		voronoiResult: superGlobule.voronoiResult
  			? {
  					...superGlobule.voronoiResult,
  					surface: null as unknown as typeof superGlobule.voronoiResult.surface
  				}
  			: undefined
  ```

- [ ] Run the type check: `npm run check` — expected: no errors in `super-globule.worker.ts`; remaining errors are in `workerStore.ts`, `superGlobuleStores.ts`, and the two components.

- [ ] Commit:
  ```bash
  git add src/lib/workers/super-globule.worker.ts
  git commit -m "refactor(voronoi): serialize single voronoiResult across worker boundary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 9: Rehydration + surface regen for single result

**Files:**
- Modify: `src/lib/stores/workerStore.ts` (lines 172-185; lines 226-239)
- Test path: `npm run check`

Steps:

- [ ] Replace the rehydration block (lines 172-185). Replace:
  ```ts
  	// Rehydrate voronoiResults
  	const voronoiResults = (result.voronoiResults ?? []).map((voronoiResult) => ({
  		...voronoiResult,
  		tubes: rehydrateTubes(voronoiResult.tubes),
  		surfaceProjectionTubes: rehydrateTubes(voronoiResult.surfaceProjectionTubes ?? [])
  	}));

  	return {
  		...result,
  		projections,
  		globuleTubes,
  		subGlobules,
  		voronoiResults
  	};
  ```
  with:
  ```ts
  	// Rehydrate voronoiResult (single)
  	const voronoiResult = result.voronoiResult
  		? {
  				...result.voronoiResult,
  				tubes: rehydrateTubes(result.voronoiResult.tubes),
  				surfaceProjectionTubes: rehydrateTubes(result.voronoiResult.surfaceProjectionTubes ?? [])
  			}
  		: undefined;

  	return {
  		...result,
  		projections,
  		globuleTubes,
  		subGlobules,
  		voronoiResult
  	};
  ```

- [ ] Replace the surface-regen block (lines 226-239). Replace:
  ```ts
  				// Regenerate Voronoi surfaces (uses projection's surface config)
  				const projSurfaceConfig = resolver.config.projectionConfigs[0]?.surfaceConfig;
  				if (projSurfaceConfig) {
  					const plainSurfaceConfig = JSON.parse(JSON.stringify(projSurfaceConfig));
  					(resolver.config.voronoiConfigs ?? []).forEach((voronoiConfig, i) => {
  						if (rehydrated.voronoiResults?.[i]) {
  							const resolvedSurfaceConfig =
  								plainSurfaceConfig.transform === 'inherit'
  									? { ...plainSurfaceConfig, transform: voronoiConfig.meta.transform }
  									: plainSurfaceConfig;
  							rehydrated.voronoiResults[i].surface = generateSurface(resolvedSurfaceConfig);
  						}
  					});
  				}
  ```
  with:
  ```ts
  				// Regenerate Voronoi surface (uses projection's surface config)
  				const projSurfaceConfig = resolver.config.projectionConfigs[0]?.surfaceConfig;
  				const voronoiConfig = resolver.config.voronoiConfig;
  				if (projSurfaceConfig && voronoiConfig && rehydrated.voronoiResult) {
  					const plainSurfaceConfig = JSON.parse(JSON.stringify(projSurfaceConfig));
  					const resolvedSurfaceConfig =
  						plainSurfaceConfig.transform === 'inherit'
  							? { ...plainSurfaceConfig, transform: voronoiConfig.meta.transform }
  							: plainSurfaceConfig;
  					rehydrated.voronoiResult.surface = generateSurface(resolvedSurfaceConfig);
  				}
  ```

- [ ] Run the type check: `npm run check` — expected: no errors in `workerStore.ts`; remaining errors are in `superGlobuleStores.ts` and the two components.

- [ ] Commit:
  ```bash
  git add src/lib/stores/workerStore.ts
  git commit -m "refactor(voronoi): rehydrate and regen surface for single voronoiResult

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 10: Pattern routing reads single result

**Files:**
- Modify: `src/lib/stores/superGlobuleStores.ts` (line 478)
- Test path: `npm run check`

Steps:

- [ ] Replace the `[0]` access. Replace:
  ```ts
  		const voronoiResult = $superGlobuleStore.voronoiResults?.[0];
  ```
  with:
  ```ts
  		const voronoiResult = $superGlobuleStore.voronoiResult;
  ```

- [ ] Run the type check: `npm run check` — expected: no errors at line 478; remaining errors are the hydration-path `voronoiConfigs` reference (Task 12, not yet added) and the two components (Tasks 11, 13).

- [ ] Commit:
  ```bash
  git add src/lib/stores/superGlobuleStores.ts
  git commit -m "refactor(voronoi): read single voronoiResult in pattern routing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 11: Component reads single result

**Files:**
- Modify: `src/components/projection/ProjectionGeometryComponent.svelte` (lines 141-142)
- Test path: `npm run check`

Steps:

- [ ] Replace the array flatMaps. Replace:
  ```ts
  			const voronoiTubes = ($superGlobuleStore.voronoiResults ?? []).flatMap((r) => r.tubes);
  			const voronoiSurfaceProjectionTubes = ($superGlobuleStore.voronoiResults ?? []).flatMap((r) => r.surfaceProjectionTubes ?? []);
  ```
  with:
  ```ts
  			const voronoiTubes = $superGlobuleStore.voronoiResult?.tubes ?? [];
  			const voronoiSurfaceProjectionTubes = $superGlobuleStore.voronoiResult?.surfaceProjectionTubes ?? [];
  ```

- [ ] Run the type check: `npm run check` — expected: no errors in `ProjectionGeometryComponent.svelte`; remaining errors are the store hydration normalizer reference (Task 12) and `VoronoiControl.svelte` (Task 13).

- [ ] Commit:
  ```bash
  git add src/components/projection/ProjectionGeometryComponent.svelte
  git commit -m "refactor(voronoi): read single voronoiResult in geometry component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 12: Config-migration normalizer + boot default (TDD)

**Files:**
- Create: `src/lib/voronoi/migrate-voronoi-config.ts`
- Test: `src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts`
- Modify: `src/lib/stores/superGlobuleStores.ts` (initializer at lines 136-148)

Steps:

- [ ] Write the failing test. Create `src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts`:
  ```ts
  import { normalizeVoronoiConfig } from '../migrate-voronoi-config';
  import { defaultVoronoiConfig } from '$lib/shades-config';
  import type { SuperGlobuleConfig } from '$lib/types';

  const baseConfig = (extra: Record<string, unknown>): SuperGlobuleConfig =>
  	({
  		type: 'SuperGlobuleConfig',
  		id: 1,
  		subGlobuleConfigs: [],
  		projectionConfigs: [],
  		...extra
  	}) as SuperGlobuleConfig;

  describe('normalizeVoronoiConfig', () => {
  	it('injects a default voronoiConfig with a random seed when none is present', () => {
  		const result = normalizeVoronoiConfig(baseConfig({}));
  		expect(result.voronoiConfig).toBeDefined();
  		expect(result.voronoiConfig?.type).toBe('VoronoiConfig');
  		expect(typeof result.voronoiConfig?.seedConfig.seedMethod.seed).toBe('number');
  	});

  	it('randomizes the injected seed (differs from the static default seed)', () => {
  		// Force Math.random to a value that maps to a seed != defaultVoronoiConfig seed.
  		const spy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
  		const result = normalizeVoronoiConfig(baseConfig({}));
  		expect(result.voronoiConfig?.seedConfig.seedMethod.seed).toBe(Math.floor(0.5 * 2 ** 31));
  		spy.mockRestore();
  	});

  	it('collapses a legacy voronoiConfigs array to the first entry', () => {
  		const a = { ...defaultVoronoiConfig, edgeDivisions: 3 };
  		const b = { ...defaultVoronoiConfig, edgeDivisions: 9 };
  		const result = normalizeVoronoiConfig(
  			baseConfig({ voronoiConfigs: [a, b] }) as SuperGlobuleConfig & {
  				voronoiConfigs: typeof a[];
  			}
  		);
  		expect(result.voronoiConfig?.edgeDivisions).toBe(3);
  	});

  	it('injects the default when a legacy voronoiConfigs array is empty', () => {
  		const result = normalizeVoronoiConfig(
  			baseConfig({ voronoiConfigs: [] }) as SuperGlobuleConfig
  		);
  		expect(result.voronoiConfig).toBeDefined();
  	});

  	it('preserves an existing single voronoiConfig untouched', () => {
  		const existing = { ...defaultVoronoiConfig, edgeDivisions: 7 };
  		const result = normalizeVoronoiConfig(baseConfig({ voronoiConfig: existing }));
  		expect(result.voronoiConfig?.edgeDivisions).toBe(7);
  	});

  	it('strips the legacy voronoiConfigs key from the result', () => {
  		const result = normalizeVoronoiConfig(
  			baseConfig({ voronoiConfigs: [defaultVoronoiConfig] }) as SuperGlobuleConfig
  		);
  		expect('voronoiConfigs' in result).toBe(false);
  	});
  });
  ```

- [ ] Run it: `npm run test:unit -- src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts` — expected failure: `Cannot find module '../migrate-voronoi-config'`.

- [ ] Write the implementation. Create `src/lib/voronoi/migrate-voronoi-config.ts`:
  ```ts
  import { defaultVoronoiConfig } from '$lib/shades-config';
  import type { SuperGlobuleConfig } from '$lib/types';
  import type { VoronoiConfig } from './types';

  type LegacySuperGlobuleConfig = SuperGlobuleConfig & {
  	voronoiConfigs?: VoronoiConfig[];
  };

  function randomSeed(): number {
  	return Math.floor(Math.random() * 2 ** 31);
  }

  function defaultConfigWithRandomSeed(): VoronoiConfig {
  	return {
  		...defaultVoronoiConfig,
  		seedConfig: {
  			...defaultVoronoiConfig.seedConfig,
  			seedMethod: {
  				...defaultVoronoiConfig.seedConfig.seedMethod,
  				seed: randomSeed()
  			}
  		}
  	};
  }

  /**
   * Normalizes a (possibly legacy / persisted) SuperGlobuleConfig so it always
   * carries exactly one `voronoiConfig`:
   *  - a legacy `voronoiConfigs` array collapses to its first entry (if any);
   *  - a missing/empty config is replaced by the default with a fresh random seed;
   *  - an existing single `voronoiConfig` is preserved as-is;
   *  - the legacy `voronoiConfigs` key is removed.
   */
  export function normalizeVoronoiConfig(config: SuperGlobuleConfig): SuperGlobuleConfig {
  	const legacy = config as LegacySuperGlobuleConfig;
  	const { voronoiConfigs, ...rest } = legacy;

  	const fromArray = voronoiConfigs && voronoiConfigs.length > 0 ? voronoiConfigs[0] : undefined;
  	const voronoiConfig = rest.voronoiConfig ?? fromArray ?? defaultConfigWithRandomSeed();

  	return { ...rest, voronoiConfig };
  }
  ```

- [ ] Run the test: `npm run test:unit -- src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts` — expected: all six tests pass.

- [ ] Wire the normalizer into the store initializer. In `src/lib/stores/superGlobuleStores.ts`, add the import near the other `$lib` imports (after the existing `loadPersistedOrDefault` import on line 18):
  ```ts
  import { normalizeVoronoiConfig } from '$lib/voronoi/migrate-voronoi-config';
  ```

- [ ] In the same file, apply the normalizer inside the `superConfigStore` initializer. Replace:
  ```ts
  export const superConfigStore = persistable<SuperGlobuleConfig>(
  	((): SuperGlobuleConfig => {
  		const config = loadPersistedOrDefault(
  			bootstrapShouldUsePersisted(),
  			generateDefaultSuperGlobuleConfig
  		);
  		console.log('SUPER GLOBULE CONFIG STORE', { config });
  		return config;
  	})(),
  ```
  with:
  ```ts
  export const superConfigStore = persistable<SuperGlobuleConfig>(
  	((): SuperGlobuleConfig => {
  		const config = normalizeVoronoiConfig(
  			loadPersistedOrDefault(
  				bootstrapShouldUsePersisted(),
  				generateDefaultSuperGlobuleConfig
  			) as SuperGlobuleConfig
  		);
  		console.log('SUPER GLOBULE CONFIG STORE', { config });
  		return config;
  	})(),
  ```

- [ ] Run the type check: `npm run check` — expected: no errors in `superGlobuleStores.ts` or `migrate-voronoi-config.ts`; the only remaining error is `VoronoiControl.svelte` (Task 13). (`loadPersistedOrDefault` returns a union of config types, hence the `as SuperGlobuleConfig` cast, matching the pattern already used elsewhere for this store.)

- [ ] Commit:
  ```bash
  git add src/lib/voronoi/migrate-voronoi-config.ts src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts src/lib/stores/superGlobuleStores.ts
  git commit -m "feat(voronoi): normalize persisted config to single voronoiConfig with boot default

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 13: Rewrite `VoronoiControl.svelte` for single config + seed method

**Files:**
- Modify: `src/components/controls/VoronoiControl.svelte` (full rewrite of script + markup)
- Test path: `npm run check` + manual verification

This is a UI-only change; the non-trivial config-mutation logic is already covered by the normalizer (Task 12) and the seed/area-weighted units (Tasks 2–3). Manual verification replaces a unit test.

Steps:

- [ ] Replace the entire `<script>` block (lines 1-62). Replace with:
  ```svelte
  <script lang="ts">
  	import { superConfigStore } from '$lib/stores/superGlobuleStores';
  	import { defaultVoronoiConfig } from '$lib/shades-config';
  	import type { VoronoiConfig, VoronoiMethod } from '$lib/voronoi/types';

  	let config: VoronoiConfig = $derived($superConfigStore.voronoiConfig ?? defaultVoronoiConfig);

  	function update(
  		field: 'pointCount' | 'seed' | 'seedMethodType' | 'relaxationIterations' | 'edgeDivisions' | 'curveOffsetFactor' | 'surfaceProjectionDivisions' | 'voronoiMethod',
  		value: number | string
  	) {
  		let next: VoronoiConfig = config;
  		if (field === 'pointCount') {
  			next = {
  				...config,
  				seedConfig: {
  					...config.seedConfig,
  					seedMethod: { ...config.seedConfig.seedMethod, pointCount: value as number }
  				}
  			};
  		} else if (field === 'seed') {
  			next = {
  				...config,
  				seedConfig: {
  					...config.seedConfig,
  					seedMethod: { ...config.seedConfig.seedMethod, seed: value as number }
  				}
  			};
  		} else if (field === 'seedMethodType') {
  			next = {
  				...config,
  				seedConfig: {
  					...config.seedConfig,
  					seedMethod: {
  						...config.seedConfig.seedMethod,
  						type: value as VoronoiConfig['seedConfig']['seedMethod']['type']
  					}
  				}
  			};
  		} else if (field === 'relaxationIterations') {
  			next = {
  				...config,
  				seedConfig: { ...config.seedConfig, relaxationIterations: value as number }
  			};
  		} else if (field === 'edgeDivisions') {
  			next = { ...config, edgeDivisions: value as number };
  		} else if (field === 'curveOffsetFactor') {
  			next = { ...config, curveOffsetFactor: value as number };
  		} else if (field === 'surfaceProjectionDivisions') {
  			next = { ...config, surfaceProjectionDivisions: value as number };
  		} else if (field === 'voronoiMethod') {
  			next = { ...config, voronoiMethod: value as VoronoiMethod };
  		}
  		$superConfigStore = { ...$superConfigStore, voronoiConfig: next };
  	}

  	function randomizeSeed() {
  		update('seed', Math.floor(Math.random() * 2 ** 31));
  	}
  </script>
  ```

- [ ] Replace the entire markup `<section>...</section>` block (lines 64-165) with a single-config form (no add/remove/each, plus a seed-method selector):
  ```svelte
  <section>
  	<header>
  		<h3>Voronoi</h3>
  	</header>

  	<div class="config-block">
  		<label>
  			Seed Method
  			<select
  				value={config.seedConfig.seedMethod.type}
  				onchange={(e) => update('seedMethodType', e.currentTarget.value)}
  			>
  				<option value="areaWeighted">Area Weighted</option>
  				<option value="centerProjection">Center Projection</option>
  			</select>
  		</label>

  		<label>
  			Method
  			<select
  				value={config.voronoiMethod ?? 'spherical'}
  				onchange={(e) => update('voronoiMethod', e.currentTarget.value)}
  			>
  				<option value="spherical">Spherical</option>
  				<option value="uv">UV</option>
  			</select>
  		</label>

  		<label>
  			Point Count
  			<input
  				type="range"
  				min="4"
  				max="300"
  				value={config.seedConfig.seedMethod.pointCount}
  				oninput={(e) => update('pointCount', Number(e.currentTarget.value))}
  			/>
  			<span>{config.seedConfig.seedMethod.pointCount}</span>
  		</label>

  		<label>
  			Seed
  			<input
  				type="number"
  				value={config.seedConfig.seedMethod.seed}
  				oninput={(e) => update('seed', Number(e.currentTarget.value))}
  			/>
  			<button onclick={randomizeSeed}>Randomize</button>
  		</label>

  		<label>
  			Relaxation Iterations
  			<input
  				type="range"
  				min="0"
  				max="20"
  				value={config.seedConfig.relaxationIterations}
  				oninput={(e) => update('relaxationIterations', Number(e.currentTarget.value))}
  			/>
  			<span>{config.seedConfig.relaxationIterations}</span>
  		</label>

  		<label>
  			Curve Offset
  			<input
  				type="range"
  				min="0.05"
  				max="0.95"
  				step="0.05"
  				value={config.curveOffsetFactor ?? 0.3}
  				oninput={(e) => update('curveOffsetFactor', Number(e.currentTarget.value))}
  			/>
  			<span>{(config.curveOffsetFactor ?? 0.3).toFixed(2)}</span>
  		</label>

  		<label>
  			Surface Divisions
  			<input
  				type="range"
  				min="0"
  				max="5"
  				step="1"
  				value={config.surfaceProjectionDivisions ?? 0}
  				oninput={(e) => update('surfaceProjectionDivisions', Number(e.currentTarget.value))}
  			/>
  			<span>{config.surfaceProjectionDivisions ?? 0}</span>
  		</label>

  		<label>
  			Edge Divisions
  			<input
  				type="range"
  				min="2"
  				max="20"
  				value={config.edgeDivisions}
  				oninput={(e) => update('edgeDivisions', Number(e.currentTarget.value))}
  			/>
  			<span>{config.edgeDivisions}</span>
  		</label>
  	</div>
  </section>
  ```
  (Leave the existing `<style>` block at lines 167-204 unchanged; `.config-header` is now unused but harmless.)

- [ ] Run the type check: `npm run check` — expected: passes with zero errors across the whole project (this is the last consumer migrated).

- [ ] Manual verification: `npm run dev`, open `/designer2`. In the Voronoi control: changing Point Count / Seed / Seed Method regenerates geometry (watch the 3D viewport update); the add/remove buttons are gone; switching Seed Method between "Area Weighted" and "Center Projection" both produce valid tessellations.

- [ ] Commit:
  ```bash
  git add src/components/controls/VoronoiControl.svelte
  git commit -m "feat(voronoi): single-config control with seed-method selector

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 14: Floating editor wiring in `designer2`

**Files:**
- Modify: `src/routes/designer2/+page.svelte` (SelectBar options ~line 55; control branch ~lines 73-74; add `Floater` + state)
- Test path: `npm run check` + manual verification

This is UI-only; reuses the existing `Floater.svelte`. Manual verification replaces a unit test.

Steps:

- [ ] Import `Floater` and add state. After the existing import on line 16 (`import HoverSidebar ...`), add:
  ```svelte
  	import Floater from '../../components/modal/Floater.svelte';
  ```

- [ ] Add a `showVoronoiFloater` state variable. After the `let viewMode` declaration (line 20), add:
  ```svelte
  	let showVoronoiFloater = $state(false);
  ```
  (Confirm this file uses Svelte 5 runes — `VoronoiControl.svelte` and `Floater.svelte` already use `$props`/`$state`/`$derived`, so the project is on Svelte 5.)

- [ ] Repurpose the SelectBar `Voronoi` option to toggle the floater instead of rendering inline. In the `SelectBar` `options` array, leave `{ name: 'Voronoi' }` in place (line 55) — it stays as the trigger. Remove the inline render branch. Replace:
  ```svelte
  			{:else if showControl?.name === 'Projection'}
  				<ProjectionControl />
  			{:else if showControl?.name === 'Voronoi'}
  				<VoronoiControl />
  			{:else if showControl?.name === 'Struts'}
  ```
  with:
  ```svelte
  			{:else if showControl?.name === 'Projection'}
  				<ProjectionControl />
  			{:else if showControl?.name === 'Struts'}
  ```

- [ ] Toggle the floater when the `Voronoi` SelectBar option is chosen. Add a reactive effect after the existing `$: viewMode = ...` line (line 30):
  ```svelte
  	$: if (showControl?.name === 'Voronoi') {
  		showVoronoiFloater = true;
  	}
  ```

- [ ] Render the `Floater` hosting `VoronoiControl`. Just before the closing `</main>` (after the `<HoverSidebar ... />` line 88), add:
  ```svelte
  	<Floater
  		title="Voronoi"
  		showFloater={showVoronoiFloater}
  		onClose={() => (showVoronoiFloater = false)}
  		content={VoronoiControl}
  		closeOnClickAway={false}
  	/>
  ```
  (`closeOnClickAway={false}` keeps the panel open while dragging sliders, which dispatch document clicks.)

- [ ] Run the type check: `npm run check` — expected: passes with zero errors. (`VoronoiControl` is still imported on line 15 and is now passed as `content`.)

- [ ] Manual verification: `npm run dev`, open `/designer2`. Click the `Voronoi` SelectBar option → the floating panel appears (top-right) with the single-config form. Edit a slider → geometry regenerates and the panel stays open. Click the panel's `X` → it closes. Reload with cleared localStorage → boots with exactly one voronoi config and a non-`42` random seed visible in the Seed field.

- [ ] Commit:
  ```bash
  git add src/routes/designer2/+page.svelte
  git commit -m "feat(voronoi): host VoronoiControl in a floating editor panel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 15: Full verification sweep

**Files:** none (verification only)

Steps:

- [ ] Run the full voronoi unit suite: `npm run test:unit -- src/lib/voronoi` — expected: all voronoi tests pass (generate-seeds, extract-surface-triangles, migrate-voronoi-config, plus the pre-existing compute/uv/apply suites).

- [ ] Run the type check: `npm run check` — expected: zero errors.

- [ ] Run the formatter and linter: `npm run format && npm run lint` — expected: no lint errors on changed files.

- [ ] Manual end-to-end: `npm run dev`, `/designer2`. Confirm: (a) boot with cleared storage yields one area-weighted voronoi config; (b) seeds visibly cover the surface proportional to area (denser where facets are larger); (c) switching to `centerProjection` still works; (d) floating editor opens/edits/persists across reload (with localStorage persistence enabled).

- [ ] No commit (verification only). If any step fails, return to the owning task before claiming completion (superpowers:verification-before-completion).

---

## Self-review

**Spec coverage:**
- Item #2 area-weighted seeds: Tasks 1–5 (types, area table, sampler, extraction, threading). ✓
- Default seed method → areaWeighted with pointCount 12: Task 6. ✓
- `centerProjection` stays selectable: Task 13 seed-method selector. ✓
- Lloyd relaxation unchanged: confirmed — `makeVoronoi` (lines 300-305) is not modified; new seeds flow into `computeVoronoiFromSeeds` untouched. ✓
- Item #3 single config across types/state/generation/routing: Tasks 6–11. ✓
- Migration normalizer for persisted state: Task 12. ✓
- Boot default with random seed: Task 12 (`normalizeVoronoiConfig` injects `defaultConfigWithRandomSeed`). ✓
- Floating editor (reuse existing `Floater.svelte`), remove add/remove buttons, repurpose SelectBar option: Tasks 13–14. ✓
- `collate-tubes.ts`/`collate-geometry.ts` access: verified — `collateVoronoiGeometry` takes tubes as args (no `voronoiResults` field access inside), so the only consumer is `ProjectionGeometryComponent.svelte` (Task 11). No change needed in collate files. ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases/similar to" — every step shows real code and exact commands. ✓

**Type consistency:**
- `SurfaceTriangle`, `AreaWeightedSeedMethod` defined in Task 1 before first use (Tasks 2–4). ✓
- `buildAreaTable`/`AREA_SCALE`/`AreaTableEntry`/`triangleArea` defined Task 2, used Task 3. ✓
- `extractSurfaceTriangles` defined Task 4, used Task 5. ✓
- `voronoiConfig?`/`voronoiResult?` introduced Task 6, consumed Tasks 7–13 — each consumer migrated before `npm run check` is expected clean (only the final Task 13/14 expect zero errors). ✓
- `normalizeVoronoiConfig` defined Task 12, used in store same task. ✓
- `Floater.svelte` props (`onClose`, `title`, `showFloater`, `content`, `closeOnClickAway`) match the real component signature read from source. ✓
- `defaultVoronoiConfig` import path `$lib/shades-config` matches existing usage in `VoronoiControl.svelte`. ✓
