# Designer UI Refactor — Remove the Fixed Pane

**Date:** 2026-08-27  
**Status:** Spec — approved, implementing

## Context

`/designer2` currently runs **two unrelated editor systems side by side**:

- **The fixed pane** — `<section class="container controls">` inlined in `src/routes/designer2/+page.svelte` (grid col 2, row 1). A `SelectBar` tab strip swaps one of ten editors into a `{#if}` chain. These are the oldest components in the app: Svelte 4 syntax (`$:`, `on:change`), the original 682-line `SuperPathEdit` bezier editor, and one panel (`StrutControl`) still wired to the legacy `configStore0` rather than `superConfigStore`.
- **The floating system** — `HoverSidebar` → `Floater`, driven by the `Map` registry in `src/components/modal/sidebar-definitions.ts`. Fully Svelte 5 runes, built on the modern reusable `PathEditor`, and where all recent work has happened (Tile Editor, Page Layout, Voronoi, Label Editor).

The fixed pane costs a permanent 600×50vh slab of screen that the `PatternViewer` could use, forces every new control to pick a system, and keeps three generations of bezier editor alive at once. This refactor **deletes the fixed pane** and moves everything worth keeping into floaters.

Outcome: one editor system, one PathEditor, and the full right column given over to the pattern view.

## Disposition of the ten fixed-pane editors

| Tab | Current component | Action | Destination |
|---|---|---|---|
| Silhouette | `SuperPathEdit` (`SilhouetteConfig`) | **refactor** | `modal/editor/Silhouette.svelte` — Silhouette tab |
| Depth | `SuperPathEdit` (`DepthCurveConfig`) | **refactor** | `modal/editor/Silhouette.svelte` — Depth tab |
| Levels | `controls/LevelControl.svelte` | **refactor** | `modal/editor/Silhouette.svelte` — controls row |
| Shape | `SuperPathEdit` (`ShapeConfig`) | **refactor** | `modal/editor/GlobuleCrossSection.svelte` |
| Pattern | `controls/TilingControl.svelte` | **refactor** | `modal/editor/PatternView.svelte` |
| Spine | `SuperPathEdit` (`SpineCurveConfig`) | **disable** | orphaned, unreachable |
| Struts | `controls/StrutControl.svelte` | **disable** | orphaned, unreachable |
| Super | `controls/super-control/SuperControl.svelte` | **disable** | orphaned, unreachable |
| Projection | `projection/ProjectionControl.svelte` | **eliminate** | deleted — superseded by the Polyhedra / Surface / Edge Curve floaters |
| Cut | `controls/CutControl.svelte` | **eliminate** | deleted — already unreachable (branch commented out) |

Confirmed decisions: Levels folds into the Silhouette floater; `PatternView` grows to full `TilingControl` parity rather than splitting; disabled means *unreachable on disk with a header comment*, not a dev flag; unrelated dead code (`path-edit-v2/`, `PathEdit.svelte`, `LevelControlV1`, `ShowControl`) is left alone.

`spineCurveConfig` and `strutConfig` still feed geometry generation (`src/lib/generate-level.ts`, `src/lib/generate-shape.ts`). Disabling their editors leaves them at their `shades-config.ts` defaults — geometry is unaffected.

## Phasing

Per the spec, in order. The fixed pane stays functional as the reference implementation through Phases 1–2.

- **Phase 1 — Build.** Extend `PathEditor` to parity; grow the three floaters. Fixed pane untouched and still working, so behaviour can be A/B compared live.
- **Phase 2 — Test and iterate.** Manual parity pass per editor; fix gaps.
- **Phase 3 — Remove the pane.** Strip the `controls` section from `+page.svelte`, re-grid the layout, mark the orphans.
- **Phase 4 — Delete.** Remove the eliminated components.

## Phase 1a — Bring `PathEditor` to parity

This is the bulk of the work. `src/components/modal/editor/PathEditor.svelte` is 111 lines; `src/components/path-edit/SuperPathEdit.svelte` is 682. Everything new is **opt-in via props defaulting to off**, so the four current consumers (`Silhouette`, `GlobuleCrossSection`, `CrossSection`, `EdgeCurve`) keep working untouched.

