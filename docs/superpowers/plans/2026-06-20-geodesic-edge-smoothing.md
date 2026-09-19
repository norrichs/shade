# Geodesic Edge Smoothing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make geodesic Voronoi cell edges and rim edges read as smooth curves by smoothing each boundary chain with a discrete cubic smoothing spline and re-projecting interior points onto the surface, gated by a new `geodesicSmoothing` lambda config.

**Architecture:** A new pure-numeric module (`smooth-chains.ts`) provides (1) `smoothSeries` — a Whittaker–Henderson discrete cubic smoothing spline on one coordinate series, solved via a banded Cholesky, endpoints pinned; (2) `smoothChainPoints` — applies it to x/y/z of a `Vector3[]`; (3) `SurfaceProjector` — raycasts smoothed points back onto a `Mesh` built from the surface triangles, blending welded vertex normals. `geodesic-voronoi.ts` runs each chain through smooth → existing arc-length resample → re-project (interior points only, so shared corners stay fixed). When `geodesicSmoothing === 0` or a chain has < 4 points, behavior is unchanged.

**Tech Stack:** TypeScript, Three.js (`Vector3`, `Raycaster`, `BufferGeometry`, `Mesh`, `Triangle`), Jest. Runs inside the geometry Web Worker.

**Spec:** `docs/superpowers/specs/2026-06-20-geodesic-edge-smoothing.md`

---

## File Structure

- **Create** `src/lib/voronoi/geodesic/smooth-chains.ts` — `smoothSeries`, `smoothChainPoints`, `SurfaceProjector`. One responsibility: turn jagged on-surface polylines into smooth on-surface polylines.
- **Create** `src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts` — unit tests for the above.
- **Modify** `src/lib/voronoi/geodesic/mesh-graph.ts` — export the weld key helper (`weldKey`) so the projector welds positions identically to `buildMeshGraph` (DRY).
- **Modify** `src/lib/voronoi/geodesic/geodesic-voronoi.ts` — wire the smoothing pipeline into the chain loop.
- **Modify** `src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts` — integration tests for the gated pipeline.
- **Modify** `src/lib/voronoi/types.ts` — add `geodesicSmoothing?: number` to `VoronoiConfig`.
- **Modify** `src/lib/shades-config.ts` — default `geodesicSmoothing: 0`.
- **Modify** `src/components/controls/VoronoiControl.svelte` — smoothing slider.

---

## Task 1: `smoothSeries` — discrete cubic smoothing spline

**Files:**

- Create: `src/lib/voronoi/geodesic/smooth-chains.ts`
- Test: `src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { smoothSeries } from '../smooth-chains';

/** Sum of |second differences| — a proxy for jaggedness. */
function roughness(s: number[]): number {
	let r = 0;
	for (let i = 1; i < s.length - 1; i++) r += Math.abs(s[i - 1] - 2 * s[i] + s[i + 1]);
	return r;
}

describe('smoothSeries', () => {
	it('reduces roughness while pinning the endpoints exactly', () => {
		// A straight ramp with alternating zig-zag noise on the interior.
		const n = 21;
		const noisy = Array.from({ length: n }, (_, i) => i + (i % 2 === 0 ? 0.5 : -0.5));
		noisy[0] = 0; // clean endpoints
		noisy[n - 1] = n - 1;
		const out = smoothSeries(noisy, 10);
		expect(out.length).toBe(n);
		expect(out[0]).toBe(noisy[0]);
		expect(out[n - 1]).toBe(noisy[n - 1]);
		expect(roughness(out)).toBeLessThan(roughness(noisy) * 0.5);
	});

	it('returns the input unchanged when lambda is 0', () => {
		const y = [0, 3, 1, 4, 1, 5, 9, 2];
		expect(smoothSeries(y, 0)).toEqual(y);
	});

	it('returns a copy unchanged for series shorter than 4', () => {
		const y = [1, 5, 2];
		const out = smoothSeries(y, 10);
		expect(out).toEqual(y);
		expect(out).not.toBe(y);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts`
