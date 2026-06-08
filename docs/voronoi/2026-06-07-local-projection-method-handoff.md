# Handoff — Voronoi "Local Projection" inner-edge mapping method

**Status:** Brief for a new planning session. NOT yet brainstormed, specced, or planned.
**Start from:** `main`. **Create branch:** `feature/voronoi-local-projection`.
**Goal:** A new method for mapping Voronoi **inner (inset) edges** onto a surface that does **not** assume a roughly spherical surface. Target rough parity with the existing Voronoi mapping on current surfaces; later extensions (other topologies, curved offsets) follow.

This document describes the desired method and points to the parts of the existing
codebase it builds on / reuses. It does not prescribe a design — brainstorm the
design with the user, then write a spec and an implementation plan.

---

## Why this method

The current inset/inner-edge computation casts rays **from a single center point
outward** to the surface (see "Current pipeline" below). That assumes a roughly
star-convex / spherical surface, and it bakes the inset *shape* into a direction
interpolation. The new "local projection" method instead:

- **Removes the spherical assumption** — it should work on toroidal and concave
  surface topologies, where center-out raycasting fails.
- **Enables richer inset geometry** — because the inset is computed in a flat 2D
  plane, the offset can later become a sampled bezier curve (or other shape),
  which is awkward with the current approach.

For now the goal is **rough parity** with the existing mapping on the current
surfaces (sphere/capsule/globule). Keep the other-geometry and curved-offset
intentions in mind when shaping the 2D abstraction — that flat plane is the seam
those future extensions will plug into — but do **not** build them yet.

---

## The method (as specified by the user)

Establish a local flattening frame from the actual surface points, flatten to 2D,
do the inset/offset work in that 2D plane, then project back onto the surface.

1. **Generate seeds** with the current methods.
2. **Map the Voronoi diagram onto the surface and subdivide the edges** using the
   *current* method (`edgeDivisions`), with **adaptive subdivision carried through**.
   This yields the 3D points of the divided Voronoi edges (and the seed points on
   the surface).
3. **Gather all the 3D points** forming the divided Voronoi edges (the sample set).
4. **Fit an "average plane"** to that sample set, via **PCA or SVD** (which is TBD).
5. Take the plane's **normal** as `sourceDirection`.
6. Define `sourceDistance` ≈ a **constant** multiple of the surface's "size"
   measured at the seed points. Not configurable — use a constant; **try 10×**.
   (E.g. if the longest distance between two seeds is 200, `sourceDistance` ≈ 2000.)
   Place the `source` at `sourceDistance` along `sourceDirection`.
7. At **half** of `sourceDistance` along `sourceDirection`, establish the
   `projectorPlane`: perpendicular to `sourceDirection` (i.e. parallel to the
   average plane).
8. **Cast rays from `source`** to: the Voronoi edge vertices + subdivided edge
   points on the surface, and the seed point(s).
9. **Intersect those rays with `projectorPlane`.** → a **2D representation** of the
   Voronoi cell on `projectorPlane`.
10. That 2D layout is the working space.
11. In that 2D plane, compute the **inset edges** (by `curveOffsetFactor`) and the
    subdivided inset points (by `surfaceProjectionDivisions`).
12. **Cast rays from `source` back through** the inset-edge points on
    `projectorPlane`, and intersect with the **surface**.
    ⚠️ **Hard part:** because the rays come from a far `source` (not a center
    inside a roughly-spherical surface) and `sourceDistance` is large relative to
    the surface, there will usually be **multiple surface intersections**. The
    correct one must be chosen carefully. Expect the desired intersection to lie
    **roughly between the already-known surface points** (the Voronoi edge points
    and the seed point) — use that proximity to disambiguate.
13. **Feed the resulting surface intersection points into the existing tube
    generation pipeline** (the same downstream structures the current mapping
    produces).

---

## Current pipeline — what to reuse and where it lives

All under `src/lib/voronoi/` unless noted.

**Seeds (step 1)**
- `generate-seeds.ts` → `generateSeeds(seedMethod, center, intersect, surfaceTriangles)`.
  Seed methods: `centerProjection`, `areaWeighted` (`VoronoiSeedConfig` in `types.ts`).

**Voronoi diagram + current surface mapping & subdivision (step 2)**
- Diagram: `compute-voronoi-spherical.ts` (`computeVoronoiSpherical`, geo/spherical)
  and `compute-voronoi.ts` (`computeVoronoi`, planar UV). Selected in
  `generate-voronoi.ts` via `computeVoronoiFromSeeds`. Edges return as **2D
  parameter-space** vertices (lon/lat or UV) with adjacent cell indices
  (`VoronoiEdge`, `VoronoiResult` in `types.ts`).
- Parameter ↔ direction transforms: `compute-voronoi-spherical.ts`
  (`toLonLat`/`fromLonLat`) and `uv-mapping.ts` (`toUV`/`fromUVToDirection`).
