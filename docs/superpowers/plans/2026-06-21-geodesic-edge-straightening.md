# Geodesic Edge Straightening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make geodesic Voronoi cell edges read as straight curves from the surface normal by replacing the Dijkstra bisector edge with the geodesic between its two corners, computed via iterated curve-shortening, behind a new `geodesicEdgeStyle: 'bisector' | 'smoothed' | 'geodesic'`.

**Architecture:** A new module `geodesic-straighten.ts` runs discrete curve-shortening flow (Laplacian step + per-iteration nearest-surface re-projection + arc-length redistribution, fixed endpoints) until the curve reaches ~zero geodesic curvature or an iteration cap. It reuses `SurfaceProjector` (extended with a public `projectClosest`). `generate-geodesic-voronoi`'s emit loop branches by edge style; rim edges (openings) are excluded from straightening and keep the smoothed treatment.

**Tech Stack:** TypeScript, Three.js (`Vector3`, `Triangle`, `Raycaster`), Jest. Runs in the geometry Web Worker.

**Spec:** `docs/superpowers/specs/2026-06-21-geodesic-edge-straightening.md`

---

## File Structure

- **Modify** `src/lib/voronoi/geodesic/smooth-chains.ts` — add public `SurfaceProjector.projectClosest(point)`.
- **Create** `src/lib/voronoi/geodesic/geodesic-straighten.ts` — `resamplePolyline` + `straightenToGeodesic`.
- **Create** `src/lib/voronoi/geodesic/__tests__/geodesic-straighten.test.ts` — unit tests.
- **Modify** `src/lib/voronoi/types.ts` — `GeodesicEdgeStyle` type + two config fields.
- **Modify** `src/lib/shades-config.ts` — defaults.
- **Modify** `src/lib/voronoi/geodesic/geodesic-voronoi.ts` — branch emit loop by edge style.
- **Modify** `src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts` — integration tests.
- **Modify** `src/components/controls/VoronoiControl.svelte` — Edge Style selector + Straighten Iterations slider.

---

## Task 1: `SurfaceProjector.projectClosest` (public closest-point projection)

**Files:**

- Modify: `src/lib/voronoi/geodesic/smooth-chains.ts`
- Test: `src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts`

