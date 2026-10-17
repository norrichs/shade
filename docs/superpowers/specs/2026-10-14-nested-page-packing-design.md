# Nested page packing (raster bottom-left fill) — design

Status: approved 2026-10-14 (rotation step 15°, raster nesting).

## Problem

Cut-pattern pages are cut from real sheets on a laser cutter, so wasted sheet
area is wasted material. Every layout mode packs **rectangles**:

- `LayoutItem` is `{ width, height, left, top, alignedYOffset }`
  (`src/lib/cut-pattern/page-layout/types.ts`), built by `toLayoutItems` in
  `CutPatternRenderer.svelte` from each band's effective bounds (pattern extent
  ∪ external self-tag box).
- `skyline.ts` packs `w×h` boxes on a skyline, rotations 0°/90° only.
- `flex-wrap.ts` packs rows of boxes; its "push-up" only tucks a box into the
  previous row's ragged underside, bounded at half its height.
- linear / line-wrap (`compute-wrapped-origins`) use the same bounds.

Curved or chevron-shaped bands leave most of their box empty. A page that
holds 3 chevron bands under skyline could hold 7–9 if pieces interlock (e.g.
alternate pieces rotated 180°).

## Goal

A new page-layout algorithm, `'nest'`, that packs each band by its **actual
shape**, with rotation in fixed steps (default 15°), so more bands fit per
sheet. Downloads (SVG, `.lbrn2`) stay mm-true and every piece stays on a page
with at least `gap` clearance from every other piece.

Non-goals (later phases): multi-start / genetic optimisation of order and
angles; placing pieces inside holes of other pieces; common-line cutting; panel
patterns (`docs/specs/panel-pattern-page-layout.md`).

## Approach: raster bottom-left fill

Rejected alternatives: exact no-fit-polygon nesting (SVGnest/Deepnest
approach) — no maintained JS library, concave NFP is the hard part, a port is
large; GA optimiser first — wrong order, it wraps a placement heuristic we do
not have yet.

### 1. Footprints (`src/lib/cut-pattern/page-layout/nest/footprint.ts`)

Input per band: a `NestShape` — a list of convex polygons in band-local
pattern units, the same frame as `band.bounds` and the pivot.

- One convex polygon per facet: the convex hull of `flattenPath(facet.path)`
  points (the same source `patternExtentBounds` reads), inflated outward by the
  facet's `strokeWidth / 2`.
- When the external self-tag is shown, the label outline polygon (from
  `buildLabelOutlinePath` placed as `computeLabelFootprintBox` places it), or —
  if that is awkward to expose — the label's axis-aligned footprint box as a
  4-point polygon.
- Built on the main thread in `CutPatternRenderer` (`buildNestShape(band, ctx)`
  in `band-layout.ts`, cached per band like `boundsIndex`), because band data
  is not worker-transferable as-is. `NestShape` is plain JSON.

Rasterisation (worker side), per piece per angle θ in
`{0, step, 2·step, … < 360}`:

- Rotate every polygon about the band's **pivot** (bounds centre, exactly what
  `bandTransform` uses) by θ.
- Scan-convert each convex polygon into per-row spans at cell size `cell`
  (pattern units = `NEST_CELL_MM × pageScale`, `NEST_CELL_MM = 1`). A cell is
  set if the polygon touches it (conservative coverage).
- Dilate by `k = ceil((gap/2) / cell) + 1` cells with a disk kernel (row
  spans widened by `floor(sqrt(k² − dy²))` for each `dy ∈ [−k, k]`). Half the
  gap on every piece gives `gap` between pieces; the `+1` cell absorbs
  rasterisation rounding so real clearance is never less than `gap`.
- Result: `Raster = { w, h, rows: Span[][] , ox, oy }` where `(ox, oy)` maps the
  raster's top-left cell to the rotated piece's pivot frame.

