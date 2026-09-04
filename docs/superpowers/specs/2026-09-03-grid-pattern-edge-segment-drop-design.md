# Grid Pattern: Band-Level Edge Segment Dropping

**Date:** 2026-09-03
**Branch:** `feat/grid-pattern-edge-segment-drop`
**Status:** Approved design, ready for implementation planning

## Problem

`tiledGridPattern` is currently invariant with respect to band-level context: the
unit pattern is generated once per band and mapped identically onto every quad.
Where two bands meet along their long edges, both bands draw a full-height
vertical line, so the seam between them reads as a solid double line.

We want the lower-index band of each adjacent pair to drop a regular subset of
its outer-edge line segments, breaking up that seam.

## The Rule

### Orientation

A band's pattern is a `PathSegment[][]` — one `PathSegment[]` per quad, in band
order. Within the unit square that `generateGridPattern` emits:

- **y (rows) runs along the band**, quad to quad. This is why `start` and `end`
  segment groups are partitioned out of the emitted array: they are the band's
  ends, and downstream `endsTrimmed` handling relies on that grouping.
- **x (columns) runs across the band's width.** Column `columns - 1` sits on the
  band's **outer** long edge — the same side `tiled-asanoha-pattern.ts` calls
  `w6` and mirrors when `finishOuterEdge` is set.

**Edge segments** are the vertical `['M', w, 0] → ['L', w, h]` pairs emitted by
the last column's units: one pair per row, per quad. These are the only segments
this feature touches. Interior column verticals, the horizontal start/end
segments, and the triangle-variant diagonals are all left alone.

### Selection

Index the edge segments globally along the band, 0-based:

```
k = quadIndex * rows + r        // r is the row index within the quad
```

> **Drop the edge segment when `k` is odd, except when it is the final row of the
> final quad** (`k === quadCount * rows - 1`).

Worked cases:

| rows × columns | global `k` per quad   | dropped                                                      |
| -------------- | --------------------- | ------------------------------------------------------------ |
| 1 × 1, 6 quads | q0:0, q1:1, q2:2, …   | k = 1, 3 (k = 5 exempt) → every other quad, never the last   |
| 1 × 2          | same                  | same `k`, segment sits in the last column only               |
| 2 × 2          | q0: 0,1 — q1: 2,3     | k = 1, 3 → one per quad, never a quad's first row            |
| 3 × 2          | q0: 0,1,2 — q1: 3,4,5 | k = 1 (2nd row of q0), then 3 and 5 (1st and 3rd rows of q1) |

Each band computes its own `k` sequence from its own quad 0. Drops are **not**
phase-aligned across bands; no cross-band coordination is attempted.

### Which bands are treated

A band is treated if and only if its **outer long edge has an adjacent partner
band**, read from the 3D facet meta graph. `generate-tiled-pattern.ts` already
performs exactly this lookup in `bandHasFreeSide(band)`, so:

```
hasOuterPartner = !bandHasFreeSide(band)
```

Consequences, all of which fall out of the definition rather than needing
special cases:

- **Individual projection tubes** (populated via `matchTubeEnds`/`matchFacets`
  in `generate-projection.ts`) wrap around, so every band has an outer partner
  → every band is treated.
- **Globule tubes are not treated.** `generateGlobuleTube`
  (`generate-shape.ts`) calls `generateProjectionBands` directly and never
  calls `matchTubeEnds`/`matchFacets`, so its facets' `meta` is never
  populated. `bandHasFreeSide` reads `facet.meta?.[outerEdge]?.partner`, which
  is `undefined` for every facet on this path, so it always returns `true` and
  `hasOuterPartner` is always `false`. The feature is inert on plain globule
  cut patterns.
- **Non-tubular tubes** (surface projection, surface voronoi): the last band's
  outer side borders open space → it is not treated.
- **"The lower-index band drops"** is automatic. A band only ever drops on its
  own outer side, and the outer side faces the higher-index neighbour. The
  higher-index band never drops on its inner side.
- **Start and end partners are never consulted.** Only the outer side edge
  matters.

One deliberate consequence: in a tubular tube the last band's outer partner is
band 0 — a _lower_ index. The outer-side rule still applies there, so the last
band drops on that seam. This is what "each band gets this treatment" for
tubular geometry requires, and it takes precedence over a literal reading of
"the band with lower index drops".

### Real reach and a known false-positive mode

Summarizing the above for a future reader: the feature is active on multi-tube
projection geometry (every band there has real outer-partner meta), and inert
on plain globule tubes (no `meta` at all, per the consequence above) and on
voronoi-surface bands whose outer edge is genuinely free — the latter is
correct by design, not a gap.

There is one known false positive. `hasOuterPartner` comes from
`bandHasFreeSide`, which reads `facet.meta[...].partner` as set by
`getFacetEdgeMeta` (`generate-projection.ts`). That function sets `.partner`
unconditionally in all three of its branches via a plain modulo wrap over band
indices (`(b + bandOffset + bandCount) % bandCount`), with no check that the
wrap is topologically real. So on a genuinely open (non-wrapping) surface
projection, the outermost band's free outer edge can still report a partner,
and turning this feature on there will drop segments on an edge that should
stay solid — the opposite of the intent. By contrast, the voronoi path
(`generate-voronoi.ts`) only sets `.partner` on a real match, so "no partner"
there is trustworthy.

