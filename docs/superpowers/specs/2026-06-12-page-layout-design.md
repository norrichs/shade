# Page-Based Pattern Layout — Design Spec

**Date:** 2026-06-12
**Branch:** `feature-page-layout` (based on local `main` @ 13bb161, which carries the line-wrap layout feature not yet on `origin/main`)
**Status:** Approved design, ready for implementation planning

## 1. Summary

Add a third cut-pattern layout mode, `page`, that distributes pattern components within real-world-dimensioned page (sheet) geometry. Pages render as filled rectangles under the pattern geometry in both the viewer and SVG export. The feature includes a floating editor to configure page geometry and layout, a swappable layout-algorithm seam, derivation/display of real-world size values, and an error flow when a pattern is too large to fit a page.

The existing `linear` and `line-wrap` layouts are preserved unchanged; the three modes are unified under a single `patternLayoutMode` config that a cycle button toggles (replacing the current "line wrap" checkbox).

## 2. Background / current state

- Layout origins are produced by the pure function `computeWrappedOrigins(items, opts)` in `src/lib/cut-pattern/compute-wrapped-origins.ts`. It handles both `linear` (no wrap) and `line-wrap` (wrap at `wrapWidth`). It returns `Vector3[]` origins in pattern coordinates. Tested in `src/lib/cut-pattern/__tests__/compute-wrapped-origins.test.ts`.
- `CutPatternRenderer.svelte` builds `WrapInput[]` from each band's _effective_ bounds (geometry bounds expanded to enclose external labels, via `effectiveBandBounds`), calls `computeWrappedOrigins`, and renders bands through `BandComponent`. It supports two ordering paths: a `sortIndex`-driven flat path and a tube-nested path.
- `CutPatternControl.svelte` holds the "line wrap" checkbox (`patternViewConfig.lineWrap`), plus `wrapWidth` and `gap` number inputs.
- `PatternViewConfig` (in `src/lib/types.ts`) holds layout view-state: `lineWrap`, `wrapWidth`, `gap`, `bandSortMode`, `patternSource`, `range`, `zoom`, `centerOffset`.
- Two overlapping legacy config fields exist on `PatternConfig` and are **left untouched** by this feature:
  - `page: PageSize` (`{ width, height, unit }`, default 300×300 mm) — drives the `CutPatternSvg` viewBox / SVG document size.
  - `pixelScale: PixelScale` (`{ value, unit }`, default `{1,'mm'}`) — mostly dormant; consumed by `generate-cut-pattern.ts`.
- The 3D model's bounding box is already computed: `SuperGlobuleMesh.bounds` (a `Box3`) in `extractMeshData` (`src/lib/stores/superGlobuleStores.ts`).
- A toast store exists (`src/lib/stores/toastStore.ts`, `toastStore.add({ type, message, duration, dismissible })`) rendered by `src/components/Toast.svelte`. It has **no** action-button support today.
- Floating/draggable panel precedents exist (e.g. `src/components/projection/BandSelectionPanel.svelte`, `src/components/modal/editor/`).

## 3. Decisions (resolved during brainstorming)

1. **Config model:** new dedicated config block for page geometry/scale; legacy `page`/`pixelScale` untouched. `patternLayoutMode` replaces `lineWrap` in `PatternViewConfig`.
2. **Multi-page arrangement:** pages stack **vertically** with a gap on the infinite SVG canvas.
3. **Fit error UX:** extend the Toast type with an optional action button; clicking it auto-applies the computed `pageScale` that makes the offending pattern fit.
4. **Derived units display:** shown inside the new floating page/layout editor.
5. **`pageScale` direction:** pattern-units **per mm**. (Confirmed.)
6. **Page layout `gap`:** in **pattern units** (consistent with the existing layout `gap`). (Confirmed.)
7. **Margin rendering:** drawn as a dashed inset on the page rectangle. (Confirmed.)

## 4. Config model

`patternLayoutMode` lives in `PatternViewConfig` (replaces `lineWrap`). The renderer maps `'line-wrap' → lineWrap=true` internally when calling `computeWrappedOrigins`. `wrapWidth` and `gap` remain for line-wrap mode.

```ts
// PatternViewConfig (src/lib/types.ts)
patternLayoutMode: 'linear' | 'line-wrap' | 'page'; // replaces `lineWrap: boolean`
// `lineWrap` field removed. Migration: existing configs with lineWrap=true → 'line-wrap', else 'linear'.
```

New persisted block on `PatternConfig`:

```ts
export type PageLayoutConfig = {
	pageSize: { width: number; height: number }; // millimetres (internal canonical unit)
	pageScale: number; // pattern-units per millimetre
	margin: number; // millimetres
	gap: number; // pattern units (spacing between adjacent patterns)
	displayUnit: 'mm' | 'inch'; // editor input display only; does not change stored values
	algorithm: 'flex-wrap'; // selects the layout algorithm from the registry
};

// PatternConfig gains:
pageLayout: PageLayoutConfig;
```

