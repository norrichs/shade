# Band Viewer Multi-Band Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Assembler band viewer show and unfold many bands at once. Bands are chosen in a floating editor (Selected / Clicked / Range), with an anchor-facet override.

**Architecture:** A persisted viewer-selection store sits beside the pattern filter. A pure resolver turns that selection into real bands. `prepareUnfold` gains an anchor override, and a multi plan packs per-band plans into one buffer. The existing scene renders the multi plan, and a `Floater` hosts the editor.

**Tech Stack:** Svelte 5 runes, Threlte, Three.js, Jest, Playwright (headless check).

**Spec:** `docs/superpowers/specs/2026-11-20-band-viewer-multi-design.md`

## Global Constraints

- Viewer selection is independent of `patternFilterSet` and `patternViewConfig.range`.
- Keys are `bandFilterKey` (`g:t:b`) in pattern band space; range semantics come from `resolveRangeList`.
- Mode `selected` + anchor `'auto'` must behave exactly as today.
- No allocation per slider tick; Three.js objects never in `$state`.

## Review Focus

1. Clicked keys gone stale after regeneration → skipped, no throw. Test in Task 2 (`clicked skips stale keys`).
2. Anchor override larger than a band → clamps to the last facet. Test in Task 1 (`anchor override clamps`).
3. Range over a source with no tubes → empty list. Test in Task 2 (`range with no tubes`).
4. Switching modes keeps each mode's own data (clicked set survives a trip to Range). Test in Task 2 (`toggle only in clicked mode`).
5. Every band of the model at once stays finite and coplanar per band at t=1. Test in Task 1 (`multi plan over real bands`).

---

### Task 1: Anchor override + multi plan

**Files:** Modify `src/lib/band-viewer/unfold-band.ts`; Test `src/lib/band-viewer/__tests__/unfold-multi.test.ts`

**Interfaces — Produces:**
- `prepareUnfold(band: Band, opts?: { anchor?: number }): UnfoldPlan | null`
- `type MultiUnfoldPlan = { plans: UnfoldPlan[]; offsets: Int32Array /* float offset per plan */; facetCount: number; centroid: Vector3; radius: number; frameNormal: Vector3 }`
- `prepareMultiUnfold(plans: UnfoldPlan[]): MultiUnfoldPlan | null` (null when empty)
- `applyMultiUnfold(multi: MultiUnfoldPlan, t: number, out: Float32Array): void`

- [ ] Tests:
  - `anchor override picks that facet`: `prepareUnfold(band, {anchor: 3}).anchor === 3`.
  - `anchor override clamps`: `{anchor: 999}` → `facetCount − 1`.
  - `auto unchanged`: `prepareUnfold(band)` and `prepareUnfold(band, {})` give the same anchor.
  - `multi offsets`: two plans → `offsets = [0, 9·n0]`, `facetCount = n0 + n1`.
  - `multi t=0 is identity`: the output equals each plan's `original`, concatenated.
  - `multi t=1 coplanar per band`: each band's slice is coplanar.
  - `multi frameNormal`: for one plan it equals `anchorNormal`; for several it's `normalize(centroid)`, and `(0,1,0)` when the centroid is at the origin.
  - `multi plan over real bands`: every globule-tube, projection and Voronoi band in one multi plan, with anchor auto and with anchor 2, is finite at t = 0.5 and 1 and coplanar per band at t = 1.
- [ ] Implement; tests pass; commit `feat(band-viewer): anchor override and multi-band unfold plan`.

### Task 2: Viewer selection store + resolver

**Files:** Create `src/lib/band-viewer/viewer-selection.ts` (pure: types and reducers), `src/lib/stores/bandViewerStore.ts` (persistable plus click hook), and `src/lib/band-viewer/resolve-bands.ts`. Modify `src/components/three-renderer/selection-helpers.ts` and `src/lib/stores/bandRingStore.ts` (call `bandViewerBandClicked` next to `patternFilterBandClicked`). Tests: `src/lib/band-viewer/__tests__/viewer-selection.test.ts`, `resolve-bands.test.ts`.

