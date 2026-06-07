# Voronoi Planar Edge Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an alternative, 2D-first Voronoi edge pipeline (gated by a `planarEdges` config boolean) that computes outer/inset edges and divisions in 2D, then projects onto the surface — reproducing today's geometry closely and creating a clean seam for future curved edges.

**Architecture:** Approach A (strategy extraction). The per-edge "compute three projected polylines + normals" step is pulled out of `makeVoronoi`'s loop into two interchangeable functions — `computeEdgeProfiles3D` (today's slerp/raycast, moved verbatim) and `computeEdgeProfiles2D` (new: build 2D segments, sample, project). A config boolean picks the strategy. Everything downstream (cross-sections, tubes, surface-projection tubes, fillAll, partner matching) is shared and untouched. The pure 2D math lives in its own dependency-free module so it is unit-testable and is the exact place curves plug in later.

**Tech Stack:** SvelteKit + Three.js + TypeScript; Jest for unit tests (`npm run test:unit`), `npm run check` for types, `npm run build` for the production/Svelte check.

**Spec:** `docs/superpowers/specs/2026-06-07-voronoi-planar-edge-pipeline-design.md`

---

## File Structure

- **Create** `src/lib/voronoi/edge-profiles-2d.ts` — pure, dependency-free 2D math: `lerp2`, `sample2DSegment`, `edgeLength2D`, `buildEdgeProfiles2D`. No `three` import. This is the seam curves plug into later.
- **Create** `src/lib/voronoi/__tests__/edge-profiles-2d.test.ts` — unit tests for the pure module.
- **Modify** `src/lib/voronoi/types.ts` — add optional `planarEdges?: boolean`.
- **Modify** `src/lib/shades-config.ts` — add `planarEdges: false` to `defaultVoronoiConfig`.
- **Modify** `src/lib/voronoi/generate-voronoi.ts` — add `EdgeProfiles`/`EdgeProfileArgs` types; extract `computeEdgeProfiles3D` (verbatim); add `computeEdgeProfiles2D`; branch on `config.planarEdges`; branch the division edge-length measure (3D arc-length vs 2D Euclidean).
- **Modify** `src/lib/voronoi/__tests__/generate-voronoi.test.ts` — add a `planarEdges: true` integration case.
- **Modify** `src/components/controls/VoronoiControl.svelte` — add a `planarEdges` checkbox + switch case.

---

## Task 1: Pure 2D edge-profile math module

**Files:**
- Create: `src/lib/voronoi/edge-profiles-2d.ts`
- Test: `src/lib/voronoi/__tests__/edge-profiles-2d.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/voronoi/__tests__/edge-profiles-2d.test.ts`:

```ts
import { lerp2, sample2DSegment, edgeLength2D, buildEdgeProfiles2D } from '../edge-profiles-2d';

describe('lerp2', () => {
	it('interpolates between two 2D points', () => {
		expect(lerp2([0, 0], [10, 0], 0.5)).toEqual([5, 0]);
		expect(lerp2([0, 0], [10, 20], 0.25)).toEqual([2.5, 5]);
	});

	it('returns the endpoints at t=0 and t=1', () => {
		expect(lerp2([1, 2], [3, 4], 0)).toEqual([1, 2]);
		expect(lerp2([1, 2], [3, 4], 1)).toEqual([3, 4]);
	});
});

describe('sample2DSegment', () => {
	it('returns divisions + 1 evenly spaced points', () => {
		const pts = sample2DSegment([0, 0], [6, 0], 3);
		expect(pts).toEqual([
			[0, 0],
			[2, 0],
			[4, 0],
			[6, 0]
		]);
	});

	it('includes both endpoints', () => {
		const pts = sample2DSegment([1, 1], [4, 7], 2);
		expect(pts[0]).toEqual([1, 1]);
		expect(pts[pts.length - 1]).toEqual([4, 7]);
		expect(pts).toHaveLength(3);
	});
});

describe('edgeLength2D', () => {
	it('returns the Euclidean distance between two 2D points', () => {
		expect(edgeLength2D([0, 0], [3, 4])).toBe(5);
		expect(edgeLength2D([1, 1], [1, 1])).toBe(0);
	});
});

describe('buildEdgeProfiles2D', () => {
	it('builds outer + two inset polylines, each divisions + 1 long', () => {
		const { outer, insetA, insetB } = buildEdgeProfiles2D(
			[0, 0],
			[4, 0],
			[2, 4],
			[2, -4],
			2,
			0.5
		);
		expect(outer).toEqual([
			[0, 0],
			[2, 0],
			[4, 0]
		]);
		expect(insetA).toEqual([
			[1, 2],
			[2, 2],
			[3, 2]
		]);
		expect(insetB).toEqual([
			[1, -2],
			[2, -2],
			[3, -2]
		]);
	});

	it('insets each sample toward its seed (affine equivalence)', () => {
		const f = 0.3;
		const seedA: [number, number] = [5, 9];
		const { outer, insetA } = buildEdgeProfiles2D([0, 0], [8, 2], seedA, [0, 0], 4, f);
		// insetA[i] must equal lerp(outer[i], seedA, f)
		outer.forEach((p, i) => {
			expect(insetA[i][0]).toBeCloseTo(p[0] + (seedA[0] - p[0]) * f);
			expect(insetA[i][1]).toBeCloseTo(p[1] + (seedA[1] - p[1]) * f);
		});
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/edge-profiles-2d.test.ts`
Expected: FAIL — `Cannot find module '../edge-profiles-2d'`.

