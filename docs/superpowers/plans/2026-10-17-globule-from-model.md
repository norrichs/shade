# Globule Cross Sections from an Imported Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "From model" section in the GCS editor slices an imported mesh at the globule's silhouette levels and snapshots each slice as an editable asymmetric GCS.

**Architecture:** Pure functions in `src/lib/gcs/` do the work — silhouette level sampling, plane–mesh slicing, outline resampling, ShapeConfig writing, and a `snapshotGcsFromModel` orchestrator that returns new `shapeConfigs` or errors. The Svelte GCS editor calls it on the main thread and replaces the globule's list. Generation, blending and validation are untouched.

**Tech Stack:** TypeScript, Three.js (`Vector2`, `Matrix4`, `BufferGeometry` in tests), Svelte 5 runes, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-globule-from-model-design.md`

## Global Constraints

- Import library code as `#lib/path/module.js` (`.js` extension for `.ts` sources); components import siblings relatively.
- `X_MIN_THRESHOLD = 0.05` (fraction of the largest sampled silhouette X), exported named constant.
- Snapshot GCS shape: `symmetry: 'asymmetric'`, `symmetryNumber: 1`, `sampleMethod: { method: 'divideCurve', divisions: 1 }`, `blend: { mode: 'linear' }`, `level: i` pinned, `isPrimary: true` only on level 0's GCS, unique `id`.
- GCS point written as `p = s * k * 100 / xMin` where `s` is fitted-model XY and `k = (yMax − yMin) / (zMax − zMin)`.
- Curve k runs resample point k−1 → point k (curve 0: N−1 → 0) so prototype vertex k = resample point k.
- Slice in fitted space: `normalizeMatrix(normalize)` only; never the surface `transform`.
- Panel state that must outlive the floater closing lives in a module store, not component `$state`.
- `yarn run check`, `yarn lint`'s eslint, `yarn knip` and `yarn test:unit` stay clean.
- Single-GCS and existing multi-GCS generation output unchanged (characterization snapshots stay green).

## Review Focus

1. A silhouette drawn bottom→top (y increasing along the curve) — slices must follow the curve's direction, level 0 slicing the model end that maps to the silhouette's start y. Test in Task 5.
2. A model whose cross-section at some height is two separate loops (legs) — largest kept, warning names the level; snapshot still succeeds. Test in Task 5.
3. A pointed model (cone) under the default pole-to-pole silhouette — end levels copy neighbours instead of aborting. Test in Task 5.
4. A loop that does not surround the globule axis (model off-center) — start point still deterministic, no twist between levels. Test in Task 3.
5. Re-snapshot after the user edits silhouette divisions — the new list has `divisions + 1` GCSs and validates clean. Test in Task 5.

---

## File Structure

- Modify `src/lib/generate-level.ts` — extract `silhouetteLevelSamples`; `generateRawLevels` uses it.
- Create `src/lib/gcs/slice-mesh.ts` — plane/mesh intersection → loops.
- Create `src/lib/gcs/outline.ts` — loop area, CCW, start point, arc-length resample.
- Create `src/lib/gcs/shape-from-points.ts` — points → asymmetric `ShapeConfig`.
- Create `src/lib/gcs/snapshot-gcs.ts` — orchestrator + `X_MIN_THRESHOLD`.
- Create `src/lib/gcs/__tests__/mesh-fixtures.ts` — test meshes (cylinder, box, cone, two-cylinder, open tube).
- Modify `src/lib/types.ts` — `GlobuleConfig.modelSource?`.
- Modify `src/components/modal/editor/ImportedMeshControls.svelte` — read/write target as props.
- Create `src/components/modal/editor/FromModel.svelte`, `src/components/modal/editor/from-model-store.ts`.
- Modify `src/components/modal/editor/GlobuleCrossSection.svelte` — mount `FromModel`.
- Create `tests/globule-from-model.spec.ts`.

---

### Task 1: Silhouette level samples

**Files:**
- Modify: `src/lib/generate-level.ts` (`generateRawLevels`, ~line 544)
- Test: `src/lib/__tests__/silhouette-level-samples.test.ts`

