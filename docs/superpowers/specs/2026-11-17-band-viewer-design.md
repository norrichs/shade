# Individual Band Viewer — Design

Date: 2026-11-17
Status: draft for Ben's approval

## Intent

In the full 3D model it is often hard to see how a band relates to its
flattened cut-pattern shape. The band viewer shows the selected band on its
own and lets Ben unfold it gradually, from its real 3D shape to fully flat,
so he can be certain how the flat piece is oriented in space.

## Goals

1. A new **Band** pane in the Assembler, between the model and pattern panes.
2. It shows the currently selected band in isolation, in 3D.
3. A **Flatten** slider (0–100%) below the band: 0% = real 3D geometry,
   100% = fully flattened, with a continuous unfold in between, computed live
   while the slider is dragged.
4. One **anchor** facet stays fixed in space at every slider value, so the
   unfold reads as "the band opening out around a fixed piece".
5. Front and back of the band are clearly different (light gray front, dark
   gray back, both opaque), with every facet edge drawn as a blue line, so
   which side faces where is never ambiguous.
6. **Draggable dividers** between all Assembler panes: the two vertical
   dividers in the top row, and the horizontal divider between the top row
   and the bottom data pane. Positions persist.

## Non-goals

- No pattern overlay (tiles, outlines, tabs) on the band in this pane. It
  shows raw facet geometry only.
- No editing or selection from inside the band pane. It only displays.
- No changes to the pattern pipeline's flattening in this task (see
  "Side benefit" below; that is a separate task).
- No multi-band or ring display: one band only, even when the highlight
  includes a ring.

## Anti-goals

- The unfold must not jump, flip or snap at any slider value, especially
  between 99% and 100%. A visible discontinuity defeats the purpose.
- The fully flat result must be the same shape as the band in the cut
  pattern (up to rotation and mirroring). If it doesn't match, the view
  misleads instead of building confidence.
- Dragging the slider must not freeze or stutter the page, and must not set
  off a regeneration, a Svelte store cascade, or a re-render of the other
  panes.

## Current state (what exists)

- **Assembler page**: `src/routes/assembler/+page.svelte`. It's a 2-column
  grid (model | pattern) over a fixed 300px data row (`PatternData`). There
  are no dividers yet.
- **Band selection**: `assemblerHighlight` (`src/lib/stores/selectionStores.ts`,
  type in `src/lib/assembler-highlight.ts`) is the Assembler's single-band
  cross-view selection. A band click in 3D (`selection-helpers.ts →
  highlightRealBand`), in the pattern pane, or in the data grid sets it. It
  holds `{ source: GeometrySource, band: GlobuleAddress_Band, ring }` in
  **pattern band space**. Map it to the real 3D band with
  `patternBandToReal(get(patternBandSpaces)(source, globule), band)`
  (`src/lib/cut-pattern/pattern-band-space.ts`), then look it up in the source's
  `Tube[]` (the same mapping as the private `tubesForGeometrySource` in
  `selectionStores.ts`, which should be exported or duplicated). `null`
  means nothing is selected.
- **Shared renderer**: `ThreeRenderer.svelte` wraps a Threlte `<Canvas>` and
  always mounts `PointPick` (interaction overlay) and `AgentCapture`.
  `AgentCapture` calls `registerModelCapture`, which is a single global slot
  (last mount wins). A second canvas with it mounted would take over the
  shades-control bridge's model screenshots.
- **Scene**: `Scene.svelte` carries measurement indicators, the projection
  geometry, highlight and interactivity. None of that belongs in the band pane.
- **Plane fit**: `fitPlane(points)` in `src/lib/voronoi/fit-plane.ts`
  (PCA best-fit plane, with a fallback for degenerate input).
- **Dihedral**: `getDihedral` in `src/lib/cut-pattern/generate-panel-pattern.ts`
  uses `acos`, so the angle is unsigned in [0, π]. That's the source of the
  "almost 180° just before 0°" problem: an unsigned angle can't tell which
  way a hinge folds.
- **Pattern flattening**: `getFlatStripV2` (`src/lib/cut-pattern/generate-cut-pattern.ts`)
  chains `getFlatTriangle` per facet, using orientation lookup tables
  (`getBandBasePoints`) for each facet's base edge, unsigned `angleTo` with a
  fixed rotation sign, and a post-hoc x-mirror for `sideOrientation === 'inside'`
  bands. Degenerate (pole) facets are handled specially.