**Interfaces — Produces:**
- `type BandViewerMode = 'selected' | 'clicked' | 'range'`
- `type BandViewerSelection = { mode; clicked: { source: GeometrySource; keys: string[] } | null; range: { tubes?: ProjectionRange['tubes']; bands?: ProjectionRange['bands'] }; anchor: 'auto' | number }`
- `DEFAULT_BAND_VIEWER_SELECTION = { mode: 'selected', clicked: null, range: {}, anchor: 'auto' }`
- `toggleViewerClick(sel, source, band: GlobuleAddress_Band): BandViewerSelection`: no-op unless in `clicked` mode; a different source starts a fresh set; an emptied set becomes `null`.
- Store: `bandViewerSelection` (persistable `'BandViewerSelection'`), `bandViewerBandClicked(source, band)`.
- `resolveViewerBands(sel, highlight: AssemblerHighlight, rangeSource: GeometrySource, tubesOf, spaces): ResolvedBand[]`, each `{band, label: 't3/b7', key}` as in `resolve-band.ts`.
  - Range: list the tube numbers from `tubesOf(rangeSource, 0)` (sorted, unique, keeping only tubes with ≥1 pattern band). Count each tube's pattern bands by probing `space.toReal(tube, pb)` until undefined. Apply `resolveRangeList` to the tube positions and then to pattern band indices.
- [ ] Tests:
  - `toggle only in clicked mode`: the selected and range modes return `sel` unchanged.
  - `toggle adds/removes`; `other source restarts`; `empty set → null`.
  - Resolver, one test per mode: `selected = highlight`; `clicked maps keys`; `clicked skips stale keys`.
  - `range all`; `range tubes [1,1] bands [-1,-1] → last band of tube 1`; `wrapping band range`; `range with no tubes → []`.
- [ ] Implement; tests pass; commit `feat(band-viewer): viewer band selection (selected/clicked/range)`.

### Task 3: Editor + pane/scene wiring

**Files:** Create `src/components/band-viewer/BandViewerEditor.svelte`. Modify `BandViewerPane.svelte` and `BandViewerScene.svelte`.

**Interfaces — Consumes:** Task 1 (`prepareUnfold` opts, `prepareMultiUnfold`, `applyMultiUnfold`) and Task 2 (store, `resolveViewerBands`).

- [ ] **Pane:**
  - `resolved = resolveViewerBands(...)` with `rangeSource = geometrySourceOfPattern($patternSourceStore)`.
  - `multi = prepareMultiUnfold(resolved.map(r => prepareUnfold(r.band, anchorOpt)))`.
  - `frameKey` = the sorted keys, joined.
  - Header: `Band <label>` for one band, `<n> bands` for several, otherwise a mode hint ("Select a band" / "Click bands to add them" / "No bands in range").
  - Footer: an "Edit" button toggles `<Floater title="Band viewer" content={BandViewerEditor}>`.
- [ ] **Scene:** takes `plan: MultiUnfoldPlan`. Use `applyMultiUnfold`, and frame from `centroid`/`radius`/`frameNormal`.
- [ ] **Editor:**
  - Mode radios.
  - Clicked: "N bands" and a clear button.
  - Range: tubes and bands pairs (Set… / all), using `NumberInput` as `CutPatternControl` does.
  - Anchor `<select>`: `auto`, then 0 … the max facet count among the shown bands − 1. This range comes from a derived store exported by the pane module. Ruling: put `bandViewerMaxFacets` in `bandViewerStore.ts`, written by the pane.
- [ ] `svelte-check` 0 errors; lint/prettier clean; full unit suite passes.
- [ ] Headless check: on `/assembler`, open the editor, then:
  - Range all: the header reads "N bands" (N > 1). Slider 0/100 screenshots.
  - Anchor 0: no errors.
  - Clicked mode: two 3D clicks give "2 bands".
- [ ] Commit `feat(assembler): band viewer editor — multi-band selection and anchor override`.

### Task 4: Review and hand-off

- [ ] Run a fresh whole-branch review and fix confirmed Critical/Important findings with tests.
- [ ] Push the branch, start the worktree dev server, and report.
