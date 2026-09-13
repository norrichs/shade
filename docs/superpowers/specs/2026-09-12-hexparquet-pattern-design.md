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

## Architectural principle: refactor, don't add

Every node adjustment hexparquet needs already exists in some form — Asanoha's
adjacent-facet snapping and the tesselation adjuster's index-pair replacement,
across-band frame transform and index removal. Hexparquet is built by
**generalizing that existing code**, not by writing a parallel mechanism. Existing
patterns keep their behaviour, proven by characterization/snapshot tests taken
before the refactor.

Genuinely new code is limited to: the hexparquet definition (subunits + index
tables), the left-partner check, and the error banner.

## Pattern definition — `src/lib/patterns/tiled-hexparquet-pattern.ts`

### Unit frame

- x ∈ [0, 1] across the band, divided into sixths. y ∈ [0, 1] along the band,
  y = 1 at the "top" (as drawn in the design images).
- With `columnCount` N, column c occupies x ∈ [c/N, (c+1)/N] of the quad —
  columns abut, no overlap. `rowCount` is not used; the subunit cycle replaces rows.

### Subunits

`◀` = the **left apex**, defined at `(−1/6, y)`. The existing bilinear quad mapping
extrapolates it to the correct position when there is no neighbour; snaps overwrite
it when there is one. `†` = within-band snap target.

| Subunit | Segments                                                                                                                                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Red     | `◀½→0,0` (leftEdge) · `◀½→0,1` (leftEdge) · `0,1→1,1` · `1,1→5/6,½` · `5/6,½→1,0` · `0,0→2/6,0` · `2/6,0→0,1` · `2/6,1→3/6,½` · `3/6,½→2/6,0` · `3/6,½→5/6,½`              |
| Green   | `0,1→◀½` (leftEdge) · `◀½→0,0` (leftEdge, partnerDrop) · `◀½→5/6,½` · `2/6,1→3/6,½` · `3/6,½→4/6,0†down` · `4/6,1†up→3/6,½` · `3/6,½→2/6,0` · `1,1→5/6,½` · `5/6,½→1,0`    |
| Blue    | `0,1→2/6,1` · `2/6,1→0,0` · `0,1→◀½` (leftEdge) · `◀½→0,0` (leftEdge) · `0,0→1,0` (unitBottom) · `1,0→5/6,½` · `5/6,½→1,1` · `2/6,1→3/6,½` · `3/6,½→2/6,0` · `3/6,½→5/6,½` |

Subunits are emitted as **complete** `PathSegment[]` (`M`/`L`) — nothing is dropped
at generation. All snap and drop indices are therefore fixed constants of the
definition (no per-variant index recomputation, unlike `getAsanohaSegments`).

### Snap rules (node adjustment)

| Target node                 | Source                                           | Mechanism                                     |
| --------------------------- | ------------------------------------------------ | --------------------------------------------- |
| green `(4/6, 1)` †up        | adjacent red facet's `(5/6, ½)` node             | shared adjacent-facet snapper (`prev`/`next`) |
| green `(4/6, 0)` †down      | adjacent blue facet's `(5/6, ½)` node            | shared adjacent-facet snapper (`prev`/`next`) |
| ◀ in column c > 0           | column c−1's `(5/6, ½)` node, same facet         | shared adjacent-facet snapper (`self`)        |
| ◀ in column 0, left partner | partner band's `(5/6, ½)` node, same facet index | tesselation across-band replacement           |
| ◀ with no neighbour         | — (extrapolated by the mapping)                  | none                                          |

Sanity check: green's diagonal `(2/6,1)→(3/6,½)` continued collinearly reaches
`(5/6, −½)` in green's frame — exactly blue's `(5/6, ½)` on a rectangular quad.
Snaps are "continue the line into the neighbour", sourced from the neighbour's
actual mapped node, so they stay correct on distorted quads.

### Drop rules (applied last)

| Tag           | Dropped when                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `leftEdge`    | column c > 0 (it would retrace column c−1's right zigzag once ◀ is snapped)                     |
| `partnerDrop` | column 0 and the band has a left partner band                                                   |
| `unitBottom`  | the unit is not the band's last unit (it coincides with the next unit's red top line `0,1→1,1`) |

Drops use tesselation's `removeInPlace` **after every snap**, so snap indices are
never invalidated. Green's horizontal `◀½→5/6,½` is never dropped; in column c > 0
its ◀ snaps to column c−1's `(5/6, ½)` so the horizontal is continuous.

### Exports

- `generateHexparquetSubunits(columns)` → `[red, green, blue]` complete paths.
- Index tables for the given `columns`: adjacent-facet snap rules per subunit,
  across-band snap pairs, and drop indices per tag.

## Refactors of existing code

### 1. Subunit cycle — `generateTiling` mapping (`generate-tiling.ts`)

Generalize `quadBand.map((quad) => transformPatternByQuad(unitPattern, quad))` so an
entry with `subunitCount` > 1 returns one pattern per subunit and quad _i_ uses
`unitPatterns[i % subunitCount]`. Legacy patterns are `subunitCount = 1`
(unchanged). The guard lives here: if `quadBand.length % subunitCount !== 0`, emit
the band with `facets: []` and
`` error: `${type} needs a quad count divisible by ${subunitCount} (got ${N})` ``.
The generic code never hard-codes 3.

### 2. Shared adjacent-facet snapper — from Asanoha