Pieces must also stay inside the content box, but the dilation reaches `gap/2 +
cell` beyond the shape. The packing area is therefore the content box grown by
`gap/2 + cell` on each side (mirrors skyline's `packWidth = contentWidth +
gap`), so a piece's real geometry can touch the content edge but never cross it.

### 2. Placement (`src/lib/cut-pattern/page-layout/nest/nest.ts`)

`nestPageLayout(shapes: NestShape[], geom: NestGeom): NestLayoutResult` — pure,
synchronous, Jest-tested. `NestGeom` = `PageGeom` + `rotationStep` +
`cellSize`.

- Order: descending raster area at θ=0 (largest first); ties by original index.
- Page occupancy: `Uint8Array` grid plus a per-row prefix-sum (`Int32Array`)
  so "is span [x0,x1) of row y free" is O(1). Prefix rows are rebuilt only for
  rows a placement touched.
- For each piece, for each angle, find the bottom-left position: minimum
  `top` (y, page grows downward like skyline), then minimum `x`, where every
  span is free and the raster lies inside the pack area.
  - Coarse-to-fine: first search on a coarse grid (`COARSE = 4` cells; coarse
    occupancy = any fine cell set, coarse piece = any fine cell set, so coarse
    feasibility implies fine feasibility), then from the best coarse hit
    compact at fine resolution: repeatedly slide up (−y) while free, then left
    (−x) while free, until neither moves.
- Choose the angle with the best (y + h_fine_bottom, then x) — i.e. skyline's
  "lowest resulting bottom, then leftmost" score, applied to rasters.
- If no angle fits the current page: open a new page, place there. If the piece
  does not fit an empty page at any angle → overflow (below).
- Overflow: computed before packing, exactly like skyline: an item fits a fresh
  page if, at some tried angle, its rotated bounding box (undilated) fits the
  content box. `requiredScale = pageScale × min over angles of
  max(w/contentWidth, h/contentHeight)` for the worst item. Return
  `{ origins: [], rotations: [], pages: [], overflow }`.
- Output per piece: `origin` and `rotation` (degrees), in the same convention
  as skyline's commit so `BandComponent` / `bandTransform(origin, rotation,
  pivot)` places it: rotation is about the pivot, and `origin` translates the
  pivot-rotated band so its raster lands at the chosen cell.
- `pages`: same rects/stacking as skyline (`y = idx × (pageHeight + pageGap)`).
- `utilisation: number[]` per page = Σ undilated piece cell area / content cell
  area. Shown in the editor so nest can be compared with skyline.

`PageLayoutResult` gains optional `utilisation?: number[]`. Nest returns a
`PageLayoutResult`; origins cross the worker boundary as `{x, y}` and are
rehydrated to `Vector3` on the main thread.

### 3. Worker and wiring

- `src/lib/workers/nest-layout.worker.ts` + `nest-layout-worker-core.ts`
  (message handling, Jest-testable) + `nest-layout-worker-factory.ts` (the only
  file with `import.meta.url`, as `band-merge-worker-factory.ts`).
- `src/lib/cut-pattern/page-layout/nest/nest-client.ts`: lazily creates one
  worker; `requestNest(shapes, geom): Promise<PageLayoutResult>` with a
  monotonically increasing `requestId`; a newer request supersedes older ones
  (older promises resolve with `null` and are ignored).
- `CutPatternRenderer.svelte`:
  - `nestShapes = $derived(...)` only when `layoutMode === 'page'` and
    `algorithm === 'nest'`.
  - An `$effect` posts `(nestShapes, geom)` and writes the reply into a local
    `$state nestResult` tagged with the request id; replies for stale ids are
    dropped.
  - `pageResult`: for `'nest'`, the latest `nestResult` whose inputs are
    current; until it arrives, the skyline result (same items, `allowRotation:
    true`) so the page never blanks.
  - A `nestPending` boolean is published to the editor (value-key-guarded
    store write, like `pageLayoutInfoStore`) and `utilisation` alongside the
    page count.
- `splitBudget`: for `'nest'`, pass `allowRotation: rotationStep > 0 && 90 %
  rotationStep === 0` (the 90° orientation is then among the tried angles).

### 4. Config and UI

- `PageLayoutConfig.algorithm: 'flex-wrap' | 'skyline' | 'nest'`;
  new field `rotationStep: number` (degrees; default 15; `0` = no rotation;
  values that do not divide 360 are allowed — angles are `k·step < 360`).
- Defaults in `shades-config.ts`; backfill `rotationStep = 15` in
  `validators.ts` beside the other `pageLayout` backfills. No DB migration
  (config is JSON).
- `PageLayout.svelte`: third option "Nest (shape-aware)"; when selected, a
  rotation-step number input (degrees) and a read-only line "Material used:
  NN% · MM% …" per page plus a "computing…" hint while `nestPending`.
  `reorderWindow` / `allowRotation` stay skyline-only.

### 5. Arbitrary angles downstream

Rendering already accepts any angle (`rotate(deg pivot)`). Stage 3
(`placeBand` → `toPageSpace`, `rotateDirection`) and the LightBurn export
(reads live DOM transforms) must be confirmed with tests at 45°; fix any spot
that assumes multiples of 90°.

### 6. Testing

Unit (Jest):
- `footprint.test.ts`: square rasterises to the expected spans at 0° and 45°;
  dilation radius; rotation about pivot.
- `nest.test.ts`:
  - no overlaps: rasters pairwise disjoint; and exact check — placed polygons
    (transformed) pairwise separated by ≥ `gap` (polygon distance), using the
    convex parts;
  - every placed polygon inside the content box;
  - overflow returns `requiredScale` that, applied, makes the item fit;
  - deterministic: same input → identical output;
  - chevron fixture (a 60°-bend chevron strip like the reference screenshot,
    ~1:3 box aspect): nest places **≥ 7** per page where skyline (rotation on)
    places 3–4;
  - perf: 30 chevron-sized pieces, step 15°, completes < 2 s.
- `nest-layout-worker-core.test.ts`: request/response, stale-id handling.
- `place-bands` at 45°: page assignment and transformed outline correct.

E2E (Playwright, extends the page-layout spec): designer2, Voronoi pattern,
page mode, algorithm `nest`; wait for layout; assert every `.lbrn2` vertex
within the page union and band outline bboxes not all disjoint-by-box only
(i.e. layout ran). Best-effort; unit tests are the gate.

## Risks

- Speed at 24 angles: coarse-to-fine bounds it; perf test guards it.
- Label measured dims change after first render → shapes change → re-nest.
  Acceptable (same as skyline today); stale-id dropping prevents flicker loops.
- Reactive loops: all store writes from effects are value-key guarded.