Expected: FAIL — `Cannot find module '../smooth-chains'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/voronoi/geodesic/smooth-chains.ts` (no imports yet — pure number
crunching; `Vector3` is added by Task 2 when first used):

```ts
/**
 * Discrete cubic smoothing spline (Whittaker–Henderson) on one coordinate series.
 * Minimises  Σ wᵢ (yᵢ − zᵢ)²  +  λ Σ (z_{k−1} − 2 z_k + z_{k+1})²
 * (the second sum is the discrete curvature/second-derivative penalty).
 *
 * The normal equations (W + λ DᵀD) z = W y form a symmetric, positive-definite
 * pentadiagonal system (half-bandwidth 2), solved with a banded Cholesky.
 * Endpoints are pinned: indices 0 and n−1 get a large data weight, then the two
 * endpoint outputs are overwritten with the exact inputs so shared corners stay
 * bit-identical. λ ≤ 0 (or fewer than 4 points) returns a copy unchanged.
 */
export function smoothSeries(values: number[], lambda: number): number[] {
	const n = values.length;
	if (n < 4 || lambda <= 0) return values.slice();

	const PIN = 1e8;
	// Symmetric pentadiagonal A = W + λ DᵀD, stored as three upper diagonals.
	const d0 = new Array<number>(n).fill(0); // A[i][i]
	const d1 = new Array<number>(n).fill(0); // A[i][i+1]
	const d2 = new Array<number>(n).fill(0); // A[i][i+2]

	for (let i = 0; i < n; i++) d0[i] = i === 0 || i === n - 1 ? PIN : 1;

	// Accumulate λ·(2nd-difference)ᵀ(2nd-difference) for each interior triple.
	const addUpper = (i: number, j: number, val: number) => {
		if (i === j) d0[i] += val;
		else if (j === i + 1) d1[i] += val;
		else if (j === i + 2) d2[i] += val;
	};
	// Store only the upper triangle (j >= i), so loop b >= a (cols is monotone,
	// hence cols[b] >= cols[a]). A full a,b loop would double-count off-diagonals
	// and break positive-definiteness.
	const coeff = [1, -2, 1];
	for (let k = 1; k <= n - 2; k++) {
		const cols = [k - 1, k, k + 1];
		for (let a = 0; a < 3; a++) {
			for (let b = a; b < 3; b++) {
				addUpper(cols[a], cols[b], lambda * coeff[a] * coeff[b]);
			}
		}
	}

	// RHS b = W .* y.
	const b = new Array<number>(n);
	for (let i = 0; i < n; i++) b[i] = (i === 0 || i === n - 1 ? PIN : 1) * values[i];

	// Banded Cholesky A = L Lᵀ, half-bandwidth 2.
	// l0[i]=L[i][i], l1[i]=L[i+1][i], l2[i]=L[i+2][i].
	const l0 = new Array<number>(n).fill(0);
	const l1 = new Array<number>(n).fill(0);
	const l2 = new Array<number>(n).fill(0);
	for (let i = 0; i < n; i++) {
		const a1 = i - 1 >= 0 ? l1[i - 1] : 0;
		const a2 = i - 2 >= 0 ? l2[i - 2] : 0;
		l0[i] = Math.sqrt(d0[i] - a1 * a1 - a2 * a2);
		if (i + 1 < n) {
			const cross = i - 1 >= 0 ? l2[i - 1] * l1[i - 1] : 0;
			l1[i] = (d1[i] - cross) / l0[i];
		}
		if (i + 2 < n) l2[i] = d2[i] / l0[i];
	}

	// Forward solve L w = b.
	const w = new Array<number>(n).fill(0);
	for (let i = 0; i < n; i++) {
		const s1 = i - 1 >= 0 ? l1[i - 1] * w[i - 1] : 0;
		const s2 = i - 2 >= 0 ? l2[i - 2] * w[i - 2] : 0;
		w[i] = (b[i] - s1 - s2) / l0[i];
	}
	// Back solve Lᵀ z = w.
	const z = new Array<number>(n).fill(0);
	for (let i = n - 1; i >= 0; i--) {
		const s1 = i + 1 < n ? l1[i] * z[i + 1] : 0;
		const s2 = i + 2 < n ? l2[i] * z[i + 2] : 0;
		z[i] = (w[i] - s1 - s2) / l0[i];
	}

	// Hard-pin endpoints to exact input.
	z[0] = values[0];
	z[n - 1] = values[n - 1];
	return z;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/geodesic/smooth-chains.ts src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts
git commit -m "feat(voronoi): smoothSeries — discrete cubic smoothing spline"
```

