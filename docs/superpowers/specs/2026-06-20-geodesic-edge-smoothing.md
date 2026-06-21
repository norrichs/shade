# Spec — Smooth geodesic Voronoi edges via cubic smoothing spline

**Date:** 2026-06-20
**Branch:** `3d-voronoi-gen`
**Related:** `docs/superpowers/handoff/2026-06-20-geodesic-edge-smoothness.md` (Option B), `docs/superpowers/specs/2026-06-20-geodesic-surface-voronoi-design.md` (original design)

## Goal

Geodesic Voronoi cell boundaries (and rim edges) come out jagged. On a
high-granularity surface we expect fairly smooth curves. This spec makes the
edges smooth by replacing the raw piecewise-linear chain → arc-length-resample
step with a **cubic smoothing spline + surface re-projection**, controlled by a
new `geodesicSmoothing` lambda.

This is the "Option B" path (solver-independent boundary smoothing). The
`DijkstraGeodesicSolver` is unchanged. A future Option A (heat-method solver)
composes with this and is out of scope here.

### Why a smoothing (approximating) spline, not interpolation

The raw chain points are jagged for two reasons: (1) the Dijkstra distance
field zigzags side-to-side (faceted/anisotropic graph metric), and (2) the
extracted polyline is piecewise-linear through mesh-edge crossings. An
*interpolating* spline (e.g. Catmull-Rom) fixes (2) — angular corners become
curves — but still threads through every zigzag point from (1). Only an
*approximating* spline that does **not** pass through the noisy interior points
flattens the zigzag. Hence a cubic smoothing spline with a penalty on the
second derivative.

### Numeric method: discrete cubic smoothing spline (Whittaker–Henderson)

We smooth the chain's node positions directly (per coordinate), which is the
discrete cubic smoothing spline: minimize

```
  Σ wᵢ (yᵢ − zᵢ)²  +  λ Σ (z_{k−1} − 2 z_k + z_{k+1})²
```

the second sum being the discrete second-derivative (curvature) penalty. The
normal equations `(W + λ DᵀD) z = W y` give a symmetric **pentadiagonal**
(half-bandwidth 2), positive-definite system, solved with a small **banded
Cholesky** (not a tridiagonal Thomas solve — the 2nd-difference penalty is
inherently pentadiagonal). Endpoints are pinned by giving indices `0` and `n−1`
a large data weight and then overwriting the two endpoint outputs with the exact
input values, so shared corners stay bit-identical. `λ = 0` returns the input
unchanged (`z = y`).

This operates at node level (output has the same point count as input), so the
existing arc-length `resample` step runs afterward unchanged.

### Safety net

`geodesicSmoothing === 0` reproduces today's output exactly (raw chain points →
existing arc-length `resample`, no re-projection). Smoothing is strictly opt-in.

## Pipeline

Applied per `BoundaryChain` in `geodesic-voronoi.ts`, after
`extractBoundaries` / `buildRimChains` and replacing the current per-chain
`resample` call.

When `geodesicSmoothing > 0` **and** the chain has ≥ 4 points:

1. **Smooth** the chain node positions per coordinate with the discrete cubic
   smoothing spline above (`λ = geodesicSmoothing`), endpoints pinned. Output has
   the same point count as input. Shared corners (triple-points, rim transition
   points) stay bit-identical.
2. **Arc-length resample** the smoothed polyline to `divisionCounts[i]` using
   the existing `resample` helper (preserves endpoints, emits exactly the
   adaptive division count). Normals are lerped here as today, then replaced by
   re-projection.
3. **Re-project** each resampled point onto the surface (see Re-projection).
   Replaces both the point and its normal.

When `geodesicSmoothing === 0` **or** the chain has < 4 points → current
behavior: raw points → `resample`, **no** re-projection. (A 4-point minimum
keeps the smoother meaningful; padded single-vertex rim runs are exactly 3
points and pass through unchanged.)

## Re-projection

Each smoothed sample sits slightly off the mesh and is put back on the surface
by raycasting (chosen over closest-point as the primary method):

- Build a `Mesh` (`BufferGeometry` from `surfaceTriangles`) + `Raycaster` once
  per generation (Three.js `Raycaster` needs no DOM — runs fine in the worker).
- For each sample `p` with normal `n`: raycast `(p, +n)` and `(p, −n)`; take the
  nearest hit. Use `hit.point` and a **barycentric blend of the hit triangle's
  three welded vertex normals** (from `MeshGraph.normals`) at the hit's
  barycentric coords, normalized — preserving the smooth area-weighted normals.
- **Fallback** on miss (grazing angle / thin feature): closest-point-on-triangle
  across `surfaceTriangles`; normal = barycentric blend of that triangle's
  welded vertex normals at the closest point.