- [ ] **Step 3: Write the module**

Create `src/lib/voronoi/edge-profiles-2d.ts`:

```ts
/**
 * Pure, dependency-free 2D math for the planar Voronoi edge pipeline. Builds the
 * outer edge and the two inset ("inner") edges as 2D polylines in the parameter
 * plane (lon/lat or UV) so they can be sampled and projected later. Kept free of
 * `three` so it is unit-testable in isolation. This is the seam where future
 * curved edges plug in: replace the straight `sample2DSegment` calls in
 * `buildEdgeProfiles2D` with curve sampling.
 */

export type Point2 = [number, number];

/** Linear interpolation between two 2D points. */
export function lerp2(a: Point2, b: Point2, t: number): Point2 {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Sample a straight 2D segment at `divisions + 1` evenly spaced points (inclusive of both ends). */
export function sample2DSegment(a: Point2, b: Point2, divisions: number): Point2[] {
	const points: Point2[] = [];
	for (let i = 0; i <= divisions; i++) {
		points.push(lerp2(a, b, i / divisions));
	}
	return points;
}

/** Euclidean length of a 2D edge in the parameter plane. */
export function edgeLength2D(v0: Point2, v1: Point2): number {
	const dx = v1[0] - v0[0];
	const dy = v1[1] - v0[1];
	return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Build the three 2D polylines for one Voronoi edge: the outer edge and the two
 * inset edges (one toward each adjacent cell seed). Each inset endpoint is lerped
 * toward its seed by `curveOffsetFactor`; because lerp-toward-a-point is affine,
 * inset[i] equals lerp(outer[i], seed, curveOffsetFactor). All three polylines
 * have `divisions + 1` points and are index-aligned.
 */
export function buildEdgeProfiles2D(
	v0: Point2,
	v1: Point2,
	seedA: Point2,
	seedB: Point2,
	divisions: number,
	curveOffsetFactor: number
): { outer: Point2[]; insetA: Point2[]; insetB: Point2[] } {
	return {
		outer: sample2DSegment(v0, v1, divisions),
		insetA: sample2DSegment(
			lerp2(v0, seedA, curveOffsetFactor),
			lerp2(v1, seedA, curveOffsetFactor),
			divisions
		),
		insetB: sample2DSegment(
			lerp2(v0, seedB, curveOffsetFactor),
			lerp2(v1, seedB, curveOffsetFactor),
			divisions
		)
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/edge-profiles-2d.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/edge-profiles-2d.ts src/lib/voronoi/__tests__/edge-profiles-2d.test.ts
git commit -m "feat(voronoi): pure 2D edge-profile math for planar pipeline"
```

---

## Task 2: Add the `planarEdges` config field

**Files:**
- Modify: `src/lib/voronoi/types.ts`
- Modify: `src/lib/shades-config.ts`

- [ ] **Step 1: Add the optional field to `VoronoiConfig`**

In `src/lib/voronoi/types.ts`, inside the `VoronoiConfig` type, add `planarEdges` next to `fillAll`:

```ts
	voronoiMethod: VoronoiMethod;
	fillAll?: boolean;
	// When true, compute edge/inset/divisions in 2D, then project onto the surface
	// (alternative pipeline). Absent/false → the direction-space pipeline runs.
	planarEdges?: boolean;
};
```

- [ ] **Step 2: Add the default to `defaultVoronoiConfig`**

In `src/lib/shades-config.ts`, in `defaultVoronoiConfig`, add `planarEdges: false` after `voronoiMethod: 'spherical'`:

```ts
	surfaceProjectionDivisions: 0,
	voronoiMethod: 'spherical',
	planarEdges: false
};
```

- [ ] **Step 3: Verify types still compile**

Run: `npm run check`
Expected: No new errors referencing `planarEdges`, `VoronoiConfig`, or `shades-config.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/voronoi/types.ts src/lib/shades-config.ts
git commit -m "feat(voronoi): add planarEdges config flag (default false)"
```

---

## Task 3: Extract `computeEdgeProfiles3D` (pure refactor)

This is a behavior-preserving refactor. The existing `generate-voronoi.test.ts` suite is the guard — it must stay green with no changes.

**Files:**
- Modify: `src/lib/voronoi/generate-voronoi.ts`

- [ ] **Step 1: Add the shared types and the `computeEdgeProfiles3D` function**

In `src/lib/voronoi/generate-voronoi.ts`, insert the following **immediately before** `export function makeVoronoi(` (which is around line 309). It reuses the existing `slerp`, `sampleEdgeAsDirections`, and `CoordToDirection` already defined above in the file:

```ts
type SurfaceIntersect = (direction: Vector3) => Vector3 | null;

type EdgeProfileArgs = {
	v0: [number, number];
	v1: [number, number];
	divisions: number;
	cellCenterA: [number, number];
	cellCenterB: [number, number];
	coordToDirection: CoordToDirection;
	intersect: SurfaceIntersect;
	center: Vector3;
	curveOffsetFactor: number;
	surface: Object3D;
	normalRaycaster: Raycaster;
};

type EdgeProfiles = {
	edgePoints3d: Vector3[];
	curvePointsA: Vector3[];
	curvePointsB: Vector3[];
	normals: Vector3[];
};

/**
 * Direction-space edge profiles (the original pipeline). Samples the edge as a
 * great-circle arc, raycasts each direction onto the surface for the 3D point and
 * normal, and computes the two insets by slerping toward each cell seed.
 */
function computeEdgeProfiles3D(args: EdgeProfileArgs): EdgeProfiles {
	const {
		v0,
		v1,
		divisions,
		cellCenterA,
		cellCenterB,
		coordToDirection,
		intersect,
		center,
		curveOffsetFactor,
		surface,
		normalRaycaster
	} = args;

	const edgeDirections = sampleEdgeAsDirections(v0, v1, divisions, coordToDirection);

	const edgePoints3d: Vector3[] = [];
	const curvePointsA: Vector3[] = [];
	const curvePointsB: Vector3[] = [];
	const normals: Vector3[] = [];

	for (const dir of edgeDirections) {
		const point3d = intersect(dir);
		if (!point3d) continue;

		edgePoints3d.push(point3d);

		// Compute surface normal at this point
		normalRaycaster.set(center, dir.clone().normalize());
		const hits = normalRaycaster.intersectObject(surface, true);
		let normal: Vector3;
		if (hits.length > 0 && hits[0].face) {
			normal = hits[0].face.normal
				.clone()
				.transformDirection(hits[0].object.matrixWorld)
				.normalize();
		} else {
			normal = dir.clone().normalize();
		}
		normals.push(normal);

		// Compute curve offset points by slerping toward cell centers and raycasting
		const edgeDir = point3d.clone().sub(center).normalize();
		const cellDirA = coordToDirection(cellCenterA[0], cellCenterA[1]).normalize();
		const cellDirB = coordToDirection(cellCenterB[0], cellCenterB[1]).normalize();

		const curveDirA = slerp(edgeDir, cellDirA, curveOffsetFactor);
		const curveHitA = intersect(curveDirA);
		curvePointsA.push(curveHitA ?? point3d.clone());

		const curveDirB = slerp(edgeDir, cellDirB, curveOffsetFactor);
		const curveHitB = intersect(curveDirB);
		curvePointsB.push(curveHitB ?? point3d.clone());
	}

	return { edgePoints3d, curvePointsA, curvePointsB, normals };
}
```

- [ ] **Step 2: Replace the inline loop body with a call to `computeEdgeProfiles3D`**

In `makeVoronoi`, find this block (currently around lines 359–405):

