# Procedural Pattern Fills — Circle Holes

Design doc. Source idea: `docs/specs/procedural-pattern.md`.
Date: 2026-09-07. Status: approved.

## Goal

Extend the `OutlinedPatternConfig` pipeline with a new class of patterns:
procedurally generated internal geometry layered on top of the band outline the
pipeline already produces. The first such fill is **randomized circle holes**.

The fill is pluggable. `circle-holes` is the first entry in a registry; the next
fill is a new module plus one registry line, with no change to the type system.

## Non-goals

- Moving seed positions (Lloyd / centroidal relaxation).
- Shrinking circles so neighbours can grow (requires a real LP solver).
- Holes that cross a band seam. Each band packs independently.
- Holes in tab geometry. Tabs are glue surfaces and stay solid.
- Any non-circular procedural fill.

## Configuration

```ts
export type CircleHolesFillConfig = {
	kind: 'circle-holes';
	seed: number;      // reroll handle; combined with band index
	density: number;   // holes per px^2
	margin: number;    // px, target clearance from the band outline
	minRadius: number; // px
	maxRadius: number; // px
	spacing: number;   // px, target gap between circle edges
};

export type ProceduralFillConfig = CircleHolesFillConfig;

export type OutlinedPatternConfig = {
	type: 'outlined';
	tabConfig?: OutlinedTabConfig;
	labels?: PatternLabelsConfig;
	fill?: ProceduralFillConfig; // NEW — optional, so saved configs stay valid
};
```

All lengths are raw SVG user units (px), matching `OutlinedTabConfig.tabWidth`.
The band geometry is already in px where the fill runs, so no unit conversion
step is needed. Physical size follows the export `pixelScale`/`scaleConfig`,
exactly as tabs do today.

`margin` and `spacing` are **targets**, not merely floors: phase 2 of the
algorithm drives as many gaps as possible onto those exact values.

## Module layout

Three new pure modules under `src/lib/patterns/procedural/`. None of them import
Three.js, Svelte, or any band/pattern type.

| Module | Exports | Depends on |
|---|---|---|
| `polygon-2d.ts` | `Polygon`, `polygonArea`, `polygonBounds`, `pointInPolygon`, `distanceToPolygonEdge`, `dedupePolygon` | — |
| `circle-packing.ts` | `packCircles(polygon, params, random) => Circle[]` | `polygon-2d` |
| `procedural-fill.ts` | `generateProceduralFill(polygon, config, bandIndex) => CutPattern` — the `kind` registry | `circle-packing`, `patterns/utils` |

Plus `src/lib/rng.ts`: `mulberry32`, lifted out of
`src/lib/voronoi/generate-seeds.ts` (which becomes an importer) so the packer and
the voronoi seeder share one deterministic RNG.

`generate-outlined-pattern.ts` is the only file that knows both worlds, and gains
roughly six lines.

## Data flow

```
generateOutlinedBandPattern()
  edges       = getOutlineEdges(...)      // existing
  outlinePath = buildOutlinePath(...)     // existing; tabs are added here
  --- new ---
  polygon    = dedupePolygon(edges.map(e => e.start))
  holesFacet = config.fill
      ? generateProceduralFill(polygon, config.fill, localBandIndex)
      : undefined
  facets: [outlineFacet, ...quadFacets, ...(holesFacet ? [holesFacet] : [])]
```

Taking the polygon from `edges[].start` excludes tab geometry by construction —
tabs live in `outlinePath`, never in the edge list.

`dedupePolygon` is load-bearing, not incidental. `buildOutlinePath` already skips
zero-length edges, and globule bands begin at a collapsed pole facet, so the edge
list genuinely contains coincident consecutive points; they would produce a
zero-length segment and a NaN in `distanceToPolygonEdge`.

### Output shape

One `CutPattern` per band. Its `path` holds every circle as its own subpath:

```
['M', cx - r, cy]
['A', r, r, 0, 1, 0, cx + r, cy]
['A', r, r, 0, 1, 0, cx - r, cy]
['Z']
```

`BandCutPatternComponent.svelte` already renders every facet's `svgPath`, and
`svg-save` already exports it, so there are no renderer changes. Emitting one
facet per band rather than one per hole keeps the DOM node count flat, which the
1,440-band configuration requires (see `pattern-pipeline-perf-findings`).

`getBoundsFromPath` reads only the outline path, so band bounds, label anchoring
and page layout are unaffected.

## Algorithm

### Phase 1 — seed

`count = round(polygonArea(polygon) * density)`.

Dart-throw candidate points into the polygon bounding box, rejecting points
outside the polygon. A candidate at `p` is accepted only when
`allowedRadius(p) >= minRadius`, where

```
allowedRadius(p) = min(
    maxRadius,
    distanceToPolygonEdge(p) - margin,
    min over placed j of ( |p - c_j| - r_j - spacing )
)
```

An accepted seed takes a uniform random radius in `[minRadius, allowedRadius(p)]`.