---

## Task 2: `smoothChainPoints` — smooth a Vector3 polyline

**Files:**

- Modify: `src/lib/voronoi/geodesic/smooth-chains.ts`
- Test: `src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts`:

```ts
import { Vector3 } from 'three';
import { smoothChainPoints } from '../smooth-chains';

/** Total turning angle (radians) across a polyline. */
function turning(points: Vector3[]): number {
	let t = 0;
	for (let i = 1; i < points.length - 1; i++) {
		const a = points[i].clone().sub(points[i - 1]);
		const b = points[i + 1].clone().sub(points[i]);
		if (a.lengthSq() < 1e-18 || b.lengthSq() < 1e-18) continue;
		t += a.angleTo(b);
	}
	return t;
}

describe('smoothChainPoints', () => {
	it('reduces turning while leaving the endpoints exactly in place', () => {
		// Zig-zag along +x in the z=0 plane.
		const raw = Array.from({ length: 15 }, (_, i) => new Vector3(i, i % 2 === 0 ? 0.4 : -0.4, 0));
		raw[0].set(0, 0, 0);
		raw[14].set(14, 0, 0);
		const out = smoothChainPoints(raw, 10);
		expect(out.length).toBe(raw.length);
		expect(out[0].equals(raw[0])).toBe(true);
		expect(out[14].equals(raw[14])).toBe(true);
		expect(turning(out)).toBeLessThan(turning(raw) * 0.5);
	});

	it('returns clones unchanged for chains shorter than 4 points', () => {
		const raw = [new Vector3(0, 0, 0), new Vector3(1, 1, 0), new Vector3(2, 0, 0)];
		const out = smoothChainPoints(raw, 10);
		expect(out.map((p) => p.toArray())).toEqual(raw.map((p) => p.toArray()));
		expect(out[0]).not.toBe(raw[0]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts`
Expected: FAIL — `smoothChainPoints is not a function` / not exported.

- [ ] **Step 3: Write minimal implementation**

Add the `Vector3` import at the top of `src/lib/voronoi/geodesic/smooth-chains.ts`
(the file currently has no imports):

```ts
import { Vector3 } from 'three';
```

Then append to `src/lib/voronoi/geodesic/smooth-chains.ts`:

```ts
/**
 * Smooth a Vector3 polyline by running `smoothSeries` on each coordinate.
 * Returns a new same-length array; endpoints are unchanged. Chains with fewer
 * than 4 points (or λ ≤ 0) are returned as clones, unchanged.
 */
export function smoothChainPoints(points: Vector3[], lambda: number): Vector3[] {
	if (points.length < 4 || lambda <= 0) return points.map((p) => p.clone());
	const xs = smoothSeries(
		points.map((p) => p.x),
		lambda
	);
	const ys = smoothSeries(
		points.map((p) => p.y),
		lambda
	);
	const zs = smoothSeries(
		points.map((p) => p.z),
		lambda
	);
	return points.map((_, i) => new Vector3(xs[i], ys[i], zs[i]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/geodesic/smooth-chains.ts src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts
git commit -m "feat(voronoi): smoothChainPoints — per-coordinate polyline smoothing"
```

---

## Task 3: Export `weldKey` from mesh-graph (DRY prep for the projector)

**Files:**

- Modify: `src/lib/voronoi/geodesic/mesh-graph.ts:17-22`

