# Pattern post-processing 2: geometry tagging, surround cuts, page labels, LightBurn export — design

Feature source: `docs/specs/pattern-post-processing-2.md`.
LightBurn research: `docs/specs/lightburn-export-research.md`.
Builds on: `2026-09-19-pattern-post-processing-design.md` (hole dropping, stage 1b/2 split).

## Problem

A prepared cut file is cut in LightBurn on a different machine than the one
that generates it. Today that trip needs manual work at the cutter:

- Every path is black (page rects `#bbbbbb`), so everything lands on one or two
  layers and must be re-assigned by hand.
- The SVG has no physical size, so it imports at a DPI-dependent scale.
- Complex pieces snag in the waste paper when lifted off the bed.
- Pages are indistinguishable once imported.
- Filenames carry no timestamp, so iterations overwrite or blur together.

## Goals

- Every exported path carries a **geometry type**, assigned by whatever produces
  it, never re-derived from color or shape downstream.
- Geometry types map to LightBurn layers; the mapping is configurable.
- **Disconnect surround**: straight cuts from band ends to the page edge or to a
  neighbouring band, breaking up the continuous waste.
- **Connect surround**: one uncut-or-alternate-layer gap per band end in the
  outline, so the whole sheet lifts as one piece.
- **Page labels**: optional `text - config name - X of Y`, placed bottom-right,
  never colliding with geometry.
- **`.lbrn2` export**: one project, all pages, each page a group, CutSettings
  copied from a template captured on the cutting machine. Open, select page, GO.
- **Download naming**: `${name || 'untitled'} - YYYY-MM-DD HH.mm.ss.<ext>`.

## Non-goals

- Facet-boundary geometry (listed in the feature source as not implemented).
- Configurable disconnect cone angle, gap placement, or label corner. Constants
  now; UI later if wanted.
- Relying on LightBurn Material Library sync. Settings travel in the file.
- Changes to what the merge (stage 1) computes.

## Architecture

```
geometry/label change ─▶ stage 1   mergeBand            (pool)  ─▶ mergedBandPathsRaw
                        stage 1b  buildContourIndex    (pool)  ─▶ bandContourIndexes
post-process change   ─▶ stage 2   postProcessBandPath  (main)  ─▶ mergedBandPaths: Map<id, TaggedPath[]>   (drops, gap split)
layout/config change  ─▶ stage 3   pagePostProcess      (main)  ─▶ per-page disconnects, page labels
render                ─▶ every <path> carries data-geometry + mapped stroke
download              ─▶ SVG (tag-checked, mm-sized) | .lbrn2 (from tagged DOM + template)
```

Stage 3 is new. It runs at render time because disconnects and page labels
depend on final page placement, which is computed at render time
(`CutPatternRenderer.svelte` `pageResult`). It is a pure function over plain
data and runs only when bands are prepared and `layoutMode === 'page'`.

### Tagging rule

**Whoever produces geometry tags it.** Nothing downstream infers a type.

| Geometry type         | Producer                                                           |
| --------------------- | ------------------------------------------------------------------ |
| `pattern-outline`     | stage 1b contour index (depth-even contours), stage 2 output       |
| `pattern-hole`        | stage 1b contour index (depth-odd contours, tiled only)            |
| `outline-gap`         | stage 2 gap split                                                  |
| `surround-disconnect` | stage 3 disconnect search                                          |
| `label-text`          | `SvgText` (via `PatternLabel.svelte`, `OnTabLabel.svelte`)         |
| `page-label`          | `SvgText` (via the new page-label component)                       |
| `page-outline`        | `PageGeometry.svelte`                                              |

The label **tag outline** (the box around `t0/b7`) is unioned into the band
outline by stage 1, so it is part of `pattern-outline`. The label **glyphs**
never enter the merge; they are tagged where they are drawn.

**Guard.** Both exporters inspect the cleaned DOM clone. Any exported `<path>`
or `<rect>` without `data-geometry` blocks the download with an error listing
the offending elements. An untagged path would otherwise cut at the wrong
setting.

## Stage 1b: contour index

`buildHoleIndex` becomes `buildContourIndex(path, payload, patternType)` in
`cut-pattern/contour-index.ts` (the hole index file is renamed and extended).
It already splits contours and nests them by containment; it now records every
contour instead of discarding outer ones.

```ts
type ContourKind = 'outline' | 'hole';
type ContourRef = {
	start: number; // [start, end) into the merged PathSegment[]
	end: number;
	kind: ContourKind;
	depth: number;
	area: number;
	bandFraction?: number; // holes only, as today
};
type BandEnd = { point: Point; outward: Point }; // band-local, outward = unit vector
type BandContourIndex = {
	seed: number;
	contours: ContourRef[];
	axis: { origin: Point; direction: Point }; // band-local major axis
	ends: { start: BandEnd; end: BandEnd };
};
```

