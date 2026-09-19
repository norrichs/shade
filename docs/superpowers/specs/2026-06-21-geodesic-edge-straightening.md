# Spec — Geodesic edge straightening via curve-shortening (Path B1)

**Date:** 2026-06-21
**Branch:** `3d-voronoi-gen`
**Related:**

- `docs/superpowers/specs/2026-06-20-geodesic-edge-smoothing.md` (the smoothing work this builds on)
- `docs/superpowers/handoff/2026-06-20-geodesic-edge-smoothness.md` (jaggedness root-cause)

## Problem

Geodesic Voronoi cell edges should **appear straight when viewed along the local
surface normal** (the manufacturing/aesthetic goal). They don't: the boundary
between two cells visibly curves. Diagnosis (confirmed empirically — raising mesh
resolution sharpened but did **not** straighten the edges):

- The edge is the **geodesic bisector** between two seeds, traced via
  `DijkstraGeodesicSolver`. Graph-Dijkstra distance only travels along mesh edges,
  so on a structured grid it converges to an **anisotropic (faceted) norm**, not
  the true geodesic metric — a classic metrication error that is O(1), not O(h).
  The bisector is therefore systematically bent, and refinement can't fix it.
- "Appears straight from the normal" ≡ the edge is a **geodesic** (zero geodesic
  curvature). But a Voronoi **bisector is not a geodesic** on a general surface,
  so even a perfect distance solver wouldn't straighten edges on non-spherical
  globules — bisectors genuinely curve there.

## Decision

Targets are **arbitrary globules** (not just spheres), and the requirement is
**straight-looking edges**, accepting that they are no longer exact equidistant
bisectors. So: keep the Dijkstra Voronoi only for **cell topology and corner
(triple-point / rim-transition) locations**, and **replace the edge curve** with
the **geodesic between its two corner endpoints**, computed by **iterated
curve-shortening** (Path B1). The smoothing spline (cosmetic) remains available
as a separate option.

The existing smoothing infrastructure is the scaffold: boundary chains, shared
corners, and `SurfaceProjector` are exactly what this needs. What changes is the
per-edge algorithm.

## Config & UX

- `VoronoiConfig.geodesicEdgeStyle?: 'bisector' | 'smoothed' | 'geodesic'`
  (default `'bisector'` — preserves current behavior).
- `VoronoiConfig.geodesicSmoothing?: number` (existing) keeps driving the
  `'smoothed'` style (the one-shot cubic smoothing spline).
- `VoronoiConfig.geodesicStraightenCap?: number` — max curve-shortening
  iterations for the `'geodesic'` style (default `60`).
- UI (`VoronoiControl.svelte`): replace the lone Smoothing slider with an **Edge
  Style** `<select>` plus two context sliders — **Smoothing** (relevant for
  `'smoothed'`) and **Straighten Iterations** (relevant for `'geodesic'`) — all
  gated on `isGeodesic`, following the existing `update(field, value)` pattern.

## Algorithm — iterated geodesic curve-shortening

`straightenToGeodesic(points: Vector3[], projector: SurfaceProjector, opts) => Vector3[]`
where `opts = { stepFactor: number; tolerance: number; cap: number }`.

- **Initial path:** the existing bisector chain, resampled to the edge's adaptive
  division count. Seeding from the bisector (not the raw chord between corners)
  keeps the curve in the correct channel / homotopy class — the chord could snap
  across a thin feature to the wrong local geodesic.
- **Each iteration** (Jacobi: compute all new positions from current, then apply):
  1. For each interior point: `pᵢ ← lerp(pᵢ, midpoint(pᵢ₋₁, pᵢ₊₁), stepFactor)`
     with `stepFactor = 0.5`.
  2. Project each moved point to the **nearest surface point**
     (`projector.projectClosest` — closest-point, no ray direction needed for a
     midpoint).
  3. **Redistribute** by arc-length resample to the same point count (prevents
     point bunching that curve-shortening induces), then re-project the
     redistributed points.
  4. Track the maximum point movement this iteration.
- **Stop** when `maxMove < tolerance` (curve has reached ~zero geodesic
  curvature) **or** after `cap` iterations.
- **Endpoints (the two corners) are never moved**, so shared corners stay
  bit-identical across adjacent edges.

This is discrete curve-shortening flow: it monotonically reduces curve length with
fixed endpoints and converges to the local length-minimizer — a geodesic, which
reads straight from the normal. On a plane the limit is a straight segment; on a
sphere, the great-circle arc.

Defaults: `stepFactor = 0.5`, `cap = config.geodesicStraightenCap ?? 60`,
`tolerance = 1e-4 × (initial path length)` (scale-relative so it behaves across
surface sizes).

## Integration (per chain, in `generateGeodesicVoronoi`)

