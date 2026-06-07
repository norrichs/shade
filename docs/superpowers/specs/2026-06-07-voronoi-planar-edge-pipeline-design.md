# Voronoi Planar Edge Pipeline — Design

**Date:** 2026-06-07
**Status:** Approved (design); implementation pending
**Scope:** 2D-first foundation only (curve-shaped edges are a later plan built on this seam)

## Problem

The current Voronoi pipeline (`src/lib/voronoi/generate-voronoi.ts`, `makeVoronoi`)
computes the geometry that runs *along* each Voronoi cell edge — the outer edge,
the two inset ("inner") edges, and the per-edge subdivisions — directly in
**3D direction-space** (great-circle `slerp`s and raycasts). Concretely, per edge:

- edge sampling: `sampleEdgeAsDirections` slerps between the two vertex directions
  (a great-circle arc), not a straight line in the 2D parameter plane;
- the inset: `slerp(edgePointDir, seedDir, curveOffsetFactor)` moves each sampled
  point a fraction of the way toward the cell seed, in direction-space;
- adaptive `edgeDivisions`: edge length is measured as 3D arc-length.

Because all of this happens in 3D, there is **no 2D representation of the inset /
inner edge**. That blocks the real goal: the developer wants to **adjust edge
shapes** — replace straight inset edges with **2D curves**, sample points along
those curves, and only then project onto the surface. That work has to happen in
2D, before projection.

This spec defines an **alternative pipeline** that does the edge work in 2D and
projects last. It is gated by a config boolean and leaves the existing pipeline
fully in place. It reproduces today's behavior closely (straight edges, linear
divisions); the curve capability is a follow-up that plugs into the 2D seam this
spec creates.

## Goals

- Add an alternative, 2D-first edge pipeline selectable per config.
- Reproduce today's output to a **topological + close-geometry** bar (same cells,
  edges, and tube connectivity; sample positions may shift slightly because
  2D-linear math replaces direction-space slerp).
- Create a single, clear seam (`computeEdgeProfiles2D`) where curved edges can be
  added later as a drop-in, **without** building the curve feature now.
- Leave the existing pipeline and all saved configs unaffected by default.

## Non-Goals

- Curved inset/outer edges (separate future plan).
- Bit-exact parity with the existing pipeline.
- Changes to seed generation, Voronoi computation, surface-projection tubes,
  fillAll, or partner matching — these are shared and untouched.
- Any new UI beyond a single toggle.

## Decisions (locked during brainstorming)

1. **Scope:** 2D-first foundation only.
2. **Parity bar:** topological + close geometry (verify topology/sanity, not exact
   coordinates).
3. **Inset construction:** lerp each outer-edge endpoint toward that side's cell
   seed by `curveOffsetFactor`, in 2D. (Lerp-toward-a-point is affine, so
   "inset the endpoints then sample the segment" equals "sample then inset each
   point" — the new ordering adds no divergence beyond the intended slerp→lerp
   swap.)
4. **Architecture:** Approach A — extract the per-edge profile step into a
   strategy function with two implementations; share everything else.

## Architecture

### Config & gating

Add an optional boolean to `VoronoiConfig` (`src/lib/voronoi/types.ts`):

```ts
planarEdges?: boolean; // true → compute edge/inset/divisions in 2D, then project
```

- Default absent/`false` → today's direction-space pipeline runs unchanged.
- Optional field → `normalizeVoronoiConfig` needs no migration; it passes through.
  Add `planarEdges: false` to `defaultVoronoiConfig` for explicitness.
- UI: a checkbox in `VoronoiControl.svelte` near the edge-division sliders, wired
  through the existing `update(...)` switch (new field key `planarEdges`).
- Name `planarEdges` is a proposal; trivially renamable.

### The extraction seam

Pull the per-edge profile computation out of the `makeVoronoi` loop into a
function with a shared return shape:

```ts
type EdgeProfiles = {
  edgePoints3d: Vector3[]; // projected outer-edge samples
  curvePointsA: Vector3[]; // inset toward cell A, projected
  curvePointsB: Vector3[]; // inset toward cell B, projected
  normals: Vector3[];      // surface normal at each edge point
};
```

Two implementations, identical signature:

- `computeEdgeProfiles3D(...)` — today's code, moved verbatim (slerp edge sampling
  + slerp-to-seed insets + raycast for point and normal).
- `computeEdgeProfiles2D(...)` — the new strategy (below).

Inside `makeVoronoi`'s loop, one branch selects the strategy:

```ts
const profiles = config.planarEdges
  ? computeEdgeProfiles2D(args)
  : computeEdgeProfiles3D(args);
const { edgePoints3d, curvePointsA, curvePointsB, normals } = profiles;
```

Everything after the seam is **unchanged and shared**: the `edgePoints3d.length < 2`
guard, `applyCrossSectionsToEdge`, `combineSections`, `generateProjectionBands`,
tube assembly, surface-projection tubes, `spFillMeta`, fillAll, and partner
matching. They consume only the four arrays plus the cell indices/centers, which
remain in the loop.

