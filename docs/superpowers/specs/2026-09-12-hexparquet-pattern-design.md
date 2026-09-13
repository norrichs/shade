# Hexparquet tiled pattern — design

Date: 2026-09-12
Branch: `feature/hexparquet-pattern`
Template: Asanoha (`src/lib/patterns/tiled-asanoha-pattern.ts`)
Preview: `2026-09-12-hexparquet-preview.svg` (rectangular quads, w = √3·h)

## Summary

Hexparquet is a new tiled cut pattern. Unlike existing tiled patterns, which map a
single unit pattern 1:1 onto every quad, hexparquet defines **3 subunits** (red,
green, blue) that **alternate** along a band, one subunit per quad. The three
together form the visible unit. Mapping each subunit to its own quad gives finer
conformance to 3D curvature.

The new behaviour is mixed into the existing tiled pipeline through optional
registry hooks. Legacy tiled patterns (`getPattern` / `adjustAfterMapping` /
`adjustAfterTiling`) are untouched.

## Pattern definition — `src/lib/patterns/tiled-hexparquet-pattern.ts`

### Unit frame

- x ∈ [0, 1] across the band, divided into sixths. y ∈ [0, 1] along the band,
  y = 1 at the "top" (as drawn in the design images).
- With `columnCount` N, column c occupies x ∈ [c/N, (c+1)/N] of the quad —
  columns abut, no overlap. `rowCount` is not used; the subunit cycle replaces rows.

### Subunits

`◀` = the **left apex**, defined as `(0, y)` in the definition and resolved to its
true position after mapping (see _Node resolution_). `†` = within-band pin.

| Subunit | Segments                                                                                                                                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Red     | `◀½→0,0` (leftEdge) · `◀½→0,1` (leftEdge) · `0,1→1,1` · `1,1→5/6,½` · `5/6,½→1,0` · `0,0→2/6,0` · `2/6,0→0,1` · `2/6,1→3/6,½` · `3/6,½→2/6,0` · `3/6,½→5/6,½`              |
| Green   | `0,1→◀½` (leftEdge) · `◀½→0,0` (leftEdge, partnerDrop) · `◀½→5/6,½` · `2/6,1→3/6,½` · `3/6,½→4/6,0†down` · `4/6,1†up→3/6,½` · `3/6,½→2/6,0` · `1,1→5/6,½` · `5/6,½→1,0`    |
| Blue    | `0,1→2/6,1` · `2/6,1→0,0` · `0,1→◀½` (leftEdge) · `◀½→0,0` (leftEdge) · `0,0→1,0` (unitBottom) · `1,0→5/6,½` · `5/6,½→1,1` · `2/6,1→3/6,½` · `3/6,½→2/6,0` · `3/6,½→5/6,½` |

Subunits are stored internally as tagged segments `{ from, to, tags }` and emitted
as `PathSegment[]` (`M`/`L`) after filtering, so drops are plain filters and pin
indices are computed after drops.

### Drop rules

| Tag           | Dropped when                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `leftEdge`    | column c > 0 (it would retrace column c−1's right zigzag once ◀ is snapped)                     |
| `partnerDrop` | column 0 and the band has a left partner band                                                   |
| `unitBottom`  | the unit is not the band's last unit (it coincides with the next unit's red top line `0,1→1,1`) |

Green's horizontal `◀½→5/6,½` is never dropped; in column c > 0 its ◀ snaps to
column c−1's `(5/6, ½)` so the horizontal is continuous.

### Node resolution (pins)

| Pin      | Node              | Resolves to                                                                                                                |
| -------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `up`     | green `(4/6, 1)`  | red neighbour quad's `(5/6, ½)`                                                                                            |
| `down`   | green `(4/6, 0)`  | blue neighbour quad's `(5/6, ½)`                                                                                           |
| `column` | ◀ in column c > 0 | column c−1's `(5/6, y)`, same quad                                                                                         |
| `apex`   | ◀ in column 0     | left partner band's `(5/6, y)` (tube-level step); otherwise extrapolated `(−1/6, y)` through **this** quad's own transform |

Sanity check: green's diagonal `(2/6,1)→(3/6,½)` continued collinearly reaches
`(5/6, −½)` in green's frame, which is exactly blue's `(5/6, ½)` on a rectangular
quad. Pins are "continue the line into the neighbour", resolved against the actual
neighbour quad so they stay correct on distorted quads.

### Export

```ts
generateHexparquetSubunits({
	columns: number,
	hasLeftPartner: boolean,
	isLastUnit: boolean
}): {
	subunits: [PathSegment[], PathSegment[], PathSegment[]]; // drops applied
	pins: SubunitPin[]; // indices valid for the returned subunits
}
```

`SubunitPin`: `{ subunit, segmentIndex, kind: 'up' | 'down' | 'column' | 'apex', unitPoint }`
where `unitPoint` is the target point in the referenced cell's unit frame.

## Pipeline integration

### Registry entry — `pattern-definitions.ts`