- **Kind** is containment depth parity: even is `outline`, odd is `hole`.
  Exact topology, not a heuristic. For `outlined` patterns every contour is
  `outline` — their only interior contours are label-tag artefacts and must
  never be dropped.
- **Axis** is the PCA major axis of the outline contours' flattened points.
- **Ends**: project outline points onto the axis; the extreme points are the
  ends. The facet centerline (already built for hole fractions) decides which
  extreme is `start` (closer to the first facet centroid) and which is `end`.
  `outward` is the axis direction pointing away from the band. On a band with
  a self-tag, the tag is the extreme at its end, so the end point sits on the
  tag, as in the source sketch.
- All of this is rigid-motion invariant, so it is computed once at prepare
  time and transformed at render time.

Outlined bands, previously skipped (`holes: []`), are now indexed.
`MergeResponse.holes` becomes `contours: BandContourIndex`; the pool, NavHeader
publish and inline path follow. `bandHoleIndexes` is renamed
`bandContourIndexes`.

## Stage 2: tagged output

```ts
type GeometryType =
	| 'pattern-outline'
	| 'pattern-hole'
	| 'outline-gap'
	| 'surround-disconnect'
	| 'label-text'
	| 'page-label'
	| 'page-outline';
type TaggedPath = { geometry: GeometryType; segments: PathSegment[]; contour?: number };
```

`postProcessBandPath(path, index, config)` returns `TaggedPath[]`: one per
surviving contour, in contour order. `contour` is the index into
`index.contours`. Dropping a hole omits its piece; `dropOutline` omits
`pattern-outline` pieces; connect surround (below) splits outline pieces.
Determinism and seeding are unchanged. Stage 2 gains `pageScale` as an input
(for the gap length).

`mergedBandPaths` becomes `Map<string, TaggedPath[]>`. `isPrepared` is
unchanged. `BandCutPatternComponent` renders one `<path>` per tagged piece. The tiled `evenodd` fill is
kept for preview only by rendering a separate non-exported fill path
(`screen-only`) from the untagged concatenation, so splitting holes into their
own paths does not lose the preview fill.

## Stroke colors: layers and mapping

`src/lib/lightburn/layers.ts`:

```ts
type LayerId = 'C00' | … | 'C29' | 'T1' | 'T2';
type LightBurnLayer = {
	id: LayerId;
	index: number; // C00–C29 → 0–29, T1 → 30, T2 → 31
	hex: string; // exact LightBurn palette value
	colorName: string; // 'black', 'blue', 'red', …
	functionName: string; // 'cut', 'skip', 'score', 'page', …
};
export const LIGHTBURN_LAYERS: LightBurnLayer[]; // all 32
```

Hex values come from the research table verbatim. Function names are
hard-coded and editable in code only.

Config, in `PostProcessConfig`:

```ts
layerMap?: Partial<Record<GeometryType, LayerId>>; // absent entries fall back to DEFAULT_LAYER_MAP
```

`DEFAULT_LAYER_MAP`: outline, hole, disconnect → `C00`; gap → `C01`;
label-text, page-label → `C02`; page-outline → `T1`.

`layerStroke(type, config)` resolves to a hex. Every producer sets
`data-geometry={type}` and `stroke={layerStroke(type)}`. The preview shows the
same colors as the export. Validators drop unknown keys and unknown layer ids.

## Stage 3: page post-process

`src/lib/cut-pattern/page-post-process/`, entry
`pagePostProcess(input): PagePostProcessResult`.

Input: pages (`PageRect[]`), per band its placement transform (origin,
rotation, pivot — the same values `bandTransform` uses), its `TaggedPath[]`,
its `BandContourIndex`, the post-process config, `pageScale`, page margin.

A band belongs to the page whose rect contains its transformed bounds centre.
All work is per page, in page (pattern) units.

### Disconnect surround

For each band on the page, for each end:

1. Transform `point` and `outward` into page space.
2. Cast rays within a cone of ±30° (`DISCONNECT_CONE_DEG`) around `outward`,
   at 2° steps. Obstacles: the outline contours of every **other** band on the
   page (flattened to segments), and the page rect's edges.
3. Keep the shortest hit. A band near the paper edge finds the edge first; an
   interior band reaches its neighbour.
4. Emit a `surround-disconnect` segment `[endPoint, hit]`.

