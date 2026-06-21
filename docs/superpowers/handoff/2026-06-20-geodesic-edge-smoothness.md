# Handoff — Smooth out jagged geodesic Voronoi edges

**Date:** 2026-06-20
**Branch:** `3d-voronoi-gen` (37 commits ahead of `main`, kept as-is / not merged)
**Status of branch:** all unit tests green (`npm run test:unit` → 466 passing). Working tree clean apart from untracked `docs/brainstorm/` and a transient `.beads/*.lock`.

## The next task

The geodesic Voronoi cell boundaries (edges) come out **jagged**. On a fairly
high-granularity surface we expect **fairly smooth curves**. Goal of the next
session: make the geodesic Voronoi edges smooth.

The user framed this as "adjust the geodesic solver." Read the root-cause analysis
below before committing to that as the only lever — there are two contributing
causes and two independent fixes.

## Where we are (what already works on this branch)

This session built, in order (all behind the geodesic `voronoiMethod`):

1. **Geodesic surface Voronoi pipeline** — center-free. `src/lib/voronoi/geodesic/`:
   - `mesh-graph.ts` — welded vertex/face/adjacency graph + `traceBoundaryLoops`.
   - `geodesic-solver.ts` — `GeodesicSolver` interface + `DijkstraGeodesicSolver`.
   - `extract-boundaries.ts` — dual-edge tracing → cell-cell `BoundaryChain`s.
   - `geodesic-voronoi.ts` — orchestrator (seeds → solve → Lloyd → boundaries → resample → `VoronoiEdge`s).
   - `rim-edges.ts` — open-surface rim chains (one-sided tubes).
2. **Pipeline gating + fault isolation** in `generate-superglobule.ts` (run only pipelines whose `viewControl.any` is on).
3. **Open-surface rim edges** — one-sided asymmetric tubes in both the bands view (rendered red) and the surface-projection view.

Relevant fixes already landed: degenerate-facet partner matching, coincident-vertex
edge-match rejection in `getEdgeMatchedTriangles`, projection-consumer guards for
empty (gated-off) pipelines.

## Root-cause analysis of the jaggedness

The boundary between two cells is the locus where `dist_A == dist_B`. Two things
make that locus jagged:

### Cause 1 (primary): graph-Dijkstra distance is faceted/anisotropic
`DijkstraGeodesicSolver` (`geodesic-solver.ts:61`) computes shortest paths **along
mesh edges only** (`solveMultiSource`, graph distance). This systematically
overestimates true geodesic distance and is **direction-dependent** (a path can
only turn at vertices, in the directions edges happen to point) — classic
"metrication / staircasing" error. The resulting distance field is piecewise-kinked,
so its equidistant boundary has kinks. **Higher mesh resolution reduces anisotropy
but does NOT remove the staircase** — it just makes the steps smaller, which still
reads as jagged. This was a known, deliberate v1 tradeoff (the original spec chose
"graph Dijkstra first, upgrade later," with the `GeodesicSolver` interface as the
seam).

### Cause 2 (secondary): boundary follows mesh-edge crossings
`extract-boundaries.ts` places each boundary point at the tie-point on a **mesh
edge** (`crossingNode`, `extract-boundaries.ts:45`, `t = (dj-di+L)/(2L)`) and a
triple-point inside tri-labeled faces. So even with a perfectly smooth field, the
extracted polyline is piecewise-linear through mesh-edge crossings. `resample`
(`geodesic-voronoi.ts:37`) only samples by arc length — it does not smooth.

The same `field` and boundary machinery drive the **rim** chains
(`rim-edges.ts` tie-points), so any improvement benefits rim edges too.

## Options (with tradeoffs)

### Option A — Better geodesic solver (the "adjust the solver" path)
Swap `DijkstraGeodesicSolver` for a more accurate solver behind the existing
`GeodesicSolver` interface (`geodesic-solver.ts:5`). Candidates:

- **Heat method (Crane et al.)** — *principled, smooth at any resolution.* Solve
  `(M − t·L)u = δ_sources` (heat), normalize `X = −∇u/|∇u|`, solve `L·φ = ∇·X`
  (Poisson); `φ` is the smooth geodesic distance. Needs a **cotangent Laplacian +
  mass matrix** and **two sparse linear solves**. No sparse solver in the repo today
  — either implement Conjugate Gradient (iterative, dependency-free) or add a small
  wasm/JS sparse-Cholesky dep. Highest quality, highest effort. Note: heat method
  gives smooth distances but is **single-source**; for the multi-source Voronoi we
  need per-vertex nearest-seed + distance — run it with all seeds as the heat source
  set for the *distance-to-nearest-seed* field, but recovering the **nearest-seed
  label** needs care (e.g., a separate multi-source Dijkstra/region-grow for labels,
  then heat-method distances per region, or compare per-seed fields — more solves).
  This label-vs-distance split is the main design wrinkle to work out.