To blend welded vertex normals we map each `surfaceTriangle`'s three corner
positions to their welded vertex ids (via the same `QUANTUM` key used by
`buildMeshGraph`) so the raycast/closest-point triangle index resolves to three
`MeshGraph.normals` entries. The `SurfaceProjector` is therefore constructed
from both `surfaceTriangles` and the `MeshGraph`.

## New module: `src/lib/voronoi/geodesic/smooth-chains.ts`

- `smoothSeries(values: number[], lambda: number): number[]` — pure discrete
  cubic smoothing spline (Whittaker–Henderson) on one coordinate series, endpoints
  pinned exactly. Builds the symmetric pentadiagonal `W + λ DᵀD` and solves via a
  small banded Cholesky. Numeric, fully unit-testable, independent of Three.js.
- `smoothChainPoints(points: Vector3[], lambda: number): Vector3[]` — applies
  `smoothSeries` to x, y, z and recombines; returns same-length smoothed points
  (endpoints unchanged). Chains with < 4 points are returned unchanged.
- `SurfaceProjector` — built from `surfaceTriangles` + the `MeshGraph`; builds
  the raycast `Mesh` + `Raycaster` and a triangle→welded-vertex-ids map once;
  `project(point: Vector3, normal: Vector3): { point: Vector3; normal: Vector3 }`
  raycasts (with closest-point fallback) and returns the hit point plus a
  barycentric blend of the hit triangle's welded vertex normals. Worker-local
  scratch; never serialized.

`geodesic-voronoi.ts` constructs one `SurfaceProjector` per generation and runs
each chain through the pipeline above. No signature change to
`generateGeodesicVoronoi` — `surfaceTriangles` is already in scope and the
raycast mesh is built internally.

## Config plumbing

- `VoronoiConfig.geodesicSmoothing?: number` in `src/lib/voronoi/types.ts`
  (default `0`, `0` = off).
- Default value in `defaultVoronoiConfig` (`src/lib/shades-config.ts`).
- Slider in `src/components/controls/VoronoiControl.svelte`, relevant when
  `isGeodesic`, mirroring the existing `update()` field-branch pattern.
- `λ` clamped to `≥ 0` at point of use in the generator. There is no existing
  `VoronoiConfig` validator block to extend; in-code clamping matches the
  current codebase approach.
- Flows to the worker automatically as part of the serialized `VoronoiConfig`.

## Invariants preserved

- **Center-free** — pure mesh/surface operations; no center-based projection
  reintroduced.
- **Shared corners fixed** — chain endpoints are the shared stitch keys
  (triple-points, rim transitions); the pinned-endpoint spline leaves them
  exactly in place.
- **Rim coupling** — rim chains go through the identical pipeline, so rim edges
  smooth too.
- **Serialization** — outputs remain `Vector3` / plain arrays; the `Mesh` and
  `Raycaster` are worker-local and never cross `postMessage`.

## Known tradeoffs / edge cases

- **Closed-loop chains** (`vertices[0] === vertices[1]`; rare — very few seeds,
  or a rim loop bordering a single cell) pin their one shared point, which may
  leave a slight cusp there. Acceptable for now; documented limitation.
- Re-projected normals are a **barycentric blend of the smooth area-weighted
  welded vertex normals** at the hit point, preserving smooth shading along the
  re-projected curve.

## Testing

- `smoothSeries`: on a flat noisy 1-D series the output is smoother (smaller
  total |second difference|) and equals the input at the pinned endpoints
  exactly; `λ = 0` returns the input unchanged.
- `smoothChainPoints`: endpoints unchanged; total turning angle drops vs. raw;
  < 4-point chains returned unchanged.
- `SurfaceProjector`: projected points lie on the surface (≈ 0 distance to the
  nearest triangle).
- Integration (`generateGeodesicVoronoi`): `λ = 0` reproduces current output;
  `λ > 0` keeps chain endpoints (shared corners) identical and reduces total
  curve turning.
- Re-run the full voronoi suite: `npm run test:unit -- src/lib/voronoi`.
- Manual: high-res open globule, geodesic method, confirm both cell edges and
  rim edges read as smooth curves in the bands and surface-projection views.

## Key files

| File | Change |
|------|--------|
| `src/lib/voronoi/geodesic/smooth-chains.ts` | **new** — spline solver, polyline smoother, `SurfaceProjector` |
| `src/lib/voronoi/geodesic/geodesic-voronoi.ts` | wire smoothing pipeline into chain loop; build `SurfaceProjector` |
| `src/lib/voronoi/types.ts` | add `geodesicSmoothing?: number` to `VoronoiConfig` |
| `src/lib/shades-config.ts` | default `geodesicSmoothing` in `defaultVoronoiConfig` |
| `src/components/controls/VoronoiControl.svelte` | smoothing slider |