### `computeEdgeProfiles2D` internals

Inputs: the edge's two 2D vertices `v0, v1` (lon/lat for spherical, UV for uv); the
two 2D cell seeds `seedA, seedB` (the relaxed seed coords already in
`relaxedSeeds`); a `divisions` count; `curveOffsetFactor` (`f`); and the closures
`coordToDirection` and `intersect`, plus the `surface` for normals.

1. **Build three 2D polylines** (straight segments — the seam curves plug into
   later):
   - outer: `v0 → v1`
   - inset A: `lerp(v0, seedA, f) → lerp(v1, seedA, f)`
   - inset B: `lerp(v0, seedB, f) → lerp(v1, seedB, f)`
2. **Sample each** at `divisions + 1` evenly spaced points in 2D — matching the
   existing `i in [0, divisions]` count so A/edge/B stay index-aligned for
   cross-sections.
3. **Project every sampled 2D point**: `dir = coordToDirection(p)`, then raycast
   `intersect(dir)` for the 3D point; for outer-edge points, the same raycast hit
   yields the transformed face normal (reuse the existing normal logic — face
   normal transformed by `object.matrixWorld`, falling back to the ray direction
   when no face).
4. **Edge-case parity with today:**
   - If an **outer** sample misses the surface, drop that index from all three
     arrays and the normals (keeps them aligned).
   - If an **inset** sample misses, fall back to the outer 3D point at that index
     (mirrors the current `curveHit ?? point3d.clone()`).

Output: the four aligned arrays the downstream expects.

### Adaptive divisions in 2D

The per-edge division count is computed before the loop via the existing
space-agnostic helper `computeAdaptiveEdgeDivisions(lengths, edgeDivisions)`
(`src/lib/voronoi/edge-divisions.ts`). The only branch is how `lengths` is
measured:

- 3D pipeline (today): `edgeArcLength` (great-circle angle between vertex
  directions).
- 2D pipeline: **2D Euclidean length** in the parameter plane,
  `dist(v0, v1)`.

This keeps divisions consistent with where the rest of the 2D work happens.
Because length is measured differently, the *distribution* of division counts
across edges can differ slightly between pipelines — acceptable under the
topological+close bar, and noted here as an intentional consequence.

## Data flow (2D pipeline)

```
2D Voronoi edges (lon/lat or UV)
  → per edge: build outer + inset-A + inset-B 2D segments (lerp-to-seed)
  → measure 2D edge lengths → adaptive division counts (shared helper)
  → sample each segment at divisions+1 points in 2D
  → project each 2D point: coordToDirection → raycast → 3D point (+ normal for edge)
  → EdgeProfiles { edgePoints3d, curvePointsA, curvePointsB, normals }
  → [shared] applyCrossSectionsToEdge → tubes / SP tubes / fillAll / partner match
```

## Testing & verification

- **Unit — `computeEdgeProfiles2D` (pure-ish core):** factor the 2D segment build +
  sampling so the 2D math is testable without a real mesh, OR inject a trivial
  `coordToDirection`/`intersect` (e.g. identity-ish sphere) in tests. Assert:
  - outer/inset-A/inset-B each return `divisions + 1` points when all hit;
  - inset endpoints equal `lerp(vertex, seed, f)` before projection;
  - an inset miss falls back to the corresponding outer point;
  - an outer miss removes that index from all four arrays.
- **Unit — adaptive divisions in 2D:** feed 2D lengths to the existing helper;
  confirm shortest edge → min, longest → max (reuses covered behavior).
- **Integration — `makeVoronoi` with `planarEdges: true`:** mirror the existing
  `generate-voronoi.test.ts` assertions (tubes defined, ≥1 tube, bands have
  facets, sections have points) to confirm the new path produces valid geometry
  and the downstream is untouched.
- **Manual parity check:** toggle `planarEdges` in the designer and confirm the
  same cell/tube topology and visually close geometry.

## Files touched

- `src/lib/voronoi/types.ts` — add `planarEdges?: boolean`.
- `src/lib/shades-config.ts` — `planarEdges: false` in `defaultVoronoiConfig`.
- `src/lib/voronoi/generate-voronoi.ts` — extract `computeEdgeProfiles3D`
  (verbatim move) + new `computeEdgeProfiles2D`; add the strategy branch and the
  2D edge-length branch for divisions.
- `src/components/controls/VoronoiControl.svelte` — `planarEdges` checkbox + switch
  case.
- `src/lib/voronoi/__tests__/generate-voronoi.test.ts` — add `planarEdges: true`
  integration cases.
- New: `src/lib/voronoi/__tests__/edge-profiles-2d.test.ts` (or colocated) — unit
  tests for the 2D strategy.

## Future hook (out of scope)

`computeEdgeProfiles2D` step 1 ("build three 2D polylines") is the single place a
later plan swaps straight segments for **2D curves** (e.g. bezier insets), then
step 2 samples the curve instead of the segment. No other part of the pipeline
needs to change to support curved edges.