- **Exact polyhedral geodesics (MMP / VTP)** — exact, but complex to implement; likely overkill.
- **Edge-subdivision / Steiner points** — cheap partial win: add midpoint nodes on
  mesh edges (and optionally face-crossing nodes) so Dijkstra has more directions.
  Reduces anisotropy without a linear solver. Diminishing returns; still a graph metric.

### Option B — Smooth the extracted boundary polylines (solver-independent)
After `extractBoundaries` / `buildRimChains`, before/with `resample`, smooth each
chain's polyline and **re-project each smoothed point back onto the surface**
(raycast against the surface mesh, or nearest-point-on-mesh). Keep chain **endpoints
and triple-points fixed** (they're shared corners — moving them would unstitch
adjacent chains). Techniques: constrained Laplacian smoothing (a few iterations),
Chaikin subdivision, or fit a smoothing spline then resample. Cheap, big visual win,
works regardless of the solver, and naturally covers rim edges. Risk: over-smoothing
can pull the curve off the true bisector and across thin features; keep it light and
surface-constrained.

### Recommendation
Likely **B first** (fast, large visible improvement, low risk, no new deps), then
**A (heat method)** if you want geometrically-accurate smoothness independent of
mesh tessellation. They compose: a heat-method field plus light boundary smoothing
gives the best result. Decide with the user — they may specifically want A.

## Where to plug in

- **Solver swap (Option A):** implement `class HeatMethodGeodesicSolver implements
  GeodesicSolver` in `geodesic-solver.ts`; select it in
  `geodesic-voronoi.ts:93` (`const solver = new DijkstraGeodesicSolver(graph)`).
  The `config.geodesicSolver?: 'dijkstra'` field was specced but not implemented —
  add `'heat'` and branch here. Mind the multi-source label-vs-distance wrinkle above.
- **Boundary smoothing (Option B):** add a `smoothChains(chains, surface)` step in
  `geodesic-voronoi.ts` right after `extractBoundaries`/`buildRimChains`
  (`geodesic-voronoi.ts:120-121`) and before `resample`. Will need the surface
  `Object3D` for re-projection — currently `generateGeodesicVoronoi(config,
  surfaceTriangles)` only receives triangles, not the surface mesh; either pass the
  surface in, or re-project using the triangle list (closest-point-on-triangle).

## Testing approach for the next session

- Unit-test a new solver on a flat subdivided grid: distances should match Euclidean
  closely (heat method) and the equidistant set between two sources should be near-straight.
- For smoothing: assert endpoints/triple-points are unchanged, total curve turning
  (sum of angle deltas) drops, and points stay on/near the surface.
- Keep the **center-free invariant** (no center-based projection) and re-run the full
  voronoi suite (`npm run test:unit -- src/lib/voronoi`).
- Manual: high-res open globule, geodesic method, confirm both cell edges and rim
  edges read as smooth curves in the bands and surface-projection views.

## Gotchas / invariants to preserve

- **Center-free:** the geodesic path must not reintroduce center-based projection.
- **Shared corners:** boundary chain endpoints/triple-points and rim transition
  points are shared keys used for stitching — don't move them when smoothing.
- **Rim coupling:** rim chains reuse `field` distances (tie-points); validate rim
  edges still look right after any solver/smoothing change.
- **Worker/serialization:** geodesic runs in the worker; keep outputs plain
  `Vector3`/arrays (no new non-serializable types crossing `postMessage`).
- The red rim-band coloring in the bands view is currently a debug-ish aid
  (`ProjectionGeometryComponent.svelte` + `collate-geometry.ts` `rimBands`); decide
  whether to keep/formalize/revert it as part of finishing.

## Key files

| File | Role |
|------|------|
| `src/lib/voronoi/geodesic/geodesic-solver.ts` | `GeodesicSolver` interface + `DijkstraGeodesicSolver` (swap target) |
| `src/lib/voronoi/geodesic/geodesic-voronoi.ts` | Orchestrator: solve (line 93/106), extract (120), resample (37), emit |
| `src/lib/voronoi/geodesic/extract-boundaries.ts` | Dual-edge tracing; tie-points on mesh edges (`crossingNode`, line 45) |
| `src/lib/voronoi/geodesic/rim-edges.ts` | Rim chains (reuse `field` + tie-points) |
| `src/lib/voronoi/geodesic/mesh-graph.ts` | Welded graph (cotangent Laplacian would be built from `faces`/`positions` here) |
| `docs/superpowers/specs/2026-06-20-geodesic-surface-voronoi-design.md` | Original design (notes heat-method as deferred work) |
