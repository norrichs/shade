# Design — Voronoi "Local Projection" inner-edge mapping

**Date:** 2026-06-07
**Status:** Approved design (brainstormed). Next: implementation plan.
**Branch:** create `feature/voronoi-local-projection` from `main`.
**Source brief:** `docs/voronoi/2026-06-07-local-projection-method-handoff.md`

---

## 1. Purpose

Add a new method for mapping Voronoi **inner (inset) edges** onto a surface that
computes the inset in a **flat 2D plane** instead of via center-out raycasting.

Near-term goal: **rough parity** with the existing inset mapping on the currently
supported surfaces (sphere, capsule, globule). The flat 2D plane is deliberately
introduced as the seam where future extensions plug in (richer/bezier offsets, and
eventually non-spherical topology support).

This milestone does **not** attempt full toroidal/concave support — see
[Scope & known limitations](#9-scope--known-limitations).

---

## 2. Background — current pipeline

All under `src/lib/voronoi/`. Entry point: `makeVoronoi` (`generate-voronoi.ts`).

Today `makeVoronoi`:

1. Builds the surface, `center`, and a nearest-hit raycaster
   `createSurfaceIntersector(surface, center)` (`generate-voronoi.ts:51`).
2. Generates seeds (`generateSeeds`).
3. Computes the Voronoi diagram in a center-relative parameter space
   (`computeVoronoiFromSeeds` → spherical lon/lat or UV), returning `voronoiResult`
   (edges as 2D param-space vertex pairs + `cellIndices`), `relaxedSeeds`, and a
   `coordToDirection` function.
4. Computes adaptive per-edge division counts (`computeAdaptiveEdgeDivisions`).
5. **Per-edge loop** (`generate-voronoi.ts:353`): samples directions along the edge,
   raycasts from `center` to get on-surface edge points + normals
   (`generate-voronoi.ts:360–391`), then **computes the two inset ("curve") points
   per sample by slerping the edge direction toward each adjacent cell seed and
   raycasting again** (`generate-voronoi.ts:394–404`). This slerp-from-center step
   is the spherical assumption.
6. Assembles tubes from `edgePoints3d` + `curvePointsA/B` + `normals`
   (`applyCrossSectionsToEdge` → `combineSections` → `generateProjectionBands`,
   `generate-voronoi.ts:407+`), builds the surface-projection tubes, runs `fillAll`
   and partner matching.

`makeVoronoi` runs inside the geometry **Web Worker**; outputs `Tube/Band/Facet`,
rehydrated by `workerStore.ts`.

---

## 3. Approach (decisions)

| Decision                           | Choice                                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Granularity ("local")              | **Per cell** — one average-plane + source per Voronoi cell                                                                                                  |
| Back-projection hit selection      | **Proximity to known step-2 points, with normal-agreement tiebreak**                                                                                        |
| Gating                             | **New orthogonal config field `insetMethod: 'centerOut' \| 'localProjection'`**, independent of `voronoiMethod`                                             |
| 2D inset primitive                 | **Homothety (scale toward seed) by `curveOffsetFactor`**, behind a swappable `insetPolygon2D` interface so perpendicular/bezier offset can replace it later |
| Plane fit                          | **SVD** of the centered cell sample points                                                                                                                  |
| Per-cell `size`                    | **Cell diameter** (max pairwise distance among the cell's sample points)                                                                                    |
| `sourceDistance`                   | `10 × size` (constant factor, not configurable)                                                                                                             |
| Phase 1 (diagram + edge placement) | **Unchanged** — still center-based for this milestone                                                                                                       |

---

## 4. Architecture — three phases

`makeVoronoi` is restructured so the spherical assumption lives **only** in Phase
2's `centerOut` branch.

### Phase 1 — shared "project + subdivide edges onto surface"

Extract the current edge-sampling + raycast + face-normal block
(`generate-voronoi.ts:360–391`) into a reusable helper. For every Voronoi edge it
returns `edgePoints3d[]` and `normals[]` (adaptive divisions already applied). Also
resolves each cell seed's 3D position (`coordToDirection(seed)` → `intersect`, the
pattern `fillAll` uses at `generate-voronoi.ts:537`).

Both `insetMethod` values consume Phase 1 identically. **Unchanged behavior**;
guarded by a characterization test.

### Phase 2 — compute the two inset polylines per edge (branches on `insetMethod`)

Produces, per edge, two inset polylines (one per adjacent cell side), each with its
`surfaceProjectionDivisions` intermediate points, back-projected onto the surface.

- `centerOut`: today's slerp-toward-seed + raycast (`generate-voronoi.ts:394–404`),
  unchanged.
- `localProjection`: a per-cell pass (Section 5).

An edge shared by cells A and B is processed once per cell, yielding its A-side
inset from cell A's flatten and its B-side inset from cell B's. **`edgePoints3d`
remain the shared Phase-1 points** (never re-projected), so the tube seam between the
two sides always aligns.

### Phase 3 — shared tube assembly (unchanged)

For each edge: `edgePoints3d` + `curvePointsA/B` (Phase 2) + `normals` →
`applyCrossSectionsToEdge` → `combineSections` → `generateProjectionBands`; build
surface-projection tube; `fillAll`; partner matching
(`generate-voronoi.ts:407–586`). No downstream changes; worker output shape is
identical, so no `workerStore` rehydration changes.

---

## 5. The per-cell local-projection pass (Phase 2, `localProjection`)

For each cell, in order:

1. **Gather inputs.** Build a `cell → edgeIndices` map from
   `voronoiResult.edges[].cellIndices`. Sample set = all `edgePoints3d` of the
   cell's edges (Phase 1) + the cell's 3D seed point.

2. **Fit average plane (SVD).** Center the sample points on their centroid; run SVD
   on the 3×N matrix; the singular vector with the smallest singular value is the
   plane normal → `sourceDirection`. Sign it away from the surface center
   (`dot(normal, centroid − surfaceCenter) > 0`, flip if needed). Degenerate
   fallback (collinear / fewer than 3 points): use the averaged Phase-1 normals of
   the cell's edge points.

3. **Size & frame.** `size` = max pairwise distance among the cell's sample points
   (cell diameter). `sourceDistance = SOURCE_DISTANCE_FACTOR (10) × size`.
   `source = centroid + sourceDirection × sourceDistance`. `projectorPlane` is
   perpendicular to `sourceDirection` at
   `centroid + sourceDirection × (sourceDistance / 2)`.

4. **Flatten to 2D.** For each cell sample point (edge points + seed), cast a ray
   from `source` through it, intersect `projectorPlane`, and express the hit in a 2D
   basis on the plane → 2D coordinates. The seed's 2D image is `seed2d`.

5. **Inset (swappable interface).** `insetPolygon2D(points2d, seed2d, factor)` —
   homothety: each point → `lerp(point2d, seed2d, curveOffsetFactor)`. The
   `surfaceProjectionDivisions` intermediate points are intermediate lerps
   (`factor × d/(divs+1)` for `d = 1..divs`). This function is the seam where a
   future perpendicular/bezier offset swaps in.

6. **Back-project to surface (hit selection).** Each 2D inset point's position on
   `projectorPlane` defines a ray from `source`. Raycast the surface with
   `intersectObject(surface, true)` (**all** hits). Selection:
   - **Primary:** nearest hit to the **anchor** = the corresponding edge sample's
     Phase-1 `edgePoints3d[i]` (all inset-region points of column `i` use that
     anchor).
   - **Tiebreak:** when two hits are within an epsilon of equal distance, prefer the
     one whose face normal best agrees with the cell's plane normal.
   - **Fallback:** no hit → use the anchor point.

7. **Emit.** For each edge of the cell, the back-projected inset polyline (+
   intermediates) becomes that edge's inset on this cell's side. Assign to
   `curvePointsA` or `curvePointsB` by whether this cell is `cellIndices[0]` or
   `cellIndices[1]`.

---

## 6. New / changed files

All under `src/lib/voronoi/` unless noted. Each new file is small and
single-purpose.

**New**

- `project-edges-onto-surface.ts` — Phase 1 helper (extracted, shared).
- `fit-plane.ts` — `fitPlaneSVD(points) → { normal, centroid }`.
- `inset-2d.ts` — `insetPolygon2D(points2d, seed2d, factor)` (swappable seam).
- `select-surface-hit.ts` — all-hits raycast wrapper + proximity/normal selection.
- `local-projection.ts` — per-cell Phase-2 orchestration (gather → fit → frame →
  flatten → inset → back-project → emit per-edge insets).

**Changed**

- `generate-voronoi.ts` — `makeVoronoi` Phase-2 block becomes a branch on
  `insetMethod`; Phase-1 block replaced by a call to the extracted helper.
- `types.ts` — add `InsetMethod` and `VoronoiConfig.insetMethod`.
- `shades-config.ts` — `defaultVoronoiConfig.insetMethod = 'centerOut'`.
- `migrate-voronoi-config.ts` — default missing `insetMethod` to `'centerOut'`.
- `src/components/controls/VoronoiControl.svelte` — add `insetMethod` selector.

**Constants** (internal, not configurable): `SOURCE_DISTANCE_FACTOR = 10`;
back-projection equidistance epsilon.

---

## 7. Config / types / migration / UI

- `voronoiMethod` (`'spherical' | 'uv'`) is untouched and still selects the diagram.
- `insetMethod` is orthogonal; default `'centerOut'` preserves current behavior.
- No changes to `VoronoiEdge` / `VoronoiResult`.
- `curveOffsetFactor`, `surfaceProjectionDivisions`, `edgeDivisions` keep their
  current meanings.
- Migration defaults any config lacking `insetMethod` to `'centerOut'`, so all
  stored DB configs keep working unchanged.
- UI: an `insetMethod` selector alongside the existing `voronoiMethod` control; no
  new numeric controls.

---

## 8. Testing strategy

TDD against pure pieces, with synthetic geometry where the answer is known. Tests
colocated in `src/lib/voronoi/__tests__/`.

**`fit-plane.ts`**

- Points sampled from a known plane (+ noise) → recovered normal matches up to sign.
- Normal signed away from a given surface center.
- Degenerate inputs (collinear, <3 points) → fallback, no throw.

**`inset-2d.ts`**

- `factor = 0` → unchanged; `factor = 1` → all points at seed; `0.5` → midpoints.
- A shared corner point maps identically regardless of source edge
  (corner-continuity invariant).
- `surfaceProjectionDivisions` intermediates are monotonic lerps edge→inset.

**`select-surface-hit.ts`**

- Two hits (near/far from anchor) → picks near.
- Near-equidistant pair → normal-agreement tiebreak picks the cell-plane-aligned
  face.
- No hits → returns anchor fallback.

**`project-edges-onto-surface.ts`**

- Characterization test: on a sphere, the extracted helper reproduces the current
  inline output (guards the refactor).

**`local-projection.ts`**

- **Sphere rough-parity:** `localProjection` insets land close to `centerOut`
  insets within a tolerance — the milestone acceptance check.
- An edge shared by two cells yields identical `edgePoints3d` on both sides
  (seam-alignment invariant) while `curvePointsA ≠ curvePointsB`.

**Migration**

- A config without `insetMethod` migrates to `'centerOut'`; other fields preserved.

**Manual/visual** (plan checkpoint, not automated): generate on sphere/capsule/
globule, compare `localProjection` vs `centerOut` side by side for rough parity.

Highest-weight checks: the **sphere rough-parity** assertion and the **Phase-1
characterization** test.

---

## 9. Scope & known limitations

**In scope:** rough parity with `centerOut` on sphere/capsule/globule; the per-cell
flat-2D inset pipeline; orthogonal `insetMethod` gating; the swappable inset
interface.

**Explicitly out of scope (later milestones):**

- **Full toroidal/concave topology support.** Phase 1 still depends on center-based
  projection in three places: (a) the diagram is computed in a center-relative
  parameter space (`toLonLat`/`toUV`), (b) edge points are placed by raycasting
  **from `center`** (`createSurfaceIntersector`), and (c) seed 3D positions are
  center-out raycasts. On a genuinely toroidal/concave surface these center-out rays
  miss or hit the wrong lobe, so this method as scoped does **not** yet work there.
  Full support requires also replacing Phase 1's center-out diagram mapping (e.g. a
  surface-intrinsic/geodesic diagram + multi-origin or surface-walking edge
  placement) — deferred.
- **Perpendicular / bezier (curved, varying-width) offsets.** The `insetPolygon2D`
  interface is the seam for this, but only homothety is implemented now.

The value this milestone banks toward the future is the **flat 2D plane
abstraction**: per-cell flatten → inset → back-project is where richer offset
geometry and, eventually, a non-center diagram source will plug in.
