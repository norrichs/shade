# surfaceProjection `fillAll` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `fillAll` config flag that, when true, generates an interior triangle-fan "fill band" for each surface-projection polygon (outer ring = polygon interior perimeter, inner ring collapsed to the polygon's centroid surface point), preserving the 2-facets-per-quad structure via one real + one degenerate facet per fan quad, and rendered only in `outlined` pattern mode.

**Architecture:** The fan is built from pure, testable functions (`buildFanSections`, `windFanSectionsOutward`, `isDegenerateEdge`) that produce `Section[]` consumed by the existing `generateProjectionBands(sections, 'axial-right', addr)` band builder. Each polygon's fan is emitted as its own dedicated `Tube` (tagged `isFill: true`) appended to `surfaceProjectionTubes` inside `generateSurfaceProjectionBands`. Downstream, `generateProjectionPattern` keeps fill tubes only for `outlined` pattern configs (dropped for tiled/panel), and `buildOutlinePath` in `generate-outlined-pattern.ts` skips zero-length collapsed-centroid edges via an epsilon guard. The centroid surface point is found with the same `Raycaster.intersectObject(surface, true)` pattern used in `generateProjection`.

**Tech Stack:** TypeScript, Three.js (`Vector3`, `Triangle`, `Raycaster`, `Object3D`), SvelteKit, Jest (colocated `__tests__`), Web Worker (serialization-safe geometry).

---

## File Structure

| File | Create/Modify | Responsibility |
| --- | --- | --- |
| `src/lib/projection-geometry/types.ts` | Modify | Add `fillAll?: boolean` to `SurfaceProjectionConfig`; add `isFill?: boolean` to `Tube`. |
| `src/lib/projection-geometry/fill-fan.ts` | Create | Pure fan-construction helpers: `buildFanSections`, `windFanSectionsOutward`, `isDegenerateEdge`, `FAN_DEGENERATE_EPSILON`. |
| `src/lib/projection-geometry/__tests__/fill-fan.test.ts` | Create | Unit tests for the pure fan helpers (layout, degeneracy, winding). |
| `src/lib/projection-geometry/generate-projection.ts` | Modify | In `generateSurfaceProjectionBands`: accept `surface`; after edge tubes, when `fillAll`, build a fill `Tube` per polygon from `buildFanSections` + `generateProjectionBands`. Pass `surface` from `makeProjection`. |
| `src/lib/cut-pattern/generate-pattern.ts` | Modify | In `generateProjectionPattern`, drop `isFill` tubes unless `isOutlinedPatternConfig(patternTypeConfig)`. |
| `src/lib/cut-pattern/generate-outlined-pattern.ts` | Modify | In `buildOutlinePath`, skip emitting `L` segments to a point coincident (within epsilon) with the current pen position (degenerate collapsed edges). |
| `src/lib/cut-pattern/__tests__/build-outline-path-degenerate.test.ts` | Create | Unit test that a degenerate fan quad produces a valid closed path with no zero-length `L`. |

---

## Verified facts (do not re-derive; cited for the implementer)

- `Section = { points: Vector3[] }` and `Tube = { bands; sections; orientation; address }` — `src/lib/projection-geometry/types.ts:221-234`.
- `SurfaceProjectionConfig = { divisions: number }` — `src/lib/projection-geometry/types.ts:184-186`. `fillAll` goes here. (`surfaceProjectionConfig` is only read at `generate-projection.ts:472`; it is never written in current code, so `divisions`/`fillAll` default via `?? 0` / `?? false`.)
- `generateProjectionBands(sections, 'axial-right', tubeAddress)` (`generate-projection.ts:665-733`) with `sectionLength = sections[0].points.length`: produces `sectionLength - 1` bands; for each band index `f` it loops `s` from `0..sections.length-2` calling `generateFacetPair`.
- `generateFacetPair` axial-right (`generate-projection.ts:640-661`) at `(sectionIndex=s, pointIndex=f)` emits:
  - facet 1: `(sections[s].points[f], sections[s].points[f+1], sections[s+1].points[f])`
  - facet 2: `(sections[s+1].points[f+1], sections[s+1].points[f], sections[s].points[f+1])`