Dedupe: when two segments connect the same pair of bands and their endpoints
are within the layout `gap` of each other's (two neighbours reaching for each
other), keep the shorter. Rays that start
inside another band's outline (overlap) are skipped. Checkbox:
`disconnectSurround?: boolean`.

### Connect surround (runs in stage 2)

`connectSurround?: { enabled: boolean; gapMm: number }`, default `gapMm: 1.5`.
Gap length in pattern units is `gapMm × pageScale`.

For each band's outline contour that contains an end point (closest outline
contour to that point), split it over the arc-length window
`[s − gap/2, s + gap/2]` where `s` is the arc-length position of the closest
point to the end. Lines split exactly; cubics split exactly via bezier-js
`split(t1, t2)` after solving t by arc length. A window that wraps the contour
start is handled by rotating the contour start first.

Result: the `pattern-outline` piece is replaced by an open `pattern-outline`
path plus an `outline-gap` path covering the window. It needs only band-local
ends and `pageScale`, not placement, so it runs in **stage 2**
(`cut-pattern/outline-gap.ts`, called from `postProcessBandPath`), not stage 3.
Skipped when `dropOutline` is on. Applies to tiled and outlined.

### Page labels

`pageLabel?: { pageNumber: boolean; text: string; configName: boolean }`.
String: `[text, configName && name, pageNumber && `${i + 1} of ${n}`].filter(Boolean).join(' - ')`.
Empty string → no label.

Placement: label box size from the existing text measurement for the label
font. Candidates start at the bottom-right content corner (inside margin),
step left by 1/4 box width across the content, then up by 1/2 box height, and
repeat. Accept the first candidate whose box:

- lies inside the content rect, and
- intersects no outline or hole segment, no disconnect segment, and no label
  glyph box on the page, and
- is not contained in any band outline.

Exact segment/box tests, not bounding boxes — a curved band's bbox covers the
corner. No fit → no label on that page, and a notice (as with overflow).
Rendered by `SvgText` with `geometry="page-label"`.

Output:

```ts
type PagePostProcessResult = {
	disconnects: { page: number; a: Point; b: Point }[];
	pageLabels: { page: number; text: string; origin: Point; unplaced?: true }[];
};
```

`CutPatternRenderer` renders disconnects and page labels in a page-space group.

## Downloads

### Naming

`fileStamp(name: string | undefined, now: Date): string` →
`${name?.trim() || 'untitled'} - YYYY-MM-DD HH.mm.ss` (local time). Used for
`.svg`, `.lbrn2` and the pattern-map `.csv` (`${stamp} pattern-map.csv`).

### SVG

`downloadSvg` (util.ts) gains: set explicit physical size on the exported root
— `width="${W}mm" height="${H}mm"` with a `viewBox` covering the pages'
union bounds, where `W = unionWidth / pageScale`. Removes the zoom-dependent
viewBox from the export. Runs the tag guard. Also: honour its `id` argument,
revoke the object URL.

### LightBurn `.lbrn2`

`src/lib/lightburn/`:

- `lbrn2-writer.ts` — pure. `writeLbrn2(project: LbProject, template?: string): { xml: string; missingLayers: LayerId[] }`.
- `lbrn2-path.ts` — pure. `PathSegment[]` (M/L/C/Q/A/Z) → `{ vertList, primList }`.
  `A` → cubic approximation; `Q` → cubic elevation. Condensed `FormatVersion="1"`
  encoding, matching files saved by LightBurn 1.7.08. Uses `c0x1`/`c1x1` for
  "no control point".
- `dom-to-lb-project.ts` — walks the cleaned DOM clone, reads `data-geometry`,
  parses `d`, applies the element's matrix relative to the export root, and
  produces an `LbProject`.
- `template.ts` — parses an uploaded `.lbrn2`, extracts `<CutSetting>` blocks
  keyed by `index`.

```ts
type LbShape = { cutIndex: number; segments: PathSegment[] } | { cutIndex: number; rect: Rect };
type LbProject = { pages: { rect: Rect; shapes: LbShape[] }[] }; // mm, Y-up
```

Rules:

- **One project, all pages**, in the same relative positions as the SVG. Units
  mm (`pattern units / pageScale`), Y flipped against the page stack's total
  height.
- **Each page is a `<Shape Type="Group">`** whose `<Children>` are the page rect
  (a `Rect` on the `page-outline` layer, T1 by default) and every shape whose
  transformed bounds centre falls on that page. One click selects a page;
  with "Cut Selected Graphics", GO cuts that page.
- **CutSettings from the template.** For each layer used, the matching
  `<CutSetting>` block is copied verbatim from the template (including any
  material-library link it carries). Missing from template, or no template →
  minimal `<CutSetting type="Cut"><index/><name/></CutSetting>` and the layer
  is reported in `missingLayers`, surfaced as a warning before download.
  Tool layers (T1/T2) get no CutSetting.