A uniform spatial grid with cell size `2 * maxRadius + spacing` makes the
neighbour term O(1) amortised: only the 3x3 cell neighbourhood can contain a
circle within reach. The attempt budget is `20 * count`; when it is exhausted the
packer returns whatever fit.

### Phase 2 — inflate to an LP vertex

Treating `spacing` and `margin` as targets, the problem is the linear program

```
maximize   sum of r_i
subject to r_i + r_j <= d_ij - spacing        (every nearby pair)
           r_i       <= distToEdge_i - margin
           minRadius <= r_i <= maxRadius
```

An LP optimum lies at a vertex of the feasible polytope — the point where the
greatest number of constraints are tight. "Maximise the number of gaps equal to
the target spacing" and "find a vertex of this polytope" are the same statement.

We reach a vertex without an LP dependency by **uniform inflation**. Every
unfrozen circle grows at the same rate, so at time `t` its radius is `r0_i + t`.
Each constraint becomes a freeze time:

```
pair, both growing     t_ij = (d_ij - spacing - r0_i - r0_j) / 2
pair, j already frozen t_ij =  d_ij - spacing - r_j - r0_i
boundary               t_i  =  distToEdge_i - margin - r0_i
clamp                  t_i  =  maxRadius - r0_i
```

Run as an event simulation: a min-heap keyed on each circle's earliest freeze
time. Pop the minimum, freeze that circle at that time, then recompute only its
unfrozen neighbours.

The simulation is well founded. When `i` freezes at `t_i`, a neighbour's bound
against `i` moves from `T = (d_ij - spacing - r0_i - r0_j) / 2` to
`2T - t_i`, and since `t_i <= T` that is `>= T`. Bounds therefore only ever
relax, popped freeze times are monotonically non-decreasing, and every circle
freezes exactly once. Phase 1 guarantees the constraints already hold at `t = 0`,
so every freeze time is non-negative.

Cost is `O(n * k * log n)` per band, `k` being the bounded neighbour count.

The result is a configuration where each circle is tight against a neighbour gap
of `spacing`, an edge gap of `margin`, or `maxRadius`.

### Determinism

The RNG is `mulberry32(seed ^ bandIndex)`: every band gets its own arrangement,
and the whole pattern is byte-stable across store re-derivation. Pattern
generation runs on the main thread in a derived store
(`superGlobuleStores.ts:581`) and re-runs on every config change, so stability
here is a correctness requirement, not a nicety. The `seed` field is the reroll
handle exposed in the UI.

## UI, validation, defaults

- `TilingControl.svelte` gains a "Procedural fill" block beside the existing tab
  block: an enable checkbox, the six inputs, and a Reroll button that assigns a
  new `seed`.
- `validators.ts` gains `validateProceduralFillConfig`: `minRadius <= maxRadius`,
  all lengths non-negative, `density > 0`. It follows the shape of the existing
  label/tab validation.
- `shades-config.ts` gains `defaultCircleHolesFillConfig()`.
- Persistence needs no migration: `fill` is optional, and `saved-config.ts` keys
  only off `patternTypeConfig.type`, which is unchanged.

## Testing

Jest, colocated in `src/lib/patterns/procedural/__tests__/`, against the pure
modules.

- `polygon-2d`: area, inside/outside and edge distance on a unit square and a
  concave L; a polygon carrying duplicated consecutive points survives
  `dedupePolygon`.
- `circle-packing` **constraint invariants**, the spec's requirements restated as
  assertions, over several seeds and polygon shapes:
  - `minRadius <= r <= maxRadius` for every circle;
  - `distToEdge(c) - r >= margin - eps` for every circle;
  - `d_ij - r_i - r_j >= spacing - eps` for every pair.
- **Determinism**: identical seed gives identical output; a different seed does
  not.
- **Optimality**: after phase 2 every circle is tight on at least one constraint
  within `eps`. This is the assertion that catches a broken inflation loop.
- `procedural-fill`: the emitted `path` has `4 * n` segments and round-trips
  through `svgPathStringFromSegments`.

Final visual confirmation on `designer2` via the Playwright recipe in
`headless-ui-verification`, since the aesthetic judgement is the developer's.

## Performance

The worst realistic case is the 1,440-band configuration. Cost is linear in total
hole count with small constants; phase 1 dominates and phase 2 is heap-bounded.
The fill re-runs whenever a fill parameter changes.

This will be measured with the CDP profiler recipe and reported as a number. If a
band-count times density combination proves slow, the remedy is memoising the
fill per band on `(seed, params, band identity)` — to be added on evidence rather
than upfront.

## Adjacent fix

`QuadLabels.svelte:28` selects its middle quad as
`band.facets[Math.floor((band.facets.length - 1) / 2)].quad`, indexing the facet
array positionally. Appending the holes facet shifts that selection. It should
filter to facets that actually carry a `quad` first. Two lines, and it is a
latent bug that the new facet would otherwise expose.