```ts
'tiledHexparquetPattern-0': {
	subunitCount: 3,
	getSubunits: (columns, ctx: { hasLeftPartner: boolean; isLastUnit: boolean }) => ...,
	adjustAcrossBands: (bands, tiledPatternConfig) => ...,
	tagAnchor: { facetIndex: 0, quadEdge: { edge: 'ab', position: 'midPoint' } }
}
```

`subunitCount` and `getSubunits` are new optional members of the generator type.
The generic code never hard-codes 3.

### `generateTiling` (per band) — `generate-tiling.ts`

A new branch, taken only when the entry has `getSubunits`:

1. **Guard**: if `quadBand.length % subunitCount !== 0`, emit the band with
   `facets: []` and `` error: `${type} needs a quad count divisible by ${subunitCount} (got ${N})` ``.
2. **Map**: quad _i_ → `subunits[i % subunitCount]` via the existing
   `transformPatternByQuad`. `getSubunits` is called per unit so the last unit can
   keep `unitBottom`.
3. **Resolve pins**: map each pin's `unitPoint` through the quad it references
   (`up`/`down` → neighbour quad *i*∓1; `column` → same quad; `apex` → own quad,
   extrapolated) using `transformPointByQuadrilateralTransform` with the
   **original** (un-cloned, Vector3) quads.
4. Tag anchor, `CutPattern` assembly, stroke width and SVG output reuse the
   existing code unchanged.

### Left-partner detection

A band has a left partner if any of its facets has an outer-edge partner in band
`(b − 1 + bandCount) % bandCount` of the same tube — the same neighbour the
tesselation adjuster treats as `prev`. Wrapping tubes resolve through the modulo;
surface projections match partners geometrically
(`matchSurfaceProjectionCrossBandPartners`), so band 0 of an open tube correctly
has none.

### Tube-level step — `generate-pattern.ts`

New optional hook `adjustAcrossBands(bands, tiledPatternConfig)`, run for every
in-range tube **without** the tube-end-partner gate that guards
`adjustAfterTiling` (`generate-pattern.ts:217`). Reuses the existing band-range
expansion so a band range still sees its neighbour.

For each band with a left partner, re-snap the column-0 ◀ nodes to band b−1's
`(5/6, y)`. The partner's **quad** is brought into this band's frame with the
tesselation adjuster's edge-alignment transform (partner quad `b→c` onto this quad
`a→d`; currently inline in `tesselation/shared/adjuster.ts:61-75`, to be extracted
into a shared helper), then `(5/6, y)` is mapped through it.

### Ignored config

`rowCount`, `endsMatched`, `endsTrimmed` are ignored for hexparquet.

### To verify in code

Whether quad _i_+1 lies across green's y = 1 or y = 0 edge. This fixes whether
`up` references *i*−1 or _i_+1 and whether the cycle is red→green→blue or reversed.
Settled by a test on a real flattened band; quad 0 starts the cycle.

## Errors & UI

- `BandCutPattern.error?: string`. Guard failures keep the band's address and are
  logged once per tube via `console.error`.
- `PatternView.svelte` shows a warning banner when any band has `error`, listing
  affected bands (e.g. `t2/b0: 20 quads`). Placed alongside the grid-specific
  controls block (`PatternView.svelte:418`).
- `shades-config.ts`: `tiledPatternConfigs['tiledHexparquetPattern-0']` with
  Asanoha-like defaults (`columnCount: 1`, `dynamicStroke: 'quadWidth'`,
  `endsMatched: false`, `endsTrimmed: false`).
- The pattern picker picks the type up automatically (`PatternTileButton` reads
  `tiledPatternConfigs` / `patterns`).
- `PatternTile.svelte`: for entries with `getSubunits`, preview the three subunits
  stacked into one quad.
- Hide the row control for hexparquet; keep columns.

## Testing

Jest, TDD:

- `src/lib/patterns/__tests__/tiled-hexparquet-pattern.test.ts` — per-subunit
  segment counts; `leftEdge` / `partnerDrop` / `unitBottom` drops; pin indices valid
  under every drop combination.
- Subunit tiling tests (rectangular fixture quads → exact coordinates): guard sets
  `error` for non-multiple-of-3 quad counts; cycle order; `up`/`down` pins land on the
  neighbour's mapped `(5/6, ½)`; `apex` extrapolates to `(−1/6, ½)`; quad-direction
  test on a real flattened band.
- Left-partner detection: wrapping tube vs open surface-projection fixture facets.
- Cross-band snap: two rectangular bands; partner `(5/6, ½)` lands on this band's ◀.
- Regression: existing tiled pattern tests pass; `npm run check` stays at the ~434
  error baseline.

Visual verification: headless Playwright screenshot of designer2 with hexparquet on
a surface projection and on a wrapping projection.

## Out of scope

- Other subunit-based patterns (the hooks are generic, but only hexparquet is built).
- Changing geometry generation to enforce quad counts.
- Tube-end matching (`endsMatched`) for hexparquet.
