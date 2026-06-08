# Voronoi Local-Projection Inset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-cell "local projection" method for computing Voronoi inset (inner-edge) geometry — flatten each cell to a 2D plane, inset there, project back onto the surface — selectable via a new `insetMethod` config, with rough parity to the existing center-out method on sphere/capsule/globule.

**Architecture:** `makeVoronoi` is restructured into three phases. Phase 1 (shared) projects/subdivides Voronoi edges onto the surface (center-out, unchanged). Phase 2 computes the two inset polylines per edge and branches on `insetMethod`: `centerOut` (today's slerp-toward-seed) or `localProjection` (per-cell SVD/PCA plane fit → flatten via a far source → homothety inset → back-project with proximity+normal hit selection). Phase 3 (shared, unchanged) assembles tubes. The spherical assumption is thereby isolated to Phase 2's `centerOut` branch.

**Tech Stack:** TypeScript, three.js (`Vector2`/`Vector3`/`Raycaster`/`Object3D`), Jest (`npm run test:unit`), SvelteKit. No matrix library — the plane fit is hand-rolled PCA (covariance + symmetric 3×3 Jacobi eigensolver).

**Reference spec:** `docs/superpowers/specs/2026-06-07-voronoi-local-projection-inset-design.md`

**Before starting:** create branch `feature/voronoi-local-projection` from `main`.

```bash
git checkout main && git pull && git checkout -b feature/voronoi-local-projection
```

---

## File Structure

**New files (all `src/lib/voronoi/`):**
- `fit-plane.ts` — `fitPlane(points, opts)` → `{ normal, centroid }` (PCA via Jacobi).
- `source-projection.ts` — plane basis + ray/plane flatten and inverse.
- `inset-2d.ts` — `insetPoint2D` / `insetIntermediates2D` (homothety; the swappable seam).
- `select-surface-hit.ts` — `chooseHit` (pure) + `selectSurfaceHit` (raycast wrapper).
- `edge-sampling.ts` — `slerp` / `edgeArcLength` / `sampleEdgeAsDirections` + `CoordToDirection` (extracted from `generate-voronoi.ts`).
- `project-edges-onto-surface.ts` — Phase 1 helper, `projectEdgesOntoSurface(...)` → `EdgeProjection[]`.
- `inset-types.ts` — `EdgeInsets` type.
- `inset-center-out.ts` — `computeEdgeInsetsCenterOut(...)` → `EdgeInsets[]`.
- `local-projection.ts` — `computeEdgeInsetsLocalProjection(...)` → `EdgeInsets[]`.

**Modified files:**
- `src/lib/voronoi/types.ts` — add `InsetMethod`, `VoronoiConfig.insetMethod`.
- `src/lib/shades-config.ts` — `defaultVoronoiConfig.insetMethod`.
- `src/lib/voronoi/migrate-voronoi-config.ts` — default missing `insetMethod`.
- `src/components/controls/VoronoiControl.svelte` — `insetMethod` selector.
- `src/lib/voronoi/generate-voronoi.ts` — use Phase-1 helper; consume `EdgeInsets`; branch on `insetMethod`.

**Tests (all `src/lib/voronoi/__tests__/`):** one `*.test.ts` per new module + additions to `migrate-voronoi-config.test.ts` and `generate-voronoi.test.ts`.

**Test command:** `npm run test:unit -- <path>` (Jest). Type check: `npm run check`.

---

## Task 1: Config plumbing for `insetMethod`

**Files:**
- Modify: `src/lib/voronoi/types.ts`
- Modify: `src/lib/shades-config.ts:700-727`
- Modify: `src/lib/voronoi/migrate-voronoi-config.ts:44-47`
- Test: `src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts`

- [ ] **Step 1: Write the failing migration test**

Add to `src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts`. First add `insetMethod: 'centerOut'` to the `inlineDefaultVoronoiConfig` object (after `voronoiMethod: 'spherical'` on line 35) so the inline default is type-complete, then add these tests inside the `describe('normalizeVoronoiConfig', ...)` block:

```ts
it("defaults a missing insetMethod to 'centerOut'", () => {
	const legacy = { ...inlineDefaultVoronoiConfig } as Record<string, unknown>;
	delete legacy.insetMethod;
	const result = normalizeVoronoiConfig(
		baseConfig({ voronoiConfig: legacy as unknown as VoronoiConfig })
	);
	expect(result.voronoiConfig?.insetMethod).toBe('centerOut');
});

it('preserves an explicit insetMethod', () => {
	const existing = { ...inlineDefaultVoronoiConfig, insetMethod: 'localProjection' as const };
	const result = normalizeVoronoiConfig(baseConfig({ voronoiConfig: existing }));
	expect(result.voronoiConfig?.insetMethod).toBe('localProjection');
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts`
Expected: FAIL — `insetMethod` is `undefined` (type error on `InsetMethod`, and the "defaults" test fails).

- [ ] **Step 3: Add the type**

In `src/lib/voronoi/types.ts`, after the `VoronoiMethod` line (line 7) add:

```ts
export type InsetMethod = 'centerOut' | 'localProjection';
```

In the `VoronoiConfig` type, after `voronoiMethod: VoronoiMethod;` (line 22) add:

```ts
	insetMethod: InsetMethod;
```

- [ ] **Step 4: Add the default**

In `src/lib/shades-config.ts`, in `defaultVoronoiConfig` after `voronoiMethod: 'spherical'` (line 726) add (mind the trailing comma on the prior line):

```ts
	insetMethod: 'centerOut'
```

- [ ] **Step 5: Add the migration default**

In `src/lib/voronoi/migrate-voronoi-config.ts`, replace the `voronoiConfig` construction (lines 44-47) with:

```ts
	const voronoiConfig: VoronoiConfig = {
		...resolved,
		edgeDivisions: normalizeEdgeDivisions(resolved.edgeDivisions),
		insetMethod: resolved.insetMethod ?? 'centerOut'
	};
```

- [ ] **Step 6: Run the tests, verify they pass**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts`
Expected: PASS (all migration tests).

- [ ] **Step 7: Add the UI selector**

In `src/components/controls/VoronoiControl.svelte`:
- In the import on line 4, add `InsetMethod`: `import type { VoronoiConfig, VoronoiMethod, InsetMethod } from '$lib/voronoi/types';`
- In the `update` `field` union (lines 9-18), add `| 'insetMethod'`.
- In `update`, after the `voronoiMethod` branch (line 70) add:

```ts
		} else if (field === 'insetMethod') {
			next = { ...config, insetMethod: value as InsetMethod };
```

- In the template, after the `Method` (voronoiMethod) `<label>` block (lines 96-105) add:

```svelte
		<label>
			Inset Method
			<select
				value={config.insetMethod ?? 'centerOut'}
				onchange={(e) => update('insetMethod', e.currentTarget.value)}
			>
				<option value="centerOut">Center Out</option>
				<option value="localProjection">Local Projection</option>
			</select>
		</label>
```

- [ ] **Step 8: Type check and commit**

Run: `npm run check`
Expected: no new errors referencing `insetMethod` (pre-existing unrelated errors may remain).

```bash
git add src/lib/voronoi/types.ts src/lib/shades-config.ts src/lib/voronoi/migrate-voronoi-config.ts src/components/controls/VoronoiControl.svelte src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts
git commit -m "feat(voronoi): add insetMethod config field (centerOut|localProjection)"
```

---

## Task 2: `fit-plane.ts` — PCA plane fit

**Files:**
- Create: `src/lib/voronoi/fit-plane.ts`
- Test: `src/lib/voronoi/__tests__/fit-plane.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/voronoi/__tests__/fit-plane.test.ts`:

```ts
import { Vector3 } from 'three';
import { fitPlane } from '../fit-plane';

describe('fitPlane', () => {
	it('recovers the normal of an axis-aligned plane (up to sign)', () => {
		// Points in the z = 5 plane.
		const pts = [
			new Vector3(0, 0, 5),
			new Vector3(1, 0, 5),
			new Vector3(0, 1, 5),
			new Vector3(2, 3, 5)
		];
		const { normal, centroid } = fitPlane(pts);
		expect(Math.abs(normal.z)).toBeCloseTo(1, 5);
		expect(Math.abs(normal.x)).toBeCloseTo(0, 5);
		expect(Math.abs(normal.y)).toBeCloseTo(0, 5);
		expect(centroid.z).toBeCloseTo(5, 5);
	});

	it('recovers a tilted plane normal up to sign', () => {
		// Plane through origin with normal (0,0,1) rotated 45deg about x: normal ~ (0,-s,c).
		const n = new Vector3(0, -Math.SQRT1_2, Math.SQRT1_2);
		// Two in-plane directions orthogonal to n.
		const u = new Vector3(1, 0, 0);
		const v = new Vector3().crossVectors(n, u).normalize();
		const pts = [
			new Vector3(),
			u.clone(),
			v.clone(),
			u.clone().multiplyScalar(2).add(v.clone().multiplyScalar(-1))
		];
		const { normal } = fitPlane(pts);
		expect(Math.abs(normal.dot(n))).toBeCloseTo(1, 5);
	});

	it('orients the normal away from a given center', () => {
		const pts = [
			new Vector3(0, 0, 5),
			new Vector3(1, 0, 5),
			new Vector3(0, 1, 5)
		];
		const center = new Vector3(0, 0, 0);
		const { normal } = fitPlane(pts, { orientAwayFrom: center });
		// centroid is at z=5, away-from-center means +z.
		expect(normal.z).toBeGreaterThan(0);
	});

	it('uses the fallback normal for fewer than 3 points', () => {
		const fallback = new Vector3(0, 1, 0);
		const { normal } = fitPlane([new Vector3(1, 1, 1)], { fallbackNormal: fallback });
		expect(normal.x).toBeCloseTo(0, 6);
		expect(normal.y).toBeCloseTo(1, 6);
		expect(normal.z).toBeCloseTo(0, 6);
	});

	it('uses the fallback normal for collinear points (degenerate fit)', () => {
		const fallback = new Vector3(0, 0, 1);
		const pts = [
			new Vector3(0, 0, 0),
			new Vector3(1, 1, 1),
			new Vector3(2, 2, 2),
			new Vector3(3, 3, 3)
		];
		const { normal } = fitPlane(pts, { fallbackNormal: fallback });
		expect(normal.z).toBeCloseTo(1, 6);
	});
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/fit-plane.test.ts`
Expected: FAIL — "Cannot find module '../fit-plane'".

- [ ] **Step 3: Implement `fit-plane.ts`**

Create `src/lib/voronoi/fit-plane.ts`:

```ts
import { Vector3 } from 'three';

export type FitPlaneOptions = {
	/** Used when there are <3 points or the fit is degenerate (near-collinear). */
	fallbackNormal?: Vector3;
	/** If given, flip the normal so it points away from this point (dot with centroid-from > 0). */
	orientAwayFrom?: Vector3;
};

export type FittedPlane = { normal: Vector3; centroid: Vector3 };

/** Eigen-decomposition of a symmetric 3x3 matrix via cyclic Jacobi rotations. */
function jacobiEigenSymmetric3(m: number[][]): { values: number[]; vectors: number[][] } {
	const a = m.map((row) => row.slice());
	const v = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1]
	];
	for (let sweep = 0; sweep < 50; sweep++) {
		const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
		if (off < 1e-14) break;
		for (const [p, q] of [
			[0, 1],
			[0, 2],
			[1, 2]
		] as const) {
			if (Math.abs(a[p][q]) < 1e-300) continue;
			const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
			const sign = theta >= 0 ? 1 : -1;
			const t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
			const c = 1 / Math.sqrt(t * t + 1);
			const s = t * c;
			const app = a[p][p];
			const aqq = a[q][q];
			const apq = a[p][q];
			a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
			a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
			a[p][q] = 0;
			a[q][p] = 0;
			const r = 3 - p - q;
			const arp = a[r][p];
			const arq = a[r][q];
			a[r][p] = c * arp - s * arq;
			a[p][r] = a[r][p];
			a[r][q] = s * arp + c * arq;
			a[q][r] = a[r][q];
			for (let i = 0; i < 3; i++) {
				const vip = v[i][p];
				const viq = v[i][q];
				v[i][p] = c * vip - s * viq;
				v[i][q] = s * vip + c * viq;
			}
		}
	}
	return { values: [a[0][0], a[1][1], a[2][2]], vectors: v };
}

function orient(normal: Vector3, centroid: Vector3, opts?: FitPlaneOptions): Vector3 {
	if (opts?.orientAwayFrom) {
		const away = centroid.clone().sub(opts.orientAwayFrom);
		if (normal.dot(away) < 0) normal.multiplyScalar(-1);
	}
	return normal;
}

/**
 * Best-fit plane through a point cloud via PCA: the normal is the eigenvector of the
 * smallest eigenvalue of the centered covariance matrix. Falls back to
 * opts.fallbackNormal when there are <3 points or the fit is degenerate
 * (smallest two eigenvalues both ~0, i.e. collinear).
 */
export function fitPlane(points: Vector3[], opts?: FitPlaneOptions): FittedPlane {
	const centroid = new Vector3();
	for (const p of points) centroid.add(p);
	if (points.length > 0) centroid.divideScalar(points.length);

	const fallback = (opts?.fallbackNormal ?? new Vector3(0, 0, 1)).clone().normalize();

	if (points.length < 3) {
		return { normal: orient(fallback, centroid, opts), centroid };
	}

	let xx = 0;
	let xy = 0;
	let xz = 0;
	let yy = 0;
	let yz = 0;
	let zz = 0;
	for (const p of points) {
		const dx = p.x - centroid.x;
		const dy = p.y - centroid.y;
		const dz = p.z - centroid.z;
		xx += dx * dx;
		xy += dx * dy;
		xz += dx * dz;
		yy += dy * dy;
		yz += dy * dz;
		zz += dz * dz;
	}
	const cov = [
		[xx, xy, xz],
		[xy, yy, yz],
		[xz, yz, zz]
	];
	const { values, vectors } = jacobiEigenSymmetric3(cov);

	// Indices sorted by eigenvalue ascending.
	const idx = [0, 1, 2].sort((a, b) => values[a] - values[b]);
	const largest = Math.max(values[0], values[1], values[2], 1e-30);
	// Degenerate if the second-smallest eigenvalue is ~0 relative to the largest:
	// the plane is not well-defined (points collinear or coincident).
	if (values[idx[1]] / largest < 1e-9) {
		return { normal: orient(fallback, centroid, opts), centroid };
	}

	const min = idx[0];
	const normal = new Vector3(vectors[0][min], vectors[1][min], vectors[2][min]).normalize();
	return { normal: orient(normal, centroid, opts), centroid };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/fit-plane.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/fit-plane.ts src/lib/voronoi/__tests__/fit-plane.test.ts
git commit -m "feat(voronoi): add fitPlane PCA helper for local projection"
```

---

## Task 3: `source-projection.ts` — flatten via source / inverse

**Files:**
- Create: `src/lib/voronoi/source-projection.ts`
- Test: `src/lib/voronoi/__tests__/source-projection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/voronoi/__tests__/source-projection.test.ts`:

```ts
import { Vector2, Vector3 } from 'three';
import {
	buildPlaneBasis,
	intersectRayPlane,
	projectToPlane2D,
	plane2DToPoint3D
} from '../source-projection';

describe('buildPlaneBasis', () => {
	it('returns orthonormal axes perpendicular to the normal', () => {
		const n = new Vector3(0.3, -0.7, 0.65).normalize();
		const { u, v } = buildPlaneBasis(n);
		expect(u.length()).toBeCloseTo(1, 6);
		expect(v.length()).toBeCloseTo(1, 6);
		expect(u.dot(n)).toBeCloseTo(0, 6);
		expect(v.dot(n)).toBeCloseTo(0, 6);
		expect(u.dot(v)).toBeCloseTo(0, 6);
	});
});

describe('intersectRayPlane', () => {
	it('finds the pierce point of source->through with a plane', () => {
		const source = new Vector3(0, 0, 10);
		const through = new Vector3(2, 0, 5);
		const hit = intersectRayPlane(source, through, new Vector3(0, 0, 0), new Vector3(0, 0, 1));
		// Parametric: z goes 10 -> 5 as x goes 0 -> 2, hits z=0 at x=4.
		expect(hit).not.toBeNull();
		expect(hit!.x).toBeCloseTo(4, 5);
		expect(hit!.z).toBeCloseTo(0, 5);
	});

	it('returns null for a ray parallel to the plane', () => {
		const hit = intersectRayPlane(
			new Vector3(0, 0, 1),
			new Vector3(1, 0, 1),
			new Vector3(0, 0, 0),
			new Vector3(0, 0, 1)
		);
		expect(hit).toBeNull();
	});
});

describe('projectToPlane2D / plane2DToPoint3D', () => {
	const source = new Vector3(0, 0, 10);
	const planePoint = new Vector3(0, 0, 0);
	const normal = new Vector3(0, 0, 1);
	const basis = buildPlaneBasis(normal);

	it('round-trips a point that lies on the plane', () => {
		const onPlane = plane2DToPoint3D(new Vector2(3, -2), planePoint, basis);
		const p2d = projectToPlane2D(onPlane, source, planePoint, normal, basis);
		expect(p2d).not.toBeNull();
		const back = plane2DToPoint3D(p2d!, planePoint, basis);
		expect(back.distanceTo(onPlane)).toBeCloseTo(0, 5);
	});

	it('projects an off-plane point to its pierce location', () => {
		// Point at z=5, x=2 -> pierces z=0 plane at x=4 (see intersectRayPlane test).
		const p2d = projectToPlane2D(new Vector3(2, 0, 5), source, planePoint, normal, basis);
		expect(p2d).not.toBeNull();
		const back = plane2DToPoint3D(p2d!, planePoint, basis);
		expect(back.x).toBeCloseTo(4, 5);
		expect(back.y).toBeCloseTo(0, 5);
		expect(back.z).toBeCloseTo(0, 5);
	});
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/source-projection.test.ts`
Expected: FAIL — "Cannot find module '../source-projection'".

- [ ] **Step 3: Implement `source-projection.ts`**

Create `src/lib/voronoi/source-projection.ts`:

```ts
import { Vector2, Vector3 } from 'three';

export type PlaneBasis = { u: Vector3; v: Vector3 };

/** Two orthonormal in-plane axes for a unit (or near-unit) normal. */
export function buildPlaneBasis(normal: Vector3): PlaneBasis {
	const n = normal.clone().normalize();
	const seed = Math.abs(n.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
	const u = seed.sub(n.clone().multiplyScalar(seed.dot(n))).normalize();
	const v = n.clone().cross(u).normalize();
	return { u, v };
}

/** Intersect the ray from `source` through `through` with the plane (planePoint, planeNormal). */
export function intersectRayPlane(
	source: Vector3,
	through: Vector3,
	planePoint: Vector3,
	planeNormal: Vector3
): Vector3 | null {
	const dir = through.clone().sub(source);
	const denom = planeNormal.dot(dir);
	if (Math.abs(denom) < 1e-12) return null;
	const t = planeNormal.dot(planePoint.clone().sub(source)) / denom;
	return source.clone().addScaledVector(dir, t);
}

/**
 * Flatten a 3D point onto the plane as seen from `source`: cast source->point, pierce the
 * plane, and express the pierce point in the 2D basis (origin = planePoint). Null if parallel.
 */
export function projectToPlane2D(
	point: Vector3,
	source: Vector3,
	planePoint: Vector3,
	planeNormal: Vector3,
	basis: PlaneBasis
): Vector2 | null {
	const hit = intersectRayPlane(source, point, planePoint, planeNormal);
	if (!hit) return null;
	const d = hit.sub(planePoint);
	return new Vector2(d.dot(basis.u), d.dot(basis.v));
}

/** Inverse of projectToPlane2D's basis step: a 2D plane coord back to its 3D position. */
export function plane2DToPoint3D(p2d: Vector2, planePoint: Vector3, basis: PlaneBasis): Vector3 {
	return planePoint.clone().addScaledVector(basis.u, p2d.x).addScaledVector(basis.v, p2d.y);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/source-projection.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/source-projection.ts src/lib/voronoi/__tests__/source-projection.test.ts
git commit -m "feat(voronoi): add source-projection flatten/inverse helpers"
```

---

## Task 4: `inset-2d.ts` — homothety inset (swappable seam)

**Files:**
- Create: `src/lib/voronoi/inset-2d.ts`
- Test: `src/lib/voronoi/__tests__/inset-2d.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/voronoi/__tests__/inset-2d.test.ts`:

```ts
import { Vector2 } from 'three';
import { insetPoint2D, insetIntermediates2D } from '../inset-2d';

describe('insetPoint2D (homothety toward seed)', () => {
	const edge = new Vector2(10, 0);
	const seed = new Vector2(0, 0);

	it('factor 0 leaves the point unchanged', () => {
		expect(insetPoint2D(edge, seed, 0).x).toBeCloseTo(10, 6);
	});

	it('factor 1 moves the point onto the seed', () => {
		const r = insetPoint2D(edge, seed, 1);
		expect(r.x).toBeCloseTo(0, 6);
		expect(r.y).toBeCloseTo(0, 6);
	});

	it('factor 0.5 moves the point halfway to the seed', () => {
		expect(insetPoint2D(edge, seed, 0.5).x).toBeCloseTo(5, 6);
	});

	it('maps a shared corner identically regardless of which edge supplied it', () => {
		const corner = new Vector2(4, 8);
		const fromEdge1 = insetPoint2D(corner.clone(), seed, 0.3);
		const fromEdge2 = insetPoint2D(corner.clone(), seed, 0.3);
		expect(fromEdge1.distanceTo(fromEdge2)).toBeCloseTo(0, 9);
	});
});

describe('insetIntermediates2D', () => {
	const edge = new Vector2(10, 0);
	const seed = new Vector2(0, 0);

	it('returns `divisions` points ordered inset -> edge', () => {
		const inter = insetIntermediates2D(edge, seed, 0.5, 3);
		expect(inter).toHaveLength(3);
		// inset is at x=5, edge at x=10; s = d/(divs+1) => x increases 5->10.
		expect(inter[0].x).toBeCloseTo(5 + (10 - 5) * (1 / 4), 6);
		expect(inter[1].x).toBeCloseTo(5 + (10 - 5) * (2 / 4), 6);
		expect(inter[2].x).toBeCloseTo(5 + (10 - 5) * (3 / 4), 6);
		// monotonic toward the edge
		expect(inter[0].x).toBeLessThan(inter[1].x);
		expect(inter[1].x).toBeLessThan(inter[2].x);
	});

	it('returns an empty array for 0 divisions', () => {
		expect(insetIntermediates2D(edge, seed, 0.5, 0)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/inset-2d.test.ts`
Expected: FAIL — "Cannot find module '../inset-2d'".

- [ ] **Step 3: Implement `inset-2d.ts`**

Create `src/lib/voronoi/inset-2d.ts`:

```ts
import { Vector2 } from 'three';

/**
 * The 2D inset primitive (homothety): move a boundary point a fraction `factor` of the
 * way toward the cell seed. This is the swappable seam — a future perpendicular/bezier
 * offset replaces this module without touching callers.
 */
export function insetPoint2D(point: Vector2, seed: Vector2, factor: number): Vector2 {
	return point.clone().lerp(seed, factor);
}

/**
 * `divisions` intermediate points between the inset point (inset = insetPoint2D(edge,...))
 * and the edge point, ordered inset -> edge. Point d sits at s = d/(divisions+1) of the way
 * from inset to edge. Used to populate the surface-projection tube's intermediate rings.
 */
export function insetIntermediates2D(
	edgePoint: Vector2,
	seed: Vector2,
	factor: number,
	divisions: number
): Vector2[] {
	const inset = insetPoint2D(edgePoint, seed, factor);
	const out: Vector2[] = [];
	for (let d = 1; d <= divisions; d++) {
		const s = d / (divisions + 1);
		out.push(inset.clone().lerp(edgePoint, s));
	}
	return out;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/inset-2d.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/inset-2d.ts src/lib/voronoi/__tests__/inset-2d.test.ts
git commit -m "feat(voronoi): add inset-2d homothety primitive"
```

---

## Task 5: `select-surface-hit.ts` — hit selection (proximity + normal tiebreak)

**Files:**
- Create: `src/lib/voronoi/select-surface-hit.ts`
- Test: `src/lib/voronoi/__tests__/select-surface-hit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/voronoi/__tests__/select-surface-hit.test.ts`:

```ts
import { Vector3, Object3D, Mesh, SphereGeometry, MeshBasicMaterial, DoubleSide } from 'three';
import { chooseHit, selectSurfaceHit, type SurfaceHit } from '../select-surface-hit';

describe('chooseHit (pure)', () => {
	const cellNormal = new Vector3(0, 0, 1);

	it('returns null when there are no hits', () => {
		expect(chooseHit([], new Vector3(), cellNormal)).toBeNull();
	});

	it('picks the hit nearest the anchor', () => {
		const anchor = new Vector3(0, 0, 0);
		const hits: SurfaceHit[] = [
			{ point: new Vector3(0, 0, 9), normalWorld: new Vector3(0, 0, 1) },
			{ point: new Vector3(0, 0, 0.5), normalWorld: new Vector3(0, 0, 1) }
		];
		expect(chooseHit(hits, anchor, cellNormal)!.point.z).toBeCloseTo(0.5, 6);
	});

	it('breaks near-equidistant ties by normal agreement with the cell normal', () => {
		const anchor = new Vector3(0, 0, 0);
		// Both ~1 unit from anchor; one faces +z (agrees), one faces +x (disagrees).
		const hits: SurfaceHit[] = [
			{ point: new Vector3(1, 0, 0), normalWorld: new Vector3(1, 0, 0) },
			{ point: new Vector3(0, 0, 1), normalWorld: new Vector3(0, 0, 1) }
		];
		const chosen = chooseHit(hits, anchor, cellNormal, 0.5);
		expect(chosen!.normalWorld.z).toBeCloseTo(1, 6);
	});

	it('does not apply the tiebreak when one hit is clearly nearer', () => {
		const anchor = new Vector3(0, 0, 0);
		const hits: SurfaceHit[] = [
			{ point: new Vector3(0, 0, 5), normalWorld: new Vector3(0, 0, 1) },
			{ point: new Vector3(0.2, 0, 0), normalWorld: new Vector3(1, 0, 0) }
		];
		const chosen = chooseHit(hits, anchor, cellNormal, 0.5);
		expect(chosen!.point.x).toBeCloseTo(0.2, 6);
	});
});

describe('selectSurfaceHit (raycast wrapper)', () => {
	function sphereSurface(radius: number): Object3D {
		const surface = new Object3D();
		const mesh = new Mesh(new SphereGeometry(radius, 32, 32), new MeshBasicMaterial({ side: DoubleSide }));
		surface.add(mesh);
		surface.updateMatrixWorld(true);
		return surface;
	}

	it('returns the hit nearest the anchor among multiple surface intersections', () => {
		const surface = sphereSurface(100);
		// Ray along -z through the sphere center hits at z=+100 and z=-100.
		const source = new Vector3(0, 0, 500);
		const through = new Vector3(0, 0, 0);
		const anchor = new Vector3(0, 0, 100); // near side
		const hit = selectSurfaceHit({ surface, source, through, anchor, cellNormal: new Vector3(0, 0, 1) });
		expect(hit).not.toBeNull();
		expect(hit!.z).toBeCloseTo(100, 0);
	});

	it('returns null when the ray misses the surface', () => {
		const surface = sphereSurface(100);
		const source = new Vector3(0, 1000, 500);
		const through = new Vector3(0, 1000, 0); // parallel to -z, far above the sphere
		const hit = selectSurfaceHit({
			surface,
			source,
			through,
			anchor: new Vector3(0, 1000, 0),
			cellNormal: new Vector3(0, 0, 1)
		});
		expect(hit).toBeNull();
	});
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/select-surface-hit.test.ts`
Expected: FAIL — "Cannot find module '../select-surface-hit'".

- [ ] **Step 3: Implement `select-surface-hit.ts`**

Create `src/lib/voronoi/select-surface-hit.ts`:

```ts
import { Object3D, Raycaster, Vector3 } from 'three';

export type SurfaceHit = { point: Vector3; normalWorld: Vector3 };

const DEFAULT_TIE_EPSILON = 0.5;

/**
 * Pure selection rule. Among candidate hits, pick the one nearest the anchor (a known
 * trustworthy surface point). When several are within `tieEpsilon` of the nearest, prefer
 * the one whose world normal best agrees (|dot|) with the cell's plane normal.
 */
export function chooseHit(
	hits: SurfaceHit[],
	anchor: Vector3,
	cellNormal: Vector3,
	tieEpsilon: number = DEFAULT_TIE_EPSILON
): SurfaceHit | null {
	if (hits.length === 0) return null;
	const scored = hits
		.map((h) => ({ h, d: h.point.distanceTo(anchor) }))
		.sort((a, b) => a.d - b.d);
	const best = scored[0].d;
	const tied = scored.filter((s) => s.d - best <= tieEpsilon);
	if (tied.length === 1) return tied[0].h;
	tied.sort(
		(a, b) =>
			Math.abs(b.h.normalWorld.dot(cellNormal)) - Math.abs(a.h.normalWorld.dot(cellNormal))
	);
	return tied[0].h;
}

/**
 * Cast a ray from `source` through `through`, collect ALL surface intersections, and apply
 * chooseHit. Returns the chosen 3D point or null if the ray misses.
 */
export function selectSurfaceHit(params: {
	surface: Object3D;
	source: Vector3;
	through: Vector3;
	anchor: Vector3;
	cellNormal: Vector3;
	tieEpsilon?: number;
	raycaster?: Raycaster;
}): Vector3 | null {
	const { surface, source, through, anchor, cellNormal } = params;
	const raycaster = params.raycaster ?? new Raycaster();
	raycaster.far = Infinity;
	const dir = through.clone().sub(source);
	if (dir.lengthSq() < 1e-18) return null;
	raycaster.set(source, dir.normalize());
	const intersections = raycaster.intersectObject(surface, true);
	if (intersections.length === 0) return null;

	const hits: SurfaceHit[] = intersections.map((it) => {
		const normalWorld = it.face
			? it.face.normal.clone().transformDirection(it.object.matrixWorld).normalize()
			: dir.clone();
		return { point: it.point.clone(), normalWorld };
	});
	const chosen = chooseHit(hits, anchor, cellNormal, params.tieEpsilon);
	return chosen ? chosen.point.clone() : null;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/select-surface-hit.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/select-surface-hit.ts src/lib/voronoi/__tests__/select-surface-hit.test.ts
git commit -m "feat(voronoi): add surface-hit selection (proximity + normal tiebreak)"
```

---

## Task 6: `edge-sampling.ts` — extract edge sampling from `generate-voronoi.ts`

This is a pure move so both methods share it; behavior is guarded by the existing `generate-voronoi.test.ts`.

**Files:**
- Create: `src/lib/voronoi/edge-sampling.ts`
- Modify: `src/lib/voronoi/generate-voronoi.ts` (remove the moved functions, import them)
- Test: `src/lib/voronoi/__tests__/edge-sampling.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/voronoi/__tests__/edge-sampling.test.ts`:

```ts
import { Vector3 } from 'three';
import { slerp, edgeArcLength, sampleEdgeAsDirections } from '../edge-sampling';

// A planar coordToDirection good enough for arc-length / sampling checks:
// treat (a,b) as a point on the unit circle in the xy-plane by angle a (radians).
const coordToDirection = (a: number, _b: number): Vector3 =>
	new Vector3(Math.cos(a), Math.sin(a), 0);

describe('slerp', () => {
	it('returns endpoints at t=0 and t=1', () => {
		const a = new Vector3(1, 0, 0);
		const b = new Vector3(0, 1, 0);
		expect(slerp(a, b, 0).distanceTo(a)).toBeCloseTo(0, 6);
		expect(slerp(a, b, 1).distanceTo(b)).toBeCloseTo(0, 6);
	});

	it('returns the midpoint direction at t=0.5', () => {
		const mid = slerp(new Vector3(1, 0, 0), new Vector3(0, 1, 0), 0.5);
		expect(mid.x).toBeCloseTo(Math.SQRT1_2, 5);
		expect(mid.y).toBeCloseTo(Math.SQRT1_2, 5);
	});
});

describe('edgeArcLength', () => {
	it('is the angle between the two endpoint directions', () => {
		expect(edgeArcLength([0, 0], [Math.PI / 2, 0], coordToDirection)).toBeCloseTo(Math.PI / 2, 5);
	});
});

describe('sampleEdgeAsDirections', () => {
	it('returns divisions+1 unit directions including both endpoints', () => {
		const dirs = sampleEdgeAsDirections([0, 0], [Math.PI / 2, 0], 4, coordToDirection);
		expect(dirs).toHaveLength(5);
		dirs.forEach((d) => expect(d.length()).toBeCloseTo(1, 6));
		expect(dirs[0].x).toBeCloseTo(1, 5);
		expect(dirs[4].y).toBeCloseTo(1, 5);
	});
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/edge-sampling.test.ts`
Expected: FAIL — "Cannot find module '../edge-sampling'".

- [ ] **Step 3: Create `edge-sampling.ts` with the moved code**

Create `src/lib/voronoi/edge-sampling.ts` (copy the bodies verbatim from `generate-voronoi.ts` lines 101-144, plus the `CoordToDirection` type from line 283):

```ts
import { Vector3 } from 'three';

export type CoordToDirection = (a: number, b: number) => Vector3;

export function sampleEdgeAsDirections(
	v0: [number, number],
	v1: [number, number],
	divisions: number,
	coordToDirection: CoordToDirection
): Vector3[] {
	const dir0 = coordToDirection(v0[0], v0[1]).normalize();
	const dir1 = coordToDirection(v1[0], v1[1]).normalize();
	const directions: Vector3[] = [];
	for (let i = 0; i <= divisions; i++) {
		const t = i / divisions;
		const dir = slerp(dir0, dir1, t);
		directions.push(dir);
	}
	return directions;
}

/**
 * Great-circle arc length (radians) of a Voronoi edge, measured as the angle between its
 * two vertices' surface directions. Consistent with the slerp-based sampling above.
 */
export function edgeArcLength(
	v0: [number, number],
	v1: [number, number],
	coordToDirection: CoordToDirection
): number {
	const d0 = coordToDirection(v0[0], v0[1]).normalize();
	const d1 = coordToDirection(v1[0], v1[1]).normalize();
	const dot = Math.max(-1, Math.min(1, d0.dot(d1)));
	return Math.acos(dot);
}

export function slerp(a: Vector3, b: Vector3, t: number): Vector3 {
	const dot = Math.max(-1, Math.min(1, a.dot(b)));
	const omega = Math.acos(dot);
	if (omega < 1e-10) {
		return a.clone().lerp(b, t);
	}
	const sinOmega = Math.sin(omega);
	const sa = Math.sin((1 - t) * omega) / sinOmega;
	const sb = Math.sin(t * omega) / sinOmega;
	return new Vector3(sa * a.x + sb * b.x, sa * a.y + sb * b.y, sa * a.z + sb * b.z);
}
```

- [ ] **Step 4: Remove the moved code from `generate-voronoi.ts` and import it**

In `src/lib/voronoi/generate-voronoi.ts`:
- Delete the `sampleEdgeAsDirections` function (lines 101-116), the `edgeArcLength` function (lines 118-132), the `slerp` function (lines 134-144), and the `type CoordToDirection` line (line 283).
- Add an import near the other `./` imports (after line 27):

```ts
import { slerp, edgeArcLength, sampleEdgeAsDirections, type CoordToDirection } from './edge-sampling';
```

(`slerp` is still used by the surface-projection section; `edgeArcLength`/`sampleEdgeAsDirections` by the edge loop; `CoordToDirection` by `computeVoronoiFromSeeds`.)

- [ ] **Step 5: Run the moved-module test and the full voronoi suite**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/edge-sampling.test.ts src/lib/voronoi/__tests__/generate-voronoi.test.ts`
Expected: PASS (edge-sampling 5 tests; generate-voronoi all existing tests still green — proves the extraction changed no behavior).

- [ ] **Step 6: Type check and commit**

Run: `npm run check`
Expected: no new errors.

```bash
git add src/lib/voronoi/edge-sampling.ts src/lib/voronoi/generate-voronoi.ts src/lib/voronoi/__tests__/edge-sampling.test.ts
git commit -m "refactor(voronoi): extract edge-sampling helpers (no behavior change)"
```

---

## Task 7: `project-edges-onto-surface.ts` — Phase 1 helper

**Files:**
- Create: `src/lib/voronoi/project-edges-onto-surface.ts`
- Modify: `src/lib/voronoi/generate-voronoi.ts` (use the helper for `edgePoints3d` + `normals`)
- Test: `src/lib/voronoi/__tests__/project-edges-onto-surface.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/voronoi/__tests__/project-edges-onto-surface.test.ts`:

```ts
import {
	Vector3,
	Object3D,
	Mesh,
	SphereGeometry,
	MeshBasicMaterial,
	DoubleSide,
	Raycaster
} from 'three';
import { projectEdgesOntoSurface } from '../project-edges-onto-surface';
import type { VoronoiEdge } from '../types';
import type { CoordToDirection } from '../edge-sampling';

function sphereSurface(radius: number): Object3D {
	const surface = new Object3D();
	const mesh = new Mesh(new SphereGeometry(radius, 48, 48), new MeshBasicMaterial({ side: DoubleSide }));
	surface.add(mesh);
	surface.updateMatrixWorld(true);
	return surface;
}

describe('projectEdgesOntoSurface', () => {
	const R = 100;
	const center = new Vector3(0, 0, 0);
	const surface = sphereSurface(R);
	// coordToDirection: (lon,lat) radians -> unit direction.
	const coordToDirection: CoordToDirection = (lon, lat) =>
		new Vector3(
			Math.cos(lat) * Math.cos(lon),
			Math.cos(lat) * Math.sin(lon),
			Math.sin(lat)
		);
	const intersect = (dir: Vector3): Vector3 | null => {
		const rc = new Raycaster(center, dir.clone().normalize(), undefined, 2000);
		const hits = rc.intersectObject(surface, true);
		return hits.length ? hits[0].point.clone() : null;
	};

	it('places edge points on the sphere with radial normals', () => {
		const edges: VoronoiEdge[] = [{ vertices: [[0, 0], [Math.PI / 4, 0]], cellIndices: [0, 1] }];
		const result = projectEdgesOntoSurface({
			edges,
			edgeDivisionCounts: [4],
			coordToDirection,
			center,
			surface,
			intersect
		});
		expect(result).toHaveLength(1);
		const { edgePoints3d, normals } = result[0];
		expect(edgePoints3d.length).toBe(5);
		expect(normals.length).toBe(edgePoints3d.length);
		for (let i = 0; i < edgePoints3d.length; i++) {
			expect(edgePoints3d[i].distanceTo(center)).toBeCloseTo(R, 0);
			// On a sphere centered at origin the outward normal is ~ the radial direction.
			const radial = edgePoints3d[i].clone().sub(center).normalize();
			expect(Math.abs(normals[i].dot(radial))).toBeGreaterThan(0.9);
		}
	});
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/project-edges-onto-surface.test.ts`
Expected: FAIL — "Cannot find module '../project-edges-onto-surface'".

- [ ] **Step 3: Implement `project-edges-onto-surface.ts`**

Create `src/lib/voronoi/project-edges-onto-surface.ts`:

```ts
import { Object3D, Raycaster, Vector3 } from 'three';
import type { VoronoiEdge } from './types';
import { sampleEdgeAsDirections, type CoordToDirection } from './edge-sampling';

export type EdgeProjection = { edgePoints3d: Vector3[]; normals: Vector3[] };

/**
 * Phase 1 (shared): for every Voronoi edge, sample directions along the edge, raycast them
 * from `center` onto the surface to get on-surface points, and compute a per-point surface
 * normal. This is the center-out edge placement reused by both inset methods.
 */
export function projectEdgesOntoSurface(params: {
	edges: VoronoiEdge[];
	edgeDivisionCounts: number[];
	coordToDirection: CoordToDirection;
	center: Vector3;
	surface: Object3D;
	intersect: (direction: Vector3) => Vector3 | null;
}): EdgeProjection[] {
	const { edges, edgeDivisionCounts, coordToDirection, center, surface, intersect } = params;
	const normalRaycaster = new Raycaster(undefined, undefined, undefined, 2000);

	return edges.map((edge, edgeIndex) => {
		const directions = sampleEdgeAsDirections(
			edge.vertices[0],
			edge.vertices[1],
			edgeDivisionCounts[edgeIndex],
			coordToDirection
		);
		const edgePoints3d: Vector3[] = [];
		const normals: Vector3[] = [];

		for (const dir of directions) {
			const point3d = intersect(dir);
			if (!point3d) continue;
			edgePoints3d.push(point3d);

			normalRaycaster.set(center, dir.clone().normalize());
			const hits = normalRaycaster.intersectObject(surface, true);
			if (hits.length > 0 && hits[0].face) {
				normals.push(
					hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld).normalize()
				);
			} else {
				normals.push(dir.clone().normalize());
			}
		}

		return { edgePoints3d, normals };
	});
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/project-edges-onto-surface.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Wire the helper into `makeVoronoi` (Phase 1)**

In `src/lib/voronoi/generate-voronoi.ts`:
- Import the helper (after the edge-sampling import added in Task 6):

```ts
import { projectEdgesOntoSurface, type EdgeProjection } from './project-edges-onto-surface';
```

- After `edgeDivisionCounts` is computed (currently line 351), add:

```ts
		const edgeProjections: EdgeProjection[] = projectEdgesOntoSurface({
			edges: voronoiResult.edges,
			edgeDivisionCounts,
			coordToDirection,
			center,
			surface,
			intersect
		});
```

- Inside the per-edge loop, replace the direction-sampling + per-point raycast block that builds `edgePoints3d` and `normals` (currently the `edgeDirections` declaration plus the `for (const dir of edgeDirections)` loop, lines 360-405) so that `edgePoints3d` and `normals` come from `edgeProjections`, while the curve-offset points stay computed for now from the existing inline slerp. Concretely, replace lines 359-405 with:

```ts
		const { edgePoints3d, normals } = edgeProjections[edgeIndex];

		// Curve offset points (still center-out here; replaced by EdgeInsets in Task 8).
		const curvePointsA: Vector3[] = [];
		const curvePointsB: Vector3[] = [];
		for (const point3d of edgePoints3d) {
			const edgeDir = point3d.clone().sub(center).normalize();
			const cellDirA = coordToDirection(cellCenterA[0], cellCenterA[1]).normalize();
			const cellDirB = coordToDirection(cellCenterB[0], cellCenterB[1]).normalize();

			const curveHitA = intersect(slerp(edgeDir, cellDirA, curveOffsetFactor));
			curvePointsA.push(curveHitA ?? point3d.clone());

			const curveHitB = intersect(slerp(edgeDir, cellDirB, curveOffsetFactor));
			curvePointsB.push(curveHitB ?? point3d.clone());
		}
```

(This preserves identical behavior — same points, same normals, same curve offsets — but `edgePoints3d`/`normals` now come from the shared Phase-1 helper. The `normalRaycaster` declaration at line 343 is now unused; delete it.)

- [ ] **Step 6: Run the full voronoi suite**

Run: `npm run test:unit -- src/lib/voronoi/`
Expected: PASS — all existing `generate-voronoi.test.ts` tests still green (behavior unchanged).

- [ ] **Step 7: Type check and commit**

Run: `npm run check`
Expected: no new errors.

```bash
git add src/lib/voronoi/project-edges-onto-surface.ts src/lib/voronoi/generate-voronoi.ts src/lib/voronoi/__tests__/project-edges-onto-surface.test.ts
git commit -m "refactor(voronoi): use shared Phase-1 edge projection helper"
```

---

## Task 8: `inset-center-out.ts` — `EdgeInsets` type + centerOut extraction

Pull both inset computations (curve points AND surface-projection intermediates) out of `makeVoronoi` into one function returning `EdgeInsets[]`, so the per-edge loop just consumes a precomputed structure. Behavior guarded by the existing `generate-voronoi.test.ts` (including the fold-back regression).

**Files:**
- Create: `src/lib/voronoi/inset-types.ts`
- Create: `src/lib/voronoi/inset-center-out.ts`
- Modify: `src/lib/voronoi/generate-voronoi.ts`
- Test: `src/lib/voronoi/__tests__/inset-center-out.test.ts`

- [ ] **Step 1: Create the shared `EdgeInsets` type**

Create `src/lib/voronoi/inset-types.ts`:

```ts
import type { Vector3 } from 'three';

/**
 * Per Voronoi edge, the two inset polylines (one per adjacent cell side) plus the
 * surface-projection intermediate points. Aligned index-for-index with that edge's
 * on-surface `edgePoints3d` from Phase 1.
 *  - curvePointsA[i] / curvePointsB[i]: inset point for sample i, cell-A / cell-B side.
 *  - divsA[i]: intermediate points ordered cA -> edge (exclusive ends).
 *  - divsB[i]: intermediate points ordered edge -> cB (exclusive ends).
 */
export type EdgeInsets = {
	curvePointsA: Vector3[];
	curvePointsB: Vector3[];
	divsA: Vector3[][];
	divsB: Vector3[][];
};
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/voronoi/__tests__/inset-center-out.test.ts`:

```ts
import {
	Vector3,
	Object3D,
	Mesh,
	SphereGeometry,
	MeshBasicMaterial,
	DoubleSide,
	Raycaster
} from 'three';
import { computeEdgeInsetsCenterOut } from '../inset-center-out';
import type { VoronoiEdge } from '../types';
import type { EdgeProjection } from '../project-edges-onto-surface';
import type { CoordToDirection } from '../edge-sampling';

function sphereSurface(radius: number): Object3D {
	const surface = new Object3D();
	const mesh = new Mesh(new SphereGeometry(radius, 48, 48), new MeshBasicMaterial({ side: DoubleSide }));
	surface.add(mesh);
	surface.updateMatrixWorld(true);
	return surface;
}

describe('computeEdgeInsetsCenterOut', () => {
	const R = 100;
	const center = new Vector3(0, 0, 0);
	const surface = sphereSurface(R);
	const coordToDirection: CoordToDirection = (lon, lat) =>
		new Vector3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
	const intersect = (dir: Vector3): Vector3 | null => {
		const rc = new Raycaster(center, dir.clone().normalize(), undefined, 2000);
		const hits = rc.intersectObject(surface, true);
		return hits.length ? hits[0].point.clone() : null;
	};

	// One edge between two cells whose seeds straddle the edge.
	const edges: VoronoiEdge[] = [{ vertices: [[0, -0.3], [0, 0.3]], cellIndices: [0, 1] }];
	const relaxedSeeds: [number, number][] = [
		[-0.4, 0],
		[0.4, 0]
	];
	const edgeProjections: EdgeProjection[] = [
		{
			edgePoints3d: [
				intersect(coordToDirection(0, -0.3))!,
				intersect(coordToDirection(0, 0))!,
				intersect(coordToDirection(0, 0.3))!
			],
			normals: []
		}
	];

	it('produces aligned curve polylines on the surface, offset toward each seed', () => {
		const result = computeEdgeInsetsCenterOut({
			edges,
			edgeProjections,
			relaxedSeeds,
			coordToDirection,
			center,
			intersect,
			curveOffsetFactor: 0.3,
			surfaceProjectionDivisions: 0
		});
		expect(result).toHaveLength(1);
		const { curvePointsA, curvePointsB, divsA, divsB } = result[0];
		expect(curvePointsA).toHaveLength(3);
		expect(curvePointsB).toHaveLength(3);
		// Inset points land on the sphere.
		curvePointsA.forEach((p) => expect(p.distanceTo(center)).toBeCloseTo(R, 0));
		// Side A is offset toward seed 0 (negative lon), side B toward seed 1 (positive lon).
		const seedDirA = coordToDirection(relaxedSeeds[0][0], relaxedSeeds[0][1]);
		const seedDirB = coordToDirection(relaxedSeeds[1][0], relaxedSeeds[1][1]);
		const edgePt = edgeProjections[0].edgePoints3d[1];
		expect(curvePointsA[1].clone().sub(edgePt).dot(seedDirA)).toBeGreaterThan(0);
		expect(curvePointsB[1].clone().sub(edgePt).dot(seedDirB)).toBeGreaterThan(0);
		// No divisions requested.
		expect(divsA[0]).toEqual([]);
		expect(divsB[0]).toEqual([]);
	});

	it('produces ordered intermediate division points', () => {
		const result = computeEdgeInsetsCenterOut({
			edges,
			edgeProjections,
			relaxedSeeds,
			coordToDirection,
			center,
			intersect,
			curveOffsetFactor: 0.3,
			surfaceProjectionDivisions: 2
		});
		const { divsA, curvePointsA } = result[0];
		expect(divsA[1]).toHaveLength(2);
		// Ordered cA -> edge: first intermediate is nearer cA than the second.
		const cA = curvePointsA[1];
		expect(divsA[1][0].distanceTo(cA)).toBeLessThan(divsA[1][1].distanceTo(cA));
	});
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/inset-center-out.test.ts`
Expected: FAIL — "Cannot find module '../inset-center-out'".

- [ ] **Step 4: Implement `inset-center-out.ts`**

Create `src/lib/voronoi/inset-center-out.ts`. The curve-point logic mirrors the original `generate-voronoi.ts` lines 394-404; the division logic mirrors lines 463-481.

```ts
import { Vector3 } from 'three';
import type { VoronoiEdge } from './types';
import type { EdgeProjection } from './project-edges-onto-surface';
import type { EdgeInsets } from './inset-types';
import { slerp, type CoordToDirection } from './edge-sampling';

/**
 * Center-out inset computation (the original spherical-assumption method), now producing the
 * shared EdgeInsets structure consumed by the tube assembly.
 */
export function computeEdgeInsetsCenterOut(params: {
	edges: VoronoiEdge[];
	edgeProjections: EdgeProjection[];
	relaxedSeeds: [number, number][];
	coordToDirection: CoordToDirection;
	center: Vector3;
	intersect: (direction: Vector3) => Vector3 | null;
	curveOffsetFactor: number;
	surfaceProjectionDivisions: number;
}): EdgeInsets[] {
	const {
		edges,
		edgeProjections,
		relaxedSeeds,
		coordToDirection,
		center,
		intersect,
		curveOffsetFactor,
		surfaceProjectionDivisions
	} = params;

	return edges.map((edge, edgeIndex) => {
		const edgePoints3d = edgeProjections[edgeIndex].edgePoints3d;
		const [cellIdxA, cellIdxB] = edge.cellIndices;
		const cellDirA = coordToDirection(relaxedSeeds[cellIdxA][0], relaxedSeeds[cellIdxA][1]).normalize();
		const cellDirB = coordToDirection(relaxedSeeds[cellIdxB][0], relaxedSeeds[cellIdxB][1]).normalize();

		const curvePointsA: Vector3[] = [];
		const curvePointsB: Vector3[] = [];
		const divsA: Vector3[][] = [];
		const divsB: Vector3[][] = [];

		for (const point3d of edgePoints3d) {
			const edgeDir = point3d.clone().sub(center).normalize();

			const curveHitA = intersect(slerp(edgeDir, cellDirA, curveOffsetFactor));
			const cA = curveHitA ?? point3d.clone();
			curvePointsA.push(cA);

			const curveHitB = intersect(slerp(edgeDir, cellDirB, curveOffsetFactor));
			const cB = curveHitB ?? point3d.clone();
			curvePointsB.push(cB);

			const divA: Vector3[] = [];
			const divB: Vector3[] = [];
			if (surfaceProjectionDivisions > 0) {
				const cADir = cA.clone().sub(center).normalize();
				const cBDir = cB.clone().sub(center).normalize();
				for (let d = 1; d <= surfaceProjectionDivisions; d++) {
					const t = d / (surfaceProjectionDivisions + 1);
					const hitA = intersect(slerp(cADir, edgeDir, t));
					if (hitA) divA.push(hitA);
					const hitB = intersect(slerp(edgeDir, cBDir, t));
					if (hitB) divB.push(hitB);
				}
			}
			divsA.push(divA);
			divsB.push(divB);
		}

		return { curvePointsA, curvePointsB, divsA, divsB };
	});
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/inset-center-out.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Consume `EdgeInsets` in `makeVoronoi`**

In `src/lib/voronoi/generate-voronoi.ts`:
- Add imports:

```ts
import type { EdgeInsets } from './inset-types';
import { computeEdgeInsetsCenterOut } from './inset-center-out';
```

- After the `edgeProjections` assignment (added in Task 7), add:

```ts
		const edgeInsets: EdgeInsets[] = computeEdgeInsetsCenterOut({
			edges: voronoiResult.edges,
			edgeProjections,
			relaxedSeeds,
			coordToDirection,
			center,
			intersect,
			curveOffsetFactor,
			surfaceProjectionDivisions: config.surfaceProjectionDivisions ?? 0
		});
```

- In the per-edge loop, replace the inline `curvePointsA`/`curvePointsB` computation (the block added in Task 7 Step 5) with:

```ts
		const { edgePoints3d, normals } = edgeProjections[edgeIndex];
		const { curvePointsA, curvePointsB, divsA, divsB } = edgeInsets[edgeIndex];
```

- In the surface-projection section, replace the inline `divA`/`divB` computation inside the `spSections` map (original lines 458-491) so it uses the precomputed divisions. Replace the body of the `edgePoints3d.map((edgePoint, idx)...)` callback with:

```ts
		const spSections: Section[] = edgePoints3d.map((edgePoint, idx): Section => {
			const cA = curvePointsA[idx];
			const cB = curvePointsB[idx];
			return {
				points: [cA.clone(), ...divsA[idx], edgePoint.clone(), ...divsB[idx], cB.clone()]
			};
		});
```

- The local `curveOffsetFactor` const (line 340) is still used for the `computeEdgeInsetsCenterOut` call; keep it. The `cellCenterA`/`cellCenterB` locals (lines 356-357), the `spDivisions` local (original line 456, now superseded by the precomputed `divsA`/`divsB`), and the `slerp` import may now be unused in `generate-voronoi.ts` — remove each if `npm run check` flags it as unused.

- [ ] **Step 7: Run the full voronoi suite**

Run: `npm run test:unit -- src/lib/voronoi/`
Expected: PASS — all `generate-voronoi.test.ts` tests, including `surfaceProjection sections do not fold back`, still green (proves the EdgeInsets refactor preserved ordering/behavior).

- [ ] **Step 8: Type check and commit**

Run: `npm run check`
Expected: no new errors.

```bash
git add src/lib/voronoi/inset-types.ts src/lib/voronoi/inset-center-out.ts src/lib/voronoi/generate-voronoi.ts src/lib/voronoi/__tests__/inset-center-out.test.ts
git commit -m "refactor(voronoi): consume EdgeInsets; extract centerOut inset computation"
```

---

## Task 9: `local-projection.ts` — per-cell inset + wire `insetMethod` branch

**Files:**
- Create: `src/lib/voronoi/local-projection.ts`
- Modify: `src/lib/voronoi/generate-voronoi.ts` (branch on `insetMethod`; precompute seed 3D points)
- Test: `src/lib/voronoi/__tests__/local-projection.test.ts`
- Test (smoke): `src/lib/voronoi/__tests__/generate-voronoi.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/voronoi/__tests__/local-projection.test.ts`:

```ts
import {
	Vector3,
	Object3D,
	Mesh,
	SphereGeometry,
	MeshBasicMaterial,
	DoubleSide,
	Raycaster
} from 'three';
import { computeEdgeInsetsLocalProjection } from '../local-projection';
import { computeEdgeInsetsCenterOut } from '../inset-center-out';
import type { VoronoiEdge } from '../types';
import type { EdgeProjection } from '../project-edges-onto-surface';
import type { CoordToDirection } from '../edge-sampling';

function sphereSurface(radius: number): Object3D {
	const surface = new Object3D();
	const mesh = new Mesh(new SphereGeometry(radius, 64, 64), new MeshBasicMaterial({ side: DoubleSide }));
	surface.add(mesh);
	surface.updateMatrixWorld(true);
	return surface;
}

describe('computeEdgeInsetsLocalProjection', () => {
	const R = 100;
	const center = new Vector3(0, 0, 0);
	const surface = sphereSurface(R);
	const coordToDirection: CoordToDirection = (lon, lat) =>
		new Vector3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
	const intersect = (dir: Vector3): Vector3 | null => {
		const rc = new Raycaster(center, dir.clone().normalize(), undefined, 2000);
		const hits = rc.intersectObject(surface, true);
		return hits.length ? hits[0].point.clone() : null;
	};

	// Two cells (0,1) sharing one edge near lon=0; each cell also has two more edges so the
	// per-cell plane fit has enough non-collinear points.
	const edges: VoronoiEdge[] = [
		{ vertices: [[0, -0.3], [0, 0.3]], cellIndices: [0, 1] }, // shared edge
		{ vertices: [[-0.3, -0.3], [0, -0.3]], cellIndices: [0, 2] },
		{ vertices: [[-0.3, 0.3], [0, 0.3]], cellIndices: [0, 2] },
		{ vertices: [[0.3, -0.3], [0, -0.3]], cellIndices: [1, 3] },
		{ vertices: [[0.3, 0.3], [0, 0.3]], cellIndices: [1, 3] }
	];
	const relaxedSeeds: [number, number][] = [
		[-0.2, 0], // cell 0
		[0.2, 0], // cell 1
		[-0.5, 0], // cell 2
		[0.5, 0] // cell 3
	];
	const edgeProjections: EdgeProjection[] = edges.map((e) => {
		const dirs = [e.vertices[0], e.vertices[1]].map((v) =>
			intersect(coordToDirection(v[0], v[1]))!
		);
		// subdivide: endpoints + midpoint
		const mid = intersect(
			coordToDirection((e.vertices[0][0] + e.vertices[1][0]) / 2, (e.vertices[0][1] + e.vertices[1][1]) / 2)
		)!;
		return { edgePoints3d: [dirs[0], mid, dirs[1]], normals: [] };
	});
	const seedPoints3d = relaxedSeeds.map((s) => intersect(coordToDirection(s[0], s[1])));

	const common = {
		edges,
		edgeProjections,
		relaxedSeeds,
		coordToDirection,
		center,
		surface,
		surfaceCenter: center,
		curveOffsetFactor: 0.3,
		surfaceProjectionDivisions: 0
	};

	it('insets land on the sphere and offset toward each cell seed', () => {
		const result = computeEdgeInsetsLocalProjection({ ...common, seedPoints3d });
		const shared = result[0];
		expect(shared.curvePointsA).toHaveLength(3);
		expect(shared.curvePointsB).toHaveLength(3);
		shared.curvePointsA.forEach((p) => expect(p.distanceTo(center)).toBeCloseTo(R, -1));
		const seedDirA = coordToDirection(relaxedSeeds[0][0], relaxedSeeds[0][1]);
		const seedDirB = coordToDirection(relaxedSeeds[1][0], relaxedSeeds[1][1]);
		const edgePt = edgeProjections[0].edgePoints3d[1];
		expect(shared.curvePointsA[1].clone().sub(edgePt).dot(seedDirA)).toBeGreaterThan(0);
		expect(shared.curvePointsB[1].clone().sub(edgePt).dot(seedDirB)).toBeGreaterThan(0);
	});

	it('A and B sides of the shared edge differ', () => {
		const result = computeEdgeInsetsLocalProjection({ ...common, seedPoints3d });
		const shared = result[0];
		expect(shared.curvePointsA[1].distanceTo(shared.curvePointsB[1])).toBeGreaterThan(1);
	});

	it('is in rough parity with centerOut on a sphere', () => {
		const local = computeEdgeInsetsLocalProjection({ ...common, seedPoints3d });
		const centerOut = computeEdgeInsetsCenterOut({
			edges,
			edgeProjections,
			relaxedSeeds,
			coordToDirection,
			center,
			intersect,
			curveOffsetFactor: 0.3,
			surfaceProjectionDivisions: 0
		});
		// Compare the shared edge's midpoint inset on side A. Tolerance is loose ("rough parity"):
		// within 20% of the sphere radius.
		const dLocal = local[0].curvePointsA[1];
		const dCenter = centerOut[0].curvePointsA[1];
		expect(dLocal.distanceTo(dCenter)).toBeLessThan(R * 0.2);
	});
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/local-projection.test.ts`
Expected: FAIL — "Cannot find module '../local-projection'".

- [ ] **Step 3: Implement `local-projection.ts`**

Create `src/lib/voronoi/local-projection.ts`:

```ts
import { Object3D, Vector2, Vector3 } from 'three';
import type { VoronoiEdge } from './types';
import type { EdgeProjection } from './project-edges-onto-surface';
import type { EdgeInsets } from './inset-types';
import type { CoordToDirection } from './edge-sampling';
import { fitPlane } from './fit-plane';
import { buildPlaneBasis, projectToPlane2D, plane2DToPoint3D } from './source-projection';
import { insetPoint2D, insetIntermediates2D } from './inset-2d';
import { selectSurfaceHit } from './select-surface-hit';

const DEFAULT_SOURCE_DISTANCE_FACTOR = 10;

function maxPairwiseDistance(points: Vector3[]): number {
	let max = 0;
	for (let i = 0; i < points.length; i++) {
		for (let j = i + 1; j < points.length; j++) {
			const d = points[i].distanceTo(points[j]);
			if (d > max) max = d;
		}
	}
	return max;
}

function averageNormal(edgeIdxs: number[], edgeProjections: EdgeProjection[]): Vector3 {
	const acc = new Vector3();
	let n = 0;
	for (const ei of edgeIdxs) {
		for (const nrm of edgeProjections[ei].normals) {
			acc.add(nrm);
			n++;
		}
	}
	if (n === 0) return new Vector3(0, 0, 1);
	return acc.divideScalar(n).normalize();
}

/**
 * Per-cell "local projection" inset: fit an average plane to each cell's on-surface points,
 * place a far source on its normal, flatten the cell to 2D, inset toward the seed by
 * homothety, and back-project onto the surface choosing the hit nearest the known edge point.
 */
export function computeEdgeInsetsLocalProjection(params: {
	edges: VoronoiEdge[];
	edgeProjections: EdgeProjection[];
	relaxedSeeds: [number, number][];
	seedPoints3d: (Vector3 | null)[];
	coordToDirection: CoordToDirection;
	surface: Object3D;
	surfaceCenter: Vector3;
	curveOffsetFactor: number;
	surfaceProjectionDivisions: number;
	sourceDistanceFactor?: number;
}): EdgeInsets[] {
	const {
		edges,
		edgeProjections,
		seedPoints3d,
		surface,
		surfaceCenter,
		curveOffsetFactor,
		surfaceProjectionDivisions
	} = params;
	const distanceFactor = params.sourceDistanceFactor ?? DEFAULT_SOURCE_DISTANCE_FACTOR;

	// Initialize output; default every side to the edge points so any edge a cell pass misses
	// still yields a valid (degenerate) inset rather than undefined.
	const result: EdgeInsets[] = edges.map((_, i) => {
		const pts = edgeProjections[i].edgePoints3d;
		return {
			curvePointsA: pts.map((p) => p.clone()),
			curvePointsB: pts.map((p) => p.clone()),
			divsA: pts.map(() => []),
			divsB: pts.map(() => [])
		};
	});

	// cell -> list of its edge indices
	const cellEdges = new Map<number, number[]>();
	edges.forEach((edge, edgeIndex) => {
		for (const cell of edge.cellIndices) {
			const list = cellEdges.get(cell);
			if (list) list.push(edgeIndex);
			else cellEdges.set(cell, [edgeIndex]);
		}
	});

	for (const [cell, edgeIdxs] of cellEdges) {
		// Sample set: all on-surface edge points of this cell + the cell seed.
		const samples: Vector3[] = [];
		for (const ei of edgeIdxs) samples.push(...edgeProjections[ei].edgePoints3d);
		const seed3d = seedPoints3d[cell] ?? null;
		if (samples.length === 0) continue;
		const seedForInset = seed3d ?? null;
		if (seedForInset) samples.push(seedForInset);

		const fallbackNormal = averageNormal(edgeIdxs, edgeProjections);
		const { normal, centroid } = fitPlane(samples, { fallbackNormal, orientAwayFrom: surfaceCenter });
		const size = maxPairwiseDistance(samples);
		if (size < 1e-9) continue;
		const sourceDistance = distanceFactor * size;
		const source = centroid.clone().addScaledVector(normal, sourceDistance);
		const planePoint = centroid.clone().addScaledVector(normal, sourceDistance / 2);
		const basis = buildPlaneBasis(normal);

		// 2D seed (homothety target). Fall back to the plane origin if projection fails.
		const seed2d =
			(seedForInset && projectToPlane2D(seedForInset, source, planePoint, normal, basis)) ||
			new Vector2(0, 0);

		for (const ei of edgeIdxs) {
			const pts = edgeProjections[ei].edgePoints3d;
			const isSideA = edges[ei].cellIndices[0] === cell;
			const curve: Vector3[] = [];
			const divs: Vector3[][] = [];

			for (let i = 0; i < pts.length; i++) {
				const anchor = pts[i];
				const e2d = projectToPlane2D(anchor, source, planePoint, normal, basis);
				if (!e2d) {
					curve.push(anchor.clone());
					divs.push([]);
					continue;
				}

				const inset2d = insetPoint2D(e2d, seed2d, curveOffsetFactor);
				const insetThrough = plane2DToPoint3D(inset2d, planePoint, basis);
				const insetPt =
					selectSurfaceHit({ surface, source, through: insetThrough, anchor, cellNormal: normal }) ??
					anchor.clone();
				curve.push(insetPt);

				// Intermediates ordered inset -> edge (== cA -> edge for side A).
				const inter2d = insetIntermediates2D(e2d, seed2d, curveOffsetFactor, surfaceProjectionDivisions);
				const interPts = inter2d.map((p2) => {
					const through = plane2DToPoint3D(p2, planePoint, basis);
					return (
						selectSurfaceHit({ surface, source, through, anchor, cellNormal: normal }) ??
						anchor.clone()
					);
				});
				divs.push(interPts);
			}

			if (isSideA) {
				result[ei].curvePointsA = curve;
				result[ei].divsA = divs; // already cA -> edge
			} else {
				result[ei].curvePointsB = curve;
				// EdgeInsets.divsB is ordered edge -> cB; our intermediates are cB -> edge, so reverse.
				result[ei].divsB = divs.map((d) => d.slice().reverse());
			}
		}
	}

	return result;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/local-projection.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the branch into `makeVoronoi`**

In `src/lib/voronoi/generate-voronoi.ts`:
- Add the import:

```ts
import { computeEdgeInsetsLocalProjection } from './local-projection';
```

- Replace the `edgeInsets` assignment (added in Task 8 Step 6) with a branch. First, precompute the per-cell seed 3D points (reuse the pattern already used by `fillAll` at the bottom of the file):

```ts
		const seedPoints3d = relaxedSeeds.map((seed) => intersect(coordToDirection(seed[0], seed[1])));

		const edgeInsets: EdgeInsets[] =
			config.insetMethod === 'localProjection'
				? computeEdgeInsetsLocalProjection({
						edges: voronoiResult.edges,
						edgeProjections,
						relaxedSeeds,
						seedPoints3d,
						coordToDirection,
						surface,
						surfaceCenter: center,
						curveOffsetFactor,
						surfaceProjectionDivisions: config.surfaceProjectionDivisions ?? 0
					})
				: computeEdgeInsetsCenterOut({
						edges: voronoiResult.edges,
						edgeProjections,
						relaxedSeeds,
						coordToDirection,
						center,
						intersect,
						curveOffsetFactor,
						surfaceProjectionDivisions: config.surfaceProjectionDivisions ?? 0
					});
```

- [ ] **Step 6: Add a smoke test for the wired branch**

Add to `src/lib/voronoi/__tests__/generate-voronoi.test.ts`, inside the `describe('makeVoronoi', ...)` block:

```ts
	it('generates tubes with insetMethod localProjection', () => {
		const address: GlobuleAddress = { globule: 0 };
		const config: VoronoiConfig = { ...makeTestConfig(), insetMethod: 'localProjection' };
		const result = makeVoronoi(config, address, testSurfaceConfig);
		expect(result.tubes.length).toBeGreaterThan(0);
		result.tubes.forEach((tube) => {
			tube.bands.forEach((band) => expect(band.facets.length).toBeGreaterThan(0));
		});
	});
```

Also add `insetMethod: 'centerOut'` to the object returned by `makeTestConfig()` (after `voronoiMethod: 'spherical'`, line 200) so the base test config is type-complete.

- [ ] **Step 7: Run the full voronoi suite**

Run: `npm run test:unit -- src/lib/voronoi/`
Expected: PASS — all tests, including the new localProjection smoke test and all pre-existing centerOut tests.

- [ ] **Step 8: Type check, build, and commit**

Run: `npm run check`
Expected: no new errors.

Run: `npm run build`
Expected: build succeeds (catches Svelte event-syntax issues in `VoronoiControl.svelte` that check/tests miss).

```bash
git add src/lib/voronoi/local-projection.ts src/lib/voronoi/generate-voronoi.ts src/lib/voronoi/__tests__/local-projection.test.ts src/lib/voronoi/__tests__/generate-voronoi.test.ts
git commit -m "feat(voronoi): per-cell local-projection inset method"
```

---

## Task 10: Manual verification checkpoint

**No code.** Verify rough parity in the running app.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Compare methods on each surface**

In the designer, with a Voronoi config on a **sphere**, toggle the new **Inset Method** control between **Center Out** and **Local Projection**. Confirm:
- Local Projection produces inset tubes in roughly the same places as Center Out (rough parity).
- No obviously inverted/exploded geometry (which would indicate a wrong back-projection hit).
Repeat on **capsule** and **globule** surfaces.

- [ ] **Step 3: Record the outcome**

Note any surface where parity is poor or geometry is wrong. If issues appear, the most likely culprits are the hit-selection `tieEpsilon` (too large/small) or the per-cell `size`/`sourceDistanceFactor`. These are the tuning points; adjust and re-run Task 9's tests. If parity is acceptable on all three surfaces, the milestone is complete.

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** granularity per-cell (Task 9); hit selection proximity+normal (Task 5, used in Task 9); gating via orthogonal `insetMethod` (Task 1); homothety behind swappable `inset-2d` (Task 4); SVD/PCA plane fit (Task 2); per-cell diameter size + 10× source distance (Task 9); Phase-1 shared helper (Task 7); EdgeInsets seam keeping Phase 3 unchanged (Task 8); migration default (Task 1); tests incl. sphere rough-parity and seam invariant (Task 9). Scope limitation (Phase 1 stays center-based) is documented in the spec; no task changes Phase 1's diagram mapping, consistent with that.
- **Type consistency:** `EdgeInsets` (curvePointsA/curvePointsB/divsA/divsB) defined in `inset-types.ts` and produced identically by `inset-center-out.ts` and `local-projection.ts`; `EdgeProjection` (edgePoints3d/normals) from `project-edges-onto-surface.ts`; `CoordToDirection` from `edge-sampling.ts`; `InsetMethod` from `types.ts`. `divsA` ordered cA→edge, `divsB` ordered edge→cB in both producers (local-projection reverses side B to match).
```
