# Curved Inset for Local-Projection Voronoi — Design

**Date:** 2026-06-08
**Status:** Approved (pending spec review)
**Scope:** Add a `curvedInset` feature to the Voronoi local-projection inset pipeline, gated by a boolean config flag.

## Summary

When `curvedInset === true`, the local-projection inset method replaces its straight
homothety inset edges with per-corner **quadratic bezier curves** inscribed inside the
inset edges. The curves round each cell corner; sampling them produces the inner curve
that the surface-projection band is built from.

The feature is gated by a new `curvedInset?: boolean` on `VoronoiConfig` (default `false`)
and only affects `insetMethod: 'localProjection'`. All other behavior is unchanged.

## Background: the current local-projection flow

`computeEdgeInsetsLocalProjection` (`src/lib/voronoi/local-projection.ts`) processes one
Voronoi cell at a time:

1. Collect the cell's on-surface edge points + its seed.
2. Fit a plane (`fitPlane`) and place a far `source` along the plane normal.
3. Define a `planePoint` halfway between the surface and `source`; build a 2D plane basis.
4. Flatten the seed and each outer-edge sample to plane-2D (`projectToPlane2D`).
5. Inset each outer-edge sample toward the 2D seed by `curveOffsetFactor` (a straight
   homothety, `insetPoint2D`).
6. Back-project each inset point through `source` onto the surface (`selectSurfaceHit`),
   choosing the hit nearest the known outer edge point.
7. Generate `surfaceProjectionDivisions` intermediates per rung (`insetIntermediates2D`),
   back-projected the same way.

Output is `EdgeInsets` (`src/lib/voronoi/inset-types.ts`):

- `curvePointsA[i]` / `curvePointsB[i]`: inset point for outer sample `i`, cell-A / cell-B side.
- `divsA[i]`: rung intermediates ordered `cA -> edge`.
- `divsB[i]`: rung intermediates ordered `edge -> cB`.

All four arrays align index-for-index with the shared outer `edgePoints3d` from Phase 1
(`projectEdgesOntoSurface`). Downstream (`generate-voronoi.ts`) builds the surface-projection
tube rung `[cA, ...divsA, edge, ...divsB, cB]` at each index `i`.

## Geometry of the curved inset

All curve construction happens in the **same plane-2D space** already used for the straight
inset (the plane halfway between surface and `source`). Samples are back-projected through
`source` with the existing `selectSurfaceHit`, so the surface-projection machinery is reused
verbatim.

Per Voronoi cell:

1. **Cell vertex ring.** Build the cell's ordered ring of vertices by matching shared edge
   vertices (the `[lon, lat]` vertex coordinates on `VoronoiEdge.vertices`, which are exact
   shared values from the Voronoi computation; matched with a small epsilon). Each ring
   vertex's surface position is the shared endpoint (`edgePoints3d[0]` or last) of its two
   adjacent edges; project it to plane-2D.
2. **Inset vertices.** Inset each ring vertex toward the 2D seed by `curveOffsetFactor`
   (same homothety as straight mode) → `Vk'`. Because the inset is a homothety toward the
   seed, `Vk'` lies on the segment `(Vk, seed)`, so the line `(Vk', seed)` is the same line
   as `(Vk, seed)` — the "vertex→seed line".
3. **Inset edges + midpoints.** Inset edge `Ek` is the segment `Vk' -> V(k+1)'`; its
   midpoint is `Mk`.
4. **Corner beziers.** For each corner `Vk'`, the quadratic bezier is
   `M(k-1) -> Vk' (control) -> Mk`. Adjacent corner beziers share the midpoint of the edge
   between them.
5. **Split at the vertex→seed line.** Split the corner bezier at the line through `Vk'` and
   the seed, yielding `split_k` at bezier parameter `t_split` (the quadratic-in-`t` root in
   `(0, 1)`).
6. **Per-edge inner curve.** Edge `Ek` (between `Vk'` and `V(k+1)'`) has the inner curve
   formed by two bezier halves joined at `Mk`:
   - `[split_k -> Mk]` from corner `k`'s bezier,
   - `[Mk -> split_{k+1}]` from corner `(k+1)`'s bezier.

### Sampling the inner curve

The inner curve is sampled into `N + 1` points, where `N` is that edge's resolved adaptive
division count (`edgeDivisionCounts[edgeIndex]`), so the count equals `edgePoints3d.length`
and rungs align index-for-index with the outer edge.

Sampling is uniform in **section units** across the joined curve (total length `N` sections,
`N + 1` points). The midpoint `Mk` sits at section position `N/2`:

- Sample `i` (for `i = 0..N`) is at section position `i`.
- For `i < N/2`: on the `[split_k -> Mk]` half, at half-fraction `f = i / (N/2) = 2i/N`.
- For `i > N/2`: on the `[Mk -> split_{k+1}]` half, at half-fraction `(i - N/2) / (N/2)`.
- For even `N`, `i = N/2` lands exactly on `Mk`.