- `'bisector'` → today's raw path: `resample(chain.points, …)`, no projection.
- `'smoothed'` → today's behavior: `smoothChainPoints` (λ) → resample → re-project
  interior points.
- `'geodesic'`:
  - **cell-cell edges** → resample `chain.points` to the division count as the
    initial path, run `straightenToGeodesic`, then assign interior normals via
    `projector.projectClosest`. Endpoints keep their resampled corner
    position/normal.
  - **rim edges** (`chain.cellIndices` includes the `OPENING` sentinel) → **not**
    straightened. They trace the surface opening and must stay on the rim, so they
    fall back to the `'smoothed'` treatment. This is a correctness rule, not a
    preference.

A `SurfaceProjector` is built once per generation when `geodesicEdgeStyle !==
'bisector'` (null for `'bisector'`).

## Module structure

- **New** `src/lib/voronoi/geodesic/geodesic-straighten.ts` —
  `straightenToGeodesic` plus a small points-only arc-length `resamplePolyline`
  helper used for redistribution.
- **Modify** `src/lib/voronoi/geodesic/smooth-chains.ts` — add a public
  `projectClosest(point: Vector3): { point: Vector3; normal: Vector3 }` to
  `SurfaceProjector` (closest-point-on-surface + barycentric-blended welded vertex
  normal). The curve-shortening loop needs a normal-free projection for moved
  midpoints; this reuses the existing private closest-point logic.
- **Modify** `src/lib/voronoi/geodesic/geodesic-voronoi.ts` — branch the emit loop
  by `geodesicEdgeStyle`.
- **Modify** `src/lib/voronoi/types.ts`, `src/lib/shades-config.ts`,
  `src/components/controls/VoronoiControl.svelte` — config + UI.

## Testing

- **Flat grid (cleanest correctness check):** a wiggly initial path between two
  points on a z=0 grid converges to the straight chord — interior points become
  collinear (consecutive segment cross-products ≈ 0); endpoints unchanged. A
  plane's geodesic is a straight line, so this is unambiguous.
- **Sphere:** a wiggly path straightens toward the great-circle arc between its
  endpoints — discrete geodesic curvature drops toward zero, points stay on the
  sphere (|p| ≈ 1 within mesh tolerance), total length ≤ initial, and an
  already-geodesic arc is left essentially unchanged (idempotent).
- **`projectClosest`:** a point off the surface returns the nearest on-surface
  point with a sensible blended normal.
- **Integration:** `'geodesic'` reduces total edge geodesic-curvature vs.
  `'bisector'`/`'smoothed'`; edge endpoints (shared corners) are identical across
  all three styles; rim edges are unchanged by `'geodesic'` mode; `'bisector'`
  reproduces current output.
- Re-run the full voronoi suite: `npm run test:unit -- src/lib/voronoi`.
- Manual: high-res globule, geodesic method, `edgeStyle = geodesic`; confirm
  cell-cell edges read as straight curves from the normal and rim edges still
  follow the openings.

## Performance (flagged, not blocking)

`projectClosest` / raycast are O(triangles) per projection, now multiplied by
iterations — slow on dense meshes. It runs in the Web Worker (off the UI thread).
Mitigations in order: the iteration `cap` (default 60); straightening only
cell-cell edges (rim edges skip it); **follow-up** = spatial acceleration — a BVH
(`three-mesh-bvh`) or a locality search seeded from each point's previous-iteration
triangle (points move little per step). Baseline ships without acceleration; add
it if straightening feels slow.

## Invariants preserved

- **Center-free** — no center-based projection reintroduced; pure surface ops.
- **Shared corners fixed** — endpoints (corners) are never moved by smoothing,
  straightening, or projection.
- **Rim coupling** — rim chains keep the smoothed treatment; openings are not
  crossed.
- **Serializable** — outputs are `Vector3`/arrays; `Mesh`/`Raycaster` stay
  worker-local.
- **`'bisector'` default** — byte-for-byte the current behavior.

## Key files

| File                                              | Change                                                |
| ------------------------------------------------- | ----------------------------------------------------- |
| `src/lib/voronoi/geodesic/geodesic-straighten.ts` | **new** — `straightenToGeodesic` + `resamplePolyline` |
| `src/lib/voronoi/geodesic/smooth-chains.ts`       | add `SurfaceProjector.projectClosest`                 |
| `src/lib/voronoi/geodesic/geodesic-voronoi.ts`    | branch emit loop by `geodesicEdgeStyle`               |
| `src/lib/voronoi/types.ts`                        | add `geodesicEdgeStyle`, `geodesicStraightenCap`      |
| `src/lib/shades-config.ts`                        | defaults (`'bisector'`, `60`)                         |
| `src/components/controls/VoronoiControl.svelte`   | Edge Style selector + Straighten Iterations slider    |
