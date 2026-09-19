# Globule editing fixes and updates — design

Source request: `docs/specs/Globule editing fixes and updateds.md`
Branch: `feat/globule-editing-fixes`

Four independent changes. They share no code except that (2) and (3) both touch
radial cross-section geometry, and are therefore sequenced together.

---

## 1. Floating editor persistence

### Current behavior

`Floater.svelte` takes `closeOnClickAway` defaulting to `true`, and duplicates
its entire markup across an `{#if closeOnClickAway}` branch so the `clickOutside`
action can be omitted. `HoverSidebar.svelte:50` passes
`currentFloater?.closeOnClickAway ?? true`. Three entries in
`sidebar-definitions.ts` opt out explicitly (`Tile Editor`, `Pattern Layout`,
`Voronoi`); one opts in redundantly (`Label Editor`); the rest inherit
click-away closing from the default.

### Change

Invert the default. Staying open is the norm; closing on click-away is the
opt-in.

- `Floater.svelte`: default `closeOnClickAway = false`. Delete the duplicated
  `<main>` branch — apply `use:clickOutside` unconditionally and return early
  inside the handler when the prop is false. The action closes over the
  component's props, so no branch is needed and the panel stops remounting when
  the flag changes.
- `HoverSidebar.svelte`: `?? true` becomes `?? false`.
- `sidebar-definitions.ts`: delete every now-redundant `closeOnClickAway: false`.
  Keep `closeOnClickAway: true` only where click-away closing is still wanted —
  currently **Label Editor** alone.

### Consequence (intended)

These panels become sticky: Utilities, Selection, Configs, Rendering, Pattern
View, Pattern Scale, Silhouette, Globule Cross Section, Cross Section, Edge
Curve, Polyhedra, Surface. Label Editor keeps closing on click-away.

Note: `Floater` still tears down panel content on close/switch, so the existing
module-scope UI stores (`path-editor-ui-store.ts`,
`silhouette-editor-store.ts`) remain necessary and are untouched.

---

## 2. Cross-section division methods

`ShapeConfig.sampleMethod` drives `generateRadialShapeLevelPrototype` in
`src/lib/generate-shape.ts`, which produces the vertices of one level — and
therefore the band count of the globule.

### 2a. `divideCurve` (`By Sub-curve`) — unchanged

Divides each authored bezier into `divisions` spans. Works as expected.

### 2b. `divideCurvePath` (`By Whole Curve`) — currently wrong

Today:

```ts
const totalLength = shape.getLength();
shape.curves.forEach((curve) => {
	const ratio = curve.getLength() / totalLength;
	points.push(...curve.getPoints(Math.ceil(sampleMethod.divisions * ratio)).slice(1));
});
```

Three faults: it divides per sub-curve rather than across the joined path; it
uses `getPoints` (parameter-space, not arc-length) within each curve; and
`Math.ceil` per curve overshoots the requested total. The result stays radially
symmetric, which is the opposite of what this method is for.

**Required behavior:** join every bezier of the entire cross-section into one
`CurvePath` and divide it evenly by arc length. For a 7-side radial section with
2 beziers per side that is a 14-curve path divided into `divisions` spans, and
the boundaries are deliberately _not_ radially symmetric.

**Implementation:** the joined `CurvePath` is exactly what `generateRadialShape`
already returns, and `CurvePath.getPoint(t)` already maps `t` through cumulative
curve lengths. So:

```ts
points.push(...shape.getSpacedPoints(sampleMethod.divisions).slice(1));
```

`getSpacedPoints(d)` returns `d + 1` points; the shape is closed, so the last
duplicates the first. `slice(1)` drops the leading duplicate, matching the
"remove the first point of each curve to avoid dupes" convention already used by
the other branches, and yields exactly `divisions` vertices.

### 2c. `divideSide` (`By Side`) — new

Join the beziers of **each side** into its own `CurvePath`, divide each evenly
by arc length, and concatenate.

