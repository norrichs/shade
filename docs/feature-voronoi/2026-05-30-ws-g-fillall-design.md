# WS-G · surfaceProjection `fillAll`

**Status:** Spec — approved design, pending implementation plan
**Item:** #9
**Depends on:** nothing
**Blocks:** nothing
**Worktree:** isolated; implementer = Sonnet
**Risk:** highest of the set — geometry is novel (degenerate facets). Spec includes explicit
latitude; expect iteration during implementation.

---

## Goal

A `fillAll` config option. When **true** and the pattern type is **`outlined`**, generate an
additional **interior fill band** for each surface-projection polygon: a triangle fan whose
outer edge follows the polygon's interior perimeter and whose inner edge collapses to the
polygon's **centroid surface-intersection point**.

To keep the existing pattern machinery happy, **preserve the 2-facets-per-quad structure**,
where each fill quad has one normal triangle facet and **one degenerate triangle facet**
(collapsed at the centroid). Tiled patterns can't handle degenerate facets — so `fillAll` is
**outlined-only**.

---

## Current state

`src/lib/projection-geometry/generate-projection.ts`:

- `generateSurfaceProjectionBands(projection, projectionConfig, projectionAddress)`
  (`:1222`) builds polygon-edge "tubes": for each shared polyhedron edge pair it assembles
  `Section[]` from the two edges' `intersections` (`curve`, `edge`, `divisions`), winding-
  corrects (`:1289-1306`), and calls `generateProjectionBands(sections, 'axial-right', ...)`
  (`:1309`). Returns `{ tubes }`. Partner matching runs after (`:1321-1335`).
- A `Section` is `{ points: Vector3[] }`. A polygon (`projection.polygons[i]`) has `edges`,
  each edge holds `sections` with `intersections.curve` (the inner offset point) and
  `intersections.edge`.
- The surface intersector used to ray-cast onto the surface mesh exists in this module
  (locate the exact function during implementation) — needed for the centroid projection.

> The current output traces polygon **edges/struts** as tubes; polygon **interiors are
> empty**. `fillAll` adds the interior coverage.

---

## Design

### Config

Add `fillAll?: boolean` to the surface-projection config (the projection config branch that
drives `generateSurfaceProjectionBands`; mirror where `surfaceProjectionDivisions` lives).
Default `false`. Add a UI toggle near the existing surface-projection controls.

### Interior fill band per polygon

When `fillAll` is true (and outlined), after the edge tubes are built, for **each polygon**:

1. **Interior perimeter points.** Collect the polygon's inner-curve points — the
   `intersections.curve` points of the polygon's edges, in winding order around the polygon.
   These form the fan's **outer ring** (`P0..P_{m-1}`).
2. **Centroid surface point.** Average the perimeter points → ray-cast from the projection
   center through that average onto the surface (use the module's surface intersector) to get
   `C`, the centroid surface-intersection point. (If the ray misses, fall back to the
   averaged 3D point and warn.)
3. **Build fan sections preserving 2-facets-per-quad.** For each perimeter edge
   `(P_k → P_{k+1})`, build a quad with vertices `[P_k, P_{k+1}, C, C]` so that
   `generateProjectionBands`-style facetization yields:
   - facet 1: `(P_k, P_{k+1}, C)` — a real triangle,
   - facet 2: `(P_{k+1}, C, C)` — a **degenerate** triangle (zero area, collapsed at `C`).

   Represent this as `Section`s compatible with the band builder: the fan is one band whose
   "inner" section points are all `C` (repeated) and "outer" section points are the
   `P_k`. Confirm the exact `Section.points` ordering the `axial-right` band builder expects
   (3 points per section ⇒ 2 facets) and supply the collapsed inner point accordingly.
4. **Winding.** Apply the same outward-normal check used at `:1289-1306` to the first
   non-degenerate facet; reverse if needed so the fill band faces outward consistently with
   the edge tubes.
5. **Emit** the fill band as its own `Tube` (single band) appended to `tubes`, or as an extra
   band on a dedicated "fill" tube per polygon — **pick one and document**; a dedicated
   per-polygon fill tube keeps addressing clean and avoids disturbing edge-tube band indices.

### Partner / tab metadata

The fill band's outer edges coincide with the edge tubes' inner-curve points, so tabs can
in principle join fill ↔ edge. Best-effort:

- Run the fill bands through the existing surface-projection partner matchers
  (`matchSurfaceProjection*`) if they can match on shared geometry; otherwise leave fill-band
  partner meta empty (fill bands simply won't sprout connecting tabs in v1).
- Degenerate facets must not crash partner matching or outline generation — guard
  zero-length edges (skip tab generation on any edge of length ~0, i.e. the collapsed
  centroid edges).

### Pattern generation guard

- Gate fill-band creation to `outlined` pattern type. If the active pattern type is tiled,
  do **not** generate fill bands (they'd break tiling on degenerate facets).
- In `generate-outlined-pattern.ts`, ensure degenerate quads/edges are tolerated: the
  outline walk should skip ~zero-length edges rather than emit `L` segments to a coincident
  point. Add a small epsilon guard if needed.

---

## Testing

- Unit: fan builder — given a polygon's perimeter points + centroid, produces `m` quads,
  each with one real + one degenerate facet; perimeter preserved; inner points all equal `C`.
- Unit: winding — fan facet normals point outward (dot with `centroid - projCenter` > 0).
- Unit: degenerate-edge guard — outline builder skips zero-length collapsed edges, produces a
  valid closed path (a triangle-fan boundary, no duplicate coincident vertices).
- Manual: `fillAll` on, outlined — polygon interiors render as filled triangle fans; off →
  unchanged; tiled mode → no fill bands, no crash.

## Out of scope

- Tiled-pattern support for fill bands (explicitly excluded).
- Decorative subdivision of the fan interior.
- Tabs that physically connect fill bands to edge bands (best-effort only in v1; may be empty).

## Open implementation details / latitude (no further sign-off needed)

- Exact `Section.points` layout the `axial-right` builder needs for a collapsed inner ring.
- Whether each polygon's fan is its own tube vs. appended band (recommend own tube).
- Centroid ray-cast fallback behavior on miss.
- Epsilon for degenerate-edge detection.

> Because the degenerate-facet interaction with downstream pattern code is the least-certain
> part of this whole effort, implement behind the `fillAll` flag and verify the outlined SVG
> output visually before wiring partner/tab metadata.