**Interfaces:**
- Produces: `export type SilhouetteLevelSample = { t: number; x: number; y: number }` and `export function silhouetteLevelSamples(silhouette: CurvePath<Vector2>, sampleMethod: CurveSampleMethod): SilhouetteLevelSample[]` in `generate-level.ts`. Length `divisions + 1`; `t = i / divisions` (last exactly 1); point via `getPoint(t)` when `method === 'divideCurve'`, else `getPointAt(t)` — exactly what `generateRawLevels` does today.

- [ ] **Step 1: Write the failing test** — `silhouetteLevelSamples follows the generator's sampling`: with `generateDefaultGlobuleConfig()`'s silhouette (built with `generateSilhouette` from `#lib/generate-shape.js`), `samples.length === divisions + 1`, `samples[0].t === 0`, `samples.at(-1).t === 1`; for `divideCurve` each `{x, y}` equals `silhouette.getPoint(t)`, and for `divideCurvePath` equals `silhouette.getPointAt(t)`. The refactor's equivalence with `generateRawLevels` is guarded by the existing characterization snapshots in Step 4.
- [ ] **Step 2: Run** `yarn test:unit src/lib/__tests__/silhouette-level-samples.test.ts` — FAIL (not exported).
- [ ] **Step 3: Implement** `silhouetteLevelSamples` and make `generateRawLevels` iterate its result instead of its local `fractionalDivisions` loop.
- [ ] **Step 4: Run** the new test plus `yarn test:unit src/lib/__tests__/multi-gcs-characterization.test.ts src/lib/__tests__/depth-curve-baseline.test.ts` — PASS, snapshots unchanged.
- [ ] **Step 5: Commit** `refactor(globule): extract silhouetteLevelSamples`

### Task 2: Slice a mesh with a horizontal plane

**Files:**
- Create: `src/lib/gcs/slice-mesh.ts`, `src/lib/gcs/__tests__/mesh-fixtures.ts`
- Test: `src/lib/gcs/__tests__/slice-mesh.test.ts`

**Interfaces:**
- Produces: `export type SliceResult = { loops: Vector2[][]; openChains: number }` and `export function sliceMeshAtZ(positions: Float32Array, index: Uint32Array, z: number): SliceResult`. Loops are closed (first point not repeated), unoriented. Segment endpoints are joined when within `1e-6 × bbox diagonal`. Triangles with a vertex exactly on the plane: treat that vertex as above (z ≥ plane) so no zero-length or duplicate segments arise.
- Produces (fixtures): `cylinderMesh(radius, height, segments)`, `boxMesh(w, d, h)`, `coneMesh(radius, height, segments)`, `twoCylindersMesh()`, `openTubeMesh()` each returning `{ positions: Float32Array; index: Uint32Array }`, Z-up, centered at origin. Build from Three geometries, rotate Y-up → Z-up, weld with `mergeVertices` (from `three/examples/jsm/utils/BufferGeometryUtils.js`) dropping normals/uvs first. `openTubeMesh` = an open-ended cylinder with one side face removed so slices yield open chains.

- [ ] **Step 1: Write failing tests:**
  - box 2×4×6 at z=0 → 1 loop, 0 open chains, loop bbox x∈[−1,1], y∈[−2,2] (toBeCloseTo 6).
  - cylinder r=5 at z=0 → 1 loop, every point at distance 5 ± 1e-6 from origin.
  - `twoCylindersMesh()` at z=0 → 2 loops.
  - `openTubeMesh()` at z=0 → `openChains ≥ 1`, `loops.length === 0`.
  - plane above the box (z=10) → 0 loops, 0 open chains.
- [ ] **Step 2: Run** `yarn test:unit src/lib/gcs/__tests__/slice-mesh.test.ts` — FAIL.
- [ ] **Step 3: Implement** — per triangle, collect the two edge crossings as a segment; chain via an endpoint hash map (quantized key) into loops; a chain that can't close counts as open.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(gcs): slice a mesh with a horizontal plane`

### Task 3: Outline orientation, start point, arc-length resample

**Files:**
- Create: `src/lib/gcs/outline.ts`
- Test: `src/lib/gcs/__tests__/outline.test.ts`