**Definition of a side (decided):** one side is the authored curve run as
authored — the `curves` array — not the run plus its mirror. For a
`radial-lateral` shape with `symmetryNumber` 7, that is **14** sides (7 forward
runs and 7 reflected runs, interleaved in generation order). For plain `radial`
it is 7. Vertex count is `sides * divisions`.

The spec's worked example — 7 sides, 5 beziers per side, `divisions: 3`, 21
bands — is the plain `radial` case and holds.

**Implementation:** extract from `generateRadialShape` a function returning one
`CurvePath` per emitted side:

```ts
export const radialSideCurvePaths = (config: ShapeConfig): CurvePath<Vector2>[]
```

It emits sides in the same order `generateRadialShape` emits curves today, so
sampling order continues to match geometry order. `generateRadialShape` becomes
a flatten of it — one source of truth, and the function (3) also needs.

Then in `generateRadialShapeLevelPrototype`:

```ts
} else if (sampleMethod.method === 'divideSide') {
  radialSideCurvePaths(normalized).forEach((side) => {
    points.push(...side.getSpacedPoints(sampleMethod.divisions).slice(1));
  });
}
```

### Type and UI work

- `types.ts`: add `{ method: 'divideSide'; divisions: number }` to
  `CurveSampleMethod`; add `'divideSide'` to the `isCurveSampleMethodMethod`
  array.
- `GlobuleCrossSection.svelte`: add `<option value="divideSide">By Side</option>`
  to the Sampling select.
- No other editor changes. `divideSide` is cross-section-only; `Silhouette`,
  `CrossSection`, `EdgeCurve` and the legacy `path-edit*` panels do not offer it,
  and code paths that never see it are unaffected.
- `getLevels` in `shades-config.ts` needs no change. Audited: both callers
  (`shades-config.ts:613`, `stores/stores.ts:41`) pass
  `levelConfig.silhouetteSampleMethod`, never `shapeConfig.sampleMethod`, and
  the Silhouette editor does not offer `divideSide`. It is therefore
  unreachable from this method.

---

## 3. Radial cross-section rendering

### Evidence

Gap between each curve's start point and the previous curve's end point,
measured on the radius-100 default config:

| case                      | source                             | max gap                               |
| ------------------------- | ---------------------------------- | ------------------------------------- |
| `radial`, 7 sides         | generator (`generateRadialShape`)  | **0.000**                             |
| `radial`, 7 sides         | editor preview (`radializeCurves`) | **156.4**                             |
| `radial-lateral`, 7 sides | generator                          | **200.0** (alternating 180.2 / 200.0) |

Two distinct defects.

### 3a. Preview: flipY reverses the rotation direction

`PathEditor` renders in "display space" — with `flipY`, the model reflected
about the viewBox's horizontal midline. For `GlobuleCrossSection`'s editor
config that midline is exactly `y = 0`, so the transform is `y → −y`.

`PathEditor` hands overlay snippets `curveDef: displayCurveDef`
(`PathEditor.svelte:215`) — already reflected. `radializeCurves` then rotates
copies by `+angle * i`. But mirroring is orientation-reversing: where the model
has `p3 = rot(p0, +a)` (so copy _i_ ends exactly where copy _i+1_ begins),
display space has `p0' = rot(p3', +a)`, so copy _i+1_ starts a full wedge angle
past where copy _i_ ended. Seven gaps of one wedge each — the seven tangential
lobes and the uncovered center wedge in the reported screenshot.

`pathFromCurves` hides this: it emits `M p0` once and then chains `C` segments,
so each gap is silently bridged by the following bezier bulging outward.

**Fix:** radialize in model space, then convert to display space for rendering.

