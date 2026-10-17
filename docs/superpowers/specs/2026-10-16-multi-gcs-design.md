# Multiple Globule Cross Sections — Design

Date: 2026-10-16 · Branch: `worktree-multi-gcs`

## Intent

Today a globule has exactly one Globule Cross Section (GCS, `GlobuleConfig.shapeConfig`).
Every silhouette level is a scaled / offset / depthed copy of that one shape. That limits
globules to forms whose cross-section never changes character along the height.

This feature lets a globule carry **several GCSs placed at silhouette levels**, with the
levels in between **blended** from their neighbours. Examples Ben wants to make:

- A 5-lobed flower at the bottom morphing into a circle at the top.
- A 5-lobed flower with 6 bands per lobe (30 bands) morphing into a 6-lobed flower with 5
  bands per lobe (also 30 bands).
- Three GCSs → two transition regions (A→B, then B→C).

Because bands are the manufacturing unit (flattening, patterns, panels), band topology must
not change: every level still has the same N vertices, so every band still has the same
facet structure. Only vertex positions change.

## Goals

- A globule holds an ordered list of GCSs (1..levelCount of them).
- Exactly one GCS is **primary**. Its vertex count defines N = band count.
- Every other GCS must produce exactly N vertices; otherwise the config is invalid.
- Each GCS is placed at a silhouette level — automatically (evenly spread) or pinned to a
  level number by the user.
- Levels between placed GCSs are linearly blended, vertex-by-vertex.
- GCS positions are marked on the silhouette editor.
- Invalid configs never produce broken/empty geometry; the last good geometry stays.
- Existing saved configs (single `shapeConfig`) load and render identically.

## Non-goals (this phase)

- Non-linear blending (bezier / eased transitions). **Planned for later** — the design must
  leave a clean seam for it (see "Blend seam").
- Automatic resampling of a GCS to match N. A mismatch is an error, not something fixed
  silently.
- Vertex-correspondence controls (phase / rotation offset to pick which vertex is "vertex 0").
  Vertex k of each GCS is the k-th prototype vertex as generated today.
