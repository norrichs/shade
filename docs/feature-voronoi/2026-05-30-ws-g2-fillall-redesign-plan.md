# surfaceProjection / voronoiSurface interior fill bands (redesign) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken per-polygon centroid "fan tube" `fillAll` with per-border-band synthetic fill bands that the existing outlined renderer draws correctly, working for both `surfaceProjection` and `voronoiSurface`.

**Architecture:** For each polygon/cell interior, build one synthetic "fill band" per bordering tube-band. Each fill band mirrors its border band 1:1 with alternating real (2 border vectors + shared center point) and degenerate (1 border vector + 2 center) facets. Fill bands are inserted into their tubes (one before band 0, one after the last band) **before** addressing/partner matching, so they are first-class. A degenerate-facet guard is added to the flatten path so zero-length edges don't poison 2D coordinates. Fill stays outlined-only.

**Tech Stack:** TypeScript, Three.js (`Vector3`, `Triangle`, `Raycaster`, `Object3D`), SvelteKit, Jest (colocated `__tests__`), Web Worker (serialization-safe geometry).

**Spec:** [`2026-05-30-ws-g2-fillall-redesign-design.md`](./2026-05-30-ws-g2-fillall-redesign-design.md)

---

## File Structure

| File | Create/Modify | Responsibility |
| --- | --- | --- |
| `src/lib/projection-geometry/fill-bands.ts` | Create | Pure fill-band construction: `extractBorderEdge`, `buildFillBand`, `windFillBandOutward`, `isDegenerateTriangle`, `FILL_DEGENERATE_EPSILON`. |
| `src/lib/projection-geometry/__tests__/fill-bands.test.ts` | Create | Unit tests for the pure helpers. |
| `src/lib/projection-geometry/fill-fan.ts` | Delete | Old per-polygon fan builder (replaced). |
| `src/lib/projection-geometry/__tests__/fill-fan.test.ts` | Delete | Old fan tests. |
| `src/lib/projection-geometry/types.ts` | Modify | Add `fillAll` already present on `SurfaceProjectionConfig`; remove `isFill` from `Tube`. |
| `src/lib/types.ts` | Modify | Add `isFill?: boolean` to `Band`; add `isDegenerate?: boolean` to `Facet`. |
| `src/lib/voronoi/types.ts` | Modify | Add `fillAll?: boolean` to `VoronoiConfig`. |
| `src/lib/projection-geometry/generate-projection.ts` | Modify | Remove old per-polygon fan block; build+insert fill bands per polygon before partner matching; guard partner matchers against degenerate edges. |
| `src/lib/voronoi/generate-voronoi.ts` | Modify | Build+insert fill bands per cell (seed-based center) before partner matching. |
| `src/lib/cut-pattern/generate-panel-pattern.ts` | Modify | Degenerate-facet guard in `getFlatStripV2` flatten path. |
| `src/lib/cut-pattern/generate-pattern.ts` | Modify | Drop fill *bands* (not tubes) for non-outlined patterns. |
| `src/components/cut-pattern/CutPatternControl.svelte` | Modify | One shared "fill all" toggle shown for both `surfaceProjection` and `voronoiSurface`. |

**Note on `isFill` granularity:** the marker moves from `Tube` to `Band`. A fill band lives inside an otherwise-normal tube.

**Note on degenerate tagging:** degenerate fill facets are marked **explicitly** at construction with `Facet.isDegenerate = true`. Production guards (flatten path, partner matchers) read this flag — they do NOT detect degeneracy geometrically. The geometric `isDegenerateTriangle` helper exists only for unit tests.

---

## Conventions

- Run a single Jest file: `npm run test:unit -- src/lib/projection-geometry/__tests__/fill-bands.test.ts`
- Type-check: `npm run check`
- Tests are colocated under `__tests__`, using Jest + `jest-globals`. Follow the import style of a neighboring test (e.g. `src/lib/projection-geometry/__tests__/`).
- Geometry runs in the worker — only use serialization-safe Three.js objects (`Vector3`, `Triangle`) that `workerStore.ts` already rehydrates.

---

## Task 1: Move `isFill` to band level; add `isDegenerate` to Facet; add `fillAll` to VoronoiConfig

**Files:**
- Modify: `src/lib/types.ts` (the `Band` type ~line 792, and the `Facet` type ~line 736)
- Modify: `src/lib/projection-geometry/types.ts` (the `Tube` type, line 226-236)
- Modify: `src/lib/voronoi/types.ts` (the `VoronoiConfig` type, lines 9-19)

- [ ] **Step 1: Add `isFill` to `Band`**

In `src/lib/types.ts`, the `Band` type currently is:

```typescript
export type Band = {
	facets: Facet[];
	orientation: FacetOrientation;

	sideOrientation?: 'inside' | 'outside' | 'mixed';
	endTab?: FacetTab;
	selected?: BandSelection;
	visible?: boolean;
	address?: GeometryAddress<BandAddressed> | GlobuleAddress_Band;
};
```

Add the `isFill` marker:

```typescript
export type Band = {
	facets: Facet[];
	orientation: FacetOrientation;

	sideOrientation?: 'inside' | 'outside' | 'mixed';
	endTab?: FacetTab;
	selected?: BandSelection;
	visible?: boolean;
	address?: GeometryAddress<BandAddressed> | GlobuleAddress_Band;
	/** True for synthetic interior fill bands (fillAll). Drives outlined-only gating. */
	isFill?: boolean;
};
```

- [ ] **Step 2: Add `isDegenerate` to `Facet`**

In `src/lib/types.ts`, the `Facet` type currently is:

```typescript
export type Facet = {
	triangle: ThreeTriangle;
	address?: GlobuleAddress_Facet;
	meta?: {
		ab: FacetEdgeMeta;
		bc: FacetEdgeMeta;
		ac: FacetEdgeMeta;
	};
	orientation: FacetOrientation;
	tab?: FacetTab; // | FacetTab[];
};
```

Add the explicit degenerate marker:

