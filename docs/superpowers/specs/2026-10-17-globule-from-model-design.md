# Globule Cross Sections from an Imported Model — Design

Date: 2026-10-17 · Branch: `worktree-globule-from-model`

## Intent

Imported 3D models (GLB / glTF / STL / OBJ, `src/lib/mesh-import/`) can already be used as the
surface for projection and Voronoi generation. Globules can't use them. Globules now support
multiple cross sections (GCSs) placed at silhouette levels and blended between
(`docs/superpowers/specs/2026-10-16-multi-gcs-design.md`).

This feature joins the two: **slice the imported model at the globule's silhouette levels and
snapshot each slice outline as an asymmetric GCS**, all with the same vertex count, so the
globule takes on the model's cross-sectional character level by level. The output is still a
globule — bands, flattening, patterns and panels work unchanged.

## Goals

- From the GCS editor, pick an imported model and a band count N, then **Snapshot**: the
  globule's GCS list is replaced by one generated asymmetric GCS per silhouette level.
- The **silhouette defines the sampling**: its levels decide where the model is sliced.
- The **silhouette X acts as a scale factor normalized to its minimum**: at the level with the
  smallest silhouette X the slice is exactly model size; every other level's slice is enlarged
  by `x / min(x)`.
- Each slice outline is resampled to exactly N points **evenly spaced by arc length**, with a
  consistent start point and winding so bands run straight up the model rather than twisting.
- Generated GCSs are a **snapshot**: plain `ShapeConfig`s, fully editable in the GCS editor,
  saved with the config like any other GCS. **Re-snapshot** any time recomputes from the current
  model, silhouette and N.

## Non-goals

- A live link between model and GCSs (no auto-regeneration when model or silhouette changes).
- Deriving the silhouette from the model. The user's silhouette stays authoritative.
- Slices that produce several separate loops (legs, handles, holes) as multiple outlines — only
  one loop per level is used (see "Multiple loops").
- Any change to globule generation, blending, or the GCS validation rules. This feature only
  *writes* GCS configs.
- Non-horizontal slicing planes. Slices are perpendicular to the globule's Z axis.

## Anti-goals

- Bands that twist or spiral up the model because vertex 0 wanders between slices.
- Silently producing broken geometry: a level that can't be sliced is an error the user sees,
  not a degenerate GCS.
- Overwriting hand edits without warning — re-snapshot replaces the whole list, so it confirms
  first.

## Decisions (Ben's)

1. Silhouette defines slice locations (one slice per silhouette level).
2. Silhouette X is a scale factor normalized to the minimum silhouette X.
3. Generated GCSs are an editable snapshot; re-snapshot is available any time.
4. N points per slice are spread by equal arc length along the outline.
5. The snapshot keeps the model's proportions: slices are scaled by silhouette height ÷ model
   height, on top of the `x / xMin` factor.
6. `xMin` ignores silhouette levels below a small threshold, so tapering (pole) levels don't set
   the scale.
7. UI: a "From model" section in the GCS editor — model picker (defaults to the model already
   loaded as the projection/Voronoi surface, can import another file, reuses the existing
   fit / up-axis / simplify controls), a band-count N input (preset to the current primary GCS's
   vertex count), and a Snapshot button.

## How it fits the existing pipeline

Facts the design relies on (all on `main` at `f53c2e2`):

- A GCS is a `ShapeConfig` (`src/lib/types.ts`): `symmetry`, `symmetryNumber`, `sampleMethod`,
  `curves: BezierConfig[]`, plus multi-GCS fields `isPrimary`, `level`, `blend`.
- `generateRadialShapeLevelPrototype` (`src/lib/generate-shape.ts`) scales GCS points by a
  **fixed** ratio of 1/200 (not fit-to-size), then samples vertices per `sampleMethod`. The
  prototype center is always (0, 0).
- Each raw level (`generateRawLevels`, `src/lib/generate-level.ts`) sits at
  `z = silhouette.y` and is scaled by `silhouette.x * 2` in X and Y.
- So a GCS point `p` lands in world XY at `p / 200 * 2 * x = p * x / 100`.
- Imported models are stored un-normalized; `ImportedMeshConfig.normalize` (up axis, `offset`,
  `scale`, `targetSize`) defines the fitted space — bbox centered at the origin, +Z up, largest
  dimension = `targetSize` (`src/lib/mesh-import/normalize.ts`, `normalizeMatrix`).

### Scale