- Extend `PathEditorOverlayContext` with the unreflected `modelCurveDef` and a
  `toDisplay(curves: BezierConfig[]): BezierConfig[]` helper (the existing
  `reflectCurves`, which is its own inverse). Overlays that need to compose
  geometry work in model space and hand the result back through `toDisplay`.
  `curveDef` keeps its current meaning so the `Silhouette` fill overlay is
  unaffected.
- `GlobuleCrossSection.svelte`'s `shapeOverlay` becomes
  `pathFromCurves(toDisplay(radializeCurves(modelCurveDef, …)))`.

### 3b. Generator: radial-lateral reflection and wedge angle

`rotatedCurve` reflects with `v.rotateAround(center, angle - 2 * v.angle())`,
mapping a point at θ to `angle − θ` — a mirror about the ray at `angle / 2`.
That chains only if the authored run starts at angle 0, but
`generateDefaultRadialShapeConfig` starts it at 90°. Separately,
`generateRadialShape` uses `angle = 2π / symmetryNumber` for every symmetry,
while the design note at `generate-shape.ts:143` states radial-lateral should
use `π / symmetryNumber` with the authored run spanning a half wedge.

**Fix (scope confirmed with the user):** correct both inside
`radialSideCurvePaths` — mirror about the bisector of the _authored run_ rather
than a fixed ray, and use the symmetry-appropriate wedge angle. Because
`radialSideCurvePaths` is the single source of truth shared by the generator and
the preview, the 3D geometry and the editor overlay are correct together by
construction.

**Accepted risk, explicitly agreed:** any saved config using `lateral` or
`radial-lateral` will generate different — correct — geometry after this change
and will visibly change shape. `radial` and `asymmetric` configs are unaffected
(verified: gap already 0.000).

### 3c. Honest breaks

`pathFromCurves` gains a contiguity check: when a curve's `p0` differs from the
previous curve's `p3` by more than a small epsilon, emit a fresh `M` instead of
continuing the `C` chain. A genuinely disjoint config then renders as a visible
break rather than a phantom loop. This is a safety net, not the fix for 3a/3b.

### Testing

Unit tests over `radialSideCurvePaths` asserting max joint gap ≈ 0 for `radial`,
`lateral`, `radial-lateral` and `asymmetric` across several `symmetryNumber`
values, plus a test that the preview path and the generator path agree — the
regression that would let 3a recur.

---

## 4. Arbitrary dimension measurer

### Current behavior

With Pattern Layout in `page` mode, `PageLayout.svelte` shows a "Model size"
block: X/Y/Z extents from `model3dBoundsStore`, scaled through `pageScale` by
`derivePageDimensions`, colour-coded red/green/blue, with a "show measure
points" toggle that renders six axis-extreme indicators in the 3D scene.

### Change

Add user-placed two-point measurements alongside the automatic X/Y/Z rows.

### Interaction

- A **New measurement** button in the Pattern Layout editor enters a selection
  mode, with a visible active state and a cancel affordance.
- While active, a click on the 3D model resolves to the **first** intersection
  only, then snaps to the nearest `Vector3` node of that geometry.
- First click places a **magenta** indicator (unmatched). The next click places
  a second point, both turn **black**, and the pair becomes a numbered
  measurement. Magenta therefore only ever means "awaiting a partner".
- Multiple measurements can be taken; the mode stays active until cancelled.
- Each row in "Model size" shows `1: 42.19 mm / 1.66 in` in black with a small
  `[x]` that removes that pair and its indicators.

### First-intersection handling (reuse of prior work)

The existing solution is kept exactly as-is, not reinvented. In `Scene.svelte`,
Threlte's `interactivity()` dispatches pointer events over intersections in
nearest-first order; `handleClick` calls `event.stopPropagation()` on the first,
which suppresses the rest. It is paired with two guards that must be preserved:
`interactivity({ clickDistanceThreshold: 25 })` (touchpad taps drift a few
pixels and would otherwise be classified as camera drags) and
`if (event.delta > CLICK_DELTA_THRESHOLD) return`. Nearest-node snapping reuses
`getNearestPoint` from `generate-globulegeometry.ts`.