```typescript
export type Facet = {
	triangle: ThreeTriangle;
	address?: GlobuleAddress_Facet;
	meta?: {
		ab: FacetEdgeMeta;
		bc: FacetEdgeMeta;
		ac: FacetEdgeMeta;
	};
	orientation: FacetOrientation;
	tab?: FacetTab; // | FacetTab[];
	/**
	 * True for the synthetic zero-area facets in interior fill bands (fillAll).
	 * Set explicitly at construction; read by the flatten path and partner matchers
	 * to skip them. NOT inferred from geometry.
	 */
	isDegenerate?: boolean;
};
```

- [ ] **Step 3: Remove `isFill` from `Tube`**

In `src/lib/projection-geometry/types.ts`, the `Tube` type has `isFill?: boolean;` on line 231. Remove that single line (leave the rest of the `Tube` type unchanged).

- [ ] **Step 4: Add `fillAll` to `VoronoiConfig`**

In `src/lib/voronoi/types.ts`, change:

```typescript
export type VoronoiConfig = {
	type: 'VoronoiConfig';
	meta: { transform: TransformConfig };
	seedConfig: VoronoiSeedConfig;
	crossSectionConfig: CrossSectionConfig;
	bandConfig: ProjectionBandConfig;
	edgeDivisions: number;
	curveOffsetFactor: number;
	surfaceProjectionDivisions: number;
	voronoiMethod: VoronoiMethod;
};
```

to add the flag (mirrors `SurfaceProjectionConfig.fillAll`, which already exists at `src/lib/projection-geometry/types.ts:186`):

```typescript
export type VoronoiConfig = {
	type: 'VoronoiConfig';
	meta: { transform: TransformConfig };
	seedConfig: VoronoiSeedConfig;
	crossSectionConfig: CrossSectionConfig;
	bandConfig: ProjectionBandConfig;
	edgeDivisions: number;
	curveOffsetFactor: number;
	surfaceProjectionDivisions: number;
	voronoiMethod: VoronoiMethod;
	fillAll?: boolean;
};
```

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: No NEW errors referencing `Band.isFill`, `Facet.isDegenerate`, `Tube.isFill`, or `VoronoiConfig.fillAll`. (The codebase has pre-existing errors; compare against baseline — there must be no new errors from these files. Any reference to `tube.isFill` elsewhere will now error and is fixed in later tasks; note them but do not fix yet.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/projection-geometry/types.ts src/lib/voronoi/types.ts
git commit -m "feat(fillAll): move isFill to band; add Facet.isDegenerate; add fillAll to VoronoiConfig"
```

---

## Task 2: `fill-bands.ts` — degeneracy helper + outer-border polyline

**Files:**
- Create: `src/lib/projection-geometry/fill-bands.ts`
- Test: `src/lib/projection-geometry/__tests__/fill-bands.test.ts`

**Background (verified facts — do not re-derive):**
- Surface-projection tubes (both sources) are built from `sections: Section[]`, where each section is
  a column `{ points: Vector3[] }`. `generateProjectionBands` (axial-right) makes **band index =
  point index** within the column, and walks `sectionIndex` along the tube length. So:
  - `Section.points[0]` across all sections = the **first band's outer border** polyline,
  - `Section.points[last]` across all sections = the **last band's outer border** polyline.
- The two outer borders are the polygon/cell-bordering edges (the "open space" sides). Interior
  division bands (when `surfaceProjectionDivisions > 0`) use middle point-indices and never border
  open space.
- The `sections` array is the **post-winding** geometry (the winding reverse in both generators
  reverses each section's `points`), so reading `points[0]`/`points[last]` is always correct.
- `Section` type: `src/lib/projection-geometry/types.ts:222` = `{ points: Vector3[] }`. `Facet`,
  `Band` shapes: `src/lib/types.ts`. `Facet = { triangle: ThreeTriangle; address?:
  GlobuleAddress_Facet; meta?: {ab,bc,ac}; orientation: FacetOrientation }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/projection-geometry/__tests__/fill-bands.test.ts`:

```typescript
import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';
import type { Section } from '../types';
import {
	isDegenerateTriangle,
	outerBorderPolyline,
	FILL_DEGENERATE_EPSILON
} from '../fill-bands';

describe('isDegenerateTriangle', () => {
	it('is false for a normal triangle', () => {
		const t = new Triangle(new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0));
		expect(isDegenerateTriangle(t)).toBe(false);
	});

	it('is true when two vertices coincide', () => {
		const c = new Vector3(2, 2, 2);
		const t = new Triangle(new Vector3(1, 0, 0), c.clone(), c.clone());
		expect(isDegenerateTriangle(t)).toBe(true);
	});

	it('respects the epsilon', () => {
		const t = new Triangle(
			new Vector3(0, 0, 0),
			new Vector3(FILL_DEGENERATE_EPSILON / 2, 0, 0),
			new Vector3(0, 1, 0)
		);
		expect(isDegenerateTriangle(t)).toBe(true);
	});
});

