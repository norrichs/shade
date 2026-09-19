# Tiled Pattern Outline-Union — Design

**Date:** 2026-07-03
**Branch:** `feature-pattern-output` (worktree `shades-new-feature`)
**Status:** Approved design, ready for implementation planning

## Problem

Tiled pattern generation emits **many** SVG `<path>` elements per band — roughly
one per line segment — each rendered with a `stroke-width` and
`stroke-linecap="round"`. These widthed strokes visually overlap to form the
material shape (e.g. a grid, a carnation). For manufacturing we need the actual
geometry, not overlapping strokes.

We want to:

1. Derive, for each widthed facet path, a **filled outline** that traces the
   outer visual edge of its stroke width (a rounded-rect for a single round-cap
   segment).
2. **Boolean-union** all the derived outlines within a single band into **one
   path** — preserving interior holes (the pattern's negative space).

This mirrors the existing **outlined** pipeline, where each band's outline is
merged with its label into one continuous path via paper.js
(`mergeOutlineWithLabel` → `unitePaths`), optionally with keep-connected gaps.

There is an explicit `TODO` in `generate-tiled-pattern.ts` describing exactly
this ("convert stroke widths to paths instead of doing so in Affinity"). This
feature is that TODO.

## Decisions (from brainstorming)

| Decision                      | Choice                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expansion engine (first pass) | `svg-path-outline` (already a dependency)                                                                                                                                   |
| Expander/union coupling       | **Fully decoupled.** Union takes generic `PathSegment[][]` and has zero knowledge of `svg-path-outline`, so Clipper or hand-rolled geometry can replace the expander later. |
| When computed                 | **On-demand**, via the existing `runPrepare()` action — not eagerly in the worker.                                                                                          |
| Scope                         | **Union only.** No gap insertion this iteration.                                                                                                                            |
| Line cap / join               | **Round**, matching the current `stroke-linecap="round"` render.                                                                                                            |
| Interior holes                | **Must be preserved.**                                                                                                                                                      |
| Render representation         | Filled silhouette `fill="rgba(200,200,200,0.1)"`, `fill-rule="evenodd"`, plus a 1px black stroke outline.                                                                   |

Approach rejected: eager computation in the worker (pays the slow expansion cost
on every edit); a parallel toggle/store/component (the existing merge pipeline
already provides on-demand trigger, per-band store, and single-path render).

## Architecture

The feature slots into the **existing merge pipeline** rather than introducing a
parallel one:

- `computeMergedBandPaths()` already produces one merged `PathSegment[]` per
  band, keyed by `band.id`, into the `mergedBandPaths` store.
- `runPrepare()` in `NavHeader.svelte` is already the on-demand trigger.
- `BandCutPatternComponent`'s `renderAsSinglePath` branch already renders
  `$mergedBandPaths.get(band.id)` as one path.

Today `computeMergedBandPaths` early-returns unless
`patternType === 'outlined'`. We extend it to also handle tiled patterns.

### New units (the swappable core)

Each is independently testable and has one clear purpose.

**1. `expandFacetStroke` — the swappable expander**
`src/lib/cut-pattern/expand-stroke.ts`

```ts
type StrokeInput = { path: PathSegment[]; strokeWidth: number; cap: 'round' };
// Returns the facet's stroke as one or more CLOSED outline contours.
export const expandFacetStroke = (stroke: StrokeInput): PathSegment[][];
```

- First implementation wraps `svg-path-outline` (round joints/caps), parses the
  returned path string into `PathSegment[]` via the existing
  `path-segment-to-paper` / SVG-path parsing utilities, and splits into contours
  at `M` boundaries.
- This is the **only** unit that imports `svg-path-outline`. Swapping engines
  means providing a different function with this signature.
- Supersedes the currently-unused `expandStroke` / `expandAndCombine` helpers in
  `generate-cut-pattern.ts` (which outline but never union). Those may be removed
  or left; not depended upon.

**2. `uniteMany` — engine-agnostic, hole-preserving union**
`src/lib/paper/path-operations.ts` (extends existing module)

```ts
export const uniteMany = (contours: PathSegment[][]): PathSegment[];
```

- Reduces a set of closed contours to a single compound path via paper.js
  boolean union.
- **Must preserve interior holes.** The existing `apply()` helper calls
  `result.reorient(false, true)`, forcing every subpath to positive area — this
  is correct for the single-contour label merge but would **fill in holes**.
  `uniteMany` uses a union path that does **not** force uniform winding, so the
  outer boundary and hole boundaries keep their opposite winding and survive as
  separate subpaths in the returned compound path. (Even-odd fill at render time
  is winding-insensitive, so holes render correctly regardless.)
- Knows nothing about strokes or `svg-path-outline` — operates purely on
  `PathSegment[][]`.
- Union of N contours is done by reduction (accumulate). If profiling shows this
  is too slow on large bands, a divide-and-conquer reduction (union pairs, then
  pairs of results) is a drop-in optimization. Noted, not built now.

**3. `buildBandUnionPath` — orchestrator**
`src/lib/cut-pattern/build-band-union-path.ts`

```ts
export const buildBandUnionPath = (
  band: BandCutPattern,
  opts?: { expander?: (s: StrokeInput) => PathSegment[][] }
): PathSegment[];
```

- For each facet: `expandFacetStroke({ path: facet.path, strokeWidth:
facet.strokeWidth ?? 1, cap: 'round' })`.
- Concatenate all contours from all facets → `uniteMany(...)`.
- `expander` defaults to `expandFacetStroke`; injectable for tests and future
  engine swaps.

### Integration

**4. Dispatcher in `prepare-merge.ts`**

Refactor `computeMergedBandPaths` into a dispatcher:

- `patternType === 'outlined'` → existing label-merge logic (unchanged).
- tiled pattern type → for each band in each tube, call `buildBandUnionPath` and
  set the result into the same `Map<bandId, PathSegment[]>`.

Prefer extracting the outlined path into `computeOutlinedMergedPaths(...)` and
adding `computeTiledUnionPaths(...)`, with `computeMergedBandPaths` as the thin
dispatcher — keeps each function focused. Same return type, same store, same
trigger. Gaps (`insertKeepConnectedBreak`) are **not** applied to tiled unions
this iteration.

**5. Render branch in `BandCutPatternComponent.svelte`**

The `renderAsSinglePath` branch currently strokes the merged path with the
**thick** `facets[0].strokeWidth` + round caps — correct for an outlined
centerline, **wrong** for a union outline (already the outer boundary).

For a tiled union path, render:

```svelte
<path
	d={svgPathStringFromSegments(unionPath)}
	fill="rgba(200,200,200,0.1)"
	fill-rule="evenodd"
	stroke="black"
	stroke-width={1}
/>
```

The component distinguishes the two cases via `patternTypeConfig.type`
(`outlined` vs tiled) — no new store state. Export needs nothing extra: the SVG
serializer captures whatever the component renders.

## Data flow

```
runPrepare()  (NavHeader, on-demand)
   → collateTubes(...)
   → computeMergedBandPaths(tubes, ..., patternType)      [dispatcher]
        outlined → computeOutlinedMergedPaths (existing)
        tiled    → computeTiledUnionPaths
                     └─ per band: buildBandUnionPath(band)
                          ├─ per facet: expandFacetStroke  (svg-path-outline)
                          └─ uniteMany(contours)           ($lib/paper, hole-preserving)
   → mergedBandPaths.set(Map<bandId, PathSegment[]>)
   → BandCutPatternComponent renders $mergedBandPaths.get(band.id)
        as filled silhouette + 1px stroke, fill-rule=evenodd
```

## Error / edge handling

- **Empty / degenerate facet** (zero-length path, missing `strokeWidth`): skip
  the facet's contribution; default `strokeWidth` to 1.
- **Disjoint band** (facets don't overlap): union legitimately yields a compound
  path of several separate silhouettes — valid, not an error.
- **Bezier facets** (carnation `C`/`Q`): `svg-path-outline` flattens curves
  (approximation) — accepted for manufacturing fidelity this iteration.
- **Union produces holes**: expected and required (grid/tristar negative space).

## Testing

- `uniteMany` unit tests:
  - Two overlapping rectangles → one rectangle (single contour).
  - Two disjoint rectangles → compound path, two contours.
  - A ring of contours enclosing empty center → **hole preserved** (outer + inner
    subpath).
- `expandFacetStroke` unit test: single `M/L` line, round cap → a closed
  rounded-rect contour of the expected bounds.
- `buildBandUnionPath` integration test: small hand-built grid band → one path
  with expected outer boundary and hole count.

## Out of scope (future)

- Gap / keep-connected insertion into tiled union paths.
- Replacing `svg-path-outline` with Clipper or hand-rolled offset geometry
  (enabled by the decoupled expander boundary).
- Configurable cap/join styles.
- Moving the computation off the main thread (worker) if it proves slow.

## Safety note

Another session is concurrently editing `VoronoiControl.svelte`. This work does
**not** touch that file. Re-verify working-tree state before implementation.
