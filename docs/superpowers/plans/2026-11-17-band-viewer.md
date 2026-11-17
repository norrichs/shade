# Individual Band Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Band pane to the Assembler. It shows the highlighted band alone and unfolds it from 3D to flat with a live slider, and all Assembler panes get draggable dividers.

**Architecture:** A pure TS unfold module turns a band into a per-facet hinge tree around an anchor facet, then writes vertex positions for any flatten fraction into a preallocated `Float32Array`. A new Threlte scene renders those positions with front/back gray meshes and blue edge lines. A pane component resolves `assemblerHighlight` to the real 3D band and owns the slider. The Assembler page moves to a 3-column, 2-row grid driven by a persisted panel store and a shared divider component.

**Tech Stack:** SvelteKit 3 / Svelte 5 runes, Threlte (`@threlte/core`, `@threlte/extras`), Three.js, Jest (ts-jest ESM), Playwright for headless check.

**Spec:** `docs/superpowers/specs/2026-11-17-band-viewer-design.md`

## Global Constraints

- Band geometry stays in model world coordinates; only the camera moves.
- Anchor = the non-degenerate facet whose normal has the largest |dot| with `fitPlane(all band vertices).normal`; its vertices are identical at every t.
- Fold angles are signed (`atan2`), flat = 0, interpolated as `(1 − t)·φ`; never `acos`.
- Front material: opaque light gray (`#d3d3d3`), FrontSide. Back: opaque dark gray (`#555555`), BackSide. Lines: blue (`#1e5bff`).
- No allocation per slider tick; no store writes per tick; Three.js objects never in `$state`.
- Default widths model 2/5 · band 1/5 · pattern 2/5; top/bottom default top = 0.7 of height; each pane ≥ 0.1 of its axis.
- Import lib code as `#lib/...js`. Don't touch designer2's divider.

## Review Focus

1. Globule-tube bands with a collapsed pole facet (zero-area / zero-length hinge): expect finite positions, no NaN, at all t. Test in Task 1 (`pole facet stays finite`).
2. Facets whose stored winding alternates along the strip: expect t=1 still coplanar (not folded over). Test in Task 1 (`alternating winding flattens`).
3. Selection pointing at a band that no longer exists after regeneration (stale highlight): expect empty pane, no throw. Test in Task 2 (`stale address → null`).
4. Dragging a divider past its neighbour: expect clamping so no pane goes below 0.1. Test in Task 3 (`clampAssemblerPanels`).
5. Slider at 0.999 vs 1: no visible jump. Test in Task 1 (`continuity near 1`).

---

### Task 1: Unfold module

**Files:**
- Create: `src/lib/band-viewer/unfold-band.ts`
- Test: `src/lib/band-viewer/__tests__/unfold-band.test.ts`

**Interfaces:**
- Consumes: `fitPlane` from `#lib/voronoi/fit-plane.js`; `Band` from `#lib/types.js`.
- Produces:
  - `type UnfoldPlan = { facetCount: number; anchor: number; anchorNormal: Vector3; centroid: Vector3; original: Float32Array /* 9·N, a,b,c per facet */; /* internal hinge data */ }`
  - `prepareUnfold(band: Band): UnfoldPlan | null` (null for 0 facets)
  - `applyUnfold(plan: UnfoldPlan, t: number, out: Float32Array): void` (t clamped to [0,1]; `out.length === 9·N`)

