# Geodesic Surface Voronoi Pipeline — Design

**Date:** 2026-06-20
**Branch:** `3d-voronoi-gen`
**Status:** Approved design, ready for implementation planning

## Goal

Add a new Voronoi generation pipeline that runs **in parallel** with the existing
UV and spherical pipelines, eliminating **all** reliance on center-based projection.

The current pipeline is center-based at three stages:

1. **Seed projection** — rays cast from a center point onto the surface.
2. **Voronoi computation** — performed in a 2D parameterization (UV or spherical
   lon/lat), which is itself a center/sphere-relative flattening that distorts on
   non-spherical shapes.
3. **Edge projection** — every Voronoi edge is sampled as directions _from center_
   and ray-cast onto the surface (`project-edges-onto-surface.ts`).

The result is cells distorted relative to the geometry's center, only suited to
roughly spherical shapes. The new pipeline measures distance **along the surface
(geodesic)** so cells are correct on arbitrary, non-spherical, and non-convex
geometry.

## Scope

- **In scope (now):** geodesic **surface** Voronoi — cells tile the surface,
  boundaries are curves on the surface, tubes run along those boundaries (same
  output shape as today, computed without center distortion).
- **Out of scope (future):** volumetric foam / lattice cells. This is a genuinely
  different algorithm (true 3D Euclidean polyhedral cells via bisector-plane
  clipping). When built, _its_ 3D polyhedral cell generator will be the standalone,
  reusable piece. The geodesic surface path does **not** share a core with it.

## Key Decisions (from brainstorming)

| Decision            | Choice                                                                                     | Rationale                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Output domain       | Surface cells now; volumetric foam later (separate module)                                 | Matches current manufacturing output; foam is a future, independent algorithm.                                                                             |
| Distance metric     | **Geodesic** (along the surface) from the start                                            | No "through-the-air" artifacts on non-convex shapes; correct for any geometry.                                                                             |
| Geodesic method     | **Graph Dijkstra first**, behind a clean solver interface; upgrade to heat method later    | Lowest-risk path to a working result; swap solver without touching the rest.                                                                               |
| Relaxation (CVT)    | Reuse existing `relaxationIterations`; wire to geodesic Lloyd if simple, else degrade to 0 | Decide during implementation; uniform cells are desirable but not blocking.                                                                                |
| Boundary extraction | **Dual-edge tracing** (tie-points + triple-points → stitched polylines)                    | Produces a proper Voronoi boundary _network_ with shared corners — what inset/tube code expects. Per-cell-outline rejected (gaps/overlap at shared edges). |

### Why not the SDF/raymarching shader approach

The shader/raymarching starting point only _visualizes_ cell coloring in a fragment
shader — it produces **no polygonal geometry**, so it cannot feed the
flattening → SVG manufacturing pipeline that is the entire point of Shades. The new
pipeline must produce real on-surface polyline geometry (`Band`s).

## Architecture

A new geodesic surface Voronoi pipeline beside the existing UV/spherical ones. It
replaces only the **front half** (seeds → Voronoi → on-surface edges) and hands off
to the **existing, already center-free** inset (`local-projection` + `curvedInset`)
and tube/band assembly (`generateProjectionBands` → `Tube[]`). Selected via a new
`voronoiMethod: 'geodesic'`.

### New module folder: `src/lib/voronoi/geodesic/`

- **`mesh-graph.ts`** — build a **welded** vertex/edge/face adjacency graph from the
  surface mesh. Weld coincident vertices by quantized position so UV seams don't
  disconnect the graph. Edge weights = Euclidean length. Carries per-vertex normals.
- **`geodesic-solver.ts`** — `GeodesicSolver` interface with
  `solveMultiSource(seedVertexIds) → { nearestSeed, distance }[]`. First
  implementation `DijkstraGeodesicSolver` (binary-heap multi-source Dijkstra). Clean
  seam to drop in a heat-method solver (Crane et al.) later.