```ts
		// Sample directions along the great circle arc between edge vertices
		const edgeDirections = sampleEdgeAsDirections(
			voronoiEdge.vertices[0],
			voronoiEdge.vertices[1],
			edgeDivisionCounts[edgeIndex],
			coordToDirection
		);

		// Map each direction to 3D surface point, compute normals and curve offsets
		const edgePoints3d: Vector3[] = [];
		const curvePointsA: Vector3[] = [];
		const curvePointsB: Vector3[] = [];
		const normals: Vector3[] = [];

		for (const dir of edgeDirections) {
			const point3d = intersect(dir);
			if (!point3d) continue;

			edgePoints3d.push(point3d);

			// Compute surface normal at this point
			normalRaycaster.set(center, dir.clone().normalize());
			const hits = normalRaycaster.intersectObject(surface, true);
			let normal: Vector3;
			if (hits.length > 0 && hits[0].face) {
				normal = hits[0].face.normal
					.clone()
					.transformDirection(hits[0].object.matrixWorld)
					.normalize();
			} else {
				normal = dir.clone().normalize();
			}
			normals.push(normal);

			// Compute curve offset points by slerping toward cell centers and raycasting
			const edgeDir = point3d.clone().sub(center).normalize();
			const cellDirA = coordToDirection(cellCenterA[0], cellCenterA[1]).normalize();
			const cellDirB = coordToDirection(cellCenterB[0], cellCenterB[1]).normalize();

			const curveDirA = slerp(edgeDir, cellDirA, curveOffsetFactor);
			const curveHitA = intersect(curveDirA);
			curvePointsA.push(curveHitA ?? point3d.clone());

			const curveDirB = slerp(edgeDir, cellDirB, curveOffsetFactor);
			const curveHitB = intersect(curveDirB);
			curvePointsB.push(curveHitB ?? point3d.clone());
		}
```

Replace that entire block with:

```ts
		const { edgePoints3d, curvePointsA, curvePointsB, normals } = computeEdgeProfiles3D({
			v0: voronoiEdge.vertices[0],
			v1: voronoiEdge.vertices[1],
			divisions: edgeDivisionCounts[edgeIndex],
			cellCenterA,
			cellCenterB,
			coordToDirection,
			intersect,
			center,
			curveOffsetFactor,
			surface,
			normalRaycaster
		});
```

The next line, `if (edgePoints3d.length < 2) continue;`, is unchanged and stays.