describe('outerBorderPolyline', () => {
	// 3 sections, each a 3-point column [first, mid, last].
	const sections: Section[] = [
		{ points: [new Vector3(0, 0, 0), new Vector3(0.5, 0, 0), new Vector3(1, 0, 0)] },
		{ points: [new Vector3(0, 1, 0), new Vector3(0.5, 1, 0), new Vector3(1, 1, 0)] },
		{ points: [new Vector3(0, 2, 0), new Vector3(0.5, 2, 0), new Vector3(1, 2, 0)] }
	];

	it('reads the first-band outer border (points[0] of each section)', () => {
		const edge = outerBorderPolyline(sections, 'first');
		expect(edge.map((v) => v.toArray())).toEqual([
			[0, 0, 0],
			[0, 1, 0],
			[0, 2, 0]
		]);
	});

	it('reads the last-band outer border (points[last] of each section)', () => {
		const edge = outerBorderPolyline(sections, 'last');
		expect(edge.map((v) => v.toArray())).toEqual([
			[1, 0, 0],
			[1, 1, 0],
			[1, 2, 0]
		]);
	});

	it('returns clones, not aliases', () => {
		const edge = outerBorderPolyline(sections, 'first');
		expect(edge[0]).not.toBe(sections[0].points[0]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/fill-bands.test.ts`
Expected: FAIL — `Cannot find module '../fill-bands'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/projection-geometry/fill-bands.ts`:

```typescript
import { Triangle, Vector3 } from 'three';
import type { Section } from './types';

/** Edges shorter than this (Euclidean) are treated as collapsed/degenerate. */
export const FILL_DEGENERATE_EPSILON = 1e-6;

/** True when any edge of the triangle is shorter than FILL_DEGENERATE_EPSILON. */
export const isDegenerateTriangle = (t: Triangle): boolean => {
	const eps2 = FILL_DEGENERATE_EPSILON * FILL_DEGENERATE_EPSILON;
	return (
		t.a.distanceToSquared(t.b) < eps2 ||
		t.b.distanceToSquared(t.c) < eps2 ||
		t.c.distanceToSquared(t.a) < eps2
	);
};

/**
 * The outer-border polyline of a tube's first or last band.
 * 'first' → points[0] of each section; 'last' → points[last] of each section.
 * These are the polygon/cell-bordering ("open space") edges. Returns ordered clones.
 */
export const outerBorderPolyline = (sections: Section[], side: 'first' | 'last'): Vector3[] =>
	sections.map((s) =>
		(side === 'first' ? s.points[0] : s.points[s.points.length - 1]).clone()
	);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/fill-bands.test.ts`
Expected: PASS (all `isDegenerateTriangle` and `outerBorderPolyline` tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/projection-geometry/fill-bands.ts src/lib/projection-geometry/__tests__/fill-bands.test.ts
git commit -m "feat(fillAll): add isDegenerateTriangle and outerBorderPolyline"
```

---

## Task 3: `fill-bands.ts` — `buildFillBand` (fan of real + degenerate facets, wound outward)

**Files:**
- Modify: `src/lib/projection-geometry/fill-bands.ts`
- Test: `src/lib/projection-geometry/__tests__/fill-bands.test.ts`

**Design:** Given a border polyline `[P0..Pk]`, a shared `center` C, and the band `address`, build a
band whose facets, per segment `j`, are:
- real facet `2j`: `Triangle(P_j, P_{j+1}, C)` (2 border vectors + center)
- degenerate facet `2j+1`: `Triangle(P_{j+1}, C, C)` (1 border vector + 2 center; zero area, keeps
  indexing), **explicitly tagged `isDegenerate: true`**.

Wind so real-facet normals point outward (away from `projCenter`): if the first real facet's normal
dots negatively with `(C − projCenter)`, build from the **reversed** polyline. The band is tagged
`isFill: true`, orientation `'axial-right'`. Real facets are NOT tagged degenerate.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/projection-geometry/__tests__/fill-bands.test.ts`:

```typescript
import { buildFillBand } from '../fill-bands';

describe('buildFillBand', () => {
	// Perimeter on the z=1 plane (square ring, 4 points → but use 3 for a 2-segment fan),
	// center below it so outward (= away from origin projCenter) is +z.
	const P0 = new Vector3(-1, -1, 1);
	const P1 = new Vector3(1, -1, 1);
	const P2 = new Vector3(1, 1, 1);
	const center = new Vector3(0, 0, 1);
	const projCenter = new Vector3(0, 0, 0);
	const address = { globule: 0, tube: 3, band: 0 };

	it('produces alternating real and degenerate facets, 2 per segment', () => {
		const band = buildFillBand({ borderEdge: [P0, P1, P2], center, address, projCenter });
		// 2 segments → 4 facets
		expect(band.facets).toHaveLength(4);
		// Geometric reality matches the explicit tag.
		expect(isDegenerateTriangle(band.facets[0].triangle)).toBe(false);
		expect(isDegenerateTriangle(band.facets[1].triangle)).toBe(true);
		expect(isDegenerateTriangle(band.facets[2].triangle)).toBe(false);
		expect(isDegenerateTriangle(band.facets[3].triangle)).toBe(true);
	});

	it('tags degenerate facets explicitly and leaves real facets untagged', () => {
		const band = buildFillBand({ borderEdge: [P0, P1, P2], center, address, projCenter });
		expect(band.facets[0].isDegenerate).toBeFalsy();
		expect(band.facets[1].isDegenerate).toBe(true);
		expect(band.facets[2].isDegenerate).toBeFalsy();
		expect(band.facets[3].isDegenerate).toBe(true);
	});

	it('marks the band isFill and uses axial-right orientation', () => {
		const band = buildFillBand({ borderEdge: [P0, P1, P2], center, address, projCenter });
		expect(band.isFill).toBe(true);
		expect(band.orientation).toBe('axial-right');
		expect(band.facets[0].orientation).toBe('axial-right');
	});

	it('real facets include the center as the third vertex', () => {
		const band = buildFillBand({ borderEdge: [P0, P1, P2], center, address, projCenter });
		expect(band.facets[0].triangle.c.toArray()).toEqual(center.toArray());
	});

	it('assigns sequential facet addresses', () => {
		const band = buildFillBand({ borderEdge: [P0, P1, P2], center, address, projCenter });
		expect(band.facets[0].address).toEqual({ ...address, facet: 0 });
		expect(band.facets[3].address).toEqual({ ...address, facet: 3 });
	});

	it('winds real-facet normals outward (away from projCenter)', () => {
		const band = buildFillBand({ borderEdge: [P0, P1, P2], center, address, projCenter });
		const t = band.facets[0].triangle;
		const normal = new Vector3()
			.subVectors(t.b, t.a)
			.cross(new Vector3().subVectors(t.c, t.a));
		const facetCentroid = new Vector3().addVectors(t.a, t.b).add(t.c).divideScalar(3);
		const toFacet = new Vector3().subVectors(facetCentroid, projCenter);
		expect(normal.dot(toFacet)).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/fill-bands.test.ts`
Expected: FAIL — `buildFillBand` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/projection-geometry/fill-bands.ts`:

```typescript
import type { Facet, FacetOrientation } from '$lib/types';
import type { GlobuleAddress_Band } from './types';

const realFacetNormalDotOutward = (
	p0: Vector3,
	p1: Vector3,
	center: Vector3,
	projCenter: Vector3
): number => {
	const normal = new Vector3().subVectors(p1, p0).cross(new Vector3().subVectors(center, p0));
	const facetCentroid = new Vector3().addVectors(p0, p1).add(center).divideScalar(3);
	return normal.dot(new Vector3().subVectors(facetCentroid, projCenter));
};

/**
 * Build one interior fill band for a polygon/cell border polyline.
 * Real facet per segment = (P_j, P_{j+1}, C); degenerate facet = (P_{j+1}, C, C).
 * Wound so real-facet normals face away from projCenter.
 */
export const buildFillBand = ({
	borderEdge,
	center,
	address,
	projCenter
}: {
	borderEdge: Vector3[];
	center: Vector3;
	address: GlobuleAddress_Band;
	projCenter: Vector3;
}): Band => {
	const orientation: FacetOrientation = 'axial-right';
	// Orient the polyline so the first real facet faces outward.
	let edge = borderEdge;
	if (edge.length >= 2) {
		const dot = realFacetNormalDotOutward(edge[0], edge[1], center, projCenter);
		if (dot < 0) edge = [...borderEdge].reverse();
	}

	const facets: Facet[] = [];
	for (let j = 0; j < edge.length - 1; j++) {
		const pj = edge[j];
		const pj1 = edge[j + 1];
		facets.push({
			triangle: new Triangle(pj.clone(), pj1.clone(), center.clone()),
			address: { ...address, facet: facets.length },
			orientation
		});
		facets.push({
			triangle: new Triangle(pj1.clone(), center.clone(), center.clone()),
			address: { ...address, facet: facets.length },
			orientation,
			isDegenerate: true
		});
	}

	return { facets, orientation, visible: true, isFill: true, address };
};
```

Also add `Band` to the existing imports at the top of `fill-bands.ts` (it is already imported from `$lib/types`; just add `Facet`, `FacetOrientation` and the `GlobuleAddress_Band` import shown above, avoiding a duplicate `Band` import).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/fill-bands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projection-geometry/fill-bands.ts src/lib/projection-geometry/__tests__/fill-bands.test.ts
git commit -m "feat(fillAll): add buildFillBand (outward-wound real+degenerate fan)"
```

---

## Task 4: Remove the old fan implementation

**Files:**
- Delete: `src/lib/projection-geometry/fill-fan.ts`
- Delete: `src/lib/projection-geometry/__tests__/fill-fan.test.ts`
- Modify: `src/lib/projection-geometry/generate-projection.ts` (remove the per-polygon fan block, lines ~1323-1364, and its now-unused imports)

- [ ] **Step 1: Delete the old files**

```bash
git rm src/lib/projection-geometry/fill-fan.ts src/lib/projection-geometry/__tests__/fill-fan.test.ts
```

- [ ] **Step 2: Remove the per-polygon fan block in `generateSurfaceProjectionBands`**

In `src/lib/projection-geometry/generate-projection.ts`, delete the entire block that starts with the comment `// Interior fill bands (fillAll). Each polygon → one dedicated fan Tube (isFill).` and the following `if (projectionConfig.surfaceProjectionConfig?.fillAll) { … }` (the `projection.polygons.forEach` fan loop, ~lines 1323-1364). Leave the partner-matching `try { … }` block that follows it intact (the degenerate-edge guard for it comes in the "partner-matcher degenerate guard" task).

- [ ] **Step 3: Remove now-unused imports**

In `generate-projection.ts`, remove any import of `buildFanSections` / `windFanSectionsOutward` from `./fill-fan`. Leave the `Raycaster` import if still used elsewhere in the file; otherwise remove it. (Run the type-check in the next step to confirm.)

- [ ] **Step 4: Type-check and run existing geometry tests**

Run: `npm run check`
Expected: No references to `./fill-fan` remain. (Pre-existing unrelated errors may persist.)

Run: `npm run test:unit -- src/lib/projection-geometry`
Expected: PASS (no remaining `fill-fan` tests; `fill-bands` tests pass).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(fillAll): remove old per-polygon fan implementation"
```

---

## Task 5: `fill-bands.ts` — `reindexBandAddresses` helper

Inserting fill bands changes every band's array position. Band/facet addresses must be renumbered so
partner matching and addressing stay consistent with position.

**Files:**
- Modify: `src/lib/projection-geometry/fill-bands.ts`
- Test: `src/lib/projection-geometry/__tests__/fill-bands.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/projection-geometry/__tests__/fill-bands.test.ts`:

```typescript
import { buildFillBand, reindexBandAddresses } from '../fill-bands';
import type { Band } from '$lib/types';

describe('reindexBandAddresses', () => {
	it('renumbers each band and its facets to match array position', () => {
		const tubeAddress = { globule: 0, tube: 2 };
		const mk = (band: number): Band => ({
			orientation: 'axial-right',
			facets: [
				{
					triangle: new Triangle(new Vector3(), new Vector3(1, 0, 0), new Vector3(0, 1, 0)),
					orientation: 'axial-right',
					address: { ...tubeAddress, band: 99, facet: 0 }
				}
			],
			address: { ...tubeAddress, band: 99 }
		});
		const bands = [mk(0), mk(0), mk(0)];
		reindexBandAddresses(bands, tubeAddress);
		expect(bands[0].address).toEqual({ ...tubeAddress, band: 0 });
		expect(bands[2].address).toEqual({ ...tubeAddress, band: 2 });
		expect(bands[2].facets[0].address).toEqual({ ...tubeAddress, band: 2, facet: 0 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/fill-bands.test.ts`
Expected: FAIL — `reindexBandAddresses` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/projection-geometry/fill-bands.ts`:

```typescript
import type { GlobuleAddress_Tube } from './types';

/**
 * Rewrite every band's address.band (and each facet's address.band) to match the
 * band's position in the array. Call after inserting/removing bands in a tube.
 */
export const reindexBandAddresses = (bands: Band[], tubeAddress: GlobuleAddress_Tube): void => {
	bands.forEach((band, b) => {
		band.address = { ...tubeAddress, band: b };
		band.facets.forEach((facet) => {
			if (facet.address) facet.address = { ...facet.address, ...tubeAddress, band: b };
		});
	});
};
```

(Ensure `Band` and `GlobuleAddress_Tube` are imported in `fill-bands.ts` — `Band` from `$lib/types`,
`GlobuleAddress_Tube` from `./types`. Merge with existing imports; no duplicates.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/fill-bands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projection-geometry/fill-bands.ts src/lib/projection-geometry/__tests__/fill-bands.test.ts
git commit -m "feat(fillAll): add reindexBandAddresses helper"
```

---

## Task 6: surfaceProjection integration — build + insert fill bands (pre-partner)

**Files:**
- Modify: `src/lib/projection-geometry/generate-projection.ts` (`generateSurfaceProjectionBands`,
  function starts at line 1223)

**Approach:** track per-tube which polygon each outer band borders (accounting for the winding
reverse), then after the tube loop and **before** partner matching, build one fill band per outer
band and insert it (first prepended, last appended), then renumber band addresses.

This task is a code change with no new unit test; it is verified by `npm run check`, the existing
geometry tests, and the manual verification task at the end. (The pure pieces it relies on —
`outerBorderPolyline`, `buildFillBand`, `reindexBandAddresses` — are already unit-tested.)

- [ ] **Step 1: Import the fill helpers**

At the top of `generate-projection.ts`, add to the imports:

```typescript
import { buildFillBand, outerBorderPolyline, reindexBandAddresses } from './fill-bands';
```

Ensure `Raycaster` is imported from `three` (it may have been removed in Task 4; re-add it to the
`three` import if missing). `Band` is already imported in this file.

- [ ] **Step 2: Add a per-tube fill-metadata accumulator**

In `generateSurfaceProjectionBands`, just after `const tubes: Tube[] = [];` (line 1229), add:

```typescript
	// For fillAll: which polygon each tube's first/last outer band borders.
	const fillMeta: { firstPolygon: number; lastPolygon: number }[] = [];
```

- [ ] **Step 3: Capture the winding result and record polygon membership**

In the tube loop, the current winding block (around lines 1305-1308) reads:

```typescript
		if (testNormal.dot(toFacet) < 0) {
			// Reverse point order in each section to fix winding
			sections.forEach((s) => s.points.reverse());
		}
```

Change it to capture the boolean:

```typescript
		const reversed = testNormal.dot(toFacet) < 0;
		if (reversed) {
			// Reverse point order in each section to fix winding
			sections.forEach((s) => s.points.reverse());
		}
```

Then, immediately after `tubes.push(tube);` (line 1320), add:

```typescript
		// After winding, band 0 = sections.points[0]; if reversed that is em1's polygon.
		fillMeta.push({
			firstPolygon: reversed ? em1.polygonIndex : em0.polygonIndex,
			lastPolygon: reversed ? em0.polygonIndex : em1.polygonIndex
		});
```

- [ ] **Step 4: Build + insert fill bands after the loop, before partner matching**

Immediately after the tube loop closes (where the old fan block was removed in Task 4) and **before**
the `// Partner matching for flat surface projection geometry.` try block, insert:

```typescript
	// Interior fill bands (fillAll). One fill band per outer (open-space-bordering) band,
	// prepended before band 0 and appended after the last band of each tube, sharing one
	// per-polygon center point on the surface. Built before partner matching so the fill
	// bands are addressed and partnered as first-class bands.
	if (projectionConfig.surfaceProjectionConfig?.fillAll) {
		const fillRay = new Raycaster(undefined, undefined, undefined, 2000);

		// Per-polygon apex: average the polygon's inner-curve points, ray-cast onto the surface.
		const polygonApex: (Vector3 | undefined)[] = projection.polygons.map((poly) => {
			const pts = poly.edges.flatMap((e) => e.sections.map((s) => s.intersections.curve));
			if (pts.length === 0) return undefined;
			const avg = pts.reduce((acc, p) => acc.add(p), new Vector3()).divideScalar(pts.length);
			fillRay.set(projCenter, avg.clone().sub(projCenter).normalize());
			const hit = fillRay.intersectObject(surface, true)[0];
			if (!hit) console.warn('fillAll: polygon centroid ray missed surface; using averaged point');
			return hit ? hit.point.clone() : avg;
		});

		tubes.forEach((tube, t) => {
			const meta = fillMeta[t];
			const firstApex = polygonApex[meta.firstPolygon];
			const lastApex = polygonApex[meta.lastPolygon];
			const firstEdge = outerBorderPolyline(tube.sections, 'first');
			const lastEdge = outerBorderPolyline(tube.sections, 'last');

			const newBands: Band[] = [];
			if (firstApex && firstEdge.length >= 2) {
				newBands.push(
					buildFillBand({
						borderEdge: firstEdge,
						center: firstApex,
						address: { ...tube.address, band: 0 },
						projCenter
					})
				);
			}
			newBands.push(...tube.bands);
			if (lastApex && lastEdge.length >= 2) {
				newBands.push(
					buildFillBand({
						borderEdge: lastEdge,
						center: lastApex,
						address: { ...tube.address, band: 0 },
						projCenter
					})
				);
			}
			tube.bands = newBands;
			reindexBandAddresses(tube.bands, tube.address);
		});
	}
```

- [ ] **Step 5: Type-check and run geometry tests**

Run: `npm run check`
Expected: no new errors in `generate-projection.ts`.

Run: `npm run test:unit -- src/lib/projection-geometry`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projection-geometry/generate-projection.ts
git commit -m "feat(fillAll): build and insert surfaceProjection fill bands before partner matching"
```

---

## Task 7: voronoiSurface integration — build + insert fill bands (pre-partner)

**Files:**
- Modify: `src/lib/voronoi/generate-voronoi.ts` (`makeVoronoi`, lines 285-492)

**Approach:** identical shape to Task 6, but the per-cell center is the cell **seed** ray-cast onto
the surface (the seed is 2D parameter-space — it is NOT already a 3D point). Cell membership comes
from each edge's `cellIndices`.

Verified facts: `relaxedSeeds[i]` is `[number, number]`; `coordToDirection(lon, lat)` returns a
`Vector3` direction; `intersect(direction)` returns `Vector3 | undefined` (the surface hit);
`center` (line 296) is the surface center to use as `projCenter`. The spTube winding reverse is at
lines 463-465; spTubes are pushed at 468-473.

- [ ] **Step 1: Import the fill helpers**

At the top of `generate-voronoi.ts`, add:

```typescript
import {
	buildFillBand,
	outerBorderPolyline,
	reindexBandAddresses
} from '$lib/projection-geometry/fill-bands';
import type { Band } from '$lib/types';
```

(If `Band` is already imported, merge rather than duplicate.)

- [ ] **Step 2: Add a per-spTube fill-metadata accumulator**

Just after `const surfaceProjectionTubes: Tube[] = [];` (line 312), add:

```typescript
	// For fillAll: which cell each spTube's first/last outer band borders.
	const spFillMeta: { firstCell: number; lastCell: number }[] = [];
```

- [ ] **Step 3: Capture winding and record cell membership**

The spTube winding block (lines 463-465) currently reads:

```typescript
		if (testNormal.dot(toFacet) < 0) {
			spSections.forEach((s) => s.points.reverse());
		}
```

Change to capture the boolean:

```typescript
		const spReversed = testNormal.dot(toFacet) < 0;
		if (spReversed) {
			spSections.forEach((s) => s.points.reverse());
		}
```

Then immediately after the `surfaceProjectionTubes.push({ … });` call (ends line 473), add:

```typescript
		// After winding, band 0 = spSections.points[0]; if reversed that is cell B (cellIdxB).
		spFillMeta.push({
			firstCell: spReversed ? cellIdxB : cellIdxA,
			lastCell: spReversed ? cellIdxA : cellIdxB
		});
```

(`cellIdxA`/`cellIdxB` are in scope from line 320: `const [cellIdxA, cellIdxB] = voronoiEdge.cellIndices;`.)

- [ ] **Step 4: Build + insert fill bands before spTube partner matching**

The current spTube partner-matching block is at lines 484-489:

```typescript
	try {
		matchTubeEnds(surfaceProjectionTubes);
		matchFacets(surfaceProjectionTubes);
	} catch (error) {
		console.error('Voronoi surface projection partner matching error:', error);
	}
```

**Before** that block, insert:

```typescript
	// Interior fill bands (fillAll). One fill band per outer (open-space-bordering) band of each
	// spTube, sharing one per-cell center (the cell seed ray-cast onto the surface). Built before
	// partner matching so fill bands are addressed and partnered as first-class bands.
	if (config.fillAll) {
		const averageOf = (pts: Vector3[]): Vector3 =>
			pts.reduce((acc, p) => acc.add(p.clone()), new Vector3()).divideScalar(pts.length);

		// Per-cell apex: ray-cast the seed direction onto the surface.
		const cellApex: (Vector3 | undefined)[] = relaxedSeeds.map((seed) =>
			intersect(coordToDirection(seed[0], seed[1]))
		);

		surfaceProjectionTubes.forEach((tube, t) => {
			const meta = spFillMeta[t];
			const firstEdge = outerBorderPolyline(tube.sections, 'first');
			const lastEdge = outerBorderPolyline(tube.sections, 'last');
			const firstApex =
				cellApex[meta.firstCell] ?? (firstEdge.length ? averageOf(firstEdge) : undefined);
			const lastApex =
				cellApex[meta.lastCell] ?? (lastEdge.length ? averageOf(lastEdge) : undefined);

			const newBands: Band[] = [];
			if (firstApex && firstEdge.length >= 2) {
				newBands.push(
					buildFillBand({
						borderEdge: firstEdge,
						center: firstApex,
						address: { ...tube.address, band: 0 },
						projCenter: center
					})
				);
			}
			newBands.push(...tube.bands);
			if (lastApex && lastEdge.length >= 2) {
				newBands.push(
					buildFillBand({
						borderEdge: lastEdge,
						center: lastApex,
						address: { ...tube.address, band: 0 },
						projCenter: center
					})
				);
			}
			tube.bands = newBands;
			reindexBandAddresses(tube.bands, tube.address);
		});
	}
```

- [ ] **Step 5: Type-check and run voronoi tests**

Run: `npm run check`
Expected: no new errors in `generate-voronoi.ts`.

Run: `npm run test:unit -- src/lib/voronoi`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/voronoi/generate-voronoi.ts
git commit -m "feat(fillAll): build and insert voronoiSurface fill bands before partner matching"
```

---

## Task 8: Flatten-path degenerate guard (`getFlatStripV2`)

The flatten path uses law-of-cosines (`Vector3.angleTo` + division by edge length) per facet, chained
facet-to-facet. A degenerate facet yields `NaN`, poisoning the entire band's 2D coordinates. Guard it
by reading the **explicit `facet.isDegenerate` tag** — when set, copy the previous flat facet's
geometry into the degenerate slot (zero rotation, no NaN) instead of flattening.

**Files:**
- Modify: `src/lib/cut-pattern/generate-cut-pattern.ts` (`getFlatStripV2`, lines 652-698)
- Test: `src/lib/cut-pattern/__tests__/flatten-degenerate.test.ts` (create)

**Verified facts:** `getFlatStripV2` maps `geometry.facets` to `flatFacets` (line 667). For `i > 0` it
derives `base` from `previousFlatFacet` and calls `getFlatTriangle({ triangle: facet.triangle, base })`
(line 690), then sets `previousFlatFacet = alignedFacet.triangle` (line 691). A fill band always
starts with a real facet (index 0), so a degenerate facet always has a valid `previousFlatFacet`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/__tests__/flatten-degenerate.test.ts`:

```typescript
import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';
import type { Band } from '$lib/types';
import { getFlatStripV2 } from '../generate-cut-pattern';

const allFinite = (t: Triangle): boolean =>
	[t.a, t.b, t.c].every((v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z));

describe('getFlatStripV2 with degenerate fill facets', () => {
	// Fan band: real (P0,P1,C), degenerate (P1,C,C), real (P1,P2,C), degenerate (P2,C,C).
	const P0 = new Vector3(0, 0, 0);
	const P1 = new Vector3(1, 0, 0);
	const P2 = new Vector3(2, 0, 0);
	const C = new Vector3(1, -1, 0);
	const band: Band = {
		orientation: 'axial-right',
		isFill: true,
		facets: [
			{ triangle: new Triangle(P0.clone(), P1.clone(), C.clone()), orientation: 'axial-right' },
			{
				triangle: new Triangle(P1.clone(), C.clone(), C.clone()),
				orientation: 'axial-right',
				isDegenerate: true
			},
			{ triangle: new Triangle(P1.clone(), P2.clone(), C.clone()), orientation: 'axial-right' },
			{
				triangle: new Triangle(P2.clone(), C.clone(), C.clone()),
				orientation: 'axial-right',
				isDegenerate: true
			}
		]
	};

	it('produces only finite coordinates (no NaN)', () => {
		const flat = getFlatStripV2(band, { bandStyle: 'helical-right' });
		expect(flat.facets).toHaveLength(4);
		for (const f of flat.facets) {
			expect(allFinite(f.triangle)).toBe(true);
		}
	});

	it('leaves a normal band unchanged in finiteness', () => {
		const normal: Band = {
			orientation: 'axial-right',
			facets: [
				{ triangle: new Triangle(P0.clone(), P1.clone(), C.clone()), orientation: 'axial-right' },
				{ triangle: new Triangle(P1.clone(), C.clone(), P2.clone()), orientation: 'axial-right' }
			]
		};
		const flat = getFlatStripV2(normal, { bandStyle: 'helical-right' });
		for (const f of flat.facets) expect(allFinite(f.triangle)).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/flatten-degenerate.test.ts`
Expected: FAIL — the degenerate-facet test produces NaN coordinates.

- [ ] **Step 3: Add the guard in `getFlatStripV2`**

In `src/lib/cut-pattern/generate-cut-pattern.ts`, the per-facet map body (lines 688-693) currently is:

```typescript
		// Use getFlatTriangle to get the aligned triangle
		const alignedFacet = { ...facet };
		alignedFacet.triangle = getFlatTriangle({ triangle: facet.triangle, base });
		previousFlatFacet = alignedFacet.triangle;

		return alignedFacet;
```

Replace with a tag-gated branch that collapses degenerate facets onto the shared base edge instead of
flattening (no `getFlatTriangle`, no NaN):

```typescript
		// Use getFlatTriangle to get the aligned triangle
		const alignedFacet = { ...facet };
		if (facet.isDegenerate) {
			// Synthetic zero-area fill facet: do not run law-of-cosines (it divides by a
			// zero-length edge → NaN, poisoning the whole strip). Place the two collapsed
			// vertices coincident on the shared base edge so the facet occupies its quad
			// slot with finite coordinates and contributes zero rotation.
			const flat = new Triangle(base.v0.clone(), base.v1.clone(), base.v1.clone());
			alignedFacet.triangle = flat;
		} else {
			alignedFacet.triangle = getFlatTriangle({ triangle: facet.triangle, base });
		}
		previousFlatFacet = alignedFacet.triangle;

		return alignedFacet;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/flatten-degenerate.test.ts`
Expected: PASS (all finite).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cut-pattern/generate-cut-pattern.ts src/lib/cut-pattern/__tests__/flatten-degenerate.test.ts
git commit -m "feat(fillAll): guard getFlatStripV2 against tagged degenerate facets"
```

---

## Task 9: Partner-matcher degenerate guard

Partner matchers compare facet triangles; tagged-degenerate facets must be skipped so they neither
crash nor produce false partners. Guard reads `facet.isDegenerate`.

**Files:**
- Modify: `src/lib/projection-geometry/generate-projection.ts`:
  - `matchFacets` (line 862) — used by voronoi spTubes
  - `matchSurfaceProjectionCrossBandPartners` (line ~1391), `matchSurfaceProjectionSequentialPartners`
    (~1429), `matchSurfaceProjectionTubeEnds` (~1485) — these previously skipped whole `isFill` tubes
    via `if (tube.isFill) return;`, which no longer compiles (Tube has no `isFill`).

- [ ] **Step 1: Guard `matchFacets`**

In `matchFacets` (line 862), the body iterates `band.facets.forEach((facet, facetIndex) => { … })`.
Add an early return at the top of that callback:

```typescript
			band.facets.forEach((facet, facetIndex) => {
				if (facet.isDegenerate) return; // synthetic fill facet — never partner-matched
				const { triangle } = facet;
				// …existing body unchanged…
			});
```

- [ ] **Step 2: Replace the old tube-level `isFill` guards with facet-level guards**

In each of `matchSurfaceProjectionCrossBandPartners`, `matchSurfaceProjectionSequentialPartners`, and
`matchSurfaceProjectionTubeEnds`, the line `if (tube.isFill) return;` no longer compiles. Remove that
line in each function and instead skip degenerate facets where facets are iterated. Concretely:

In `matchSurfaceProjectionCrossBandPartners` (the `for (const facetA of bandA.facets) { … }` /
`for (const facetB of bandB.facets) { … }` loops), add at the top of each loop body:

```typescript
					for (const facetA of bandA.facets) {
						if (facetA.isDegenerate) continue;
						if (!facetA.address) continue;
						for (const facetB of bandB.facets) {
							if (facetB.isDegenerate) continue;
							if (!facetB.address) continue;
							// …existing body unchanged…
```

In `matchSurfaceProjectionSequentialPartners` (the `band.facets.forEach((facet, f) => { … })` loop),
add at the top:

```typescript
				band.facets.forEach((facet, f) => {
					if (facet.isDegenerate) return;
					if (!facet.address) return;
					// …existing body unchanged…
```

In `matchSurfaceProjectionTubeEnds` (where end facets are collected: `tube.bands.forEach((band, b) =>
{ … endFacets.push(...) })`), guard the pushes so degenerate end facets are not collected:

```typescript
			tube.bands.forEach((band, b) => {
				const fc = band.facets.length;
				if (fc > 0 && !band.facets[0].isDegenerate)
					endFacets.push({ facet: band.facets[0], tube: t, band: b, pos: 'first' });
				if (fc > 0 && !band.facets[fc - 1].isDegenerate)
					endFacets.push({ facet: band.facets[fc - 1], tube: t, band: b, pos: 'last' });
			});
```

(Also delete the now-removed `if (tube.isFill) return;` line that was at the top of each of these
three functions.)

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: no `tube.isFill` references remain; no new errors in `generate-projection.ts`.

- [ ] **Step 4: Run geometry tests**

Run: `npm run test:unit -- src/lib/projection-geometry src/lib/voronoi`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projection-geometry/generate-projection.ts
git commit -m "feat(fillAll): skip tagged-degenerate facets in partner matchers"
```

---

## Task 10: Drop fill *bands* for non-outlined patterns

`generateProjectionPattern` previously filtered fill *tubes*. Fill is now a *band*; drop fill bands
within tubes when the pattern type is not outlined.

**Files:**
- Modify: `src/lib/cut-pattern/generate-pattern.ts` (lines 127-131)

- [ ] **Step 1: Replace the tube filter with a band filter**

The current block (lines 127-131) is:

```typescript
	// fillAll produces interior fan tubes with one degenerate facet per quad.
	// Tiled/panel patterns cannot tile degenerate facets — keep fill tubes for outlined only.
	const effectiveTubes = isOutlinedPatternConfig(patternTypeConfig)
		? tubes
		: tubes.filter((t) => !t.isFill);
```

Replace with:

```typescript
	// fillAll produces interior fill BANDS (one degenerate facet per quad) inside normal tubes.
	// Tiled/panel patterns cannot tile degenerate facets — keep fill bands for outlined only.
	const effectiveTubes = isOutlinedPatternConfig(patternTypeConfig)
		? tubes
		: tubes.map((t) => ({ ...t, bands: t.bands.filter((b) => !b.isFill) }));
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors; no remaining references to `t.isFill`.

- [ ] **Step 3: Run cut-pattern tests**

Run: `npm run test:unit -- src/lib/cut-pattern`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/cut-pattern/generate-pattern.ts
git commit -m "feat(fillAll): drop fill bands (not tubes) for tiled/panel patterns"
```

---

## Task 11: One shared "fill all" toggle for both sources

Show the existing "fill all" checkbox for **both** `surfaceProjection` and `voronoiSurface`, writing
to the matching config (`surfaceProjectionConfig.fillAll` or `voronoiConfig.fillAll`).

**Files:**
- Modify: `src/components/cut-pattern/CutPatternControl.svelte` (lines 116-150)

**Verified facts:** `superConfigStore` is imported (line 4). `SuperGlobuleConfig.voronoiConfig` exists
(`src/lib/types.ts:918`). `VoronoiConfig.fillAll` was added in Task 1. `patternSource` lives at
`$patternConfigStore.patternViewConfig.patternSource`.

- [ ] **Step 1: Generalize the gate and the checkbox**

Replace the block at lines 116-150 (the `{#if patternSource === 'surfaceProjection' …}` through its
closing `{/if}`) with one that handles both sources. Keep the `divisions` input gated to
`surfaceProjection` (voronoi divisions are edited elsewhere, in `VoronoiControl.svelte`), but show the
`fill all` checkbox for both:

```svelte
		{#if $patternConfigStore.patternViewConfig.patternSource === 'surfaceProjection' && $superConfigStore.projectionConfigs[0]?.surfaceProjectionConfig}
			<NumberInput
				label="divisions"
				min={0}
				max={5}
				step={1}
				bind:value={$superConfigStore.projectionConfigs[0].surfaceProjectionConfig.divisions}
			/>
			<label>
				fill all
				<input
					type="checkbox"
					checked={$superConfigStore.projectionConfigs[0].surfaceProjectionConfig.fillAll ?? false}
					on:change={(e) => {
						const checked = (e.currentTarget as HTMLInputElement).checked;
						$superConfigStore = {
							...$superConfigStore,
							projectionConfigs: $superConfigStore.projectionConfigs.map((pc, i) =>
								i === 0
									? {
											...pc,
											surfaceProjectionConfig: { ...pc.surfaceProjectionConfig!, fillAll: checked }
										}
									: pc
							)
						};
					}}
				/>
			</label>
		{:else if $patternConfigStore.patternViewConfig.patternSource === 'voronoiSurface' && $superConfigStore.voronoiConfig}
			<label>
				fill all
				<input
					type="checkbox"
					checked={$superConfigStore.voronoiConfig.fillAll ?? false}
					on:change={(e) => {
						const checked = (e.currentTarget as HTMLInputElement).checked;
						$superConfigStore = {
							...$superConfigStore,
							voronoiConfig: { ...$superConfigStore.voronoiConfig!, fillAll: checked }
						};
					}}
				/>
			</label>
		{/if}
```

- [ ] **Step 2: Type-check and build**

Run: `npm run check`
Expected: no new errors in `CutPatternControl.svelte`.

Run: `npm run build`
Expected: build succeeds (catches Svelte event-syntax issues `check` misses).

- [ ] **Step 3: Commit**

```bash
git add src/components/cut-pattern/CutPatternControl.svelte
git commit -m "feat(fillAll): show shared fill-all toggle for voronoiSurface and surfaceProjection"
```

---

## Task 12: Manual verification (visual)

No code; confirm behavior end-to-end. Record results in the commit message of any follow-up fix.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: surfaceProjection, outlined, fillAll on**

In the cut-pattern view: pattern source = **Surface**, pattern type = **outlined**, check **fill all**.
Expected: each polygon interior renders as a triangle fan — **one visible triangle per real facet**
(spokes from the center to each border vertex), NOT a single collapsed polygon outline. Toggle
**divisions** 0 → 2: fan still correct; only the strut bands gain divisions.

- [ ] **Step 3: voronoiSurface, outlined, fillAll on**

Pattern source = **Voronoi Surface**, pattern type = **outlined**, check **fill all**.
Expected: each cell interior renders as a triangle fan, same as above.

- [ ] **Step 4: Off / non-outlined**

Uncheck **fill all** → interiors empty (unchanged). With fill all on, switch pattern type to a
**tiled** pattern and to **panel** → no fill geometry, no crash, no NaN paths.

- [ ] **Step 5: Console check**

Open the browser console. Expected: no NaN/`Infinite` warnings from path building; at most the
benign `fillAll: … ray missed surface` warning if a centroid ray misses.

---

## Self-Review notes (for the executor)

- **Spec coverage:** config+UI (Tasks 1, 11), new module (Tasks 2-3, 5), remove old (Task 4),
  surfaceProjection integration (Task 6), voronoi integration (Task 7), flatten guard (Task 8),
  partner guards (Task 9), outlined-only gating (Task 10), tests throughout, manual verify (Task 12).
- **Explicit degenerate tagging:** `Facet.isDegenerate` is set only in `buildFillBand` (Task 3) and
  read by the flatten guard (Task 8) and partner guards (Task 9). No geometric degeneracy detection
  in production paths.
- **Type consistency:** helper names used consistently — `outerBorderPolyline`, `buildFillBand`,
  `reindexBandAddresses`, `isDegenerateTriangle`, `FILL_DEGENERATE_EPSILON`. `buildFillBand` params:
  `{ borderEdge, center, address, projCenter }`. Band marker `isFill`; facet marker `isDegenerate`.