Extract `adjustAsanohaPatternAfterMapping` + `straightenEndSegments` into a shared
snapper (e.g. `src/lib/patterns/adjust/snap-adjacent-facets.ts`):

```ts
type FacetSnapRule = { from: 'prev' | 'next' | 'self'; pairs: IndexPair[] };
snapAdjacentFacets(patternBand, quadBand, getRules: (facetIndex) => FacetSnapRule[], {
	endsMatched
});
```

- Keeps Asanoha's `endsMatched` wrap (translated clone of the first/last facet).
- Reads sources from an unmodified copy, writes via tesselation's `replaceInPlace`.
- Rules are per facet index so the subunit cycle can supply different rules for
  red/green/blue facets; Asanoha supplies the same rules for every facet.
- `getAsanohaSegments` becomes Asanoha's rules builder (start pair ← `prev` end
  pair; end pair ← `next` start pair). Asanoha's `endsTrimmed` handling stays in
  Asanoha.

### 3. Across-band frame transform — from the tesselation adjuster

Extract the `prevBandPaths` computation (`tesselation/shared/adjuster.ts:61-75`:
partner quad `b→c` aligned onto this quad `a→d`, translate + rotate) into a shared
helper used by both `adjustTesselation` and hexparquet's `adjustAfterTiling`.
Hexparquet then applies `replaceInPlace` with its across-band pairs (◀ ← partner's
`(5/6, ½)`) for bands with a left partner.

### 4. `adjustAfterTiling` gate — `generate-pattern.ts:217`

Replace the hard-coded "first band has a tube-end partner" gate with an entry flag
(default: today's behaviour). Hexparquet opts out so its `adjustAfterTiling` runs on
open tubes too. The existing band-range expansion (`bandExpand`) still applies, so
a band range sees its neighbour. When called without tubes
(`generateTiledBandPattern`), hexparquet skips the across-band snap and still
applies drops.

### 5. Left-partner flag — `bandContext` in `generateTiling`

Extend the existing `bandContext` (`hasOuterPartner`, from `bandHasFreeSide`) with
`hasLeftPartner`: true if any facet has an outer-edge partner in band
`(b − 1 + bandCount) % bandCount` of the same tube — the neighbour the tesselation
adjuster treats as `prev`. Wrapping tubes resolve through the modulo; surface
projections match partners geometrically
(`matchSurfaceProjectionCrossBandPartners`), so band 0 of an open tube has none.
Carried on the `BandCutPattern` so `adjustAfterTiling` can apply `partnerDrop`.

### Processing order for hexparquet

1. Map (refactor 1) → 2. within-band snaps `prev`/`next`/`self` (refactor 2, in
   `adjustAfterMapping`) → 3. across-band ◀ snap (refactor 3, in `adjustAfterTiling`)
   → 4. `removeInPlace` drops (end of `adjustAfterTiling`).

### Registry entry — `pattern-definitions.ts`

`tiledHexparquetPattern-0`: `subunitCount: 3`, `getPattern` returning the three
subunits, `adjustAfterMapping` (shared snapper with hexparquet rules),
`adjustAfterTiling` (across-band snap + drops, gate opt-out),
`tagAnchor: { facetIndex: 0, quadEdge: { edge: 'ab', position: 'midPoint' } }`.

### Ignored config

`rowCount`, `endsMatched`, `endsTrimmed` are ignored for hexparquet.

### To verify in code

Whether quad _i_+1 lies across green's y = 1 or y = 0 edge. This fixes whether the
`up` rule reads `prev` or `next` and whether the cycle is red→green→blue or
reversed. Settled by a test on a real flattened band; quad 0 starts the cycle.

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
- `PatternTile.svelte`: for entries with `subunitCount` > 1, preview the subunits
  stacked into one quad.
- Hide the row control for hexparquet; keep columns.

## Testing

Jest, TDD. Order matters — characterization before refactor:

1. **Asanoha characterization** (Asanoha has no direct tests today): snapshot mapped
   - adjusted output on fixture quads for `hasOuterMirror` on/off, `endsMatched`
     on/off, `endsTrimmed` on/off, columns 1–2. Refactor 2 must keep these identical.
2. **Tesselation regression**: the existing hex snapshot test stays green through
   refactor 3.
3. **Shared snapper** unit tests: `prev`/`next`/`self` rules, `endsMatched` wrap.
4. **Subunit mapping**: guard sets `error` for non-multiple quad counts; cycle order;
   legacy `subunitCount = 1` unchanged.
5. **Hexparquet** (rectangular fixture quads → exact coordinates): full subunit
   segment counts; up/down snaps land on the neighbour's `(5/6, ½)`; column snaps;
   ◀ extrapolates to `(−1/6, ½)`; drops for `leftEdge` / `partnerDrop` /
   `unitBottom`; quad-direction test on a real flattened band.
6. **Left-partner detection**: wrapping tube vs open surface-projection fixtures.
7. **Across-band snap**: two rectangular bands; partner `(5/6, ½)` lands on ◀.
8. Regression: all existing tests pass; `npm run check` stays at the ~434 baseline.

Visual verification: headless Playwright screenshot of designer2 with hexparquet on
a surface projection and on a wrapping projection.

## Out of scope

- Migrating other patterns (grid, carnation, …) onto the shared snapper.
- Changing geometry generation to enforce quad counts.
- Tube-end matching (`endsMatched`) for hexparquet.