- [ ] **Step 3: Run the existing suite to verify no behavior change**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/generate-voronoi.test.ts`
Expected: PASS — all existing `makeVoronoi` tests stay green.

- [ ] **Step 4: Run the type check**

Run: `npm run check`
Expected: No new errors in `generate-voronoi.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/generate-voronoi.ts
git commit -m "refactor(voronoi): extract computeEdgeProfiles3D from makeVoronoi loop"
```

---

## Task 4: Add `computeEdgeProfiles2D` and the strategy branch

**Files:**
- Modify: `src/lib/voronoi/generate-voronoi.ts`
- Test: `src/lib/voronoi/__tests__/generate-voronoi.test.ts`

- [ ] **Step 1: Write the failing integration test**

In `src/lib/voronoi/__tests__/generate-voronoi.test.ts`, add a new `describe` block at the end of the file (it reuses the existing top-level `makeTestConfig`, `testSurfaceConfig`, and the imported `makeVoronoi` / `GlobuleAddress`):

```ts
describe('makeVoronoi with planarEdges', () => {
	const planarConfig = () => ({ ...makeTestConfig(), planarEdges: true });

	it('generates valid tube geometry via the 2D pipeline', () => {
		const address: GlobuleAddress = { globule: 0 };
		const result = makeVoronoi(planarConfig(), address, testSurfaceConfig);
		expect(result.tubes.length).toBeGreaterThan(0);
		result.tubes.forEach((tube) => {
			expect(tube.bands.length).toBeGreaterThan(0);
			tube.bands.forEach((band) => {
				expect(band.facets.length).toBeGreaterThan(0);
			});
			expect(tube.sections.length).toBeGreaterThan(0);
			tube.sections.forEach((section) => {
				expect(section.points.length).toBeGreaterThan(0);
			});
		});
	});

	it('produces the same tube count as the 3D pipeline (topological parity)', () => {
		const address: GlobuleAddress = { globule: 0 };
		const planar = makeVoronoi(planarConfig(), address, testSurfaceConfig);
		const direction = makeVoronoi(makeTestConfig(), address, testSurfaceConfig);
		expect(planar.tubes.length).toBe(direction.tubes.length);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/generate-voronoi.test.ts -t "planarEdges"`
Expected: FAIL — `planarEdges: true` currently behaves identically to 3D, so the first test may pass, but `computeEdgeProfiles2D` does not exist yet; once Step 3's branch is added it must stay green. (If both tests already pass because `planarEdges` is ignored, that is expected before the branch — proceed to Step 3, which makes the flag actually select the 2D path.)

> Note: this test asserts *valid geometry + parity*, not exact coordinates (matches the topological+close bar). It will pass once the 2D path is wired and produces sane geometry.

- [ ] **Step 3: Add the import for the pure 2D module**

At the top of `src/lib/voronoi/generate-voronoi.ts`, next to the existing `import { computeAdaptiveEdgeDivisions } from './edge-divisions';`, add:

```ts
import { buildEdgeProfiles2D, edgeLength2D } from './edge-profiles-2d';
```

- [ ] **Step 4: Add the `computeEdgeProfiles2D` function**

In `src/lib/voronoi/generate-voronoi.ts`, immediately **after** `computeEdgeProfiles3D` (added in Task 3), add:

```ts
/**
 * Planar (2D-first) edge profiles. Builds the outer edge and the two inset edges
 * as straight 2D segments in the parameter plane (insets lerped toward each cell
 * seed by curveOffsetFactor), samples them, then projects every 2D point onto the
 * surface via coordToDirection + raycast. Edge-case parity with the 3D pipeline:
 * a missed outer sample drops that index from all arrays; a missed inset sample
 * falls back to the outer point. This is the seam for future curved edges — only
 * `buildEdgeProfiles2D` needs to change to sample curves instead of segments.
 */
function computeEdgeProfiles2D(args: EdgeProfileArgs): EdgeProfiles {
	const {
		v0,
		v1,
		divisions,
		cellCenterA,
		cellCenterB,
		coordToDirection,
		intersect,
		center,
		curveOffsetFactor,
		surface,
		normalRaycaster
	} = args;

	const { outer, insetA, insetB } = buildEdgeProfiles2D(
		v0,
		v1,
		cellCenterA,
		cellCenterB,
		divisions,
		curveOffsetFactor
	);

	const edgePoints3d: Vector3[] = [];
	const curvePointsA: Vector3[] = [];
	const curvePointsB: Vector3[] = [];
	const normals: Vector3[] = [];

	for (let i = 0; i <= divisions; i++) {
		const dir = coordToDirection(outer[i][0], outer[i][1]);
		const point3d = intersect(dir);
		if (!point3d) continue; // outer miss → drop this index across all arrays

		edgePoints3d.push(point3d);

		// Surface normal at the projected edge point
		normalRaycaster.set(center, dir.clone().normalize());
		const hits = normalRaycaster.intersectObject(surface, true);
		let normal: Vector3;
		if (hits.length > 0 && hits[0].face) {
			normal = hits[0].face.normal
				.clone()
				.transformDirection(hits[0].object.matrixWorld)
				.normalize();
		} else {
			normal = dir.clone().normalize();
		}
		normals.push(normal);

		// Insets: project the 2D inset samples; fall back to the edge point on a miss
		const hitA = intersect(coordToDirection(insetA[i][0], insetA[i][1]));
		curvePointsA.push(hitA ?? point3d.clone());

		const hitB = intersect(coordToDirection(insetB[i][0], insetB[i][1]));
		curvePointsB.push(hitB ?? point3d.clone());
	}

	return { edgePoints3d, curvePointsA, curvePointsB, normals };
}
```

- [ ] **Step 5: Branch the division edge-length measure**

In `makeVoronoi`, find the `edgeLengths` computation (currently around lines 348–350):

```ts
	const edgeLengths = voronoiResult.edges.map((e) =>
		edgeArcLength(e.vertices[0], e.vertices[1], coordToDirection)
	);
```

Replace it with:

```ts
	const edgeLengths = voronoiResult.edges.map((e) =>
		config.planarEdges
			? edgeLength2D(e.vertices[0], e.vertices[1])
			: edgeArcLength(e.vertices[0], e.vertices[1], coordToDirection)
	);
```

- [ ] **Step 6: Branch the profile strategy in the loop**

In `makeVoronoi`, find the call added in Task 3:

```ts
		const { edgePoints3d, curvePointsA, curvePointsB, normals } = computeEdgeProfiles3D({
			v0: voronoiEdge.vertices[0],
			v1: voronoiEdge.vertices[1],
			divisions: edgeDivisionCounts[edgeIndex],
			cellCenterA,
			cellCenterB,
			coordToDirection,
			intersect,
			center,
			curveOffsetFactor,
			surface,
			normalRaycaster
		});
```

Replace it with:

```ts
		const edgeProfileArgs = {
			v0: voronoiEdge.vertices[0],
			v1: voronoiEdge.vertices[1],
			divisions: edgeDivisionCounts[edgeIndex],
			cellCenterA,
			cellCenterB,
			coordToDirection,
			intersect,
			center,
			curveOffsetFactor,
			surface,
			normalRaycaster
		};
		const { edgePoints3d, curvePointsA, curvePointsB, normals } = config.planarEdges
			? computeEdgeProfiles2D(edgeProfileArgs)
			: computeEdgeProfiles3D(edgeProfileArgs);
```

- [ ] **Step 7: Run the new tests to verify they pass**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/generate-voronoi.test.ts`
Expected: PASS — both the original tests and the new `planarEdges` tests are green.

- [ ] **Step 8: Run the type check**

Run: `npm run check`
Expected: No new errors in `generate-voronoi.ts`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/voronoi/generate-voronoi.ts src/lib/voronoi/__tests__/generate-voronoi.test.ts
git commit -m "feat(voronoi): planar 2D edge pipeline gated by planarEdges"
```

---

## Task 5: UI toggle in VoronoiControl

**Files:**
- Modify: `src/components/controls/VoronoiControl.svelte`

- [ ] **Step 1: Widen the `update` field union and value type**

In `src/components/controls/VoronoiControl.svelte`, in the `update` function signature, add `'planarEdges'` to the field union and widen `value` to include `boolean`:

```ts
	function update(
		field:
			| 'pointCount'
			| 'seed'
			| 'seedMethodType'
			| 'relaxationIterations'
			| 'edgeDivisionsMin'
			| 'edgeDivisionsMax'
			| 'curveOffsetFactor'
			| 'surfaceProjectionDivisions'
			| 'voronoiMethod'
			| 'planarEdges',
		value: number | string | boolean
	) {
```

- [ ] **Step 2: Add the `planarEdges` case to the switch**

In the same `update` function, add a branch alongside the others (e.g. after the `voronoiMethod` case):

```ts
		} else if (field === 'planarEdges') {
			next = { ...config, planarEdges: value as boolean };
		}
```

- [ ] **Step 3: Add the checkbox control**

In the template's `.config-block`, after the "Edge Divisions (max)" label block, add:

```svelte
		<label>
			Planar Edges (2D)
			<input
				type="checkbox"
				checked={config.planarEdges ?? false}
				onchange={(e) => update('planarEdges', e.currentTarget.checked)}
			/>
		</label>
```

- [ ] **Step 4: Verify types and build**

Run: `npm run check`
Expected: No new errors in `VoronoiControl.svelte`.

Run: `npm run build`
Expected: `✓ built` with no Svelte event-syntax errors.

- [ ] **Step 5: Manual parity check**

Run: `npm run dev`, open the designer, and toggle **Planar Edges (2D)** on the Voronoi control. Confirm: the same cell/tube topology, visually close geometry, and no console errors. Toggling off restores the original pipeline.

- [ ] **Step 6: Commit**

```bash
git add src/components/controls/VoronoiControl.svelte
git commit -m "feat(voronoi): planarEdges toggle in VoronoiControl"
```

---

## Self-Review

**Spec coverage:**
- Config & gating (optional `planarEdges`, default false, no migration, UI toggle) → Tasks 2 + 5. ✓
- Extraction seam (`EdgeProfiles`, two strategy fns, single branch, shared downstream) → Tasks 3 + 4. ✓
- `computeEdgeProfiles2D` internals (3 polylines, sample divisions+1, project, miss-handling parity) → Task 4 Step 4 + Task 1. ✓
- Adaptive divisions measured in 2D for the planar path → Task 4 Step 5. ✓
- Testing (pure unit, integration with `planarEdges: true`, manual parity) → Tasks 1, 4, 5. ✓
- Future curve hook isolated to `buildEdgeProfiles2D` → Task 1 module docstring. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command lists expected output. ✓

**Type consistency:** `EdgeProfileArgs` / `EdgeProfiles` defined in Task 3 and consumed unchanged in Task 4. `buildEdgeProfiles2D(v0, v1, seedA, seedB, divisions, curveOffsetFactor)` signature in Task 1 matches its call in Task 4 (note: `makeVoronoi` passes `cellCenterA`/`cellCenterB` as the `seedA`/`seedB` arguments — positional, names differ but order matches). `lerp2`/`sample2DSegment`/`edgeLength2D` names consistent across Tasks 1 and 4. `planarEdges` field name consistent across Tasks 2, 4, 5. ✓