- [ ] **Step 1: Replace the private key helper with an exported one**

In `src/lib/voronoi/geodesic/mesh-graph.ts`, replace:

```ts
const QUANTUM = 1e-5;

function keyOf(p: Vector3): string {
	const q = (n: number) => Math.round(n / QUANTUM);
	return `${q(p.x)},${q(p.y)},${q(p.z)}`;
}
```

with:

```ts
const QUANTUM = 1e-5;

/**
 * Quantized position key used to weld coincident vertices. Exported so other
 * geodesic code (e.g. the surface projector) can map raw positions to the same
 * welded vertex ids `buildMeshGraph` produced.
 */
export function weldKey(p: Vector3): string {
	const q = (n: number) => Math.round(n / QUANTUM);
	return `${q(p.x)},${q(p.y)},${q(p.z)}`;
}
```

Then update the single internal call site inside `buildMeshGraph`'s `idFor`:

```ts
const k = keyOf(p);
```

to:

```ts
const k = weldKey(p);
```

- [ ] **Step 2: Verify existing mesh-graph tests still pass**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/mesh-graph.test.ts`
Expected: PASS (unchanged behavior — pure rename + export).

- [ ] **Step 3: Commit**

```bash
git add src/lib/voronoi/geodesic/mesh-graph.ts
git commit -m "refactor(voronoi): export weldKey from mesh-graph"
```

---

## Task 4: `SurfaceProjector` — raycast smoothed points back onto the surface

**Files:**

- Modify: `src/lib/voronoi/geodesic/smooth-chains.ts`
- Test: `src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts`:

```ts
import type { SurfaceTriangle } from '$lib/voronoi/types';
import { buildMeshGraph } from '../mesh-graph';
import { SurfaceProjector } from '../smooth-chains';

/** Flat NxN grid in the z=0 plane (normals point +z). */
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

