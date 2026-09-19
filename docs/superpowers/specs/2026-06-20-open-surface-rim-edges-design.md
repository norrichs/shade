# Open-Surface Rim Edges (Asymmetric Tubes) — Design

**Date:** 2026-06-20
**Branch:** `3d-voronoi-gen`
**Status:** Approved design, ready for implementation planning
**Scope:** Geodesic Voronoi pipeline only

## Goal

When a surface has openings (holes/rims, e.g. an uncapped globule), the geodesic
Voronoi pipeline should trace the edges adjoining each opening and render a tube
along them — like every other Voronoi edge — except the tube is **asymmetric**:
it has bands only on the surface side of the rim, none on the opening side (there
is no surface there to back the geometry).

This builds on the existing geodesic pipeline, which already produces correct
Voronoi cells on open surfaces. Today the rim is simply where cells stop; this
feature adds explicit edges/tubes along that rim.

## Decisions (from brainstorming)

| Decision                    | Choice                             | Rationale                                                                                                                                                                                                                             |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method scope                | Geodesic only                      | The only center-free method that works on open surfaces; it has the welded mesh graph needed for topological boundary detection. UV/spherical are center-based and can't render open surfaces.                                        |
| Open/closed classification  | Topological                        | A surface is open iff its welded mesh graph has boundary edges (an edge used by exactly one face). Subsumes a per-type config switch, handles partial caps and arbitrary meshes for free, and is the same data the rim tracing needs. |
| Rim → edges                 | Per-cell segments                  | Split each rim loop where the nearest-cell label changes, so each segment borders exactly one cell. Integrates with the existing per-edge/per-cell inset + tube model; split points coincide with interior cell-cell corners.         |
| Opening-side representation | Sentinel cell index `OPENING = -1` | A rim edge's `cellIndices` is `[cell, -1]`. Existing inset/tube code adapts by skipping the sentinel side.                                                                                                                            |
| Asymmetric tube (v1)        | One-sided                          | Cross-section applied only from the rim edge toward the cell-interior inset; no opening-side curve. A symmetric "ideal" version is explicitly out of scope for now.                                                                   |

## Background: what already exists

- `mesh-graph.ts` (`buildMeshGraph`) builds a welded vertex/face/adjacency graph.
  `faces: [number,number,number][]` is sufficient to compute boundary edges (an
  undirected welded-vertex edge used by exactly one face). No boundary notion
  exists yet.
- `geodesic-solver.ts` produces a `GeodesicField` (per welded-vertex nearest-seed
  label + distance).
- `extract-boundaries.ts` produces `BoundaryChain`s for cell-cell boundaries
  (`{ vertices:[cornerId,cornerId]; cellIndices:[a,b]; points; normals }`).
- `geodesic-voronoi.ts` resamples chains and emits
  `{ edges: VoronoiEdge[]; edgeProjections; seedPoints3d }`, with
  `VoronoiEdge.cellIndices` taken directly from each chain.
- `local-projection.ts` (`computeEdgeInsetsLocalProjection`) groups edges by cell
  (`for (const cell of edge.cellIndices)`) and, per edge, assigns
  `curvePointsA/divsA` when `cellIndices[0] === cell` else `curvePointsB/divsB`.
  It already defaults every side to the edge points, so an un-inset side is a
  valid degenerate.
- `generate-voronoi.ts` (`assembleVoronoiTubes`) builds a symmetric tube per edge:
  `applyCrossSectionsToEdge` for side A and side B, then `combineSections` merges
  them, then `generateProjectionBands`.

## Architecture

### New / changed modules

**`mesh-graph.ts` — boundary loop tracing (new export)**

```
traceBoundaryLoops(graph: MeshGraph): number[][]
```

- Count each undirected welded edge's face incidence from `graph.faces`.
- Boundary edges = incidence exactly 1.
- Chain boundary edges into ordered loops of welded-vertex ids (each loop encircles
  one opening). A surface is **open** iff at least one loop exists.
- Robustness: a boundary vertex with more than two incident boundary edges
  (pinch point) is handled by walking one unused boundary edge at a time until all
  are consumed; this yields valid loops without infinite looping.

**`rim-edges.ts` (new)**