### The y-axis discrepancy — settle this first

The two editors disagree on coordinate convention:

- `SuperPathEdit` renders every point as `-point.y` (math convention, y-up).
- `CurveDefPath` / `DraggablePoint` render raw `point.y` (SVG convention, y-down).

They read the *same* `BezierConfig` data, so the existing floating Silhouette editor should be displaying the profile vertically mirrored relative to the fixed pane. **Open both at `/designer2` and compare before writing any code** — the answer decides the approach:

- If the floating version looks wrong, add an opt-in `flipY?: boolean` (default `false`, so `CrossSection`/`EdgeCurve` are untouched): wrap the `<svg>` contents in `<g transform="scale(1,-1)">` and negate y on the way in and out of `handleDrag` and `DraggablePoint` positioning. `Silhouette` and `GlobuleCrossSection` opt in.
- If y-down reads fine, keep it and work natively y-down.

Either way the extracted preview helpers (below) must be written **orientation-neutral** — strip the baked-in `-y` out of them rather than carrying it along.

### New prop surface

Everything is additive and defaults to today's behaviour, so `Silhouette`, `GlobuleCrossSection`, `CrossSection` and `EdgeCurve` compile and behave identically with zero edits.

```ts
{
  // existing — unchanged
  curveDef: BezierConfig[];
  config: PathEditorConfig;
  onChangeCurveDef: (curveDef: BezierConfig[]) => void;
  manualUpdate?: boolean;
  limits?: LimitFunction[];
  children?: Snippet;

  flipY?: boolean;                  // only if the comparison above calls for it

  showCurveTools?: boolean;         // the + / sp / - toolbar
  curveStep?: number;               // model units for addCurve; default canv.viewBoxData.width / 10
  minCurves?: number;               // floor for removeCurve

  coupling?: 'none' | 'anchorDragsHandles' | 'full';   // default 'none'
  enablePointTypeToggle?: boolean;  // dblclick angled <-> smooth

  showPointInputsToggle?: boolean;
  pointInputMode?: 'inline' | 'outrigger';
  editorId?: string;                // key for module-level UI state

  overlay?: Snippet<[PathEditorOverlayContext]>;       // drawn behind the curve
  overlayAbove?: Snippet<[PathEditorOverlayContext]>;  // drawn above it
}

type PathEditorOverlayContext = {
  curveDef: BezierConfig[];   // live — reflects in-progress drags
  canv: PathEditorCanvas;
  config: PathEditorConfig;
};
```

**Why `overlay` is a new prop rather than a re-typed `children`:** the four existing consumers pass guide shapes as implicit children, which Svelte types as `Snippet<[]>`. `Snippet<[]>` is not assignable to `Snippet<[Ctx]>`, so widening `children` would fail `svelte-check` at all four call sites even though it works at runtime.

Overlays need both fields of the context: `curveDef` because the prop lags mid-drag and the legacy fills update live, and `canv.scale` because stroke widths and point radii must scale — the viewBoxes in play range from `0..1` (Cross Section, Edge Curve) to `-100..100` (Silhouette). Every absolute pixel literal in the legacy markup (`r={2}`, `stroke-width="5"`, `r="4"`) has to become `k * canv.scale` or it will be invisible in one editor and canvas-filling in another.

Render order inside the `<svg>` — fills first, matching legacy:

```
{@render overlay?.(ctx)}
<CurveDefPath /> <DirectionLines />
{@render overlayAbove?.(ctx)}
{@render children?.()}     ← unchanged, still topmost
```

### Handle coupling — port `onPathPointMove` through the existing `LimitFunction` seam

The delicate core of `SuperPathEdit` is `onPathPointMove` (`path-edit/path-edit.ts:6`, ~110 lines): dragging an anchor carries its handles and its joined partner; dragging a handle on a `smooth` joint rotates the partner handle to stay colinear. The new editor has none of this.