- Winding check pattern in `generateSurfaceProjectionBands` (`generate-projection.ts:1289-1306`): cross product of first facet edges, dot with `(facetCentroid - projCenter)`; if `< 0`, reverse each section's `points`.
- Surface intersector pattern (`generate-projection.ts:461-507`, and `createSurfaceIntersector` `voronoi/generate-voronoi.ts:43-53`): `raycaster.set(center, dir.clone().normalize()); raycaster.intersectObject(surface, true)`; take `hits[0].point.clone()` or `null`.
- `makeProjection` (`generate-projection.ts:1474-1510`) builds `surface` (line 1486) then calls `generateSurfaceProjectionBands(projection, projectionConfig, address)` (line 1498). `surface` is in scope to thread through.
- `projCenter` derivation already present at `generate-projection.ts:1246-1249` (GlobuleConfig → origin; else `getVector3(surfaceConfig.center)`).
- Polygon perimeter inner-curve points: for polygon `projection.polygons[pi]`, each `edge` has `sections[k].intersections.curve` (Vector3). The polygon's interior perimeter point per edge is its first section's curve point `edge.sections[0].intersections.curve`. Edges are already in winding order within `polygon.edges` (the edge-pairing in `generateSurfaceProjectionBands:1232-1239` derives `v0` from the previous edge's `vertex1`, confirming sequential winding). Use `edge.sections[0].intersections.curve` per edge, in `edge` order, as the fan outer ring.
- `generateProjectionPattern` (`generate-pattern.ts:116-134`) branches: `isOutlinedPatternConfig(patternTypeConfig)` → outlined; else panel/tiled. This is the gate point for dropping fill tubes.
- `isOutlinedPatternConfig` / `isTiledPatternConfig` exported from `src/lib/types.ts:639-642`.
- `buildOutlinePath` (`generate-outlined-pattern.ts:383-437`) emits `['M', start.x, start.y]` then `['L', edges[i].end.x, edges[i].end.y]` per edge (or a tab). The pen position after edge `i` is `edges[i].end`; the collapsed centroid edges are where `end` coincides with the prior point.
- `getQuadrilaterals` axial-right (`quadrilateral.ts:317-371`) builds each quad from a facet pair `{ a: f0.a, b: f0.b, c: f1.a, d: f0.c }`. For a fan band where facet0=`(P_k, C, P_{k+1})` and facet1 is degenerate, the quad collapses two vertices onto `C`. The epsilon guard in `buildOutlinePath` handles the resulting zero-length outline edges.
- `Tube` rehydration in `workerStore.ts:93-107` spreads `...tube`, so a primitive `isFill: boolean` survives postMessage + rehydration automatically (no rehydration change needed).
- Jest test style: colocated under `**/__tests__/**/*.test.ts`, `import { ... } from '../<module>'`, `describe`/`test`/`expect` (see `src/lib/cut-pattern/__tests__/label-outline-path.test.ts`). Run one: `npm run test:unit -- <path>`. Type check: `npm run check`.

---

## Section.points layout for the collapsed fan (CONFIRMED)

For `m` perimeter points `P_0..P_{m-1}` and centroid `C`, build **`m+1` sections, each with exactly 2 points**:

```
sections[k] = { points: [ P_k, C ] }   for k in 0..m-1
sections[m] = { points: [ P_0, C ] }   // wrap-around closes the fan
```

With `sectionLength = 2`, `generateProjectionBands(sections, 'axial-right', addr)` produces **1 band** (`sectionLength - 1 = 1`) containing `2 * (sections.length - 1) = 2*m` facets — `m` quads, each:

- facet `2j` (real): `(sections[j].points[0], sections[j].points[1], sections[j+1].points[0])` = `(P_j, C, P_{j+1})`
- facet `2j+1` (degenerate): `(sections[j+1].points[1], sections[j+1].points[0], sections[j].points[1])` = `(C, P_{j+1}, C)` — zero area.

This preserves the 2-facets-per-quad contract with exactly one degenerate facet per quad.

## Own-tube-vs-band decision (CONFIRMED)

**Each polygon's fan is its own dedicated `Tube`** (single band), tagged `isFill: true`, appended to `surfaceProjectionTubes` after the edge tubes. Rationale (per spec): keeps addressing clean, does not disturb edge-tube band indices, and makes the downstream `outlined`-only filter a simple `tube.isFill` check.

## Resolved open details

- **Centroid ray-cast miss fallback:** if `intersectObject` returns no hit, fall back to the averaged 3D perimeter point and `console.warn` (matches spec). Fan still builds.
- **Degenerate-edge epsilon:** `FAN_DEGENERATE_EPSILON = 1e-6` (squared-distance compare in 2D for the outline guard; 3D for `isDegenerateEdge`). Distinct from `isSameVector3`'s `1/10_000` partner-matching precision — the outline guard must be much tighter to avoid skipping genuine short edges.
- **Partner/tab metadata:** left empty for fill bands in v1 (best-effort, out of scope). Fill tubes are simply not passed through `matchSurfaceProjection*` matchers. Degenerate facets therefore never reach partner matching. (Verify visually before any future metadata work.)

---

### Task 1: Config + Tube type additions

**Files:**
- Modify `src/lib/projection-geometry/types.ts:184-186` (`SurfaceProjectionConfig`) and `:225-234` (`Tube`).
- Test: none (pure type change; covered by `npm run check`).

- [ ] Add `fillAll?: boolean;` to `SurfaceProjectionConfig`:
  ```ts
  export type SurfaceProjectionConfig = {
  	divisions: number;
  	fillAll?: boolean;
  };
  ```
- [ ] Add `isFill?: boolean;` to `Tube` (after `address`):
  ```ts
  export type Tube = {
  	bands: Band[];
  	sections: Section[];
  	orientation: FacetOrientation;
  	address: GlobuleAddress_Tube;
  	isFill?: boolean;
  };
  ```
- [ ] Run: `npm run check` — expected: passes (no callers broken; both fields optional).
- [ ] Commit:
  ```bash
  git add src/lib/projection-geometry/types.ts
  git commit -m "feat(fillAll): add fillAll config flag and Tube.isFill marker"
  ```

---

### Task 2: Pure `isDegenerateEdge` guard (TDD)

**Files:**
- Create `src/lib/projection-geometry/fill-fan.ts`.
- Test: `src/lib/projection-geometry/__tests__/fill-fan.test.ts`.

- [ ] Write failing test in `src/lib/projection-geometry/__tests__/fill-fan.test.ts`:
  ```ts
  import { Vector3 } from 'three';
  import { isDegenerateEdge, FAN_DEGENERATE_EPSILON } from '../fill-fan';

  describe('isDegenerateEdge', () => {
  	test('returns true for coincident points', () => {
  		const p = new Vector3(1, 2, 3);
  		expect(isDegenerateEdge(p, p.clone())).toBe(true);
  	});
  	test('returns true for points within epsilon', () => {
  		const a = new Vector3(0, 0, 0);
  		const b = new Vector3(FAN_DEGENERATE_EPSILON / 10, 0, 0);
  		expect(isDegenerateEdge(a, b)).toBe(true);
  	});
  	test('returns false for clearly distinct points', () => {
  		expect(isDegenerateEdge(new Vector3(0, 0, 0), new Vector3(1, 0, 0))).toBe(false);
  	});
  });
  ```
- [ ] Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/fill-fan.test.ts` — expected: FAIL (`Cannot find module '../fill-fan'`).
- [ ] Implement minimal `src/lib/projection-geometry/fill-fan.ts`:
  ```ts
  import { Vector3 } from 'three';

  /** Edges shorter than this (Euclidean) are treated as collapsed/degenerate. */
  export const FAN_DEGENERATE_EPSILON = 1e-6;

  /** True when two points are coincident within FAN_DEGENERATE_EPSILON. */
  export const isDegenerateEdge = (a: Vector3, b: Vector3): boolean =>
  	a.distanceToSquared(b) < FAN_DEGENERATE_EPSILON * FAN_DEGENERATE_EPSILON;
  ```
- [ ] Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/fill-fan.test.ts` — expected: PASS.
- [ ] Commit:
  ```bash
  git add src/lib/projection-geometry/fill-fan.ts src/lib/projection-geometry/__tests__/fill-fan.test.ts
  git commit -m "feat(fillAll): add isDegenerateEdge guard with tests"
  ```

---

### Task 3: Pure `buildFanSections` (TDD)

**Files:**
- Modify `src/lib/projection-geometry/fill-fan.ts`.
- Test: append to `src/lib/projection-geometry/__tests__/fill-fan.test.ts`.

- [ ] Append failing test:
  ```ts
  import { buildFanSections } from '../fill-fan';
  import { generateProjectionBands } from '../generate-projection';

  describe('buildFanSections', () => {
  	const perimeter = [
  		new Vector3(1, 0, 0),
  		new Vector3(0, 1, 0),
  		new Vector3(-1, 0, 0),
  		new Vector3(0, -1, 0)
  	];
  	const centroid = new Vector3(0, 0, 0);

  	test('produces m+1 sections of 2 points each (last wraps to first)', () => {
  		const sections = buildFanSections(perimeter, centroid);
  		expect(sections).toHaveLength(perimeter.length + 1);
  		sections.forEach((s) => expect(s.points).toHaveLength(2));
  		// each section: [P_k, C]; inner point equals centroid
  		sections.forEach((s) => expect(s.points[1].equals(centroid)).toBe(true));
  		// wrap-around: last section outer point equals first perimeter point
  		expect(sections[sections.length - 1].points[0].equals(perimeter[0])).toBe(true);
  	});

  	test('feeds generateProjectionBands to yield m quads, one real + one degenerate facet each', () => {
  		const sections = buildFanSections(perimeter, centroid);
  		const bands = generateProjectionBands(sections, 'axial-right', { globule: 0, tube: 0 });
  		expect(bands).toHaveLength(1);
  		const facets = bands[0].facets;
  		expect(facets).toHaveLength(2 * perimeter.length);
  		for (let j = 0; j < perimeter.length; j++) {
  			const real = facets[2 * j].triangle;
  			const degenerate = facets[2 * j + 1].triangle;
  			// real facet = (P_j, C, P_{j+1})
  			expect(real.a.equals(perimeter[j])).toBe(true);
  			expect(real.b.equals(centroid)).toBe(true);
  			// degenerate facet collapses at centroid (two of its vertices coincide with C)
  			expect(degenerate.getArea()).toBeLessThan(1e-9);
  		}
  	});
  });
  ```
- [ ] Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/fill-fan.test.ts` — expected: FAIL (`buildFanSections` undefined).
- [ ] Implement in `src/lib/projection-geometry/fill-fan.ts`:
  ```ts
  import type { Section } from './types';

  /**
   * Build fan sections for a polygon interior fill band.
   * Outer ring = perimeter points (winding order); inner ring collapsed to centroid.
   * Layout: sections[k] = [perimeter[k], centroid] for k in 0..m-1, plus a wrap-around
   * section [perimeter[0], centroid]. With generateProjectionBands(..,'axial-right',..)
   * this yields one band of m quads, each one real + one degenerate (centroid-collapsed) facet.
   */
  export const buildFanSections = (perimeter: Vector3[], centroid: Vector3): Section[] => {
  	const sections: Section[] = perimeter.map((p) => ({
  		points: [p.clone(), centroid.clone()]
  	}));
  	sections.push({ points: [perimeter[0].clone(), centroid.clone()] });
  	return sections;
  };
  ```
- [ ] Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/fill-fan.test.ts` — expected: PASS.
- [ ] Run: `npm run check` — expected: passes.
- [ ] Commit:
  ```bash
  git add src/lib/projection-geometry/fill-fan.ts src/lib/projection-geometry/__tests__/fill-fan.test.ts
  git commit -m "feat(fillAll): add buildFanSections producing m+1 collapsed-ring sections"
  ```

---

### Task 4: Pure `windFanSectionsOutward` (TDD)

**Files:**
- Modify `src/lib/projection-geometry/fill-fan.ts`.
- Test: append to `src/lib/projection-geometry/__tests__/fill-fan.test.ts`.

- [ ] Append failing test (mirrors the winding logic at `generate-projection.ts:1289-1306` — first real facet normal must point away from projection center):
  ```ts
  import { windFanSectionsOutward } from '../fill-fan';

  describe('windFanSectionsOutward', () => {
  	// Perimeter on plane z=1, centroid at z=1, projection center at origin → outward = +z
  	const perimeter = [
  		new Vector3(1, 0, 1),
  		new Vector3(0, 1, 1),
  		new Vector3(-1, 0, 1),
  		new Vector3(0, -1, 1)
  	];
  	const centroid = new Vector3(0, 0, 1);
  	const projCenter = new Vector3(0, 0, 0);

  	const firstFacetNormalDotOutward = (sections: ReturnType<typeof buildFanSections>) => {
  		const p0 = sections[0].points[0];
  		const p1 = sections[0].points[1];
  		const p2 = sections[1].points[0];
  		const n = new Vector3()
  			.subVectors(p1, p0)
  			.cross(new Vector3().subVectors(p2, p0));
  		const c = new Vector3().addVectors(p0, p1).add(p2).divideScalar(3);
  		return n.dot(new Vector3().subVectors(c, projCenter));
  	};

  	test('result has first real facet normal pointing outward (dot > 0)', () => {
  		const wound = windFanSectionsOutward(buildFanSections(perimeter, centroid), projCenter);
  		expect(firstFacetNormalDotOutward(wound)).toBeGreaterThan(0);
  	});

  	test('reversing perimeter order still yields outward winding', () => {
  		const reversed = [...perimeter].reverse();
  		const wound = windFanSectionsOutward(buildFanSections(reversed, centroid), projCenter);
  		expect(firstFacetNormalDotOutward(wound)).toBeGreaterThan(0);
  	});
  });
  ```
- [ ] Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/fill-fan.test.ts` — expected: FAIL (`windFanSectionsOutward` undefined).
- [ ] Implement in `src/lib/projection-geometry/fill-fan.ts` (reuse the exact pattern from `generate-projection.ts:1289-1306`; mutate-and-return is acceptable since `buildFanSections` returns fresh clones):
  ```ts
  /**
   * Ensure the fan's first real facet normal points outward (away from projCenter).
   * Mirrors the winding check in generateSurfaceProjectionBands. If inward, reverse
   * each section's point order. Returns the (possibly reversed) sections.
   */
  export const windFanSectionsOutward = (sections: Section[], projCenter: Vector3): Section[] => {
  	if (sections.length < 2) return sections;
  	const p0 = sections[0].points[0];
  	const p1 = sections[0].points[1];
  	const p2 = sections[1].points[0];
  	const v1 = new Vector3().subVectors(p1, p0);
  	const v2 = new Vector3().subVectors(p2, p0);
  	const normal = new Vector3().crossVectors(v1, v2);
  	const facetCentroid = new Vector3().addVectors(p0, p1).add(p2).divideScalar(3);
  	const toFacet = new Vector3().subVectors(facetCentroid, projCenter);
  	if (normal.dot(toFacet) < 0) {
  		sections.forEach((s) => s.points.reverse());
  	}
  	return sections;
  };
  ```
  (Add `Vector3` to the existing `three` import in this file.)
- [ ] Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/fill-fan.test.ts` — expected: PASS.
- [ ] Commit:
  ```bash
  git add src/lib/projection-geometry/fill-fan.ts src/lib/projection-geometry/__tests__/fill-fan.test.ts
  git commit -m "feat(fillAll): add windFanSectionsOutward winding fix with tests"
  ```

---

### Task 5: Wire fill tubes into `generateSurfaceProjectionBands`

**Files:**
- Modify `src/lib/projection-geometry/generate-projection.ts`:
  - signature `:1222-1226`, body after the edge-tube loop ends `:1319`, before/after partner matching `:1321-1335`, return `:1337`.
  - caller `makeProjection` `:1498-1502`.
- Test: none new (covered by Task 3/4 unit tests + `npm run check`; visual verification is the gate per spec).

- [ ] Add `surface: Object3D` parameter to `generateSurfaceProjectionBands` (after `projectionAddress`). `Object3D` is already imported (`generate-projection.ts:24`):
  ```ts
  export const generateSurfaceProjectionBands = (
  	projection: Projection,
  	projectionConfig: ProjectionConfig<undefined, number, number, number>,
  	projectionAddress: GlobuleAddress,
  	surface: Object3D
  ): { tubes: Tube[] } => {
  ```
- [ ] Import the fan helpers at top of `generate-projection.ts`:
  ```ts
  import { buildFanSections, windFanSectionsOutward } from './fill-fan';
  ```
- [ ] After the edge-tube `for` loop closes (after `generate-projection.ts:1319`) and **before** the partner-matching `try` block (`:1321`), insert fill-tube generation. Reuse `projCenter` (already defined `:1246-1249`) and the surface-intersector pattern (`:504-507`):
  ```ts
  // Interior fill bands (fillAll). Each polygon → one dedicated fan Tube (isFill).
  // Gated to outlined pattern mode downstream (generateProjectionPattern drops isFill
  // tubes for tiled/panel). Degenerate facets are intentional and never partner-matched.
  if (projectionConfig.surfaceProjectionConfig?.fillAll) {
  	const fillRaycaster = new Raycaster(undefined, undefined, undefined, 2000);
  	projection.polygons.forEach((polygon) => {
  		// Outer ring = each edge's first-section inner-curve point, in edge (winding) order.
  		const perimeter = polygon.edges
  			.filter((edge) => edge.sections.length > 0)
  			.map((edge) => edge.sections[0].intersections.curve.clone());
  		if (perimeter.length < 3) return;

  		// Centroid surface point: ray-cast from projCenter through the averaged perimeter.
  		const avg = perimeter
  			.reduce((acc, p) => acc.add(p), new Vector3())
  			.divideScalar(perimeter.length);
  		fillRaycaster.set(projCenter, avg.clone().sub(projCenter).normalize());
  		const hits = fillRaycaster.intersectObject(surface, true);
  		let centroidPoint: Vector3;
  		if (hits[0]) {
  			centroidPoint = hits[0].point.clone();
  		} else {
  			console.warn('fillAll: centroid ray missed surface; falling back to averaged perimeter point');
  			centroidPoint = avg.clone();
  		}

  		const fillTubeIndex = tubes.length;
  		const fillTubeAddress: GlobuleAddress_Tube = { ...projectionAddress, tube: fillTubeIndex };
  		const fanSections = windFanSectionsOutward(
  			buildFanSections(perimeter, centroidPoint),
  			projCenter
  		);
  		const fillBands = generateProjectionBands(fanSections, 'axial-right', fillTubeAddress);
  		tubes.push({
  			bands: fillBands,
  			sections: fanSections,
  			orientation: 'axial-right',
  			address: fillTubeAddress,
  			isFill: true
  		});
  	});
  }
  ```
- [ ] Confirm `GlobuleAddress_Tube` and `Raycaster` are imported in this file — both already are (`Raycaster` at `:25`; `GlobuleAddress_Tube` is used at `:1260`).
- [ ] Ensure fill tubes are **excluded** from partner matching: the matchers iterate `tubes` (`:1327-1332`). Guard them so `isFill` tubes are skipped. In `matchSurfaceProjectionCrossBandPartners` (`:1346-1375`), `matchSurfaceProjectionTubeEnds`, and `matchSurfaceProjectionSequentialPartners`, add an early `if (tube.isFill) return;` / `continue;` at the start of each per-tube iteration. (Locate each `tubes.forEach((tube) => {` / `for` loop over tubes and add the guard.)
- [ ] Update the caller in `makeProjection` (`generate-projection.ts:1498-1502`) to pass `surface`:
  ```ts
  const { tubes: surfaceProjectionTubes } = generateSurfaceProjectionBands(
  	projection,
  	projectionConfig,
  	address,
  	surface
  );
  ```
- [ ] Run: `npm run check` — expected: passes.
- [ ] Run full SP-related unit tests to confirm no regression: `npm run test:unit -- src/lib/projection-geometry` — expected: PASS (existing + new fan tests).
- [ ] Commit:
  ```bash
  git add src/lib/projection-geometry/generate-projection.ts
  git commit -m "feat(fillAll): emit per-polygon fan fill tubes in generateSurfaceProjectionBands"
  ```

---

### Task 6: Gate fill tubes to outlined pattern in `generateProjectionPattern`

**Files:**
- Modify `src/lib/cut-pattern/generate-pattern.ts:116-134` (entry of `generateProjectionPattern`).
- Test: none new (type-checked; visual gate). `isOutlinedPatternConfig` already imported (`generate-pattern.ts:22`).

- [ ] At the start of `generateProjectionPattern` body (after destructuring `patternTypeConfig`, before the `if (isOutlinedPatternConfig...)` branch at `:127`), filter fill tubes for non-outlined modes:
  ```ts
  // fillAll produces interior fan tubes with one degenerate facet per quad.
  // Tiled/panel patterns cannot tile degenerate facets — keep fill tubes for outlined only.
  const effectiveTubes = isOutlinedPatternConfig(patternTypeConfig)
  	? tubes
  	: tubes.filter((t) => !t.isFill);
  ```
- [ ] Replace the three uses of `tubes` inside the function body with `effectiveTubes` (the outlined branch call `:128-134`, the panel branch `:136-140`, and the tiled branch `:152` `resolveRangeIndices(projectionRange?.tubes, tubes.length)` and the `for` loop / `tubes[t]` accesses). Verify by searching the function: every read of the `tubes` parameter after the filter must use `effectiveTubes`.
- [ ] Run: `npm run check` — expected: passes.
- [ ] Commit:
  ```bash
  git add src/lib/cut-pattern/generate-pattern.ts
  git commit -m "feat(fillAll): drop fill tubes for tiled/panel patterns, keep for outlined"
  ```

---

### Task 7: Degenerate-edge guard in `buildOutlinePath` (TDD)

**Files:**
- Create test `src/lib/cut-pattern/__tests__/build-outline-path-degenerate.test.ts`.
- Modify `src/lib/cut-pattern/generate-outlined-pattern.ts:383-437` (`buildOutlinePath`).

Note: `buildOutlinePath` is module-private. To TDD it directly, **export it** from `generate-outlined-pattern.ts` (low-risk; additive). Then test via the public edge list.

- [ ] Export `buildOutlinePath` and its `OutlineEdge` type: change `const buildOutlinePath = (` → `export const buildOutlinePath = (` (`:383`) and `type OutlineEdge = {` → `export type OutlineEdge = {` (`:79`).
- [ ] Write failing test `src/lib/cut-pattern/__tests__/build-outline-path-degenerate.test.ts`:
  ```ts
  import { Vector3 } from 'three';
  import { buildOutlinePath, type OutlineEdge } from '../generate-outlined-pattern';

  describe('buildOutlinePath degenerate-edge guard', () => {
  	const mk = (start: Vector3, end: Vector3, side: OutlineEdge['side']): OutlineEdge => ({
  		start,
  		end,
  		side,
  		interiorPoint: new Vector3(0, 0, 0)
  	});

  	test('skips zero-length collapsed edges, no duplicate coincident L', () => {
  		const C = new Vector3(0, 0, 0);
  		// Simulate a fan quad outline: real edge, then a collapsed centroid edge (end == prev pen).
  		const edges: OutlineEdge[] = [
  			mk(new Vector3(1, 0, 0), new Vector3(0, 1, 0), 'before'),
  			mk(new Vector3(0, 1, 0), C, 'end'),
  			mk(C, C.clone(), 'after'), // collapsed: start == end == centroid
  			mk(C, new Vector3(1, 0, 0), 'end')
  		];
  		const path = buildOutlinePath(edges);
  		// Starts with M, ends with Z
  		expect(path[0][0]).toBe('M');
  		expect(path[path.length - 1][0]).toBe('Z');
  		// No L segment that lands on the immediately-preceding coordinate.
  		let prev: [number, number] = [path[0][1] as number, path[0][2] as number];
  		for (let i = 1; i < path.length; i++) {
  			const seg = path[i];
  			if (seg[0] === 'L') {
  				const cur: [number, number] = [seg[1] as number, seg[2] as number];
  				const dx = cur[0] - prev[0];
  				const dy = cur[1] - prev[1];
  				expect(dx * dx + dy * dy).toBeGreaterThan(1e-12);
  				prev = cur;
  			}
  		}
  	});

  	test('non-degenerate edges still emit one L each', () => {
  		const edges: OutlineEdge[] = [
  			mk(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 'before'),
  			mk(new Vector3(1, 0, 0), new Vector3(1, 1, 0), 'end')
  		];
  		const path = buildOutlinePath(edges);
  		const lCount = path.filter((s) => s[0] === 'L').length;
  		expect(lCount).toBe(2);
  	});
  });
  ```
- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/build-outline-path-degenerate.test.ts` — expected: FAIL on the first test (a zero-length `L` to the coincident centroid is currently emitted).
- [ ] Implement the guard in `buildOutlinePath` second pass (`generate-outlined-pattern.ts:424-433`). Track the last emitted pen position and skip non-tab `L` segments that land within epsilon of it:
  ```ts
  // Second pass: build path (skip zero-length collapsed edges, e.g. fillAll centroid edges)
  const EPS_SQ = 1e-12;
  let penX = edges[0].start.x;
  let penY = edges[0].start.y;
  for (let i = 0; i < edges.length; i++) {
  	const tab = tabsByIndex.get(i);
  	if (tab) {
  		for (const seg of tab.path) {
  			path.push(seg);
  		}
  		// Tabs reshape the pen; reset pen to the edge end they terminate on.
  		penX = edges[i].end.x;
  		penY = edges[i].end.y;
  	} else {
  		const ex = edges[i].end.x;
  		const ey = edges[i].end.y;
  		const dx = ex - penX;
  		const dy = ey - penY;
  		if (dx * dx + dy * dy < EPS_SQ) continue; // collapsed/degenerate edge — skip
  		path.push(['L', ex, ey]);
  		penX = ex;
  		penY = ey;
  	}
  }
  ```
- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/build-outline-path-degenerate.test.ts` — expected: PASS.
- [ ] Run existing outlined tests to confirm no regression: `npm run test:unit -- src/lib/cut-pattern/__tests__` — expected: PASS.
- [ ] Run: `npm run check` — expected: passes.
- [ ] Commit:
  ```bash
  git add src/lib/cut-pattern/generate-outlined-pattern.ts src/lib/cut-pattern/__tests__/build-outline-path-degenerate.test.ts
  git commit -m "feat(fillAll): skip zero-length collapsed edges in outline path"
  ```

---

### Task 8: UI toggle for `fillAll`

**Files:**
- Locate the surface-projection controls component and the config that backs `projectionConfig.surfaceProjectionConfig` (search controls directory). If `surfaceProjectionConfig` is not yet surfaced in the editing config/UI (it currently is never written — see Verified facts), add a minimal toggle bound to `surfaceProjectionConfig.fillAll`. Mirror the existing `surfaceProjectionDivisions` control's wiring.
- Test: none (UI; behavior verified visually).

- [ ] Find the control that edits surface-projection settings:
  ```bash
  grep -rn "surfaceProjectionDivisions\|surfaceProjection\|surfaceProjectionConfig\|divisions" src/components/controls --include="*.svelte"
  ```
- [ ] If a surface-projection control panel exists, add a checkbox bound to `fillAll` on the same config object the panel already edits, defaulting to `false`. If the projection path does not yet edit `surfaceProjectionConfig` at all, scope this task to: add the toggle to the projection controls panel that owns `projectionConfig`, writing `surfaceProjectionConfig: { ...(cfg.surfaceProjectionConfig ?? { divisions: 0 }), fillAll: <checked> }`. Keep it minimal and consistent with neighboring controls.
- [ ] Run: `npm run check` — expected: passes.
- [ ] Run: `npm run lint` — expected: passes.
- [ ] Commit:
  ```bash
  git add src/components/controls
  git commit -m "feat(fillAll): add UI toggle for surfaceProjection fillAll"
  ```

> **Latitude:** If the projection editing UI does not currently expose `surfaceProjectionConfig` and wiring a new control is non-trivial, the flag can be toggled via the config object directly for v1 verification; document this in the commit message and revisit. The geometry/pattern behavior (Tasks 1-7) is the load-bearing deliverable.

---

### Task 9: Manual visual verification (the gate)

**Files:** none (manual).

- [ ] Run: `npm run dev`.
- [ ] In `/designer2`, select a surface-projection config with `patternSource: 'surfaceProjection'` and `patternTypeConfig.type === 'outlined'`.
- [ ] Enable `fillAll`. Expected: each polygon interior renders as a filled triangle fan (SVG in PatternViewer); polygon edges/struts unchanged; **no zero-length artifacts or crashes** in the outlined SVG.
- [ ] Disable `fillAll`. Expected: output identical to pre-feature (edge tubes only).
- [ ] Switch `patternTypeConfig` to a tiled type with `fillAll` still on. Expected: **no fill bands**, no crash, normal tiled output.
- [ ] Check the browser console: at most the expected `fillAll: centroid ray missed surface` warnings (only if rays genuinely miss); no errors from partner matching or outline generation.
- [ ] If anything renders wrong, iterate on the fan layout/winding (Tasks 3-4) — spec grants explicit latitude here. Re-verify after each change.
- [ ] No commit (verification only). If code changed during iteration, commit those changes under the relevant task.

---

## Self-review checklist (performed during planning)

- **Spec coverage:** config flag (Task 1), interior perimeter + centroid ray-cast + fan with 2-facets-per-quad incl. one degenerate facet (Tasks 3, 5), winding (Task 4), own-tube emission (Task 5), outlined-only gate (Task 6), degenerate-edge epsilon guard in outline builder (Task 7), UI toggle (Task 8), visual verification before metadata (Task 9). Partner/tab metadata intentionally left empty (documented; fill tubes excluded from matchers).
- **Placeholder scan:** every referenced symbol verified to exist — `Section`, `Tube`, `GlobuleAddress_Tube` (types.ts), `generateProjectionBands` / `generateFacetPair` / `projCenter` / `Raycaster` / `Object3D` / `getVector3` (generate-projection.ts), `isOutlinedPatternConfig` (types.ts), `buildOutlinePath` / `OutlineEdge` (generate-outlined-pattern.ts), `getQuadrilaterals` (quadrilateral.ts). No undefined helpers.
- **Type consistency:** `fillAll?: boolean` and `isFill?: boolean` are optional → no existing caller breaks. `surface: Object3D` added as a required new param to `generateSurfaceProjectionBands`; the sole caller (`makeProjection`) is updated in the same task. `effectiveTubes` is `Tube[]`, identical to `tubes`.
- **Serialization:** `isFill` is a primitive boolean; survives postMessage and the `...tube` spread in `workerStore.ts` rehydration — no rehydration change required.
- **TDD ordering:** Tasks 2-4 and 7 each follow failing test → run (expected fail) → minimal impl → run (expected pass) → commit. Tasks 1/5/6/8 are type/wiring/UI changes gated by `npm run check` and the colocated unit tests.
- **DRY:** winding reuses the exact `:1289-1306` logic (extracted to `windFanSectionsOutward`); ray-cast reuses the established `Raycaster.intersectObject(surface, true)` pattern; no duplicate fan logic.
- **YAGNI:** no decorative subdivision, no fill↔edge tab geometry, no tiled support — all explicitly out of scope.