```
buildRimChains(graph: MeshGraph, field: GeodesicField, loops: number[][]): BoundaryChain[]
```

- For each loop, walk its ordered vertices; the cell label of a rim vertex is
  `field[v].nearestSeed`.
- Split the loop into maximal runs of the same label. Each run → one rim chain for
  that `cell`.
- Each rim chain: `points` = the run's vertex positions (in order); `normals` = the
  mesh-graph vertex normals at those vertices; `cellIndices = [cell, OPENING]`;
  `vertices = [startCornerId, endCornerId]` where corner ids are stable keys at the
  label-change split points (so they can match the interior cell-cell corners that
  reach the rim).
- Skip runs whose `cell` is `< 0` (unreachable vertices), and runs shorter than 2
  points.

**`types.ts`**

- Export `export const OPENING = -1;` (the opening sentinel cell index).

**`geodesic-voronoi.ts`**

- After `extractBoundaries`, call `traceBoundaryLoops` + `buildRimChains` and append
  the rim chains to the chain list before resampling/emit. Rim chains flow through
  the exact same resample → `VoronoiEdge` emission path; their `cellIndices` carry
  the `OPENING` sentinel.

**`local-projection.ts`**

- In the cell→edges grouping loop, skip the sentinel: `if (cell < 0) continue;`.
  This computes the inset only toward the real cell's seed; the opening side keeps
  its default (edge points). No other change — the real cell processes the rim edge
  as one of its edges and assigns the correct side (A or B).

**`generate-voronoi.ts` (`assembleVoronoiTubes`)**

- Detect a sentinel edge (`cellIndices` contains `OPENING`). For it, build a
  **one-sided tube**:
  - Determine the real side: if `cellIndices[0] === OPENING`, the real side is B
    (`curvePointsB/divsB`), else A (`curvePointsA/divsA`).
  - `sections = applyCrossSectionsToEdge(edgePoints3d, realCurvePoints, normals, crossSectionConfig)`.
  - Build the tube's sections directly from that one side
    (`sections.map(s => ({ points: s.crossSectionPoints }))`) — no `combineSections`.
  - `generateProjectionBands(...)` as usual; orient winding so bands face outward
    (reuse the existing centroid-vs-surfaceCenter dot test).
  - Surface-projection tube / fill behavior for sentinel edges: keep it simple —
    a sentinel edge contributes its one-sided main tube; it is excluded from the
    paired surface-projection-tube construction (which assumes two sides). Document
    this so it isn't mistaken for a bug.

### Data flow

```
geodesic surface mesh
  → buildMeshGraph
  → DijkstraGeodesicSolver.solveMultiSource (+Lloyd)           [field]
  → extractBoundaries(graph, field)                            [cell-cell chains]
  → traceBoundaryLoops(graph)                                  [rim loops]   (NEW)
  → buildRimChains(graph, field, loops)                        [rim chains]  (NEW)
  → resample(all chains) → VoronoiEdge[] (+sentinel for rim)
  → computeEdgeInsetsLocalProjection (skips sentinel side)     (CHANGED)
  → assembleVoronoiTubes (one-sided tube for sentinel edges)   (CHANGED)
  → Tube[]
```

## Out of scope (future)

- Symmetric rim tubes (geometry pushing into the opening). v1 is one-sided only.
- Rim edges for UV/spherical methods.
- Full partner-matching/stitching between rim tubes and interior tubes (corner keys
  are provided so this is possible later; v1 does not depend on it).
- `surfaceProjectionTubes` for rim edges.

## Testing

- **`mesh-graph` (`traceBoundaryLoops`)**: an open quad strip yields the expected
  boundary loop(s); a closed mesh (every edge in two faces) yields none.
- **`rim-edges` (`buildRimChains`)**: a labeled open mesh splits a rim loop into the
  expected per-cell chains, each with `cellIndices = [cell, OPENING]`, split at label
  changes; unreachable (`-1`) runs are skipped.
- **`geodesic-voronoi`**: an open surface emits extra edges containing the `OPENING`
  sentinel; a closed surface emits none (and existing geodesic tests stay green).
- **`generate-voronoi`**: a sentinel edge produces a tube with non-empty one-sided
  bands; normal (two-cell) edges are unaffected (existing suite stays green).