Do **not** port it wholesale — that would reintroduce a y-flip and a second mutation path competing with `applyLimits`. It decomposes cleanly into the existing pipeline, which is already pure and Jest-testable. Add to `modal/editor/path-editor.ts`:

```ts
export const anchorDragsHandles: LimitFunction;
export const mirrorSmoothHandles: LimitFunction;
export const radialEndLock: (limitAngle: number) => LimitFunction;
```

`applyLimits` (`path-editor.ts:132`) already supplies both `newPoint` and the untouched `oldPoint`, so `dx = newPoint.x - oldPoint.x` recovers the delta legacy got from `asDraggable` — no `dx`/`dy` plumbing needed in `DraggablePoint`. In `PathEditor`, derive `effectiveLimits = [...limits, ...couplingLimits]` so coupling runs **last**, seeing the consumer-clamped position. `handleDrag`'s `if (!limits || limits.length === 0)` fast path must switch to testing `effectiveLimits.length`.

`radialEndLock` stays out of the `coupling` enum — a consumer that needs it passes it in the plain `limits` array. That keeps `ShapeConfig` knowledge out of `PathEditor`.

Fix a latent bug while here: `cloneCurveDef` inside `applyLimits` shallow-clones with `{...curve}`, so `points` arrays stay shared with the caller and limit functions mutate the original in place. Deep-clone the `points` tuple. Until that lands, new limit functions **must** follow the existing convention of assigning into `curveDef[c].points[p]` or they will silently no-op — the most likely source of a "why isn't the partner handle moving" bug.

### Logic to extract into testable `.ts`

Jest is node-env against Svelte's server builds, so nothing can be mounted — pure functions must live in `.ts` to be covered at all.

| Module | Contents | Ported from |
|---|---|---|
| `modal/editor/path-editor.ts` (extend) | the three limit functions above, plus `addCurve` / `splitCurves` / `removeCurve` / `togglePointType` | `path-edit/path-edit.ts:120–232` |
| `modal/editor/curve-preview.ts` (new) | `pathFromCurves`, `fillPathToAxis`, `mirrorCurvesAcrossY`, `reverseReflectCurves`, `rotateCurvesAroundOrigin`, `radializeCurves` | `SuperPathEdit.svelte:188–265` (inline `const`s today) |
| `modal/editor/path-editor-ui-store.ts` (new) | `pathEditorUiStore` — per-`editorId` `{ showPointInputs, pointInputMode }` | new |

Adapt, don't import: `src/components/path-edit/` stays untouched on disk, so copy the logic across. Deliberate corrections to make during the port:

- `addCurve` gains a **`step`** parameter. Legacy hardcodes `+5 / +10 / +20`, which is off-screen by ~20× in a `0..1` viewBox.
- `removeCurve` gains a `minCurves` floor. Legacy `pop()`s to zero, after which `CurveDefPath.getPathString`'s `curveDef[0].points[0]` throws.
- `togglePointType` returns a new `curveDef` instead of mutating and firing a callback. Keep the legacy guards: no-op on handles (`pointIndex` 1 or 2) and on the two outer terminal anchors; set the type on **both** sides of a joint.
- `rotateCurvesAroundOrigin` uses `Math.atan(y / x)`, which collapses quadrants II/III and divides by zero on the y-axis. Use `Math.atan2`. Radial Shape previews will then look *different from* — and more correct than — the legacy panel for any point with `x < 0`. Expect it; don't chase it as a regression.
- `mirrorSmoothHandles` must guard zero-length handles (handle dropped exactly on its anchor). Legacy's `Math.acos(...)` yields `NaN` there and the entire path vanishes. Use `atan2` and leave the partner untouched at zero length.
- The preview helpers call `$state.snapshot()`, unavailable in a plain `.ts` — use a structured deep clone, and let callers snapshot if they need to.

`path-editor-ui-store.ts` is module-level because `Floater` fully remounts panel content on close/switch, so a component-`$state` "show point inputs" toggle would reset every time. With `editorId` undefined, fall back to component-local state — no store writes, no cross-instance bleed.