- Multi-GCS for projection cross-sections (that's a different config). Projections that use a
  globule as their *surface* inherit the feature for free, since they call the same generator.

## Anti-goals

- Changing band count, facet count per band, or band ordering between levels.
- Any change to single-GCS output. A globule with one GCS must generate byte-identical
  geometry to today.
- Blocking the UI thread with heavy work for validation.

## Decisions (Ben's)

1. **Primary is configurable**: a boolean on each GCS, unique across the list, edited with a
   checkbox in the GCS editor. Checking one unchecks the others. Primary defines N; it does
   **not** imply position.
2. **Count limit**: up to as many GCSs as the silhouette has levels.
3. **Default placement**: evenly divided across the silhouette's levels.
4. **Manual placement**: a numeric input in the GCS editor sets the GCS's level.
5. **Silhouette editor** marks each GCS's location.
6. **Blending**: two GCSs → the first level uses the first as defined, the last level uses the
   second as defined, middle levels interpolate. Linear for now; bezier-specified blending is a
   likely future addition.
7. **Error behavior**: an invalid GCS list blocks only the pipelines that actually use that
   globule; their last good geometry stays on screen. Everything else keeps regenerating.
   The offending GCS is marked in the GCS editor with a one-line reason; a toast fires only
   when the error message changes, not on every edit. If invalid on first load (no last good
   geometry), that globule's output is empty and the error is shown.
8. **Ordering follows the silhouette curve, not physical height.** GCS A is at level 0 —
   the *start* of the silhouette curve — and the list follows the curve's direction. On the
   default silhouette (`shades-config.ts:46`, starts at y=65) level 0 is physically the top
   (end caps label `levels[0]` as `'top'`). No z-direction detection; redrawing the
   silhouette in the other direction does not remap pins.

## Model

### Config shape

`GlobuleConfig.shapeConfig: ShapeConfig` is replaced by
`GlobuleConfig.shapeConfigs: ShapeConfig[]`. `ShapeConfig` gains:

```ts
isPrimary?: boolean;   // exactly one true across the list
level?: number;        // integer silhouette level; undefined = auto-placed
blend?: { mode: 'linear' }; // transition from this GCS to the next one up. Future: bezier.
```

List order is silhouette-curve order: level 0 → level `divisions` (Ben's decision 8).
*(My call: list order is the stacking order; pinned levels must agree with it, rather than the
list being re-sorted by level.)*

`id` on each `ShapeConfig` must be unique within the list (used for UI selection and markers).

### Levels and t

- Uniform silhouette sampling makes `L = divisions + 1` levels, level `i` at silhouette
  parameter `t = i / divisions` (`generateRawLevels`, `generate-level.ts:580`). Max level
  index is `divisions`. (Note `countLevels` disagrees for `divideCurve`; the builder should
  use what `generateRawLevels` actually does.)
- Placement is stored as a level index but the blend is evaluated as a function of `t`:
  GCS at level `i` anchors at `t = i / divisions`. This is what makes
  `preserveAspectRatio` mode work, where each band samples its own `t` values
  (`meridianPointAt`, `generate-level.ts:248`) and there is no single per-level `t`.

### Effective placement

Given the list and `divisions`:

- One GCS → it applies to every level (today's behavior). Its `level` is ignored.
- Pinned GCSs keep their level.
- Unpinned GCSs are spread evenly (rounded to integer levels) between their nearest pinned
  neighbours in list order; the list ends act as implicit anchors at level 0 and level
  `divisions` when the first/last GCS is unpinned.
- With all unpinned: first at 0, last at `divisions`, the rest evenly between.
- Levels below the lowest GCS copy it; levels above the highest copy it.
- Effective levels must be strictly increasing in list order (else invalid).

An unpinned GCS stores no level, so changing silhouette divisions re-spreads it rather than
leaving a stale number.

### Blend

For a sample at `t`, find the bracketing anchors `a` (below) and `b` (above). Let
`u = (t − tₐ) / (t_b − tₐ)`, passed through `a.blend` (linear: identity). Then each prototype
vertex `k` and the prototype center are `lerp(protoA[k], protoB[k], u)`, on the normalized
2D prototypes (after `normalizeConfigPoints`, before silhouette scale / offset / depth).

Vertex k matches vertex k "around the loop from the same start". When symmetries differ
(5×6 vs 6×5), lobe boundaries don't line up — that is intended; it is what morphs 5 lobes
into 6.

### Blend seam

All blending goes through one pure function, roughly
`prototypeAt(anchors, t): LevelPrototype`, with the per-transition easing isolated as
`ease(blend, u): number`. Bezier blending later = new `blend.mode` + a new `ease` branch +
editor UI. No pipeline changes.

## Validation

A pure `validateShapeConfigs(globuleConfig)` returns per-GCS errors. Invalid when:

- not exactly one GCS has `isPrimary`
- a non-primary GCS's prototype vertex count ≠ N (message names both counts)
- a pinned level is outside `0..divisions` or not an integer
- two GCSs land on the same effective level, or effective levels aren't increasing in list
  order
- more GCSs than levels
- (existing) a prototype with zero vertices

Generating a prototype is cheap (a few curves sampled), so validation can run on the main
thread.

### Where it runs

- **Scope**: a globule's GCS list only matters to pipelines that consume that globule — the
  globule / globuleTube pipelines for that sub-globule (when enabled in View), and Voronoi /
  projections when their surface is a globule (`generate-superglobule.ts:83-95`). Sphere /
  capsule surfaces, or disabled globule pipelines, are never blocked by an invalid GCS.
- **Main thread, before generation** (`triggerAsyncGeneration`, `superGlobuleStores.ts:~260`):
  compute which pipelines are blocked by invalid globules and tell the worker to skip them
  (e.g. a skip list on the request). The result merge keeps the previous result's output for
  skipped pipelines (from `lastValidResult`) rather than an empty fallback. Note today a
  pipeline throw yields *empty* geometry (`runPipeline`, `generate-superglobule.ts:44`), so
  skipping + keeping is what delivers "keep last good geometry".
- **First load while invalid**: no previous output exists, so the blocked pipelines' output
  is empty; the error is shown.
- **Toasts**: the `workerError` → toast subscriber (`superGlobuleStores.ts:344`) fires on every
  non-null set, and the trigger clears and re-sets it each generation. GCS validation errors
  must toast only when the message changes (de-duplicate against the last shown GCS error);
  clearing on becoming valid resets that.
- **Worker** also validates (defense in depth) and throws a clear error for a pipeline that
  receives an invalid config.
- **GCS editor**: a derived value of the same function marks the offending GCS red with its
  reason, always (independent of toasts).

## Pipeline changes

- `generateGlobuleTube` and the deprecated `generateGlobuleData` (`generate-shape.ts:818,
  857`) build one prototype per GCS and pass a blend function / per-level prototypes instead
  of the single prototype.
- Uniform mode: `generateRawLevels` gets the prototype for level `i` from `prototypeAt(t)`.
- `preserveAspectRatio` mode: `meridianPointAt` uses `prototypeAt(division)` for that
  vertex's `division`, instead of `levelPrototypes[vertexNumber % len]`.
- `getLevelPrototypeArray` / `levelPrototypes[i % len]` indexing should be replaced, not
  layered on — the modulo-cycling behavior is not wanted.
- End caps are built from `levels[0]` and `levels[last]` vertices, which now carry the first
  and last GCS shapes — no change needed.

## Migration

A normalizer converts legacy `shapeConfig` → `shapeConfigs: [{ ...shapeConfig, isPrimary:
true }]` and removes `shapeConfig`. It runs at the same sites as `normalizeVoronoiConfig`
(store bootstrap `superGlobuleStores.ts:202-216`, `saved-config.ts:100,108`). The DB stores
config as one JSON column — no schema change. Default config in `shades-config.ts:641`
becomes a one-element list.

Other readers to update: `GlobuleCrossSection.svelte`, dead `getLevelLines`
(`generate-level.ts:774`, can be deleted), `.claude/skills/shades-control/reference/super-config.md`
(documents the `shapeConfig` path), tests referencing `shapeConfig`.

## UI

### GCS editor (`src/components/modal/editor/GlobuleCrossSection.svelte`)

- A strip of GCS tabs/chips above the path editor, labelled A, B, C… in curve order (A = level 0), with the
  primary marked. Add (duplicates the selected GCS, so the new one starts valid), delete
  (disabled with one GCS; deleting the primary makes the first remaining one primary),
  move up/down.
- For the selected GCS, the existing path editor and controls, plus:
  - **Primary** checkbox.
  - **Level** number input: blank = auto, with the effective auto level shown as
    placeholder; a clear button returns to auto.
  - Read-out of its vertex count vs N.
  - Red state + one-line reason when invalid.
- Selected GCS index lives in a module store (panels unmount on close).

### Silhouette editor (`src/components/modal/editor/Silhouette.svelte`)

- A marker on the silhouette at each GCS's effective level, labelled with its letter, the
  primary visually distinct, invalid ones red.
- Marker positions must use the same level→t mapping as generation (the existing
  `sampledPoints` dots use `getSpacedPoints` and don't match `divideCurve` /
  `preserveAspectRatio` — use the real `t` for the markers).

## Left to the builder

- Exact UI layout/styling of the GCS strip and markers.
- Rounding rule for auto-spread levels, as long as results are strictly increasing and
  deterministic.
- Whether the worker receives anchors or precomputed prototypes.
- Test structure. Expected: unit tests for placement, validation, blend (including
  single-GCS byte-identical output and the 5×6 ↔ 6×5 case), migration, and pipeline-skip
  scoping.
