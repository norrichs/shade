# WS-G2 · surfaceProjection / voronoiSurface interior fill bands (redesign)

**Status:** Spec — approved design, pending implementation plan
**Supersedes:** [`2026-05-30-ws-g-fillall-design.md`](./2026-05-30-ws-g-fillall-design.md) (WS-G, centroid triangle-fan)
**Applies to:** both `surfaceProjection` and `voronoiSurface` pattern sources
**Risk:** medium — geometry is well-understood now; main risk is pipeline timing (insert before
partner matching) and degenerate-facet interaction with partner matchers.

---

## Why redesign

The shipped WS-G `fillAll` builds **one fan tube per polygon**, where the fan is a **single band**
whose sections are 2-point `[P_k, C]` columns. The outlined renderer draws **one closed silhouette
per band**, so the fan's internal spokes (`C → P_k`) are interior edges that never appear in the
band silhouette — and the degenerate collapsed edges are skipped by the epsilon guard in
`buildOutlinePath`. Net result: each polygon's fill collapses to **one triangle / the bare polygon
outline** instead of a proper triangle fan ("one triangle per band, not one per quad").

The fix is structural: build fill as **per-border-band synthetic bands** integrated into the
existing tubes, so each fill band is a normal band that the renderer draws as its own
triangle. This also makes the feature work identically for `voronoiSurface`.

---

## Core model

A surfaceProjection/voronoiSurface tube traces a polygon/cell **edge** as a strip of bands. The
open polygon/cell **interiors** are empty. `fillAll` fills them.

- A polygon/cell with **N sides** is bordered by **N tube-bands** (the outermost band of each of
  the N tubes touching that polygon). Each contributes **one fill band**. All N fill bands for a
  polygon share **one center point**. Together they tile the interior as a fan.
- Each fill band is **1:1 with its border band's facets**, alternating:
  - **real** facet: the 2 vectors of the border facet's open-space edge (cloned) + the center point,
  - **degenerate** facet: 1 border vector + center + center (zero area). Exists only to preserve
    even/odd facet indexing and the `axial-right` orientation so downstream code is unchanged.
- Because each fill band is a **normal band**, the outlined renderer draws each as its own
  silhouette → one visible triangle per real facet. This is what fixes the collapse.
- Fill remains **outlined-only**: degenerate facets break tiling. The existing outlined-only drop
  gate is retained (see Config/gating).

### Geometry reference (from design dialog)

At a shared border vertex, multiple border-band triangles meet (coincident position vectors), but
only the triangle that shares a full **edge** (2 vectors) with the band's border side contributes
to a given fill facet. Interior triangles of the border band are ignored. Walk the band's border
side; each border segment belongs to exactly one border-band triangle that has 2 vectors on it →
clone those 2 + center for the real facet, then emit the degenerate facet.

---

## Border identification (structural, pre-partner)

Border edges are identified **purely from structural layout**, NOT from "edges that ended up with
no partner" (partners aren't assigned yet at fill-build time).

- **surfaceProjection** (`generateSurfaceProjectionBands`): each tube is built from sections
  `[curve0, …div0, edge, …div1, curve1]`. With `surfaceProjectionDivisions = d`, the tube has
  `2 + 2·d` bands. **Only the two outermost bands border open space**: band 0's outer side is the
  `curve0` polyline, the last band's outer side is the `curve1` polyline. Interior division bands
  never touch open space. Polygon ownership comes from `projection.polygons[i].edges[...].sections[]
  .intersections.curve`. Group border bands by polygon.
- **voronoi** (`makeVoronoi`): per tube the two outer sides map to cells A/B via the edge's
  `cellIndices` and `curvePointsA`/`curvePointsB`. Group border bands by cell.

**Fill count per tube is always exactly 2** (one before band 0, one after the last band),
independent of division count. Divisions only change which index is "last."

---

## Center point (one per polygon/cell)

The center is computed once per polygon/cell and shared by all its fill bands.

- **surfaceProjection:** average the polygon's border perimeter points (3D) → ray-cast from the
  projection center onto the surface mesh.
- **voronoi:** use the cell **seed** → `coordToDirection(seed)` → ray-cast onto the surface. (The
  seed is 2D parameter-space, so it must be cast to the surface; it is NOT already a 3D point.)
- **Fallback on ray miss:** averaged-perimeter cast, then the raw 3D average; `console.warn`.

---

## New module

Replace the geometry in `fill-fan.ts` with a dedicated, pure, testable module
(`src/lib/projection-geometry/fill-bands.ts`). Exports approximately:

- `extractBorderEdge(band, side)` → ordered `Vector3[]` of the band's open-space border vertices,
  read from the band's facet triangles (the "2 border vectors per real facet" walk).
- `buildFillBand({ borderEdge, center, address, orientation })` → a `Band` of alternating
  real/degenerate facets, cloned in an order consistent with the border band's facet orientation
  (`axial-right`), wound so real-facet normals point outward (away from projection center).