Add specs under `src/components/modal/editor/__tests__/`, alongside the existing `segment-vertices` / `vertex-topology` ones. Build fresh fixtures per assertion — the shallow-clone issue above means a shared module-level `curveDef` will leak state between tests.

### New and modified sub-components

| Path | Status | Notes |
|---|---|---|
| `modal/editor/CurveToolbar.svelte` | new | `+` / `sp` / `-`, gated by `showCurveTools`. Follow `tile-editor/UnitToolbar.svelte`'s `.toolbar` idiom, not legacy's green circles. Renders in the existing `.controls` div next to the `manualUpdate` button. |
| `modal/editor/PointInput.svelte` | new | Adapted from `path-edit/PathEditInput.svelte`. Position with **`DraggablePoint`'s** formula, not legacy's `point.x - canv.minX`. Emits absolute model coords routed through the same `handleDrag`, so typed and dragged edits get identical limits. Drop legacy's `bind:point` — it mutates config behind `onChangeCurveDef`'s back. |
| `modal/editor/PointInputs.svelte` | new | The panel: toggle row plus `inline` (over-canvas) and `outrigger` (side column) layouts. |
| `modal/editor/DraggablePoint.svelte` | modify | Add `pointType` and an `ondblclick` hook; `class:angled` / `class:smooth` so the toggle is visible. **Leave the `use:asDraggable` block byte-identical.** |

**Double-click vs. drag.** The two already coexist on the same element in legacy (`SuperPathEdit.svelte:449–464`), so the pattern is proven — but a double-click still fires two full drag cycles, which can emit a spurious `onChangeCurveDef` between clicks. Mitigate by early-returning from `handleDrag` when the scaled point equals the current point (epsilon compare), and by having the double-click handler build from the current `curveDef` and commit through `onChangeCurveDef`. Do **not** add `preventDefault`, `pointerdown` handlers, or a click-count timer to `DraggablePoint` — that is exactly where "delicate" bites.

### The one genuinely hard piece: radial end-lock

`onPathPointMove`'s `isEnd && isPoint` branch (`path-edit.ts:56–71`) hardcodes `x = -r·sin(angle)`, `y = r·cos(angle)` — angle measured from **+y** in a **y-up** frame, first curve pinned to ray 0, last to `limitAngle`. Transposing to y-down is a sign flip plus a possible ray swap, and it is invisible until driven by a radial `ShapeConfig` with `symmetryNumber >= 3`. Budget real time, keep `radialEndLock` opt-in, and unit-test it against known `(r, symmetryNumber)` pairs rather than eyeballing.

### Order of work

Each step ships independently and leaves the four current consumers green. `Cross Section` and `Edge Curve` are the safest test beds for steps 1–5 because they already pass `limits`; `Silhouette` and `Globule Cross Section` are also already registered at `/designer2` (`projectionConfigs` spreads `...globuleConfigs`), so both new and legacy editors can be compared side by side throughout.

1. **Pure helpers, no UI.** Extend `path-editor.ts`, create `curve-preview.ts`, add the Jest specs. Verify with `npm run test:unit` only.
2. **Curve toolbar.** Verify in Cross Section that `+` appends a curve sized to its `0..1` viewBox — this is the check that parameterising `step` was necessary — that `sp` splits without visibly changing the path, and that `-` stops at `minCurves`.
3. **Coupling limits.** Land them with `coupling="none"` first and re-drag every point in Cross Section and Edge Curve to confirm `endPointsZeroX` / `endPointsMatchedX` / `neighborPointMatch` are bit-identical to before. Only then enable `"full"`.
4. **Double-click toggle.** Confirm both sides of a joint flip together, terminals and handles no-op, and the change survives `onChangeCurveDef`. `pointType` is optional on `PointConfig2` (`types.ts:885`) and persisting a toggle writes it into `superConfigStore` and thus into saved designs — verify the config serialisation round-trips it before moving on.
5. **Point inputs.** Typed values must clamp through the same limits as drags. Close and reopen the Floater to confirm the toggle survived the remount.
6. **Overlays.** Port the mirrored fill and the radial fill.