The curve-shortening loop projects moved midpoints with no reliable ray direction, so it needs a normal-free, closest-point projection. `SurfaceProjector` already has a private `closestPoint(point)`; expose it.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts` (the file already imports `Vector3`, `SurfaceProjector`, `buildMeshGraph`, and defines `gridMesh`):

```ts
describe('SurfaceProjector.projectClosest', () => {
	it('returns the nearest on-surface point and a sensible normal', () => {
		const tris = gridMesh(8);
		const projector = new SurfaceProjector(tris, buildMeshGraph(tris));
		const res = projector.projectClosest(new Vector3(0.2, -0.1, 0.5));
		expect(Math.abs(res.point.z)).toBeLessThan(1e-6); // snapped to z=0 plane
		expect(res.point.x).toBeCloseTo(0.2, 5);
		expect(res.point.y).toBeCloseTo(-0.1, 5);
		expect(Math.abs(res.normal.z)).toBeGreaterThan(0.99);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts`
Expected: FAIL — `projectClosest is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/voronoi/geodesic/smooth-chains.ts`, add a public method to the `SurfaceProjector` class, immediately BEFORE the existing `private raycastBoth(...)` method:

```ts
	/** Closest point on the surface to `point`, with a blended welded-vertex normal.
	 * Normal-free (no ray direction needed) — used by curve-shortening, which
	 * projects moved midpoints that have no reliable ray. */
	projectClosest(point: Vector3): { point: Vector3; normal: Vector3 } {
		return this.closestPoint(point);
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/geodesic/smooth-chains.ts src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts
git commit -m "feat(voronoi): expose SurfaceProjector.projectClosest"
```

---

## Task 2: `resamplePolyline` (points-only arc-length resample)

**Files:**

- Create: `src/lib/voronoi/geodesic/geodesic-straighten.ts`
- Test: `src/lib/voronoi/geodesic/__tests__/geodesic-straighten.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/voronoi/geodesic/__tests__/geodesic-straighten.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import { resamplePolyline } from '../geodesic-straighten';

describe('resamplePolyline', () => {
	it('resamples to the requested count, preserving endpoints, evenly by arc length', () => {
		// An L-shaped path: (0,0,0) -> (2,0,0) -> (2,2,0), total length 4.
		const input = [new Vector3(0, 0, 0), new Vector3(2, 0, 0), new Vector3(2, 2, 0)];
		const out = resamplePolyline(input, 5); // spacing 1 along arc length
		expect(out.length).toBe(5);
		expect(out[0].equals(input[0])).toBe(true);
		expect(out[4].equals(input[2])).toBe(true);
		// out[2] is at arc length 2 -> the corner (2,0,0).
		expect(out[2].distanceTo(new Vector3(2, 0, 0))).toBeLessThan(1e-9);
	});

	it('returns clones for degenerate inputs', () => {
		const single = [new Vector3(1, 2, 3)];
		expect(resamplePolyline(single, 5).map((p) => p.toArray())).toEqual([[1, 2, 3]]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/geodesic-straighten.test.ts`
Expected: FAIL — `Cannot find module '../geodesic-straighten'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/voronoi/geodesic/geodesic-straighten.ts`:

```ts
import { Vector3 } from 'three';

/** Resample a polyline to exactly `count` points, evenly spaced by arc length.
 * Endpoints are preserved. Degenerate inputs (fewer than 2 points, count <= 1,
 * or zero total length) are returned as clones. */
export function resamplePolyline(points: Vector3[], count: number): Vector3[] {
	if (points.length < 2 || count <= 1) return points.map((p) => p.clone());
	const cum: number[] = [0];
	for (let i = 1; i < points.length; i++)
		cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]));
	const total = cum[cum.length - 1];
	if (total < 1e-12) return points.map((p) => p.clone());
	const out: Vector3[] = [];
	for (let k = 0; k < count; k++) {
		const target = (k / (count - 1)) * total;
		let seg = 1;
		while (seg < cum.length - 1 && cum[seg] < target) seg++;
		const segLen = cum[seg] - cum[seg - 1];
		const t = segLen < 1e-12 ? 0 : (target - cum[seg - 1]) / segLen;
		out.push(points[seg - 1].clone().lerp(points[seg], t));
	}
	return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/geodesic-straighten.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/geodesic/geodesic-straighten.ts src/lib/voronoi/geodesic/__tests__/geodesic-straighten.test.ts
git commit -m "feat(voronoi): resamplePolyline arc-length helper"
```

---

## Task 3: `straightenToGeodesic` (iterated curve-shortening)

**Files:**

- Modify: `src/lib/voronoi/geodesic/geodesic-straighten.ts`
- Test: `src/lib/voronoi/geodesic/__tests__/geodesic-straighten.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/voronoi/geodesic/__tests__/geodesic-straighten.test.ts` (add the new imports near the top with the others):

```ts
import type { SurfaceTriangle } from '$lib/voronoi/types';
import { buildMeshGraph } from '../mesh-graph';
import { SurfaceProjector } from '../smooth-chains';
import { straightenToGeodesic } from '../geodesic-straighten';

/** Flat NxN grid in the z=0 plane. */
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

/** UV sphere -> triangles (unit radius). */
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

function polylineLength(p: Vector3[]): number {
	let L = 0;
	for (let i = 1; i < p.length; i++) L += p[i].distanceTo(p[i - 1]);
	return L;
}

describe('straightenToGeodesic', () => {
	it('straightens a wiggly path on a plane into the straight chord', () => {
		const tris = gridMesh(16);
		const projector = new SurfaceProjector(tris, buildMeshGraph(tris));
		// Wiggly path from (-0.8,0,0) to (0.8,0,0) with alternating y noise.
		const n = 11;
		const input = Array.from({ length: n }, (_, i) => {
			const x = -0.8 + (1.6 * i) / (n - 1);
			const y = i === 0 || i === n - 1 ? 0 : i % 2 === 0 ? 0.25 : -0.25;
			return new Vector3(x, y, 0);
		});
		const out = straightenToGeodesic(input, projector, {
			stepFactor: 0.5,
			tolerance: 1e-9,
			cap: 400
		});
		expect(out.length).toBe(n);
		expect(out[0].equals(input[0])).toBe(true);
		expect(out[n - 1].equals(input[n - 1])).toBe(true);
		// Converged to the x-axis: every interior point has y,z ~ 0.
		for (let i = 1; i < n - 1; i++) {
			expect(Math.abs(out[i].y)).toBeLessThan(0.01);
			expect(Math.abs(out[i].z)).toBeLessThan(1e-6);
		}
	});

	it('shortens a wiggly path on a sphere and keeps it on the surface, endpoints fixed', () => {
		const tris = sphereMesh(24);
		const projector = new SurfaceProjector(tris, buildMeshGraph(tris));
		const a = new Vector3(1, 0, 0);
		const b = new Vector3(0, 0, 1);
		const n = 13;
		const input = Array.from({ length: n }, (_, i) => {
			const t = i / (n - 1);
			const base = a.clone().lerp(b, t).normalize(); // arc-ish
			if (i === 0 || i === n - 1) return base;
			// push off the arc toward +y, then snap to sphere.
			return base
				.clone()
				.add(new Vector3(0, i % 2 === 0 ? 0.3 : -0.3, 0))
				.normalize();
		});
		const before = polylineLength(input);
		const out = straightenToGeodesic(input, projector, {
			stepFactor: 0.5,
			tolerance: 1e-9,
			cap: 150
		});
		expect(out[0].equals(input[0])).toBe(true);
		expect(out[n - 1].equals(input[n - 1])).toBe(true);
		expect(polylineLength(out)).toBeLessThan(before); // curve-shortening
		for (let i = 0; i < n; i++) expect(Math.abs(out[i].length() - 1)).toBeLessThan(0.05);
	});

	it('returns clones unchanged for paths shorter than 4 points', () => {
		const tris = gridMesh(4);
		const projector = new SurfaceProjector(tris, buildMeshGraph(tris));
		const input = [new Vector3(0, 0, 0), new Vector3(0.5, 0.1, 0), new Vector3(0.9, 0, 0)];
		const out = straightenToGeodesic(input, projector, {
			stepFactor: 0.5,
			tolerance: 1e-9,
			cap: 50
		});
		expect(out.map((p) => p.toArray())).toEqual(input.map((p) => p.toArray()));
		expect(out[0]).not.toBe(input[0]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/geodesic-straighten.test.ts`
Expected: FAIL — `straightenToGeodesic is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/voronoi/geodesic/geodesic-straighten.ts`, add the import for the projector type and append the function. Change the top import line to:

```ts
import { Vector3 } from 'three';
import type { SurfaceProjector } from './smooth-chains';
```

Append:

```ts
export type StraightenOptions = {
	/** Laplacian step fraction per iteration (0..1). 0.5 is stable. */
	stepFactor: number;
	/** Stop when the max interior point movement in an iteration falls below this. */
	tolerance: number;
	/** Hard cap on iterations. */
	cap: number;
};

/**
 * Straighten a polyline into a geodesic between its fixed endpoints by discrete
 * curve-shortening flow: each iteration nudges interior points toward the
 * midpoint of their neighbors, projects them to the nearest surface point, then
 * redistributes by arc length and re-projects. Converges to the local geodesic
 * (zero geodesic curvature — reads straight from the surface normal).
 *
 * Endpoints are never moved (shared corners stay put). Paths shorter than 4
 * points are returned as clones. Returns a new array the same length as `points`.
 */
export function straightenToGeodesic(
	points: Vector3[],
	projector: SurfaceProjector,
	opts: StraightenOptions
): Vector3[] {
	const n = points.length;
	if (n < 4) return points.map((p) => p.clone());
	const { stepFactor, tolerance, cap } = opts;

	let cur = points.map((p) => p.clone());
	for (let iter = 0; iter < cap; iter++) {
		// Jacobi Laplacian step on interior points, snapped to the surface.
		const next = cur.map((p) => p.clone());
		let maxMove = 0;
		for (let i = 1; i < n - 1; i++) {
			const mid = cur[i - 1]
				.clone()
				.add(cur[i + 1])
				.multiplyScalar(0.5);
			const moved = cur[i].clone().lerp(mid, stepFactor);
			const snapped = projector.projectClosest(moved).point;
			maxMove = Math.max(maxMove, snapped.distanceTo(cur[i]));
			next[i] = snapped;
		}
		// Redistribute evenly along the curve (curve-shortening bunches points),
		// then re-snap the interior. resamplePolyline preserves endpoints, and
		// next[0]/next[n-1] were never moved, so endpoints stay exact.
		const spread = resamplePolyline(next, n);
		for (let i = 1; i < n - 1; i++) spread[i] = projector.projectClosest(spread[i]).point;
		cur = spread;

		if (maxMove < tolerance) break;
	}
	return cur;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/geodesic-straighten.test.ts`
Expected: PASS (5 tests). Do NOT weaken assertions; if the plane test doesn't converge, raise `cap` in the test, but the math should converge well under 400 iterations.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/geodesic/geodesic-straighten.ts src/lib/voronoi/geodesic/__tests__/geodesic-straighten.test.ts
git commit -m "feat(voronoi): straightenToGeodesic via curve-shortening"
```

---

## Task 4: Config — `geodesicEdgeStyle` + `geodesicStraightenCap`

**Files:**

- Modify: `src/lib/voronoi/types.ts`
- Modify: `src/lib/shades-config.ts`

- [ ] **Step 1: Add the type + fields**

In `src/lib/voronoi/types.ts`, add this type definition immediately AFTER the existing `export type VoronoiMethod = ...;` line (near the top):

```ts
export type GeodesicEdgeStyle = 'bisector' | 'smoothed' | 'geodesic';
```

Then, inside `VoronoiConfig`, replace the existing `geodesicSmoothing?: number;` block (the field plus its comment) with:

```ts
	// Geodesic-only. How cell edges are drawn:
	//   'bisector' — raw equidistant boundary (default; current behavior)
	//   'smoothed' — bisector run through the cubic smoothing spline (geodesicSmoothing = λ)
	//   'geodesic' — edge replaced by the geodesic between its corners (curve-shortening)
	geodesicEdgeStyle?: GeodesicEdgeStyle;
	// Smoothing-spline strength (λ) for the 'smoothed' style. 0 = off.
	geodesicSmoothing?: number;
	// Max curve-shortening iterations for the 'geodesic' style.
	geodesicStraightenCap?: number;
```

- [ ] **Step 2: Add defaults**

In `src/lib/shades-config.ts`, inside `defaultVoronoiConfig`, find the existing `geodesicSmoothing: 0,` line and replace it with:

```ts
	geodesicEdgeStyle: 'bisector',
	geodesicSmoothing: 0,
	geodesicStraightenCap: 60,
```

- [ ] **Step 3: Verify types compile**

Run: `npm run check`
Expected: no NEW errors in `types.ts` or `shades-config.ts` (pre-existing unrelated errors elsewhere are fine).

- [ ] **Step 4: Commit**

```bash
git add src/lib/voronoi/types.ts src/lib/shades-config.ts
git commit -m "feat(voronoi): geodesicEdgeStyle + geodesicStraightenCap config"
```

---

## Task 5: Wire edge styles into `generateGeodesicVoronoi`

**Files:**

- Modify: `src/lib/voronoi/geodesic/geodesic-voronoi.ts`
- Test: `src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts`

Read the current emit loop first to confirm it matches the "before" block below. If it differs, STOP and report NEEDS_CONTEXT.

- [ ] **Step 1: Write the failing integration tests**

Append to `src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts` (the file already defines `baseConfig`, `sphereMesh`, `gridMesh`, imports `generateGeodesicVoronoi`, `VoronoiConfig`, `OPENING`, `Vector3`):

```ts
describe('generateGeodesicVoronoi edge styles', () => {
	const withStyle = (
		style: 'bisector' | 'smoothed' | 'geodesic',
		extra: Partial<VoronoiConfig> = {}
	): VoronoiConfig => ({ ...baseConfig(), geodesicEdgeStyle: style, ...extra });

	const totalTurning = (r: ReturnType<typeof generateGeodesicVoronoi>) => {
		let t = 0;
		for (const proj of r.edgeProjections) {
			const p = proj.edgePoints3d;
			for (let k = 1; k < p.length - 1; k++) {
				const u = p[k].clone().sub(p[k - 1]);
				const v = p[k + 1].clone().sub(p[k]);
				if (u.lengthSq() > 1e-18 && v.lengthSq() > 1e-18) t += u.angleTo(v);
			}
		}
		return t;
	};

	it('geodesic style reduces total edge turning vs bisector', () => {
		const bis = generateGeodesicVoronoi(withStyle('bisector'), sphereMesh(24));
		const geo = generateGeodesicVoronoi(
			withStyle('geodesic', { geodesicStraightenCap: 120 }),
			sphereMesh(24)
		);
		expect(geo.edges.length).toBe(bis.edges.length);
		expect(totalTurning(geo)).toBeLessThan(totalTurning(bis));
	});

	it('keeps edge endpoints (shared corners) identical across all three styles', () => {
		const bis = generateGeodesicVoronoi(withStyle('bisector'), sphereMesh(24));
		const sm = generateGeodesicVoronoi(
			withStyle('smoothed', { geodesicSmoothing: 8 }),
			sphereMesh(24)
		);
		const geo = generateGeodesicVoronoi(withStyle('geodesic'), sphereMesh(24));
		for (let i = 0; i < bis.edges.length; i++) {
			const a = bis.edgeProjections[i].edgePoints3d;
			const s = sm.edgeProjections[i].edgePoints3d;
			const g = geo.edgeProjections[i].edgePoints3d;
			expect(s[0].distanceTo(a[0])).toBeLessThan(1e-9);
			expect(g[0].distanceTo(a[0])).toBeLessThan(1e-9);
			expect(s[s.length - 1].distanceTo(a[a.length - 1])).toBeLessThan(1e-9);
			expect(g[g.length - 1].distanceTo(a[a.length - 1])).toBeLessThan(1e-9);
		}
	});

	it('does not straighten rim edges; cell-cell edges do change', () => {
		// Open surface -> some edges border an OPENING. With smoothing off, rim
		// edges must be identical between bisector and geodesic; at least one
		// cell-cell edge must differ (proving straightening ran on non-rim edges).
		const bis = generateGeodesicVoronoi(
			withStyle('bisector', { geodesicSmoothing: 0 }),
			gridMesh(16)
		);
		const geo = generateGeodesicVoronoi(
			withStyle('geodesic', { geodesicSmoothing: 0, geodesicStraightenCap: 60 }),
			gridMesh(16)
		);
		let rimChecked = 0;
		let cellChanged = false;
		for (let i = 0; i < bis.edges.length; i++) {
			const isRim = bis.edges[i].cellIndices.includes(OPENING);
			const a = bis.edgeProjections[i].edgePoints3d;
			const g = geo.edgeProjections[i].edgePoints3d;
			let maxDiff = 0;
			for (let k = 0; k < a.length; k++) maxDiff = Math.max(maxDiff, g[k].distanceTo(a[k]));
			if (isRim) {
				expect(maxDiff).toBeLessThan(1e-9); // rim untouched
				rimChecked++;
			} else if (maxDiff > 1e-6) {
				cellChanged = true;
			}
		}
		expect(rimChecked).toBeGreaterThan(0);
		expect(cellChanged).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts`
Expected: FAIL — geodesic style not wired (turning not reduced / cell edges unchanged).

- [ ] **Step 3: Wire the emit loop**

In `src/lib/voronoi/geodesic/geodesic-voronoi.ts`:

(a) Add imports. Update the `smooth-chains` import and add two new imports after it:

```ts
import { smoothChainPoints, SurfaceProjector } from './smooth-chains';
import { straightenToGeodesic } from './geodesic-straighten';
import { OPENING } from '$lib/types';
```

Also add `GeodesicEdgeStyle` to the existing type import from `$lib/voronoi/types`:

```ts
import type {
	SurfaceTriangle,
	VoronoiConfig,
	VoronoiEdge,
	GeodesicEdgeStyle
} from '$lib/voronoi/types';
```

(b) The emit loop currently looks EXACTLY like this:

```ts
const lambda = Math.max(0, config.geodesicSmoothing ?? 0);
const projector = lambda > 0 ? new SurfaceProjector(surfaceTriangles, graph) : null;

const edges: VoronoiEdge[] = [];
const edgeProjections: EdgeProjection[] = [];
chains.forEach((chain, i) => {
	// Smooth (and later re-project) only chains with enough points; shorter
	// chains (e.g. single-vertex rim runs) keep the original behavior.
	const smoothing = lambda > 0 && chain.points.length >= 4;
	const srcPoints = smoothing ? smoothChainPoints(chain.points, lambda) : chain.points;
	const { points, normals } = resample(srcPoints, chain.normals, divisionCounts[i]);
	if (points.length < 2) return;

	// Re-project interior points onto the surface; endpoints are left exactly
	// as resampled so shared corners stay bit-identical across chains.
	// (smoothChainPoints hard-pins chain endpoints, and resample reproduces
	// the first/last source point exactly, so points[0]/points[last] already
	// equal the original chain corners — we just never touch them here.)
	if (smoothing && projector) {
		for (let k = 1; k < points.length - 1; k++) {
			const pr = projector.project(points[k], normals[k]);
			points[k] = pr.point;
			normals[k] = pr.normal;
		}
	}

	edges.push({
		vertices: [
			[chain.vertices[0], 0],
			[chain.vertices[1], 0]
		],
		cellIndices: chain.cellIndices
	});
	edgeProjections.push({ edgePoints3d: points, normals });
});
```

Replace that entire block with:

```ts
const edgeStyle: GeodesicEdgeStyle = config.geodesicEdgeStyle ?? 'bisector';
const lambda = Math.max(0, config.geodesicSmoothing ?? 0);
const straightenCap = Math.max(0, Math.floor(config.geodesicStraightenCap ?? 60));
// A projector is needed whenever points get re-projected (smoothed or geodesic).
const projector = edgeStyle !== 'bisector' ? new SurfaceProjector(surfaceTriangles, graph) : null;

const edges: VoronoiEdge[] = [];
const edgeProjections: EdgeProjection[] = [];
chains.forEach((chain, i) => {
	const isRim = chain.cellIndices.includes(OPENING);
	// Geodesic straightening applies to cell-cell edges only; rim edges trace
	// an opening and must stay on the rim, so they keep the smoothed treatment.
	const straighten = edgeStyle === 'geodesic' && !isRim && chain.points.length >= 4;
	const smoothing =
		(edgeStyle === 'smoothed' || (edgeStyle === 'geodesic' && isRim)) &&
		lambda > 0 &&
		chain.points.length >= 4;

	const srcPoints = smoothing ? smoothChainPoints(chain.points, lambda) : chain.points;
	const { points, normals } = resample(srcPoints, chain.normals, divisionCounts[i]);
	if (points.length < 2) return;

	// Interior points get re-projected; endpoints are left exactly as resampled
	// so shared corners stay bit-identical across chains.
	if (straighten && projector) {
		const tolerance = 1e-4 * polylineLength(points);
		const straightened = straightenToGeodesic(points, projector, {
			stepFactor: 0.5,
			tolerance,
			cap: straightenCap
		});
		for (let k = 1; k < points.length - 1; k++) {
			points[k] = straightened[k];
			normals[k] = projector.projectClosest(straightened[k]).normal;
		}
	} else if (smoothing && projector) {
		for (let k = 1; k < points.length - 1; k++) {
			const pr = projector.project(points[k], normals[k]);
			points[k] = pr.point;
			normals[k] = pr.normal;
		}
	}

	edges.push({
		vertices: [
			[chain.vertices[0], 0],
			[chain.vertices[1], 0]
		],
		cellIndices: chain.cellIndices
	});
	edgeProjections.push({ edgePoints3d: points, normals });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts`
Expected: PASS (existing + 3 new edge-style tests).

- [ ] **Step 5: Run the full voronoi suite + type check**

Run: `npm run test:unit -- src/lib/voronoi`
Expected: PASS (no regressions).
Run: `npm run check`
Expected: no new errors in `geodesic-voronoi.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/voronoi/geodesic/geodesic-voronoi.ts src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts
git commit -m "feat(voronoi): branch geodesic edges by style (bisector/smoothed/geodesic)"
```

---

## Task 6: Controls — Edge Style selector + Straighten Iterations slider

**Files:**

- Modify: `src/components/controls/VoronoiControl.svelte`

Read the file first to match its `update(field, value)` pattern and slider markup.

- [ ] **Step 1: Extend the `update` field union and type import**

In `src/components/controls/VoronoiControl.svelte`, add `GeodesicEdgeStyle` to the existing type import from `$lib/voronoi/types`:

```ts
import type {
	VoronoiConfig,
	VoronoiMethod,
	InsetMethod,
	GeodesicEdgeStyle
} from '$lib/voronoi/types';
```

Add `'geodesicEdgeStyle'` and `'geodesicStraightenCap'` to the `field` union in the `update` signature, right after `'geodesicSmoothing'`:

```ts
			| 'geodesicSmoothing'
			| 'geodesicEdgeStyle'
			| 'geodesicStraightenCap'
```

- [ ] **Step 2: Add the update branches**

Add these branches inside `update`, right after the existing `} else if (field === 'geodesicSmoothing') {` branch and its body:

```ts
		} else if (field === 'geodesicEdgeStyle') {
			next = { ...config, geodesicEdgeStyle: value as GeodesicEdgeStyle };
		} else if (field === 'geodesicStraightenCap') {
			next = { ...config, geodesicStraightenCap: value as number };
```

- [ ] **Step 3: Add the Edge Style selector + Straighten slider**

In the template, find the existing "Smoothing" `<label>` block (the range input bound to `config.geodesicSmoothing`). Immediately BEFORE that block, add the Edge Style selector:

```svelte
<label>
	Edge Style
	<select
		value={config.geodesicEdgeStyle ?? 'bisector'}
		onchange={(e) => update('geodesicEdgeStyle', e.currentTarget.value)}
		disabled={!isGeodesic}
	>
		<option value="bisector">Bisector</option>
		<option value="smoothed">Smoothed</option>
		<option value="geodesic">Geodesic (straight)</option>
	</select>
</label>
```

Then, immediately AFTER the existing "Smoothing" `<label>` block, add the Straighten Iterations slider:

```svelte
<label>
	Straighten Iterations
	<input
		type="range"
		min="0"
		max="200"
		step="1"
		value={config.geodesicStraightenCap ?? 60}
		disabled={!isGeodesic || (config.geodesicEdgeStyle ?? 'bisector') !== 'geodesic'}
		oninput={(e) => update('geodesicStraightenCap', Number(e.currentTarget.value))}
	/>
	<span>{config.geodesicStraightenCap ?? 60}</span>
</label>
```

- [ ] **Step 4: Verify types + svelte check**

Run: `npm run check`
Expected: no new errors in `VoronoiControl.svelte`.

- [ ] **Step 5: Commit**

```bash
git add src/components/controls/VoronoiControl.svelte
git commit -m "feat(voronoi): edge style selector + straighten iterations slider"
```

---

## Task 7: Full verification

- [ ] **Step 1: Full unit suite**

Run: `npm run test:unit`
Expected: all green (previous baseline 476 + new tests).

- [ ] **Step 2: Type check (feature files clean)**

Run: `npm run check 2>&1 | grep -iE "geodesic-straighten|geodesic-voronoi|smooth-chains|VoronoiControl|voronoi/types|shades-config"`
Expected: no ERROR lines for these files (a pre-existing CSS warning in VoronoiControl is acceptable).

- [ ] **Step 3: Manual check (developer)**

Run `npm run dev`, open the designer, high-res globule surface, Voronoi method = Geodesic, set Edge Style = Geodesic, and raise Straighten Iterations from 0. Confirm cell-cell edges read as straight curves from the surface normal (compare against Bisector/Smoothed), corners stay put (no gaps), and rim edges still follow the openings. Tune the cap to taste.

- [ ] **Step 4: Final commit (if anything uncommitted)**

```bash
git add -A
git commit -m "chore(voronoi): geodesic edge straightening complete" || echo "nothing to commit"
```

---

## Notes / invariants (from the spec)

- **Center-free:** only surface/mesh operations; no center projection.
- **Shared corners fixed:** endpoints (corners) are never moved — `straightenToGeodesic` skips index 0 and last, the emit loop only writes interior `points[1..n-2]`, and `resample`/`resamplePolyline` preserve endpoints.
- **Rim coupling:** rim edges (`cellIndices` includes `OPENING`) are excluded from straightening; they keep the smoothed treatment.
- **Serializable:** outputs are `Vector3`/arrays; the `Mesh`/`Raycaster` are worker-local.
- **`'bisector'` default:** byte-for-byte the current behavior (projector is null, no smoothing, no straightening).
- **Performance:** `projectClosest` is O(triangles) per call, ×iterations — acceptable in the worker; follow-up is a BVH or locality search if it feels slow. The iteration `cap` bounds the cost.