- **Divider precedent**: designer2 (`src/routes/designer2/+page.svelte`) has a
  draggable, persisted vertical divider (`designerPanels` persistable plus
  `clampSplit` in `src/lib/stores/uiStores.ts`, dragged with `asDraggable` and
  `transparentDragImage()`).

## Approaches considered

**Flattening/unfold math**

1. **Hinge reconstruction from intrinsic coordinates (chosen).** Precompute,
   once per band, each facet's new vertex in coordinates local to its
   shared (hinge) edge: distance along the hinge, perpendicular distance in
   the facet's plane, and the **signed** fold angle between the facet and
   its neighbor toward the anchor. For each slider value `t`, walk outward
   from the anchor and rebuild each facet's free vertex from its
   already-placed hinge edge, rotated by `(1 − t) · fold`. The work is O(facets)
   with a few vector operations each. It doesn't accumulate drift, because
   each vertex is rebuilt from exact lengths, not composed matrices. At
   `t = 1` every fold is exactly 0, so the band lies in the anchor's plane:
   the flattened band directly.
2. **Cumulative rigid transforms.** Rotate each facet's original triangle by
   the product of hinge rotations back to the anchor. It's equivalent in
   principle, but matrix products accumulate floating-point error along long
   bands, and handling a degenerate (zero-length) hinge is awkward.
3. **Interpolating vertex positions** between the 3D band and the
   `getFlatStripV2` output. It's trivial, but it isn't an unfold: facets
   stretch and shear mid-way, which misleads. Rejected.

**Why signed fold angles remove the discontinuity:** the fold at each hinge
is measured as the signed angle (`atan2`) between the two facet normals
about the hinge axis. It is 0 for coplanar facets and lies in (−π, π). Flat
is exactly 0, and scaling it by `(1 − t)` is continuous all the way to 0.
The 180°↔0° wrap only exists in the unsigned `acos` formulation, which this
design never uses. Folds near ±π (a facet folded back onto its neighbor) are
the only ambiguous case. Keep the sign given by `atan2`.

**Renderer/scene**

- Reuse `ThreeRenderer` with new optional props to leave out `AgentCapture`
  and `PointPick` (default: current behavior). Add a new
  `BandViewerScene.svelte` instead of extending `Scene.svelte` (chosen).
  This meets "use the shared renderer" without the capture-slot conflict or
  any of Scene's model-specific content.
- Extending `Scene.svelte` with a mode flag is rejected: it would mix
  unrelated concerns into an already busy component.

## Design

### Layout

- Assembler top row: `model | band | pattern`, default widths 2/5, 1/5, 2/5.
  The bottom data pane spans all three columns. The default top/bottom split
  keeps today's look (bottom about 300px tall, or the equivalent fraction).
- Three draggable dividers: model|band, band|pattern, and top|bottom.
  Positions persist in a new `assemblerPanels` persistable in `uiStores.ts`
  (fractions, clamped so no pane collapses below a usable minimum). Follow the
  designer2 divider pattern (`asDraggable`, `transparentDragImage()`; see the
  memory on native drag images). Builder's call: extract a shared divider
  component if that's cleaner than duplicating it.
- Canvases must resize correctly while dividers are dragged (Threlte reads
  container size; the panes keep `overflow: hidden`).

### Band pane