Two factors (Ben's decisions 2, 5 and 6):

- **Proportion factor** `k = (yMax − yMin) / (zMax − zMin)` — silhouette height per model unit
  (see "Slice heights"). It converts model XY into globule units so the globule keeps the model's
  proportions instead of taking literal model-space widths against silhouette-space heights.
- **Silhouette normalization** `x / xMin`, where `xMin` is the smallest silhouette X among the
  sampled levels with `x ≥ X_MIN_THRESHOLD * xMax`. *(My call)* `X_MIN_THRESHOLD = 0.05` — a named
  constant, easy to tune. Levels below the threshold (near a pole) are excluded from `xMin` so a
  tapering silhouette doesn't blow every other slice up by 10–100×; they still get their own
  slices and are scaled by their own (small) `x / xMin` like any level.

Writing each slice point `s` (fitted model XY) into the GCS as

```
p = s * k * 100 / xMin
```

gives world XY `s * k * x / xMin` at a level with silhouette X `x` (since a GCS point `p` lands at
`p * x / 100`): the model's shape at globule scale on the reference level, enlarged by `x / xMin`
elsewhere. Scaling is about the globule's Z axis, so a slice that is off-center in the model stays
off-center by the same proportion. No generator change is needed.

This holds with the depth curve and level offsets at their neutral defaults (depth-curve x =
baseline, scale 1, no rotation or translation). *(My call)* The snapshot does not invert depth or
level offsets; if either is non-neutral the From-model section shows a warning that the result
won't match the slices exactly (a per-level `rotZ` in particular reintroduces twist).

**Pole levels** *(my call)*: a level with `x = 0`, or a below-threshold level whose slice fails
(plane misses a pointed end), is not sliced — it gets a copy of the nearest successfully sliced
level's GCS (re-pinned to its own level). It collapses to a point or nearly so anyway, and this
keeps a pointed model from aborting the whole snapshot. If no level at or above the threshold can
be sliced, the snapshot aborts.

### Slice heights

Levels are sampled as `generateRawLevels` does (`L = divisions + 1` levels, level `i` at
silhouette parameter `t = i / divisions`, with `getPoint` vs `getPointAt` per sample method). The
builder must reuse that sampling rather than re-derive it, so slice `i` is the slice for level `i`.

*(My call)* With `preserveAspectRatio`, `generateRawLevelsConstantAspect` samples each band at its
own silhouette position, so levels aren't flat rings. Snapshot still slices at
`t = i / divisions` — the anchors `makePrototypeAt` uses for a GCS pinned to level `i` — and the
From-model section notes that in this mode the generated rings won't sit exactly on the slice
planes.

*(My call)* The silhouette's Y range `[yMin, yMax]` over the sampled levels maps linearly onto the
model's fitted Z range `[zMin, zMax]`: level `i`'s slice plane is at
`zMin + (y_i − yMin) / (yMax − yMin) * (zMax − zMin)`. The silhouette and model need not share
units, and the whole model height is always covered. The orientation follows the silhouette
(a silhouette that runs top→bottom slices the model top→bottom). The planes at the very ends are
inset by a small epsilon so the extreme slices hit the model rather than grazing a vertex or
cap.

*(My call)* The slice uses the model in **fitted space** (the `normalize` transform only), not
the surface's user transform — the user transform positions the model as a projection/Voronoi
surface and is unrelated to the globule. If the picked config has a simplified asset, slice that
asset.

### Slicing and resampling

Per level:

1. Intersect the plane with every triangle → segments. Chain segments into closed loops by
   shared endpoints (welded mesh, so endpoints match up to float tolerance).
2. **Multiple loops** *(my call)*: keep the loop with the largest enclosed area; report in the UI
   that other loops were dropped at that level. Open (unclosed) chains, from a non-watertight
   mesh, are an error for that level.
3. Orient the loop counter-clockwise (viewed from +Z).
4. **Start point** *(my call)*: where the loop crosses the ray from the globule axis (origin)
   toward +X. If it crosses more than once, take the outermost crossing. If the loop doesn't
   surround the axis, use the loop point with the smallest angular distance to +X measured
   from the loop's centroid. Tie-breaking is the builder's, but it must be deterministic and
   consistent across levels.
5. Resample N points at equal arc length starting at the start point.
6. Write a `ShapeConfig`:
   - `symmetry: 'asymmetric'`, `symmetryNumber: 1`
   - `curves`: N straight cubic beziers (control points at 1/3 and 2/3 along each segment);
     curve k runs point k−1 → point k (curve 0 runs point N−1 → point 0)
   - `sampleMethod: { method: 'divideCurve', divisions: 1 }` → exactly N prototype vertices,
     one per point: `getSpacedPoints(1).slice(1)` takes each curve's **end** point, so with this
     order prototype vertex k = resample point k (verified against `radialShapeCurveConfigs` for
     asymmetric / `symmetryNumber: 1`, which emits curves as written)
   - `level: i` (pinned), `blend: { mode: 'linear' }`, unique `id`
   - `isPrimary: true` on exactly one — *(my call)* level 0's GCS.

A round-trip unit test must pin the vertex-0 correspondence: generated prototype vertex k of every
snapshot GCS is resample point k, so the existing blend (vertex k ↔ vertex k) lines up.

### Count limit

One GCS per level means `divisions + 1` GCSs, which is exactly the multi-GCS limit
(`validate-shape-configs.ts`). A silhouette with many divisions makes a long GCS list; that's
accepted. If the user later lowers divisions, the existing validation flags the pinned levels
that are out of range — re-snapshot fixes it.

## UI

In the GCS editor (`src/components/modal/editor/GlobuleCrossSection.svelte`), a collapsible
**From model** section:

- **Model**: defaults to the projection's imported surface if it is an `ImportedMeshConfig`;
  otherwise prompts to import. "Import another…" reuses `importModelFile` and the
  `ImportedMeshControls` fit / up-axis / simplify controls. *(My call)* The chosen model for the
  globule is held as UI state plus the last-used `assetId` + `normalize` stored on the globule
  config (optional field, e.g. `GlobuleConfig.modelSource?: { assetId, fileName, normalize,
  simplify? }`), so re-snapshot after reload uses the same model. It is provenance only;
  generation never reads it.
- **Bands (N)**: integer input, preset to the primary GCS's current prototype vertex count.
- **Snapshot** button. If the globule already has GCSs, confirm: "Replace all N cross sections
  with slices of <file>?"
- Per-level warnings after a snapshot (dropped loops, levels that failed) shown inline in the
  section; a failure on any level aborts the snapshot and leaves the existing GCSs untouched.

Panel state that must survive the floater closing lives in a module store, not component
`$state` (floater panels unmount on close).

## Where it runs

Slicing is a one-shot user action. *(My call)* Run it on the main thread inside the click handler
with the busy indicator (`imported-mesh-busy`), loading the asset via `asset-store.ts`. If a
typical simplified model × ~30 levels takes noticeably long (>~200 ms), move it into a worker —
builder decides after measuring.

## Errors

- No model chosen / asset missing from IndexedDB → button disabled with a reason.
- A level whose plane misses the model, or yields only open chains → snapshot aborted, message
  names the level(s).
- `xMin` undefined (all levels have x = 0) → snapshot aborted.
- N < 3 → input invalid.

## Testing

- Unit: plane–mesh slicing and loop chaining (cube, cylinder, a mesh producing two loops, an
  open mesh), CCW orientation, start-point selection, equal-arc-length resampling, ShapeConfig
  writer (round-trip: `generateLevelPrototype` on the written config returns the resample points
  × 1/200 in order).
- Unit: scale normalization — a cylinder of radius r and height h sliced under a silhouette of
  height H with `xMin = a` yields world radius `r * H / h` at the `a` level and `r * H / h * x / a`
  elsewhere (through the real level generator); a near-pole level below the threshold does not
  become `xMin`; an `x = 0` level copies its neighbour's GCS.
- Unit: no-twist — a straight extrusion of a non-circular outline yields GCSs whose vertex k is
  at the same angle at every level.
- E2E (Playwright, reuse `tests/fixtures/deformed-icosphere.glb`): import, switch to globule,
  snapshot, assert the GCS list length = level count and the globule generated.

## Notes

- The imported-surface config type exported from `projection-geometry/types.ts` is
  `ImportedSurfaceConfig` (`ImportedMeshConfig & { transform }`); `ImportedMeshConfig` itself is
  module-private since the knip prune — re-export it if the new code needs it.

## Left to the builder

- File layout (suggest `src/lib/gcs/slice-model.ts` + `src/lib/gcs/snapshot-gcs.ts`).
- Float tolerances for welding segment endpoints and the end-plane epsilon.
- Exact start-point tie-breaking, as long as it is deterministic and consistent across levels.
- Whether `modelSource` is a new optional `GlobuleConfig` field or lives elsewhere, as long as it
  persists with the saved config and old configs load unchanged.