**Scale convention.** Flattening is isometric, so pattern-units and 3D-model-units share one metric scale. `pageScale` (pattern-units/mm) bridges both:

- Page dimensions in pattern coords: `pageSize.{width,height} × pageScale`.
- Margin in pattern coords: `margin × pageScale`.
- Real-world delta from a model/pattern delta: `delta / pageScale` mm.

**Default `pageScale`.** Chosen so 12 in ≈ 200 pattern units: `200 / (12 × 25.4) ≈ 0.6562` pattern-units/mm. (Flagged in the original spec as revisitable during development.)

**Unit conversion.** `1 inch === 25.4 mm`. The editor accepts inch or mm input per `displayUnit` and converts to mm for storage.

**Defaults** (in `src/lib/shades-config.ts`):

```ts
pageLayout: {
  pageSize: { width: 304.8, height: 304.8 },   // 12in × 12in
  pageScale: 0.6562,
  margin: 12.7,                                 // 0.5in
  gap: 20,                                       // pattern units (matches GAP_BETWEEN_BANDS)
  displayUnit: 'inch',
  algorithm: 'flex-wrap',
}
```

**Page-size presets:** `12in × 12in`, `8.5in × 11in`, `11in × 17in`, plus `Custom`.

## 5. Layout-algorithm seam

A pure, swappable function family lives under `src/lib/cut-pattern/page-layout/`.

```ts
// types.ts
export type LayoutItem = {
	// == existing WrapInput shape
	width: number;
	height: number;
	left: number;
	top: number;
	alignedYOffset: number;
};
export type PageGeom = {
	contentWidth: number; // (pageSize.width  × pageScale) − 2×(margin × pageScale)
	contentHeight: number; // (pageSize.height × pageScale) − 2×(margin × pageScale)
	pageWidth: number; //  pageSize.width  × pageScale (full, for page rects)
	pageHeight: number; //  pageSize.height × pageScale
	marginPx: number; //  margin × pageScale
	pageGap: number; //  vertical gap between stacked pages (pattern units)
	gap: number; //  spacing between items (pattern units)
};
export type PageLayoutResult = {
	origins: Vector3[]; // per item, page-offset already applied
	pages: { x: number; y: number; width: number; height: number }[]; // page rects, pattern coords
	overflow?: { itemIndex: number; requiredScale: number };
};
export type PageLayoutFn = (items: LayoutItem[], geom: PageGeom) => PageLayoutResult;
```

- `flexWrapPageLayout` (`page-layout/flex-wrap.ts`) is the single registered implementation.
- A registry (`page-layout/registry.ts`) maps `algorithm` id → `PageLayoutFn`, so future algorithms drop in without touching the renderer.
- `computeWrappedOrigins` is unchanged and still serves `linear`/`line-wrap`.

## 6. The flex-wrap + push-up algorithm

Reproduces CSS `flex-direction: row; flex-wrap: wrap; justify-content: flex-start; align-items: flex-start`, with an additional bounded push-up packing step.

Working in pattern coords, within a page's content box (origin at the margin inset of the current page):