- Surface mapping + subdivision: `generate-voronoi.ts` → `makeVoronoi`. Its
  per-edge loop is the **current center-out projection**: it samples each Voronoi
  edge (`sampleEdgeAsDirections`), **raycasts from a single `center`** onto the
  surface (`createSurfaceIntersector`) to get 3D edge points, computes a per-point
  surface normal, and computes the two inset ("curve") points by rotating the edge
  direction toward each adjacent cell's seed and raycasting again. Step 2 of the
  new method reuses the edge-point projection + subdivision part of this (the seed
  and edge points on the surface); decide during planning whether to call it as-is
  or factor out a reusable "project + subdivide Voronoi edges onto surface" helper.
- **The single-center raycast here is exactly the spherical assumption the new
  method replaces for the inset step** — but step 2 still uses it to get the
  starting on-surface Voronoi edge points.

**Adaptive subdivision (carries through — step 2)**
- `edge-divisions.ts` → `computeAdaptiveEdgeDivisions(lengths, edgeDivisions)` and
  `normalizeEdgeDivisions`. `edgeDivisions` is `[min, max]`; per-edge division
  count is interpolated by edge length (shortest → min, longest → max). The new
  method must preserve this adaptive behavior.

**Surface (steps 2, 8, 12)**
- `generate-projection.ts` → `generateSurface`. Helpers in `generate-voronoi.ts`:
  `getSurfaceCenter`, `extractSurfaceTriangles`, `createSurfaceIntersector`
  (single-hit raycaster). Supported surfaces today: sphere, capsule, globule.
- For step 12 you'll need **all** ray/surface intersections (not just the first
  hit) and a selection rule — `createSurfaceIntersector` returns only the nearest
  hit, so you'll likely raycast the surface mesh directly (three.js `Raycaster`
  `intersectObject(..., true)` returns all hits) and pick by proximity.

**Tube generation pipeline (step 13 — reuse as-is)**
- `apply-cross-sections.ts` → `applyCrossSectionsToEdge(edgePoints3d, curvePoints,
  normals, crossSectionConfig)`.
- `generate-projection.ts` → `generateProjectionBands(...)`.
- Downstream in `makeVoronoi`: surface-projection tubes, `fillAll`
  (`fill-bands.ts`), partner matching (`matchFacets`, `matchTubeEnds`). Output
  types: `Tube` / `Band` / `Facet` (`projection-geometry/types`, `lib/types`).
- The new method should produce the same per-edge inputs the tube stage consumes
  (edge points + the two inset polylines + normals), so this stage is unchanged.

**Config & defaults**
- `types.ts` → `VoronoiConfig`, `VoronoiResult`, `VoronoiEdge`, `VoronoiSeedConfig`.
  Relevant fields: `curveOffsetFactor`, `surfaceProjectionDivisions`,
  `edgeDivisions`, `voronoiMethod`, `crossSectionConfig`, `bandConfig`.
- `src/lib/shades-config.ts` → `defaultVoronoiConfig`.
- UI: `src/components/controls/VoronoiControl.svelte`.

**Execution model (important)**
- Geometry generation runs in a **Web Worker**
  (`src/lib/workers/super-globule.worker.ts`); `src/lib/stores/workerStore.ts`
  rehydrates three.js objects (`Vector3`, `Triangle`) after `postMessage`. Keep
  heavy geometry in the worker; if you add new three.js types to the result, the
  rehydration logic must handle them. See repo `CLAUDE.md` for the worker pattern.

---

## Open questions to resolve in brainstorming (don't assume)

- **Granularity / "local":** is the projection done **per cell**, per edge, per
  local neighborhood, or once globally for the whole diagram? The branch name
  ("local projection") and the per-cell language in the steps (a single
  `projectorPlane`, "the seed point", "the Voronoi cell") suggest **per cell** —
  confirm. This decides how many planes/sources are computed and how continuity
  between adjacent cells/edges is maintained for the tube pipeline and partner
  matching.
- **PCA vs SVD** for the average plane (step 4) — pick one; consider available
  libraries vs a small hand-rolled covariance/eigen solve.
- **Intersection selection (step 12)** — the crux. Define the exact rule for
  choosing the correct surface hit among many, using proximity to the known
  on-surface edge/seed points.
- **`size` metric (step 6)** — longest seed-to-seed distance vs bounding-box
  diagonal vs other; confirm the constant multiplier (start 10×).
- **Insets per edge vs per cell** — each Voronoi edge borders two cells and today
  produces two insets (one per side). Ensure the per-region flattening preserves
  that and keeps adjacent results continuous for downstream tube assembly.
- **Reuse vs refactor of step 2** — call the existing center-out projection in
  `makeVoronoi` directly, or extract a reusable "project + subdivide Voronoi edges
  onto surface" function first.
- **Gating** — whether this is a new method selected alongside the existing one
  (e.g. via config) or a standalone path; and how to keep the existing mapping
  working unchanged.

---

## Suggested process

Brainstorm the design with the user → write a design spec under
`docs/superpowers/specs/` → write an implementation plan under
`docs/superpowers/plans/` → implement (TDD, frequent commits). Start from `main`;
create `feature/voronoi-local-projection` before touching code.
