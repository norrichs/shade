# Band Viewer: Multi-Band Selection and Anchor Override — Design

Date: 2026-11-20
Status: draft for Ben's approval
Extends: `docs/superpowers/specs/2026-11-17-band-viewer-design.md`

## Intent

The band viewer (Assembler, middle pane) unfolds one band so Ben can see how
its flat shape sits in space. Ben now wants to unfold **many bands at once**,
up to every band in the model, to see how neighbouring bands relate as they
flatten. He also wants to pick which facet anchors each band.

## Goals

1. A button next to the Flatten slider opens a **floating editor** (the app's
   existing `Floater` panel).
2. The editor chooses which bands the viewer shows, in one of three modes:
   - **Selected**: the one highlighted band, as today. This is the default.
   - **Clicked**: band clicks in any Assembler pane (3D, pattern, data grid)
     toggle a band in or out of the viewer's own set. This is the clickable
     selector, like the pattern view's "filter band" in additive mode.
   - **Range**: numeric tube and band ranges with the pattern view's Range
     semantics (`[a, b]` inclusive, negative counts from the end, wrapping
     when start > end, "all" clears).
3. All shown bands unfold together on the one slider, **each in place around
   its own anchor** (Ben's choice "a"; to refine later). At 100% each band is
   flat in its own anchor plane where it sits in the model, so neighbours may
   overlap.
4. An **Anchor** dropdown: "auto" (default: the facet most parallel to the
   band's averaged plane, as today) or a facet number, which then anchors
   **every** shown band.
5. Live slider dragging stays smooth with every band of the model shown.

## Non-goals

- Laying bands out side by side so they don't overlap (option "b"; later).
- Facet ranges (partial bands). The viewer shows whole bands.
- Changing the pattern view's own range or click filter. The viewer's
  selection is independent.

## Anti-goals

- A click while the viewer is in Clicked mode must not also change the
  pattern pane's filter beyond what it already does today, and vice versa.
- No regression of the single-band behaviour: with mode Selected and anchor
  auto, the viewer looks and behaves exactly as it does now.

## Current state

- **Viewer**: `src/components/band-viewer/BandViewerPane.svelte` (header,
  canvas, slider) and `BandViewerScene.svelte` (one plan → one face buffer
  shared by front, back and line meshes; framing on `frameKey` change).
  `prepareUnfold(band)` / `applyUnfold(plan, t, out)` live in
  `src/lib/band-viewer/unfold-band.ts`. `resolveHighlightedBand` is in
  `resolve-band.ts`.
- **Pattern view selector** (`CutPatternControl.svelte`):
  - Click filter: `patternFilterSettings` (mode off/focus/band/tube, combine
    exclusive/additive), set `patternFilterSet` (`{source, kind, keys}`), and
    helpers in `src/lib/cut-pattern/pattern-filter.ts`.
  - Numeric range: `patternViewConfig.range` `{tubes, bands, facets}` resolved
    by `resolveRangeList` (`src/lib/projection-geometry/filters.ts`).
- **Band clicks** from every pane reach `patternFilterBandClicked(source,
  patternBand)` in pattern band space, from two call sites:
  `highlightRealBand` (`three-renderer/selection-helpers.ts`, 3D clicks) and
  `setAssemblerHighlightForBand` (`stores/bandRingStore.ts`, pattern pane and
  data grid).
- **Floating panel**: `src/components/modal/Floater.svelte` (fixed position,
  title, close button). Its content unmounts on close, so state must live in a
  module store (see the `sidebar-panels-unmount-on-close` memory).

## Approaches considered

**Where the selection lives**
- **A new viewer store (chosen).** `bandViewerSelection` in
  `src/lib/stores/bandViewerStore.ts` holds mode, clicked set, range and
  anchor, independent of the pattern filter. The two click call sites also
  call `bandViewerBandClicked(source, patternBand)`, which only acts in
  Clicked mode.
- Reusing `patternFilterSet` / `patternViewConfig.range` directly was
  rejected: the viewer would then also filter the pattern pane, which Ben
  didn't ask for.

**Rendering many bands**
- **One combined plan (chosen).** A `MultiUnfoldPlan` holds the per-band
  plans and their offsets into a single position buffer. One face geometry and
  one line geometry are shared across all bands, so there are 3 draw calls in
  total. `applyMultiUnfold` loops the per-band `applyUnfold` into subarrays.
  Every band of the default model (~6,700 facets) costs a few milliseconds per
  frame.
- One mesh trio per band was rejected: hundreds of draw calls and Svelte
  components for "all bands".

## Design

### Store (`src/lib/stores/bandViewerStore.ts`)

```ts
type BandViewerMode = 'selected' | 'clicked' | 'range';
type BandViewerSelection = {
  mode: BandViewerMode;                 // default 'selected'
  clicked: { source: GeometrySource; keys: string[] } | null; // bandFilterKey keys, pattern space
  range: { tubes?: ProjectionRange['tubes']; bands?: ProjectionRange['bands'] }; // pattern space
  anchor: 'auto' | number;              // default 'auto'
};
```

- `persistable`, like the other view settings.
- `bandViewerBandClicked(source, band)`: in Clicked mode, toggle
  `bandFilterKey(band)`. A click on a different source starts a fresh set.
  Otherwise it does nothing.
- Clicked and Range modes still set the normal highlight on click, so the
  other panes behave as today.

### Resolving the shown bands (`src/lib/band-viewer/resolve-bands.ts`)

`resolveViewerBands(selection, highlight, patternSource, tubesOf, spaces)`
returns `ResolvedBand[]` (`{band, label, key}`, same shape as today's single
result):

- **selected**: today's `resolveHighlightedBand`, as a 0- or 1-element list.
- **clicked**: each key → pattern address → `patternBandToReal` → real band.
  Missing or stale keys are skipped.
- **range**: for the current pattern source
  (`geometrySourceOfPattern($patternSourceStore)`), list the pattern tubes
  (tube indices the band space knows) and pick tubes with
  `resolveRangeList(range.tubes, tubeCount)`. In each picked tube, pick
  pattern bands with `resolveRangeList(range.bands, patternBandCount)`. An
  unset range means all.

### Unfold

- `prepareUnfold(band, opts?: { anchor?: number })`: when `anchor` is a
  number, use facet `min(anchor, facetCount − 1)`. If that facet is collapsed,
  its normal falls back to the plane normal, which is already handled.
  Otherwise use auto as today.
- `prepareMultiUnfold(plans)` → `{ plans, offsets, facetCount, centroid,
  radius, frameNormal }`, with `applyMultiUnfold(multi, t, out)`.
  - `centroid`/`radius` bound all bands at t = 0 and t = 1.
  - `frameNormal` is the single band's `anchorNormal` when there is one band.
    Otherwise it's the direction from the model origin to the centroid
    (so you look at the selection from outside the model), falling back to
    +Y when that's degenerate.

### UI

- **Pane footer**: Flatten slider plus an **Edit** button that toggles a
  `Floater` titled "Band viewer".
- **Pane header**: "Band t3/b7" for one band, "N bands" for several, or the
  hint "Select a band" / "No bands in range" / "Click bands to add them".
- **Editor content** (`BandViewerEditor.svelte`):
  - Mode radio: Selected · Clicked · Range.
  - Clicked: count of bands and a "clear" button.
  - Range: tubes and bands `[from, to]` number pairs with Set/all buttons,
    mirroring `CutPatternControl`'s Range box.
  - Anchor `<select>`: "auto", then 0 … (max facet count among the shown
    bands − 1).
- **Scene**: takes the multi plan. The camera reframes when the set of shown
  band keys changes (its sorted join is the frame key), not on slider or
  anchor changes.

## Left to the builder

- Exact component markup, styling, and floater placement.
- Whether the clicked set also has an exclusive option (default: additive
  only, since exclusive is the Selected mode).
- Tests: unit tests for the store toggle, `resolveViewerBands` (all three
  modes, stale keys, wrap/negative ranges), the anchor override and clamp, and
  the multi plan (offsets, t = 0 identity, t = 1 coplanar per band); then the
  headless check as before.

## Calls made without Ben (check while reading)

- Viewer selection is independent of the pattern view's filter and range.
- Ranges and click keys are in pattern band space with pattern labels, the
  same space the pattern view uses.
- Clicked mode is additive toggling. Selected mode covers the "one at a time"
  case.
- The anchor override clamps to the last facet of shorter bands.
- With several bands, the camera looks from outside the model toward their
  centre.