- Page outline rects come from `PageRect` data, not from the DOM.
- The tag guard runs first.

Template storage: a persistable store (`lightburnTemplateStore`, localStorage)
holding `{ fileName, xml, loadedAt }`. It is machine-level, not part of the
pattern config, and not saved to the database.

## UI

`PostProcess.svelte` gains, below the existing controls:

- **Surround**: checkbox "Disconnect surround"; checkbox "Connect surround" with
  a `NumberInput` "Gap (mm)".
- **Page labels**: checkbox "Page number", checkbox "Config name", text input
  "Text".
- **Layers**: one `<select>` per geometry type, options
  `C01 · blue · skip`, with a swatch.
- **LightBurn**: checkbox "Download as LightBurn"
  (`downloadFormat?: 'svg' | 'lbrn2'`), a file input "Load template (.lbrn2)"
  showing the loaded template name and date, and a list of layers in the
  current map missing from the template.

All pattern-side state lives in `patternConfigStore.patternConfig.postProcess`
(Floater remount-safe). NavHeader's Download button uses `downloadFormat`.
The post-process block stays excluded from NavHeader's invalidation key, so
none of these controls re-run the merge.

## Config

All new fields are optional on `PostProcessConfig`; absent means off / default.
No migration. Validators: clamp `gapMm` to (0, 20], trim `text`, drop unknown
`layerMap` entries, coerce booleans.

## Testing

- **Contour index**: kinds by depth on tiled fixtures; outlined all-outline;
  axis/ends on a hand-built straight band and a curved band; `start` end
  closest to first facet; tag end lands on tag.
- **Stage 2**: tagged output; drop modes produce identical geometry to today's
  flat output when re-concatenated; `dropOutline` removes outline pieces.
- **Layers**: 32 entries, exact hex values, unique indexes; `layerStroke`
  defaults.
- **Disconnect**: synthetic pages — edge band hits edge; two facing bands
  produce one deduped segment; cone snaps to a neighbour off-axis; overlap
  skipped.
- **Gap split**: line contour and cubic contour; window wrapping the start;
  concatenated outline + gap reproduces the original contour (lengths within
  tolerance).
- **Page label**: string composition; placement avoids a band covering the
  corner; no-fit reports unplaced.
- **lbrn2**: path encoding of M/L/C/Z round-trips against a hand-checked
  expected string; A/Q conversion within tolerance; Y flip and mm scaling;
  groups per page; template CutSetting copied verbatim; missing layers
  reported; tool layers get no CutSetting. Output parses as XML.
- **Naming**: `fileStamp` fixed date and empty name.
- **Guard**: an untagged path in a DOM fixture blocks export (jsdom-free:
  the guard takes a list of `{ tag, geometry? }`).
- **Playwright** (script from repo root): prepare on `designer2` with Voronoi,
  enable each option, confirm colors, disconnect lines, gaps, page label, and
  that the lbrn2 download produces a file.
- **Manual**: open the `.lbrn2` on the cutter; cut a single test page.

## Delivery waves

- **Wave 0 (sequential)**: geometry types, layer palette, config types,
  defaults, validators; contour index + worker/pool/store rename; stage 2
  tagged output; renderer consumes `TaggedPath[]`; `data-geometry` + stroke on
  all existing producers (band paths, `SvgText`, `PageGeometry`).
- **Wave 1 (parallel, pure modules + tests, no shared UI files)**:
  A disconnect; B gap split (`outline-gap.ts`, wired into stage 2 by B); C page-label text + placement; D lbrn2 writer +
  path encoding + template parsing; E `fileStamp`, SVG sizing, tag guard,
  DOM → `LbProject`.
- **Wave 2 (one agent)**: wire stage 3 into `CutPatternRenderer`, page-label
  component, `PostProcess.svelte`
  controls, template store, NavHeader download format; Playwright check.

## Risks

- **LightBurn format is unspecified.** The condensed encoding is inferred from
  sample files. Mitigation: match 1.7.08 output exactly; first cut is a test
  page.
- **Job origin.** Where the laser starts for a selected group depends on the
  cutter's start mode, which the file does not control.
- **Stage 3 cost.** Ray casting is O(rays × segments) per page. Bbox-prefilter
  obstacles; measure on the long tri hexparquet config.
- **Render cascade.** Stage 3 must be memoised on its inputs (see
  `pattern-pipeline-perf` findings); a view-only change must not re-run it.
- **Evenodd preview fill.** Splitting holes into separate paths loses the
  preview fill unless the screen-only fill path is kept.