## Phase 1b — Grow the three floaters

### `modal/editor/Silhouette.svelte` — Silhouette + Depth + Levels

Currently 62 lines with dead imports, a "Print Silhouette" debug button, and a **non-reactive** `let silhouette = $superConfigStore...` that never updates when the config changes externally (it survives today only because `Floater` remounts its content on every open). Rebuild it:

- A `[Silhouette] [Depth]` tab strip; one 400×400 `PathEditor` at a time, with `showCurveTools`, `showPointInputsToggle`, `enablePointTypeToggle`, `coupling="full"`, `editorId`, and `limits={[neighborPointMatch]}`.
- Silhouette tab: mirrored-fill overlay plus a sampled level-line overlay (`getCurvePoints` / `getLevelLines` from `$lib/generate-level`) via the `overlay` snippet. `getCurvePoints` returns Three.js vectors — map them to plain `{x, y}` at the snippet boundary and never let one land in a `$state` rune.
- Depth tab: the depth curve, plus a **`depthCurveBaseline` number input**. This field (`types.ts:922`) has no control in the fixed pane at all — it is currently only reachable through the generic settings browser, and a recent commit (`4a90fdf`) had to fix it being hardcoded. Adding it here is a small deliberate step beyond parity.
- Controls row absorbing `LevelControl.svelte`: `levelCount`, `silhouetteSampleMethod.method` + `divisions`, and `levelOffsets[0]` x/y/z/rotX/rotY/rotZ (degrees in the UI, radians in the store).
  - Two bugs in `LevelControl` not to reproduce: `updateStore` writes only `rotZ`, silently dropping `rotX`/`rotY`; and `sgIndex` is hardcoded to `0` with an `update()` helper that is defined but never called, so the panel ignores band selection. Wire all three rotations, and drive `sgIndex` from `$selectedBand.s`.
- Read config through `$derived` off `$superConfigStore` so external config loads propagate. Keep the active tab in a **module-level store** (`Floater` remounts panel content on every close/switch, so component `$state` would reset the tab each time).
- Register with `closeOnClickAway: false` — a drag-heavy editor should not vanish when you click the 3D viewport.

### `modal/editor/GlobuleCrossSection.svelte` — Shape

Currently 71 lines; its header incorrectly reads "Silhouette". Add the Shape-only controls from `SuperPathEdit`'s toolbar: side length, `symmetryNumber`, `symmetry` (`asymmetric` / `radial` / `lateral` / `radial-lateral`), `sampleMethod.method` + `divisions`. Add the radialised-fill overlay (`radializeCurves` + `pathFromCurves`). Port `setShapeConfig`'s side-length → radius math (`SuperPathEdit.svelte:126–150`), and pass `radialEndLock` through `limits` when the symmetry mode is radial. Same `$derived` config read and `closeOnClickAway: false` treatment. Note that legacy `handleSymmetryChange` calls `update()` with three args against a two-arg signature — do not copy the bug.

### `modal/editor/PatternView.svelte` — Pattern

Grows from 50 lines to roughly `TilingControl`'s 333, converted to runes and the `Editor`/`Container`/`LabeledControl` idiom. Absorb: the tiled/outlined toggle, the whole `tabConfig` block (shape, tabWidth, inset, bandEdge, tabLayout, bandEnd), the algorithm-grouped `PatternTileButton` grid built from `pattern-registry` + `$tilePatternSpecStore.variants`, variant/rowCount/columnCount, dynamic stroke min/max, skipEdges, endsMatched, endsTrimmed, endLooped. Keep the four existing `patternViewConfig` show-toggles.