- Header: the selected band's cut-pattern label/number, the same text the
  pattern pane and data grid already show for that band (reuse the existing
  source; don't invent a new format).
- Body: `ThreeRenderer` (capture and point-pick off) containing
  `BandViewerScene`.
- Footer: the Flatten slider (0–100, step fine enough to feel continuous,
  e.g. 0.1), with its % value shown.
- When nothing is selected (`assemblerHighlight` is null, or it maps to no
  real band), the pane shows an empty canvas area with a short hint ("Select
  a band"). Nothing renders.
- When the selection changes, keep the slider value (Ben's call to change
  later; keeping it lets him compare bands at the same unfold) and reframe
  the camera to the new band.

### BandViewerScene

- Its own camera, lighting and OrbitControls (it does not use `DesignerCamera`
  or `Scene`'s interactivity).
- **Anchor**: `fitPlane` over all of the band's vertices. Anchor = the
  non-degenerate facet whose normal has the largest |dot| with the plane
  normal. Its vertices never move.
- **Framing**: on band change, center the camera on the band and look along
  the anchor's normal from the front side, so 100% is seen face-on.
  Orient "up" to the band's long axis in the anchor plane (matching how the
  pattern lays bands out along Y). Don't reframe while the slider moves.
- **Meshes** (static Three.js objects created outside `$state`; see the
  `GlobuleMesh $state proxy loop` memory):
  - one `BufferGeometry` (non-indexed, one triangle per facet) shared by two
    meshes: `FrontSide` light gray (opaque) and `BackSide` dark gray (opaque);
  - one `LineSegments` geometry with all three edges of every facet, blue.
  - Slider changes overwrite the `Float32Array` position attributes in place,
    set `needsUpdate`, recompute normals and bounding sphere. No new
    geometries per frame.
- "Front" means the facet winding as generated (the side three.js treats as
  front for the model's materials), so the pane's colors agree with the 3D
  model's notion of outside and inside.

### Unfold module (pure TS, unit-tested)

`src/lib/band-viewer/unfold-band.ts` (builder may rename):

- `prepareUnfold(band: Band): UnfoldPlan` — run once per band. It finds the
  hinge between consecutive facets by shared vertices (tolerance-based; do
  not rely on orientation tables). It chooses the anchor, and stores for each
  facet its parent (the neighbor toward the anchor), hinge vertex indices,
  intrinsic (along, perpendicular) coordinates of the free vertex, and signed
  fold angle.
- `applyUnfold(plan, t, out: Float32Array)` writes the positions of all facet
  vertices at flatten fraction `t ∈ [0, 1]` into `out`. It doesn't allocate in
  the hot path.
- Degenerate facets (zero-length hinge or zero area, e.g. globule poles,
  `facet.isDegenerate`) inherit their parent's placement with fold 0, so they
  never NaN-poison the chain (see `Globule pattern flattening` memory).
- Bands whose facets aren't a simple consecutive strip (a hinge not found
  between i and i+1): fall back to treating the facet as rigidly attached to
  its parent, and log a warning. The builder should check that real
  projection, voronoi and globule-tube bands are all strips.

Tests:
- `t = 0` reproduces the original 3D vertices (within epsilon).
- `t = 1` gives coplanar vertices with every edge length preserved, and the
  shape is congruent (rotation/reflection allowed) to the same band's
  `getFlatStripV2` output.
- The anchor's vertices are identical at every `t`.
- Continuity: positions at `t = 0.999` vs `t = 1` differ by O(0.001 × band size),
  with no jumps, including for a band with folds near ±π/2 and a pole
  facet.
- Edge lengths are preserved at intermediate `t` (it's an isometric unfold,
  not a morph).

### Performance

Typical bands are tens to a few hundred facets, so a recompute per slider
input event is well under a millisecond. Keep it on the main thread; no
worker. The slider updates a local value that drives `applyUnfold`
imperatively. No store writes per drag tick.

## Side benefit to raise separately

The intrinsic-coordinate strip (hinge-local coordinates of each new vertex)
is a cleaner basis for the pattern pipeline's `getFlatStripV2`: it would
drop the orientation lookup tables and the unsigned-angle/fixed-sign
assumption, and possibly the post-hoc `inside` mirror. The efficiency gain is
likely small: pattern math was measured at about 0.4s total, and flattening
is a fraction of that. The win is robustness and less code. **Proposed as a
separate refactor task, not part of this one.**

## Left to the builder

- Exact component and file names, the slider's control, and the minimum pane
  sizes.
- Whether the divider becomes a shared component.
- The default top/bottom split value.
- Camera FOV, lighting, and the exact gray/blue values (light gray front, dark
  gray back, blue lines).

## Calls made without Ben (check while reading)

- Selection source = `assemblerHighlight`; only its `band` is shown, not the ring.
- Slider value is kept across band changes; camera reframes on band change only.
- All hinges unfold proportionally together (not hinge by hinge from the anchor).
- Camera faces the anchor's front side, with "up" along the band's long axis.
- Pattern-pipeline flattening refactor is deferred to a separate task.