- **`extract-boundaries.ts`** — dual-edge tracing:
  - Bi-labeled mesh edge `(v_i:a, v_j:b)`: tie-point at parameter
    `t = (d_j − d_i + L) / (2L)` (clamped to `[0,1]`), where `L` is edge length and
    `d_i`/`d_j` are geodesic distances at the endpoints (the point where the two
    cells' distances balance).
  - Tri-labeled triangle `(a, b, c)`: a triple-point (Voronoi corner) plus three
    segments to the three edge tie-points.
  - Stitch segments into per-cell-pair polylines with interpolated normals. Shared
    corners are identical across adjacent cell-pairs.
- **`geodesic-voronoi.ts`** — orchestrator: seeds → graph → solver → optional Lloyd
  loop → boundaries → resample polylines to `edgeDivisions` count → emit the same
  `EdgeProjection`-shaped data the inset/tube code consumes, plus cell-adjacency for
  inset grouping.

## Data Flow & Reuse

```
surface mesh (worker)
  → extract-surface-triangles                              (REUSE)
  → mesh-graph: weld + adjacency                           [NEW]
  → seeds: areaWeighted only (center-free)                 (REUSE generate-seeds)
  → snap seeds to nearest vertices                         [NEW]
  → DijkstraGeodesicSolver.solveMultiSource                [NEW]
      ↕ Lloyd loop ×relaxationIterations (move seed → cell geodesic
        centroid, re-snap, re-solve) — wired to existing setting
  → extract-boundaries → per-cell-pair polylines + normals [NEW]
  → resample to edgeDivisions count                        (REUSE edge-divisions)
  → EdgeProjection-shaped output
  → computeEdgeInsetsLocalProjection (+curvedInset)        (REUSE, center-free)
  → applyCrossSections → generateProjectionBands → Tube[]  (REUSE)
  → voronoiResult { tubes, surfaceProjectionTubes, surface }
```

### Reuse decisions

- **Inset:** geodesic path forces `insetMethod: 'localProjection'`. `centerOut` is
  center-based (slerps toward the seed _direction from center_), so it is disallowed
  for geodesic.
- **Seeding:** forces `seedMethod: 'areaWeighted'`. The `centerProjection` seed mode
  is center-based and disallowed.
- **Lloyd:** geodesic centroid approximated as the cell's vertex centroid re-snapped
  to the nearest surface vertex; reuses `relaxationIterations`. If unstable, it
  degrades to 0 iterations (raw Voronoi).
- Everything from `EdgeProjection` onward is untouched shared code.

### Seed-to-vertex snapping (v1 approximation)

Each seed snaps to its nearest mesh vertex and is used as a Dijkstra source with
distance 0. A more accurate option (add the seed as a virtual node connected to its
containing triangle's three vertices with Euclidean weights) is a known, isolated
improvement for later.

## Config & UI

- **`types.ts`:** add `'geodesic'` to the `voronoiMethod` union. Reuse all existing
  `VoronoiConfig` fields. Add optional `geodesicSolver?: 'dijkstra'` (forward-looking,
  defaults to `'dijkstra'`).
- **`shades-config.ts`:** no change to defaults (geodesic is opt-in via the method
  selector).
- **`migrate-voronoi-config.ts`:** when `voronoiMethod === 'geodesic'`, coerce
  `seedMethod → areaWeighted` and `insetMethod → localProjection` so stale configs
  cannot select invalid combinations.
- **`VoronoiControl.svelte`:** add "Geodesic" to the method selector; hide/disable
  the center-only controls (seed method, inset method) when geodesic is active.
- **Worker:** no new wiring — `makeVoronoi` already runs in the worker and strips
  non-serializables; the geodesic compute (Dijkstra over mesh vertices) runs there.

## Testing

- **`mesh-graph.test.ts`** — welding merges coincident vertices; adjacency is
  symmetric; a seam is bridged.
- **`geodesic-solver.test.ts`** — Dijkstra distances on a subdivided plane match
  Euclidean within tolerance; multi-source picks the nearest seed.
- **`extract-boundaries.test.ts`** — synthetic label patterns (`a-a-b`, `a-b-c`)
  produce expected tie/triple points and stitched polylines; shared corners are
  identical across adjacent cell-pairs.
- **`geodesic-voronoi.test.ts`** — integration: a geodesic config through
  `makeVoronoi` yields non-empty `tubes` with valid `Band`/`Facet` structure.
- **Optional:** sandbox route `src/routes/sandbox-geodesic-voronoi/` for visual
  verification (cheap, isolated).

## Performance Notes

- Multi-source Dijkstra is `O(E log V)`; runs in the worker. Mesh resolution is the
  accuracy/cost knob.
- Lloyd multiplies the solve cost by `relaxationIterations`; runs in the worker.

## Future Work (not in this spec)

- Heat-method geodesic solver behind the existing `GeodesicSolver` interface.
- More accurate seed placement (virtual-node sources instead of vertex snapping).
- Volumetric foam / lattice pipeline (independent 3D Euclidean bisector-clipping
  core).