Within a half, the half-fraction `f` maps to the bezier by **parameter `t`** (not arc
length): for the `Mk`-side half of a corner bezier whose split is at `t_split`, `f` maps to
`t = t_split + f * (1 - t_split)` (or the mirror for the other half). This was chosen for
simplicity and matches a literal reading of "of the way to the midpoint."

Worked example, `N = 3` (3 sections, 4 points): `split_k`, then `2/3` of the way to `Mk`,
then `1/3` of the way from `Mk` toward `split_{k+1}`, then `split_{k+1}`.

### Orientation

The inner curve is oriented so sample `0` corresponds to `edge.vertices[0]` (the same
direction `edgePoints3d` is sampled), giving index-for-index rungs. The end rungs
(`split` ↔ outer vertex) run along the vertex→seed lines.

### Rungs / surface-projection intermediates

For each rung `i`, subdivide the 2D segment `[innerSample_i, outerSample_i]` into
`surfaceProjectionDivisions` intermediate points and back-project each through `source`
(same as the straight path). `outerSample_i` is the plane-2D projection of the shared outer
`edgePoints3d[i]`. Side-B `divs` are reversed to preserve the existing `edge -> cB`
convention.

## Fallback

Any edge whose corner(s) cannot be resolved falls back to the existing straight homothety
inset for that edge. Triggers include:

- boundary / open cells where the ring is a chain, not a cycle (an end edge is missing one
  corner bezier),
- vertices that don't match between a cell's two adjacent edges,
- degenerate splits (no bezier-line root in `(0, 1)`, near-zero-length edges).

Curved and straight insets can coexist within one cell. This keeps the feature robust on
real surfaces without special-casing the whole cell.

## Components

### New modules

- `src/lib/voronoi/bezier-2d.ts` — pure 2D quadratic bezier helpers:
  - `sampleQuadratic(p0: Vector2, ctrl: Vector2, p1: Vector2, t: number): Vector2`
  - `quadraticLineSplitT(p0, ctrl, p1, linePoint, lineDir): number | null` — the `t` in
    `(0, 1)` where the curve crosses the given line, or `null` if none.
- `src/lib/voronoi/curved-inset-2d.ts` — given a cell's ordered ring of plane-2D vertices,
  the 2D seed, `curveOffsetFactor`, and per-edge sample counts, produce the per-edge sampled
  inner-curve points in 2D. Pure, independently testable, no Three.js surface dependency.

### Changed modules

- `src/lib/voronoi/types.ts` — add `curvedInset?: boolean` to `VoronoiConfig`.
- `src/lib/shades-config.ts` — `curvedInset: false` in `defaultVoronoiConfig`.
- `src/lib/voronoi/local-projection.ts` — when `curvedInset` is set, build the cell ring and
  inner curves via `curved-inset-2d`, then back-project (reusing `selectSurfaceHit`) and
  produce `divs`; otherwise the existing straight path. Fallback per edge as described.
- `src/lib/voronoi/generate-voronoi.ts` — thread `curvedInset` from config into
  `computeEdgeInsetsLocalProjection`.

`EdgeInsets`, the surface-projection tube builder, and the cross-section tube are unchanged.

## Data flow

```
config.curvedInset ──► generate-voronoi ──► computeEdgeInsetsLocalProjection
                                                  │  (per cell)
                          fitPlane / source / basis / seed2d  (unchanged)
                                                  │
                              curvedInset ? curved-inset-2d : insetPoint2D
                                                  │ (plane-2D inner samples)
                                          selectSurfaceHit  (unchanged)
                                                  │
                                            EdgeInsets (unchanged shape)
```

## Testing

- `bezier-2d.test.ts` — `sampleQuadratic` endpoints (`t=0`, `t=1`) and a known midpoint;
  `quadraticLineSplitT` returns a root in `(0,1)` for a line crossing the curve and `null`
  when it doesn't.
- `curved-inset-2d.test.ts` — inner-curve point count equals requested count; sample `0`
  and last sample lie on the corresponding vertex→seed lines; even-`N` midpoint membership;
  the 2/3–1/3 spacing for `N=3`.
- `local-projection.test.ts` — with `curvedInset: true` on a sphere, inset points still land
  on the surface (radius check) and inner-curve endpoints lie on vertex→seed lines; an open
  / boundary edge exercises the straight-inset fallback.
- `generate-voronoi.test.ts` — smoke test generating tubes with `insetMethod:
  'localProjection'` and `curvedInset: true`.

## Non-goals

- No change to the `centerOut` inset method.
- No change to the `EdgeInsets` data model or downstream tube/band construction.
- Arc-length sampling (parameter-`t` only).
- Surface-projection re-sampling per side (shared outer edge reused by index).