describe('SurfaceProjector', () => {
	it('snaps a point above the plane back onto the surface via raycast', () => {
		const tris = gridMesh(8);
		const projector = new SurfaceProjector(tris, buildMeshGraph(tris));
		const res = projector.project(new Vector3(0.1, -0.2, 0.3), new Vector3(0, 0, 1));
		expect(Math.abs(res.point.z)).toBeLessThan(1e-6);
		expect(Math.abs(res.normal.z)).toBeGreaterThan(0.99);
	});

	it('falls back to closest-point when the ray misses the surface', () => {
		const tris = gridMesh(8);
		const projector = new SurfaceProjector(tris, buildMeshGraph(tris));
		// Point off the +x edge, normal parallel to the plane so neither ray hits.
		const res = projector.project(new Vector3(1.5, 0, 0), new Vector3(1, 0, 0));
		expect(Math.abs(res.point.z)).toBeLessThan(1e-6); // landed on the z=0 surface
		expect(res.point.x).toBeLessThanOrEqual(1.000001); // clamped onto the mesh extent
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts`
Expected: FAIL — `SurfaceProjector is not a constructor` / not exported.

- [ ] **Step 3: Write minimal implementation**

Add imports at the top of `src/lib/voronoi/geodesic/smooth-chains.ts` (extend the existing `three` import) and append the class:

```ts
import {
	Vector3,
	BufferGeometry,
	BufferAttribute,
	Mesh,
	MeshBasicMaterial,
	Raycaster,
	Triangle,
	type Intersection
} from 'three';
import type { SurfaceTriangle } from '$lib/voronoi/types';
import { weldKey, type MeshGraph } from './mesh-graph';

/** Barycentric coords of p w.r.t. triangle (a,b,c). Degenerate → [1,0,0]. */
function barycentric(p: Vector3, a: Vector3, b: Vector3, c: Vector3): [number, number, number] {
	const v0 = b.clone().sub(a);
	const v1 = c.clone().sub(a);
	const v2 = p.clone().sub(a);
	const d00 = v0.dot(v0);
	const d01 = v0.dot(v1);
	const d11 = v1.dot(v1);
	const d20 = v2.dot(v0);
	const d21 = v2.dot(v1);
	const denom = d00 * d11 - d01 * d01;
	if (Math.abs(denom) < 1e-20) return [1, 0, 0];
	const v = (d11 * d20 - d01 * d21) / denom;
	const w = (d00 * d21 - d01 * d20) / denom;
	return [1 - v - w, v, w];
}

function faceNormalOf(t: SurfaceTriangle): Vector3 {
	const n = t[1].clone().sub(t[0]).cross(t[2].clone().sub(t[0]));
	return n.lengthSq() < 1e-18 ? new Vector3(0, 0, 1) : n.normalize();
}

/**
 * Re-projects smoothed points onto the surface. Built once per generation from
 * the surface triangles and the welded mesh graph; raycasts from a point along
 * ±normal onto a Mesh of the triangles (nearest hit wins), with a
 * closest-point-on-triangle fallback. Returned normals are a barycentric blend
 * of the hit triangle's welded vertex normals. Worker-local; never serialized.
 */
export class SurfaceProjector {
	private mesh: Mesh;
	private raycaster = new Raycaster();
	private triangles: SurfaceTriangle[];
	private triNormals: [Vector3, Vector3, Vector3][];

	constructor(triangles: SurfaceTriangle[], graph: MeshGraph) {
		this.triangles = triangles;
		const idByKey = new Map<string, number>();
		graph.positions.forEach((p, i) => idByKey.set(weldKey(p), i));

		const positions = new Float32Array(triangles.length * 9);
		this.triNormals = [];
		triangles.forEach((t, ti) => {
			for (let c = 0; c < 3; c++) {
				positions[ti * 9 + c * 3 + 0] = t[c].x;
				positions[ti * 9 + c * 3 + 1] = t[c].y;
				positions[ti * 9 + c * 3 + 2] = t[c].z;
			}
			const fallback = faceNormalOf(t);
			const normalFor = (c: number): Vector3 => {
				const id = idByKey.get(weldKey(t[c]));
				return id !== undefined ? graph.normals[id] : fallback;
			};
			this.triNormals.push([normalFor(0), normalFor(1), normalFor(2)]);
		});

		const geom = new BufferGeometry();
		geom.setAttribute('position', new BufferAttribute(positions, 3));
		this.mesh = new Mesh(geom, new MeshBasicMaterial());
	}

	project(point: Vector3, normal: Vector3): { point: Vector3; normal: Vector3 } {
		const hit = this.raycastBoth(point, normal);
		// `!= null` (not `!== undefined`): three's Intersection.faceIndex is typed
		// `number | null`, so this narrows away both null and undefined.
		if (hit && hit.faceIndex != null && hit.faceIndex < this.triangles.length) {
			return { point: hit.point.clone(), normal: this.blendNormal(hit.faceIndex, hit.point) };
		}
		return this.closestPoint(point);
	}

	private raycastBoth(point: Vector3, normal: Vector3): Intersection | null {
		const dir = normal.lengthSq() < 1e-18 ? new Vector3(0, 0, 1) : normal.clone().normalize();
		this.raycaster.set(point, dir);
		const fwd = this.raycaster.intersectObject(this.mesh, false);
		this.raycaster.set(point, dir.clone().negate());
		const bwd = this.raycaster.intersectObject(this.mesh, false);
		const f = fwd[0] ?? null;
		const b = bwd[0] ?? null;
		if (f && b) return f.distance <= b.distance ? f : b;
		return f ?? b;
	}

	private blendNormal(faceIndex: number, at: Vector3): Vector3 {
		const t = this.triangles[faceIndex];
		const [u, v, w] = barycentric(at, t[0], t[1], t[2]);
		const [n0, n1, n2] = this.triNormals[faceIndex];
		const n = n0.clone().multiplyScalar(u).addScaledVector(n1, v).addScaledVector(n2, w);
		return n.lengthSq() < 1e-18 ? faceNormalOf(t) : n.normalize();
	}

	private closestPoint(point: Vector3): { point: Vector3; normal: Vector3 } {
		let bestD = Infinity;
		let bestP = point.clone();
		let bestI = 0;
		const tmp = new Vector3();
		const tri = new Triangle();
		this.triangles.forEach((t, ti) => {
			tri.set(t[0], t[1], t[2]);
			tri.closestPointToPoint(point, tmp);
			const d = tmp.distanceToSquared(point);
			if (d < bestD) {
				bestD = d;
				bestP = tmp.clone();
				bestI = ti;
			}
		});
		return { point: bestP, normal: this.blendNormal(bestI, bestP) };
	}
}
```

Remove the now-duplicated `import { Vector3 } from 'three';` line at the top of the file (it is superseded by the combined `three` import above).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/geodesic/smooth-chains.ts src/lib/voronoi/geodesic/__tests__/smooth-chains.test.ts
git commit -m "feat(voronoi): SurfaceProjector — raycast smoothed points onto surface"
```

---

## Task 5: Add `geodesicSmoothing` to config type + default

**Files:**

- Modify: `src/lib/voronoi/types.ts:11-30`
- Modify: `src/lib/shades-config.ts:701-728`

- [ ] **Step 1: Add the field to `VoronoiConfig`**

In `src/lib/voronoi/types.ts`, inside the `VoronoiConfig` type, add after the `voronoiMethod: VoronoiMethod;` line:

```ts
	// Geodesic-only: cubic-smoothing-spline strength (λ) applied to boundary
	// chains before resampling. 0 = off (raw piecewise-linear edges). Higher =
	// smoother. Ignored by the spherical/uv methods.
	geodesicSmoothing?: number;
```

- [ ] **Step 2: Add the default**

In `src/lib/shades-config.ts`, inside `defaultVoronoiConfig`, add next to `voronoiMethod`:

```ts
	geodesicSmoothing: 0,
```

- [ ] **Step 3: Verify types compile**

Run: `npm run check`
Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/voronoi/types.ts src/lib/shades-config.ts
git commit -m "feat(voronoi): add geodesicSmoothing config field (default 0)"
```

---

## Task 6: Wire the smoothing pipeline into `generateGeodesicVoronoi`

**Files:**

- Modify: `src/lib/voronoi/geodesic/geodesic-voronoi.ts:1-9,126-139`
- Test: `src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Append to `src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts` (the file already defines `baseConfig`, `sphereMesh`):

```ts
describe('generateGeodesicVoronoi smoothing', () => {
	const withLambda = (lambda: number): VoronoiConfig => ({
		...baseConfig(),
		geodesicSmoothing: lambda
	});

	it('leaves edge endpoints (shared corners) identical to the unsmoothed run', () => {
		const off = generateGeodesicVoronoi(withLambda(0), sphereMesh(24));
		const on = generateGeodesicVoronoi(withLambda(8), sphereMesh(24));
		expect(on.edges.length).toBe(off.edges.length);
		for (let i = 0; i < on.edges.length; i++) {
			const a = off.edgeProjections[i].edgePoints3d;
			const b = on.edgeProjections[i].edgePoints3d;
			expect(b[0].distanceTo(a[0])).toBeLessThan(1e-9);
			expect(b[b.length - 1].distanceTo(a[a.length - 1])).toBeLessThan(1e-9);
		}
	});

	it('keeps re-projected interior points on the unit sphere', () => {
		const on = generateGeodesicVoronoi(withLambda(8), sphereMesh(24));
		for (const proj of on.edgeProjections) {
			const pts = proj.edgePoints3d;
			for (let k = 1; k < pts.length - 1; k++) {
				expect(Math.abs(pts[k].length() - 1)).toBeLessThan(0.05);
			}
		}
	});

	it('reduces total edge turning versus the unsmoothed run', () => {
		const turning = (r: ReturnType<typeof generateGeodesicVoronoi>) => {
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
		const off = generateGeodesicVoronoi(withLambda(0), sphereMesh(24));
		const on = generateGeodesicVoronoi(withLambda(8), sphereMesh(24));
		expect(turning(on)).toBeLessThan(turning(off));
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts`
Expected: FAIL — interior points are not on the sphere / turning not reduced (smoothing not wired yet).

- [ ] **Step 3: Wire the pipeline**

In `src/lib/voronoi/geodesic/geodesic-voronoi.ts`, add to the imports (after the `buildRimChains` import on line 9):

```ts
import { smoothChainPoints, SurfaceProjector } from './smooth-chains';
```

Then replace the emit loop (lines 126-139, from `const edges` through the closing `});`):

```ts
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
```

with:

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts`
Expected: PASS (existing tests + 3 new smoothing tests).

- [ ] **Step 5: Run the full voronoi suite**

Run: `npm run test:unit -- src/lib/voronoi`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/lib/voronoi/geodesic/geodesic-voronoi.ts src/lib/voronoi/geodesic/__tests__/geodesic-voronoi.test.ts
git commit -m "feat(voronoi): smooth + re-project geodesic boundary chains behind lambda"
```

---

## Task 7: Add the smoothing slider to the controls panel

**Files:**

- Modify: `src/components/controls/VoronoiControl.svelte:9-79,184-220`

- [ ] **Step 1: Add the field to the `update` union and a branch**

In `src/components/controls/VoronoiControl.svelte`, add `'geodesicSmoothing'` to the `field` union in the `update` signature (after `'voronoiMethod'`):

```ts
			| 'voronoiMethod'
			| 'geodesicSmoothing'
			| 'insetMethod'
```

Then add a branch in `update` (next to the `voronoiMethod` branch):

```ts
		} else if (field === 'geodesicSmoothing') {
			next = { ...config, geodesicSmoothing: value as number };
```

- [ ] **Step 2: Add the slider markup**

In the template, after the "Method" `<label>` block (the `voronoiMethod` select, ending at its `</label>`), add:

```svelte
<label>
	Smoothing
	<input
		type="range"
		min="0"
		max="50"
		step="1"
		value={config.geodesicSmoothing ?? 0}
		disabled={!isGeodesic}
		oninput={(e) => update('geodesicSmoothing', Number(e.currentTarget.value))}
	/>
	<span>{config.geodesicSmoothing ?? 0}</span>
</label>
```

- [ ] **Step 3: Verify types + lint**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/controls/VoronoiControl.svelte
git commit -m "feat(voronoi): geodesic smoothing slider in controls"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the complete unit suite**

Run: `npm run test:unit`
Expected: all green (was 466 passing; now 466 + new tests).

- [ ] **Step 2: Type check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 3: Manual check (developer)**

Run `npm run dev`, open the designer, pick an open globule surface at high granularity, set Voronoi method = Geodesic, and drag the Smoothing slider up from 0. Confirm both cell edges and rim edges read as smooth curves in the bands and surface-projection views, and that cell corners stay put (no gaps opening at shared corners).

- [ ] **Step 4: Final commit (if any docs/notes changed)**

```bash
git add -A
git commit -m "chore(voronoi): geodesic edge smoothing complete" || echo "nothing to commit"
```

---

## Notes / invariants (carried from the spec)

- **Center-free:** the pipeline only touches mesh/surface geometry; no center-based projection is reintroduced.
- **Shared corners fixed:** the smoother pins chain endpoints; re-projection skips index 0 and the last index, so shared corners (triple-points, rim transitions) stay bit-identical across adjacent chains.
- **Rim coupling:** rim chains flow through the identical loop, so rim edges smooth too.
- **Serialization:** outputs stay `Vector3`/arrays; the `Mesh`/`Raycaster` are worker-local scratch and never cross `postMessage`.
- **λ = 0 safety net:** with `geodesicSmoothing === 0`, the loop is byte-for-byte the original (no smoothing, no projection).
- **Closed-loop chains** (`vertices[0] === vertices[1]`, rare) pin their single shared point; a slight cusp there is an accepted limitation.