### What is deliberately _not_ reused

`Scene.svelte`'s `selectPoint` implements a fixed-size ring buffer
(`points.unshift(point); points.slice(0, pick)`), correct for the existing
`pick: 2` / `pick: 3` transform modes but wrong for an unbounded list of pairs.
Measurement gets its own branch in `handleClick` rather than being forced
through `selectPoint`.

### Components

**`src/lib/stores/measurementStore.ts` (new)**

```ts
type Measurement = { id: string; a: Vector3; b: Vector3 | null };
```

`b: null` marks the pending, unmatched (magenta) point; there is at most one,
and it is last. Exposes `addPoint(point)`, `remove(id)`, `clear()`.

Lifetime, per the request: it subscribes to `superGlobuleStore` and clears on
geometry change, because `Vector3` node identity is not stable across
regeneration. It does **not** subscribe to `patternConfigStore`, so pattern and
pattern-layout parameter changes leave measurements intact. Not persisted; does
not survive reload.

**`interaction-mode.ts`** — add
`{ type: 'point-select-measure'; data: { pick: 2; points: Point3[] } }` to
`PointSelectInteractionMode` and a matching `interactions` entry for the prompt
text. It is covered by the existing `startsWith('point-select')` guard, so
`Scene.svelte`'s indicator block must branch on the mode type to avoid
double-rendering the transform-mode indicators.

**`Scene.svelte`** — a measure branch in `handleClick` calling
`measurementStore.addPoint(getNearestPoint(event.point, geometry))`, and a third
indicator block rendering measurement points. It reuses the module-level static
`indicatorGeometry`; per the note at `Scene.svelte:200` this geometry is
deliberately built once outside `$state`, because a Three.js `BufferGeometry`
held in `$state` gets proxied and its per-frame mutations feed back as reactive
invalidations, tripping `effect_update_depth_exceeded`. New indicators must
follow that rule.

**`ProjectionGeometryComponent.svelte` / `handleProjectionClick`** —
measurement works on projection geometry as well as globule bands (decided).
`handleProjectionClick` currently only sets `selectedProjection`; it gains the
same measure branch. Its click target is a facet address rather than a
`BandGeometry`, so nearest-node lookup needs a small variant over the facet's
points.

**`materials.ts`** — a `measurePending` (magenta) material; matched points reuse
a neutral black.

**`units.ts`** — `deriveDistance(a: Vector3, b: Vector3, pageScale: number)`
returning `{ mm, inch }`, mirroring `derivePageDimensions`. Straight-line 3D
distance: `a.distanceTo(b) / pageScale`, then `mmToInch`.

**`PageLayout.svelte`** — the button, the active/cancel state, and numbered
measurement rows appended to the Model size block.

### Testing

Unit tests for `deriveDistance` (including `pageScale` scaling and the mm→inch
conversion) and for `measurementStore`'s pairing state machine: first point
pending, second point completes the pair, third starts a new pending point,
`remove` drops the right entry, geometry change clears all.

The interaction itself is verified in the running app. Per the project's
recorded recipe, the Chrome extension is unavailable here: start `npm run dev`
and drive `designer2` with a Playwright script placed at the repo root so it can
resolve `@playwright/test`.

---

## Sequencing

1. Floater persistence (1) — independent, no geometry risk.
2. `radialSideCurvePaths` extraction + radial-lateral correction (3b) — the
   shared foundation.
3. Sampling methods (2) — consumes `radialSideCurvePaths`.
4. Preview overlay + honest breaks (3a, 3c) — consumes the same.
5. Dimension measurer (4) — independent; last because it is the largest.

## Verification

`npm run check` baseline is ~434 errors, all pre-existing — a clean run is the
unchanged total, not zero. The regression signal is the diff in that count.
`npm run test:unit` and `npm run lint` must pass.