## Design

### `src/lib/patterns/tiled-grid-pattern.ts`

The implementation lives here. Two changes.

**1. Emit an index map alongside the path.**

`generateGridPattern` currently assembles the path from three separately
accumulated groups (`startSegments`, `middleSegments`, `endSegments`) and
concatenates them at the end, so absolute indices are not known until concat
time. The outer-edge vertical always lands in `unit.middle`, whose internal
offset differs by variant (`rect` puts it at +2/+3; the triangle variants at
+4/+5, after the diagonal).

Introduce:

```ts
generateGridPatternWithMeta(props): {
  path: PathSegment[];
  outerEdgeSegmentIndices: number[][];   // one [mIdx, lIdx] per row, row order
}
```

The indices are recorded inside the same loop that pushes the segments — as
offsets into the middle group, resolved to absolute indices (`startSegments.length

- offset`) at concatenation. A single pass is the whole point: a second function
  that re-derives the layout would drift from the generator.

`generateGridPattern` becomes a thin wrapper returning `.path`, so every existing
caller is unaffected.

**2. Implement the adjuster.**

`adjustRectPatternAfterTiling` is today a no-op passthrough. Rename it to
`adjustGridPatternAfterMapping` and implement:

- Return `patternBand` unchanged when `config.dropEdgeSegments` is false or
  `bandContext.hasOuterPartner` is false.
- Otherwise recompute `outerEdgeSegmentIndices` for the current
  `rows`/`columns`/`variant`, walk the quads, and filter out the `M`/`L` pairs
  whose global `k` is selected by the rule above.

This is index-safe for two reasons, both of which must hold and should be
asserted by tests:

- `transformPatternByQuad` maps segments element-wise, so a unit-pattern index is
  still valid on the mapped facet path.
- `adjustAfterMapping` runs in `generateTiling` immediately after mapping, before
  `endsTrimmed` handling, `adjustAfterTiling`, stroke width application, or SVG
  string generation. Nothing has reordered or trimmed the array yet.

### Plumbing the band context

`adjustAfterMapping` has no access to band adjacency today. Extend its signature
in `src/lib/types.ts` with an optional fifth argument — a context object rather
than another positional boolean:

```ts
adjustAfterMapping?: (
  patternBand: PathSegment[][],
  quadBand: Quadrilateral[],
  tiledPatternConfig: TiledPatternConfig,
  finishOuterEdge?: boolean,
  bandContext?: { hasOuterPartner: boolean; bandIndex: number }
) => PathSegment[][];
```

In `generateTiling`, hoist the existing `bandHasFreeSide` call (currently
evaluated only as part of the `finishOuterEdge` expression) so its result serves
both purposes, and pass the context. Existing adjusters ignore the extra
argument; no behaviour changes for them.

While in `generateTiling`, guard the band lookup as `bands?.[bandIndex]` and
treat a missing band as `hasOuterPartner: false`. `generateTiledBandPattern`
calls `generateTiling` without a `bands` property, which is one of the
pre-existing type errors in the baseline; the guard keeps the new code from
making that path worse, but fixing that call site is out of scope.

### Config and UI

- `src/lib/types.ts`: add `dropEdgeSegments?: boolean` to
  `TiledPatternConfig['config']`.
- `src/lib/shades-config.ts`: default to `false`, so existing saved configs and
  the current visual output are unchanged until the toggle is turned on.
- `src/components/modal/editor/PatternView.svelte`: a checkbox, shown only when
  the selected pattern type is a grid pattern.
- `src/components/controls/TilingControl.svelte`: the same control, if that panel
  is still reachable.

## Testing

Unit tests under `src/lib/patterns/__tests__/`:

1. **Index map correctness.** For each combination of `rows ∈ {1,2,3}`,
   `columns ∈ {1,2,3}` and `variant ∈ {rect, triangle-0, triangle-1}`, every
   recorded `[mIdx, lIdx]` pair addresses segments of the form `['M', size, y]`
   and `['L', size, y']` — i.e. on the outer edge, and vertical.
2. **Selection.** A pure `getDroppedGlobalRowIndices(rows, quadCount)` reproduces
   each row of the worked-cases table exactly, including the final-row exemption.
3. **Adjuster behaviour.** On a synthetic band: exactly the selected segments are
   removed, every other segment is identical to the input, and the function is a
   strict identity when `dropEdgeSegments` is false or `hasOuterPartner` is false.
4. **Regression.** `npm run check` total error count does not rise above the
   ~434 baseline.

### What tests cannot cover

No unit test can establish that "last column" is the physically correct side of
the band, or that the resulting seam looks right. That is a visual check in
`/designer2` using the headless Playwright script run from the repo root. If the
drops land on the wrong side, the fix is a side flip in the index map — possibly
conditioned on `sideOrientation` — not a redesign.

## Out of Scope

- Generalising segment dropping to other pattern types. The asanoha and
  tesselation patterns keep their current behaviour.
- Phase-aligning or otherwise coordinating drops between adjacent bands.
- Fixing the `generateTiledBandPattern` → `generateTiling` missing-`bands` call.
- Any change to how `endsTrimmed`, `endsMatched`, or `skipEdges` behave.