Do **not** port three dead controls: the "Model Height" and "Pattern Length" readouts (their values are commented out), and "Fit to page" (`fitPatternToPage`'s body is commented out, so the checkbox does nothing).

No overlap with the neighbouring floaters — `PatternScale` owns `scaleConfig.unit/quantity`, `PageLayout` owns page size.

One CSS gotcha: `TilingControl`'s tile strip is sized with `width: var(--secondary-width)`, a variable defined on `designer2`'s `<main>`. Replace it with an explicit width; that variable's meaning changes when the grid is re-laid-out in Phase 3.

## Phase 3 — Remove the pane

In `src/routes/designer2/+page.svelte`:

- Delete `<section class="container controls">` (the `SelectBar` header and the `{#if}` chain, lines 48–86), the `showControl` state, the `ShowControlCurveValue` type and its guard, and the now-unused imports (`SuperPathEdit`, `ProjectionControl`, `StrutControl`, `LevelControl`, `TilingControl`, `SuperControl`, `SelectBar`, and `ShowControl`, which is imported but never rendered).
- Re-grid to **3D left, pattern full-height right**: drop `grid-template-rows` to a single row, keep `grid-template-columns: auto var(--secondary-width)`, and collapse `.primary` / `.secondary` to single full-height cells. `viewMode` still swaps which viewer is primary. Keep the `{#if $computationMode !== '3d-only'}` gate; when it hides the pattern column, the 3D viewport should take the full width.
- Register the refactored floaters. `globuleConfigs` already carries `Silhouette` and `Globule Cross Section`; add `closeOnClickAway: false` to both.

Mark the three orphans with a header comment block stating they are dead code, why, and what replaced them: `path-edit/SuperPathEdit.svelte` (still the Spine editor), `controls/StrutControl.svelte`, `controls/super-control/SuperControl.svelte`. Note that `super-control/NumberInput.svelte` and `PointInput.svelte` are **not** orphaned — the floating editors import them.

## Phase 4 — Delete

Remove, having confirmed no remaining importers:

- `src/components/projection/ProjectionControl.svelte`, `PolygonEditor.svelte`, `PolyhedronEditor.svelte`, `EdgeControls.svelte`, `PathEditor.svelte` — a closed cluster reachable only through the Projection tab. **Do not touch** `ProjectionGeometryComponent.svelte`, `ColorMapped.svelte`, `Highlight.svelte` (used by the 3D `Scene`) or `BandSelectionPanel.svelte` (used by `NavHeader`).
- `src/components/controls/CutControl.svelte`.
- `src/components/controls/Controls.svelte` — a narrow, forced exception to "leave dead code alone": it is itself the fixed pane's `{#if}` router and it imports `CutControl`, so deleting `CutControl` alone would leave it with a broken import that `svelte-check` reports.

Confirm importer counts with `grep -rln` before each deletion, then `npm run check`.



## Verification

No component test infrastructure exists — Jest runs `testEnvironment: 'node'` against Svelte's *server* builds, so nothing can be mounted. Verification is therefore:

1. **`npm run check`** — must stay clean. This is the main automated guard, and it catches the broken-import failure modes of Phases 3–4 (it type-checks every file, including ones no route imports).
2. **`npm run test:unit`** — must stay green; any logic extracted into `.ts` during the PathEditor work gets Jest coverage there.
3. **Manual parity pass at `/designer2`** (`npm run dev`), per editor, during Phase 2 with the fixed pane still present for direct comparison. For each of Silhouette, Depth, Levels, Shape, Pattern: perform the same edit in the old pane and the new floater and confirm the 3D viewport and pattern view respond identically.
4. **Headless check** via a Playwright script run from the repo root (the Chrome extension is unavailable in this environment) to confirm `/designer2` mounts without console errors and each floater opens.

## Out of scope

- Making `Floater` draggable, resizable, or stackable; making floater open/close state persist.
- Restyling or componentizing the shared control primitives (no new Checkbox/Slider/Tabs design-system components beyond what these editors need).
- Touching the `/assembler` route, `NavHeader`, the 3D renderer, or the pattern generation pipeline.
- Unrelated dead code: `src/components/path-edit-v2/`, `path-edit/PathEdit.svelte`, `controls/LevelControlV1.svelte`, `controls/ShowControl.svelte`, `controls/AllControls.svelte`.