- degenerate-edge epsilon helper (reuse `FAN_DEGENERATE_EPSILON` semantics).

The center is supplied by the caller (each source computes it its own way).

`fill-fan.ts` and its tests are deleted; the per-polygon fan block in
`generateSurfaceProjectionBands` is removed.

---

## Pipeline integration & timing

Fill bands are built and **inserted into their tubes before partner matching**, so addressing and
the existing partner passes treat them as first-class:

- **surfaceProjection:** insert in `generateSurfaceProjectionBands` before
  `matchSurfaceProjectionCrossBandPartners` / `…TubeEnds` / `…SequentialPartners`.
- **voronoi:** insert in `makeVoronoi` before `matchTubeEnds(surfaceProjectionTubes)` /
  `matchFacets(surfaceProjectionTubes)`.

Per tube, final band order: `[fill(curve0), band0, …divisions…, bandLast, fill(curve1)]`.

**Degenerate-facet guard in partner matchers:** zero-length collapsed edges must be skipped so the
matchers neither crash nor produce false matches on the centroid-collapsed edges. (The matchers
previously skipped whole `isFill` tubes; now fill is a band, so guard at the edge/facet level.)

---

## Config & UI (one shared toggle)

- Add `fillAll?: boolean` to `VoronoiConfig` (it already exists on `SurfaceProjectionConfig`).
- **One** "fill all" checkbox in `CutPatternControl`, shown for **both** `surfaceProjection` and
  `voronoiSurface` sources, writing to whichever config matches the active source. Default `false`.

### isFill gating: keep the concept, move the granularity

Keep the `isFill` marker and the outlined-only drop gate, but move `isFill` from **Tube-level to
Band-level** (fill is now a band inside a normal tube). The drop in `generateProjectionPattern`
changes from "filter fill *tubes*" to "filter fill *bands* within tubes" when the pattern type is
not outlined. Purpose unchanged: tiled/panel patterns must not receive degenerate fill geometry.

---

## Renderer / flatten path

**Outline emission needs no change.** Because each fill band is its own band, its silhouette IS the
real triangle (spoke → perimeter → spoke). The degenerate facet's collapsed edges are skipped
harmlessly by the existing epsilon guard in `buildOutlinePath`. Spokes are real-facet edges and
render. **Verify visually** that spokes survive.

**Flatten path DOES need a guard (critical).** Investigation found `getFlatStripV2`
(`src/lib/cut-pattern/generate-panel-pattern.ts`) flattens each facet via law-of-cosines —
`Vector3.angleTo` on edge vectors and division by edge length. For a degenerate facet (two
coincident vertices ⇒ a zero-length edge) this yields `NaN` angles/positions, and because the strip
is chained facet-to-facet, **one degenerate facet poisons the entire band's 2D coordinates**. This
is the real reason the naive degenerate approach is fragile.

Add a **degenerate-facet guard in the flatten path** (`getFlatStripV2` / its per-facet helper):
when a facet has a zero-length edge (within epsilon), place the collapsed vertex coincident with its
neighbor and contribute **zero rotation**, so the degenerate facet occupies its quad slot without
emitting NaN. The guard is gated strictly to the degenerate case, so normal bands are byte-for-byte
unchanged. Contract: flattening a fill band produces only finite coordinates.

---

## Testing

- Unit (`fill-bands.test.ts`):
  - `extractBorderEdge` returns the correct ordered border vertices for a known band.
  - `buildFillBand` produces a band whose facets alternate real/degenerate; real facets =
    `(borderV0, borderV1, center)`; degenerate facets collapse to center; count is 1:1 with the
    border band's facets.
  - winding: real-facet normals point outward (dot with `center − projCenter` > 0).
- Unit: degenerate-edge guard — partner matchers skip zero-length collapsed edges (no crash, no
  false partner).
- Unit: flatten guard — `getFlatStripV2` on a band containing degenerate facets produces only
  finite (non-NaN) 2D coordinates, and normal (non-degenerate) bands are unchanged.
- Manual:
  - `fillAll` on, outlined, surfaceProjection — interiors render as proper triangle fans (one
    triangle per real facet), at divisions 0 and >0.
  - `fillAll` on, outlined, voronoiSurface — same.
  - `fillAll` off — unchanged.
  - tiled/panel mode — no fill bands, no crash.

## Out of scope

- Tiled-pattern support for fill bands (excluded — degenerate facets).
- Decorative subdivision of the fan interior.
- Physically connecting tabs between fill bands and border bands beyond whatever the existing
  partner passes produce for free.

## Open implementation details / latitude

- Exact representation/order used by `buildFillBand` to clone border vectors so the new band's
  `axial-right` indexing matches neighbors.
- Whether to store the per-polygon/cell center alongside the grouped border bands or recompute.
- Epsilon value for degenerate-edge detection in the partner-matcher guard.