**Interfaces:**
- Produces, all in `outline.ts`:
  - `signedArea(loop: Vector2[]): number` (shoelace, CCW positive)
  - `largestLoop(loops: Vector2[][]): Vector2[]` (by `|signedArea|`)
  - `orientCCW(loop: Vector2[]): Vector2[]`
  - `startIndexedLoop(loop: Vector2[]): Vector2[]` — returns a CCW loop that begins at the start point (a new point inserted where the loop crosses the +X ray from the origin, outermost crossing; if no crossing, the vertex with smallest angular distance to +X measured from the loop's centroid, ties → lowest index)
  - `resampleByArcLength(loop: Vector2[], n: number): Vector2[]` — n points, first = `loop[0]`, equal arc length around the closed loop

- [ ] **Step 1: Write failing tests:**
  - square (−1,−1)…(1,1) given clockwise → `orientCCW` gives positive area.
  - circle-ish loop r=3 starting at angle 2 rad → `startIndexedLoop(loop)[0]` ≈ (3, 0).
  - annulus-like loop crossing +X twice (C-shape around origin) → start is the crossing with larger x.
  - loop centered at (10, 10) not surrounding origin → start deterministic: two calls on rotated copies of the same loop return the same point.
  - `resampleByArcLength(square side 2, 8)` → points at every corner and edge midpoint, consecutive distances all equal 1 (toBeCloseTo 9).
  - no-twist: for a rounded-rectangle outline scaled by 1, 1.5, 2, the k-th resampled point has the same `atan2` across scales (toBeCloseTo 6) for every k.
- [ ] **Step 2: Run** `yarn test:unit src/lib/gcs/__tests__/outline.test.ts` — FAIL.
- [ ] **Step 3: Implement** the five functions.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(gcs): outline orientation, start point and resampling`

### Task 4: Points → asymmetric ShapeConfig

**Files:**
- Create: `src/lib/gcs/shape-from-points.ts`
- Test: `src/lib/gcs/__tests__/shape-from-points.test.ts`

**Interfaces:**
- Produces: `shapeConfigFromPoints(points: Vector2[], meta: { id: number; level: number; isPrimary: boolean }): ShapeConfig` — fields per Global Constraints; each curve a straight cubic with control points at 1/3 and 2/3; `pointType: 'angled'` on all points; omit `isPrimary` when false.

- [ ] **Step 1: Write failing test** `round-trips through generateLevelPrototype`: for 12 irregular points `P`, `generateLevelPrototype(shapeConfigFromPoints(P, …)).vertices[k]` ≈ `P[k] / 200` for every k (toBeCloseTo 9), length 12; and `validateShapeConfigs` (via `validateGlobuleShapeConfigs` on a default globule whose `shapeConfigs` = three such configs at levels 0, mid, divisions) reports no errors.
- [ ] **Step 2: Run** `yarn test:unit src/lib/gcs/__tests__/shape-from-points.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(gcs): asymmetric shape config from outline points`

### Task 5: Snapshot orchestrator

**Files:**
- Create: `src/lib/gcs/snapshot-gcs.ts`
- Test: `src/lib/gcs/__tests__/snapshot-gcs.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4; `normalizeMatrix` from `#lib/mesh-import/normalize.js`; `generateSilhouette` from `#lib/generate-shape.js`.
- Produces:
  ```ts
  export const X_MIN_THRESHOLD = 0.05;
  export type SnapshotInput = {
    globule: GlobuleConfig;
    mesh: { positions: Float32Array; index: Uint32Array };
    normalize: ImportedMeshNormalize;
    bandCount: number;
  };
  export type SnapshotResult =
    | { ok: true; shapeConfigs: ShapeConfig[]; warnings: string[] }
    | { ok: false; errors: string[] };
  export function snapshotGcsFromModel(input: SnapshotInput): SnapshotResult;
  ```
- Algorithm (spec "Scale", "Slice heights", "Slicing and resampling"):
  1. `bandCount < 3` → error.
  2. Transform positions by `normalizeMatrix(normalize)`; `zMin`, `zMax` from the result.
  3. `samples = silhouetteLevelSamples(generateSilhouette(globule.silhouetteConfig), globule.levelConfig.silhouetteSampleMethod)`; `yMin`/`yMax` over samples; `k = (yMax − yMin) / (zMax − zMin)`.
  4. Plane for sample i: `zMin + (y_i − yMin)/(yMax − yMin)·(zMax − zMin)`, clamped into `[zMin + ε, zMax − ε]` with `ε = 1e-4·(zMax − zMin)`.
  5. `xMax` = max sample x; eligible = samples with `x ≥ X_MIN_THRESHOLD·xMax`; none → error. `xMin` = min eligible x.
  6. For each sample with `x > 0`: slice. Open chains → error naming level i if the level is eligible; if not eligible, mark for copy. No loops → same rule. More than one loop → warning `Level i: kept the largest of n outlines`. Else `resampleByArcLength(startIndexedLoop(largestLoop(loops)), bandCount)`, scale points by `k·100/xMin`, `shapeConfigFromPoints`.
  7. `x = 0` levels and marked levels copy the nearest successfully sliced level's points (ties → lower index), written with their own `level`/`id`.
  8. If any eligible level errored → `{ ok: false, errors }` (all of them).
  9. Warnings: `preserveAspectRatio` sample method; depth curve non-neutral (any curve point x ≠ `depthCurveBaseline`); any `levelOffsets` entry with nonzero x/y/z/rotX/rotY/rotZ or scaleX/scaleY ≠ 1.
  10. ids: `Date.now()`-independent — use `i + 1` offset by `max(existing ids) + 1` so they're unique and deterministic.

- [ ] **Step 1: Write failing tests** (default globule with an open-ended silhouette — copy the local `openEnded()` helper from `multi-gcs-generation.test.ts`, which sets both silhouette ends to x=30 — unless stated; identity `normalize` = `{ upAxis: '+z', targetSize: h, offset: {x:0,y:0,z:0}, scale: 1 }`):
  - **scale** — cylinder r=5 h=20: build the globule from the result (`generateGlobuleTube`) and assert ring radius at each level ≈ `5·k·x_i/xMin` (toBeCloseTo 4).
  - **length** — `shapeConfigs.length === divisions + 1`; levels 0..divisions in order; exactly one `isPrimary` at index 0; `validateGlobuleShapeConfigs` clean.
  - **direction** — flip the silhouette (reverse curve order and each curve's points): level 0's plane is now at the opposite model end (check via a cone: level 0 ring radius small vs. large swaps).
  - **threshold** — default pole-to-pole silhouette with a cylinder: compute the expected `xMin` from `silhouetteLevelSamples` as the smallest x ≥ `0.05·xMax`; the ring at that level has radius ≈ `5·k` (toBeCloseTo 4), and no level's ring exceeds `5·k·xMax/xMin`. Also assert there is at least one sample with `0 < x < 0.05·xMax` so the test actually exercises the exclusion (adjust divisions until true).
  - **pole copy** — cone under the default silhouette: `ok: true`; the `x = 0` levels' points equal their neighbour's.
  - **two loops** — `twoCylindersMesh()`: `ok: true`, warnings include `kept the largest`.
  - **open mesh** — `openTubeMesh()`: `ok: false`, errors name a level.
  - **re-snapshot after divisions change** — set divisions 6 → 10, snapshot again: length 11, validation clean.
  - **warnings** — `preserveAspectRatio` method and a non-neutral depth curve each produce one warning.
- [ ] **Step 2: Run** `yarn test:unit src/lib/gcs/__tests__/snapshot-gcs.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Export `ImportedMeshNormalize` is already exported from `#lib/projection-geometry/types.js`.
- [ ] **Step 4: Run** — PASS; then `yarn test:unit` whole suite — PASS.
- [ ] **Step 5: Commit** `feat(gcs): snapshot cross sections from an imported model`

### Task 6: Persist the model source

**Files:**
- Modify: `src/lib/types.ts` (`GlobuleConfig`, ~line 1275)
- Test: `src/lib/__tests__/saved-config.test.ts`

**Interfaces:**
- Produces: `GlobuleConfig.modelSource?: ImportedSurfaceConfig` (type-only import from `#lib/projection-geometry/types.js`; add `ImportedSurfaceConfig` to the index-signature union). Provenance only — no generator reads it. `transform` is stored but ignored.

- [ ] **Step 1: Write failing test** `round-trips a globule modelSource`: a config with `subGlobuleConfigs[0].globuleConfig.modelSource` set survives the same save/load path the existing tests in this file use, deep-equal; a config without it loads unchanged.
- [ ] **Step 2: Run** `yarn test:unit src/lib/__tests__/saved-config.test.ts` — FAIL (type error or dropped field).
- [ ] **Step 3: Implement** the type (and pass-through in `saved-config.ts` if it whitelists fields).
- [ ] **Step 4: Run** — PASS; `yarn run check` — 0 errors.
- [ ] **Step 5: Commit** `feat(globule): remember the model a snapshot came from`

### Task 7: From-model UI

**Files:**
- Modify: `src/components/modal/editor/ImportedMeshControls.svelte`, `src/components/modal/editor/Surface.svelte` (its one call site)
- Create: `src/components/modal/editor/from-model-store.ts`, `src/components/modal/editor/FromModel.svelte`
- Modify: `src/components/modal/editor/GlobuleCrossSection.svelte` (mount inside `<Editor>` after the existing `<section>`)
- Test: `src/components/modal/editor/__tests__/from-model-store.test.ts`

**Interfaces:**
- `ImportedMeshControls` props become `{ surface: ImportedSurfaceConfig; read: () => ImportedSurfaceConfig | undefined; write: (next: ImportedSurfaceConfig) => void }`, replacing its internal `currentImported` / `setCurrent`. `Surface.svelte` passes the existing projection-surface read/write.
- `from-model-store.ts`:
  ```ts
  export const fromModelBandCount = writable<number | undefined>(undefined);
  export const fromModelMessages = writable<{ errors: string[]; warnings: string[] }>({ errors: [], warnings: [] });
  /** The model to slice: the globule's modelSource, else the projection surface if imported. */
  export function defaultModelSource(config: SuperGlobuleConfig): ImportedSurfaceConfig | undefined;
  ```
- `FromModel.svelte` behaviour:
  - Collapsible `<section>` headed "From model".
  - Model row: file name of `globule.modelSource ?? defaultModelSource(...)`; "Import file…" (`data-testid="from-model-file-input"`) runs `importModelFile` and writes the result to `globule.modelSource`; when a model is set, render `ImportedMeshControls` with `read`/`write` targeting `globule.modelSource`.
  - Bands (N): `NumberInput`, min 3, preset from `fromModelBandCount ?? primary GCS vertex count`.
  - Snapshot button (`data-testid="from-model-snapshot"`), disabled with a reason when no model, asset missing (`resolveAsset` → undefined), N < 3, or `$importedMeshBusy`.
  - On click: if `shapeConfigs.length > 0`, `confirm("Replace all <n> cross sections with slices of <fileName>?")`; set `importedMeshBusy`; `resolveAsset(assetId)`; `snapshotGcsFromModel`; on `ok` replace `shapeConfigs`, set `modelSource` (if it came from the projection default), `selectedGcsIndex.set(0)`; write errors/warnings to `fromModelMessages`; on failure leave `shapeConfigs` untouched. Show messages inline under the button.

- [ ] **Step 1: Write failing test** for `defaultModelSource`: returns `globuleConfig.modelSource` when set; else the projection surface when its `type === 'ImportedMeshConfig'`; else `undefined`.
- [ ] **Step 2: Run** `yarn test:unit src/components/modal/editor/__tests__/from-model-store.test.ts` — FAIL.
- [ ] **Step 3: Implement** the store, the `ImportedMeshControls` prop refactor, and `FromModel.svelte`.
- [ ] **Step 4: Run** the test — PASS; `yarn run check` 0 errors; `npx eslint .` clean; `yarn knip` clean; `npx playwright test tests/model-import.spec.ts` — PASS (surface import unaffected).
- [ ] **Step 5: Commit** `feat(gcs-editor): snapshot cross sections from a model`

### Task 8: End-to-end

**Files:**
- Create: `tests/globule-from-model.spec.ts` (reuse helpers/patterns from `tests/model-import.spec.ts`; fixture `tests/fixtures/deformed-icosphere.glb`)

- [ ] **Step 1: Write the test** `snapshots globule cross sections from an imported GLB`: open designer, open the Globule Cross Section panel, set the file input `from-model-file-input`, accept the confirm dialog (`page.on('dialog', d => d.accept())`), click `from-model-snapshot`; poll `superConfigStore` until `subGlobuleConfigs[0].globuleConfig.shapeConfigs.length === divisions + 1` and every entry has `symmetry === 'asymmetric'`; poll `workerError` is `null` and the globule result has tubes; no `pageerror`s.
- [ ] **Step 2: Run** `npx playwright test tests/globule-from-model.spec.ts` (port 9775 must be free) — PASS. If it fails, fix the cause in the Task 7 code, not the test's expectations.
- [ ] **Step 3: Commit** `test(e2e): snapshot globule cross sections from an imported model`