1. **Row fill.** Place items left→right. The first item of a row starts at `x = 0`. An item fits the current row if `x + width ≤ contentWidth`. Otherwise start a new row.
2. **Row advance.** A new row's nominal top `rowY = prevRowBottom + gap`, where `prevRowBottom` is the max bottom edge of the previous row's items.
3. **Push-up packing** (rows after the first). Maintain a skyline (a heightmap over x-intervals of already-placed items on this page). For an item spanning `[x, x+w]`, let `skylineBottom` = max bottom edge of placed items overlapping that interval. Place its top at:
   `top = max(skylineBottom + gap, rowY − height/2)`
   This raises the item into the ragged underside of the previous row but never lifts its vertical midpoint above `rowY` (the spec's limit), and never pushes it below `rowY`.
4. **Page break.** Before committing a new row, if `rowY + rowHeight > contentHeight`, start a new page: `pageY += pageHeight + pageGap`, reset row/skyline state, place the item at the new page's content origin. Each placed item's final origin = page content origin (`pageX + marginPx`, `pageY + marginPx`) + in-page position, with the existing `left/top/alignedYOffset` shifts applied (same convention as `computeWrappedOrigins`, so content edges pack at a uniform gap).
5. **Pages output.** Emit one `pages[]` rect per page used (full page dimensions, vertically stacked).
6. **Overflow.** If any single item has `width > contentWidth` or `height > contentHeight`, record `overflow = { itemIndex, requiredScale }` and stop placing. Because patterns are a fixed size in pattern units and the page's size in pattern coords is `pageScale`-dependent, fitting a too-large item means **increasing** `pageScale`. `requiredScale` is the smallest `pageScale` at which every item fits both dimensions:
   `requiredScale = pageScale × max(itemWidth / contentWidth, itemHeight / contentHeight)`
   taking the **maximum** of that expression across all offending items (a small safety margin, e.g. ×1.02, may be added so items don't land exactly on the boundary). `itemIndex` points at the worst offender.

**Ordering.** Items are laid out in the current sort order (`bandSortMode`: tube order or end-connection), only the in-range patterns — identical to how the renderer already orders/filters bands. Page layout receives that already-ordered, already-filtered item list.

## 7. Rendering

- **`PageGeometry.svelte`** (`src/components/cut-pattern/`): given `pages[]` and `marginPx`, renders each page as a filled `<rect>` (light fill, subtle stroke) with a dashed inset `<rect>` for the margin. Rendered **before** band geometry in `CutPatternRenderer` so pages sit underneath.
- **`CutPatternRenderer.svelte`** dispatches on `patternLayoutMode`:
  - `linear` / `line-wrap`: existing `computeWrappedOrigins` path (`lineWrap = mode === 'line-wrap'`).
  - `page`: build `LayoutItem[]` from the same effective bounds, build `PageGeom` from `pageLayout` config, call the registry's algorithm. Render `<PageGeometry>` + bands at `result.origins`. If `result.overflow`, raise the fit-error toast (see §9) and fall back to the `line-wrap` origins (no page rects) so patterns stay visible while the toast prompts a scale fix.
  - Band rendering (`BandComponent`, labels, partner facets) is unchanged across all modes.
- **Export** (`svg-save.ts`) is unchanged; it captures the rendered SVG, so page rects are included automatically.

## 8. Controls + floating editor

- **`CutPatternControl.svelte`:** replace the "line wrap" `CheckboxInput` with a **cycle button** showing the current mode (`Linear` → `Line-wrap` → `Page` → `Linear`). Keep the `wrapWidth` input visible only in `line-wrap`. In `page` mode, show a button that opens the floating page editor (editor open-state stored in a small UI store).
- **`PageLayoutEditor.svelte`** (`src/components/cut-pattern/`): a floating, draggable panel modeled on `BandSelectionPanel`, toggled by a store flag. Controls:
  - Page-size preset `<select>` (12×12 in, 8.5×11 in, 11×17 in, Custom).
  - Custom width/height number inputs with an inch/mm unit toggle (`displayUnit`).
  - `pageScale` number input.
  - `margin` input (inch/mm per `displayUnit`).
  - `gap` (layout gap, pattern units) input.
  - **Display:** a small inline SVG preview of the page proportions (with margin inset).
  - **Derived-units readout** (see §10).

## 9. Toast action extension

Extend the toast system minimally:

```ts
// toastStore.ts — Toast interface gains:
action?: { label: string; onClick: () => void };
```

`Toast.svelte` renders an action `<button>` when `action` is present, calling `action.onClick` then dismissing.

The fit-error flow: when `flexWrapPageLayout` returns `overflow`, the renderer adds an `error` toast: message naming the problem and the suggested scale, with an action button "Fit page" / "Apply scale" that sets `patternConfig.pageLayout.pageScale = overflow.requiredScale`.

## 10. Derived units

`derivePageDimensions(bounds: Box3, pageScale: number): { x; y; z }` returns the model's X/Y/Z extents converted to real-world units:
`delta_mm = (bounds.max[axis] − bounds.min[axis]) / pageScale`, with both mm and inch presented (`inch = mm / 25.4`). Source bounds come from the existing `SuperGlobuleMesh.bounds`. The readout updates live as `pageScale`/geometry change and is displayed in `PageLayoutEditor`.

## 11. Testing

Pure-function unit tests under `src/lib/cut-pattern/page-layout/__tests__/`, mirroring `compute-wrapped-origins.test.ts`:

- single row (no wrap, no page break),
- wrap to a second row at `contentWidth`,
- push-up packing fills a gap, and is clamped at the `rowY − height/2` limit,
- page break when a row exceeds `contentHeight` (origins offset to the next stacked page; `pages[]` length grows),
- overflow detection sets `overflow.requiredScale` correctly for too-wide and too-tall items,
- `derivePageDimensions` conversion (mm + inch) and inch↔mm helpers.

Component-level behavior (cycle button, editor) is exercised manually / via existing patterns; the algorithm and conversions carry the unit-test coverage.

## 12. Implementation phases (for the plan)

1. Config + mode-cycle button + renderer dispatcher — `linear`/`line-wrap` behavior unchanged; `patternLayoutMode` migration from `lineWrap`.
2. `flexWrapPageLayout` algorithm + registry + `PageGeometry.svelte` rendering for `page` mode.
3. Floating `PageLayoutEditor` + page-size presets + custom size + unit toggle.
4. Derived-units `derivePageDimensions` + editor readout.
5. Toast action extension + overflow fit-error flow.

## 13. Out of scope

- Additional layout algorithms beyond `flex-wrap` (the seam supports them; none are built now).
- Reworking or removing the legacy `page`/`pixelScale`/`PatternScale` config and the existing Scalebar.
- Per-page or per-pattern manual nudging/repositioning.
- Changing the SVG export pipeline beyond what renders automatically.