**Algorithm (the part signatures don't determine):**
- Hinge i↔i+1: match facet vertices by position within `eps = 1e-6 · bboxDiagonal`. Use up to two child vertices that map to distinct parent vertices. Pivot = the first shared vertex (original coords). Axis = the shared edge direction if both are shared and its length > eps, else none. No shared vertex → pivot = the child's vertex a, no axis, fold 0.
- Order outward from the anchor: facets > anchor use parent i−1, facets < anchor use parent i+1.
- Consistent normal `N_i` per facet, in the original configuration. `N_anchor` = the anchor's winding normal. For a child with a 2-vertex hinge (h0,h1) and free vertex f: `n_c = normalize((f−h0) × (h1−h0))` and `n_p = normalize((h1−h0) × (p_free−h0))`. If the parent is non-degenerate, `N_child = sign(n_p·N_parent)·n_c`. Otherwise use the sign that makes `n_c·N_parent ≥ 0`. A degenerate child (area < eps²) has `N_child = N_parent`.
- Fold `φ_i = atan2(u·(N_parent × N_child), N_parent·N_child)` with `u` = the unit hinge axis. With no axis: axis = `normalize(N_parent × N_child)`, φ = the angle between them, or 0 if they're parallel.
- Each frame, every facet gets rigid (Q_i, T_i): anchor = identity. Then `Q_c = R(Q_p·axis, −t·φ_c) · Q_p` and `T_c = (Q_p·pivot + T_p) − Q_c·pivot`. Write `Q_c·v + T_c` for the facet's 3 vertices. Preallocate all quaternions/vectors in the plan.

- [ ] **Step 1: Write failing tests** (fixture: zig-zag strip like `cut-pattern/__tests__/fixtures/tube-fixture.ts:buildBand`, but folded: alternate facets lifted in z so the dihedrals are ≈ ±40°; plus a version with alternate facets' winding reversed; plus one with a leading zero-area pole facet):
  - `t=0 reproduces original` — every coordinate within 1e-9·scale.
  - `t=1 is coplanar` — all vertices' distance to the anchor plane < 1e-6·scale.
  - `edge lengths preserved at t ∈ {0.3, 0.7, 1}` — within 1e-6 relative.
  - `anchor fixed` — the anchor's 9 floats are equal at t = 0, 0.5, 1.
  - `anchor is the most plane-parallel facet` — on a fixture with one designated near-flat facet.
  - `t=1 congruent to getFlatStripV2` — sorted pairwise vertex distances of facet k match (within 1e-6 relative) for every k.
  - `continuity near 1` — max |pos(0.999) − pos(1)| < 0.01·scale.
  - `alternating winding flattens` — the reversed-winding fixture is coplanar at t=1 and edge lengths are preserved.
  - `pole facet stays finite` — no NaN at t ∈ {0, 0.5, 1}.
- [ ] **Step 2:** `yarn test:unit src/lib/band-viewer` → FAIL (module missing).
- [ ] **Step 3:** Implement `prepareUnfold` / `applyUnfold`.
- [ ] **Step 4:** `yarn test:unit src/lib/band-viewer` → PASS.
- [ ] **Step 5:** Commit `feat(band-viewer): hinge unfold of a band around its plane-parallel anchor facet`.

### Task 2: Resolve the highlighted band

**Files:**
- Modify: `src/lib/stores/selectionStores.ts` (export `tubesForGeometrySource`)
- Create: `src/lib/band-viewer/resolve-band.ts`
- Test: `src/lib/band-viewer/__tests__/resolve-band.test.ts`

**Interfaces:**
- Produces: `resolveHighlightedBand(highlight: AssemblerHighlight, tubesOf: (source: GeometrySource, globule: number) => Tube[] | undefined, spaces: PatternBandSpaceOf): { band: Band; label: string; key: string } | null`
  - `label = concatAddress_Band(highlight.band, 'tb-slash')` (pattern address, same as the pattern self-tag).
  - `key = source + ':' + concatAddress_Band(realAddress)` (identity for re-prepare and reframe).
- The store wiring in the pane uses `tubesForGeometrySource($superGlobuleStore, ...)` and `$patternBandSpaces`.

- [ ] **Step 1: Failing tests**: `null highlight → null`; `maps pattern→real through the space` (stub space where toReal(0,1)=2 → returns tubes[0].bands[2]); `stale address → null` (toReal returns a band index that doesn't exist).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement, using `patternBandToReal`. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(band-viewer): resolve assembler highlight to its real 3D band`.

### Task 3: Assembler panel store + divider + layout

**Files:**
- Modify: `src/lib/stores/uiStores.ts`
- Create: `src/components/layout/PaneDivider.svelte`
- Modify: `src/routes/assembler/+page.svelte`
- Test: `src/lib/stores/__tests__/assembler-panels.test.ts`

**Interfaces:**
- Produces in `uiStores.ts`:
  - `type AssemblerPanels = { left: number; right: number; top: number }`: `left`/`right` are the x-fractions of the two vertical dividers, `top` is the y-fraction of the horizontal one.
  - `DEFAULT_ASSEMBLER_PANELS = { left: 0.4, right: 0.6, top: 0.7 }`
  - `assemblerPanels = persistable<AssemblerPanels>(DEFAULT_ASSEMBLER_PANELS, 'AssemblerPanels', AUTO_PERSIST_KEY, true)`
  - `clampAssemblerPanels(p: AssemblerPanels, moved: 'left' | 'right' | 'top'): AssemblerPanels`: keeps `left ≥ 0.1`, `right − left ≥ 0.1`, `right ≤ 0.9`, and `top ∈ [0.15, 0.9]`. The moved divider is clamped against its neighbors, which stay put.
- `PaneDivider.svelte` props: `{ orientation: 'vertical' | 'horizontal'; position: number /* fraction */; container: HTMLElement | undefined; onchange: (fraction: number) => void; style?: string }`. It uses `asDraggable` with `relativeTo: 'parent'` and `Dummy: transparentDragImage()`, styled like designer2's `.divider`/`.handle`, with the handle following the cursor along the divider.
- Page grid: `grid-template-columns: {left}fr {right−left}fr {1−right}fr`, `grid-template-rows: {top}fr {1−top}fr`, with panes model | band | pattern, and data spanning all three columns. Vertical dividers span the top row only (`height: top·100%`).

- [ ] **Step 1: Failing tests** for `clampAssemblerPanels`: moving left past right−0.1 clamps to right−0.1; moving right below left+0.1 clamps; right > 0.9 → 0.9; top 0.05 → 0.15; top 0.99 → 0.9; defaults unchanged.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement store and clamp, the divider, and the page layout (the band pane holds a placeholder until Task 4). **Step 4:** Tests PASS; `yarn run check` reports no new errors in the touched files.
- [ ] **Step 5:** Commit `feat(assembler): three-pane layout with draggable persisted dividers`.

### Task 4: Band viewer pane + scene

**Files:**
- Modify: `src/components/three-renderer/ThreeRenderer.svelte` (props `agentCapture = true`, `pointPick = true`)
- Create: `src/components/band-viewer/BandViewerScene.svelte`
- Create: `src/components/band-viewer/BandViewerPane.svelte`
- Modify: `src/routes/assembler/+page.svelte` (mount the pane)

**Interfaces:**
- Consumes: Task 1 (`prepareUnfold`, `applyUnfold`, `UnfoldPlan`) and Task 2 (`resolveHighlightedBand`).
- `BandViewerScene` props: `{ plan: UnfoldPlan; flatten: number /* 0..1 */; frameKey: string }`.
  - Builds once per `plan`, outside `$state`: one non-indexed `BufferGeometry` with a position attribute of length 9N. The same attribute is shared by a second geometry with an index `[3i,3i+1, 3i+1,3i+2, 3i+2,3i]` for `T.LineSegments`. Two `T.Mesh` use the face geometry, FrontSide `#d3d3d3` and BackSide `#555555` (`MeshStandardMaterial`, `polygonOffset` factor 1 / units 1); `LineBasicMaterial` `#1e5bff`.
  - `$effect` on `plan` + `flatten`: `applyUnfold` into the attribute array, set `needsUpdate`, `computeVertexNormals()`, `computeBoundingSphere()`, then `invalidate()`.
  - On a `frameKey` change only: the camera (`T.PerspectiveCamera makeDefault`, `up=[0,0,1]`, fov 30) targets `plan.centroid` from `centroid + anchorNormal·d`. `d = 1.3·R / sin(fov/2)`, where R = the bounding radius over the t=0 and t=1 shapes. If |anchorNormal·Z| > 0.99, nudge the position by `0.05·d` along world Y. OrbitControls target = centroid. Lighting copies `DesignerLighting`.
- `BandViewerPane`: a header showing the `label` (or "Select a band"), the renderer `<ThreeRenderer agentCapture={false} pointPick={false}>`, which renders the scene only when resolved, and a footer `<input type=range min=0 max=100 step=0.1>` with a % readout. The slider value is local `$state` and is kept across band changes. `plan = $derived(resolved ? prepareUnfold(resolved.band) : null)`, keyed by `resolved.key` so regeneration re-prepares.

- [ ] **Step 1:** Implement the ThreeRenderer props and the scene and pane, then mount the pane in the band column.
- [ ] **Step 2:** `yarn run check` → no new errors; `yarn lint` on the touched files is clean; `yarn test:unit` has no new failures versus main.
- [ ] **Step 3: Headless check** (`.verify-tmp.mjs` at the repo root, Playwright, against the worktree dev server on 9776+). Load `/assembler`, set View → Voronoi as needed, and click a pattern band. Assert the band pane canvas renders non-background pixels. Set the slider to 0, 50 and 100, take a screenshot each time, and confirm the images differ and contain no console errors. Drag each divider and assert the pane widths change. Delete the script afterwards.
- [ ] **Step 4:** Commit `feat(assembler): band viewer pane with live flatten slider`.

### Task 5: Review and hand-off

- [ ] Run one whole-branch code review (fresh reviewer) and fix confirmed findings.
- [ ] Push the branch (no merge; Ben merges), start the worktree dev server, and report the URL plus a note on the separate flattening-refactor task.
