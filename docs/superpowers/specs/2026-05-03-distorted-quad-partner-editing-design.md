# Distorted-Quad Partner Editing — Design

**Date:** 2026-05-03 (revised after brainstorm)
**Branch:** `feature-pattern-edit-phase-5` (Phase 7 work continues here; renaming on PR is fine)
**Status:** Spec — ready for implementation plan

## Summary

The Tile Editor's partner-adjustment modes (Partner Start, Partner End) currently show the ghost as a rigid 180° rotation of the same unit pattern. This is sufficient for regular tessellations but doesn't expose the real purpose of partner rules: closing vertex-position gaps that arise when two partner band-ends have differently shaped quads due to 3D curvature. Phase 7 adds a real-model distorted-quad context to the partner-rule editing viewport so the user is authoring against geometry that actually resembles what the adjuster sees at runtime.

## Goals

- Show actual distorted quad geometry from the active model in partner-rule modes — not a synthetic mirror.
- Let the user pick a specific partner pair from the active model and see those quads' real flattened geometry in the editor.
- Highlight the selected pair in the 3D viewport for spatial orientation.
- Preserve all existing unit-mode and within/across-band rule-editing behavior unchanged.

## Non-goals (v1)

- Synthetic distortion presets. The current symmetric-mirror behavior is the no-model / no-selection fallback. No preset selector, no slider.
- Applying distorted-quad rendering to within-band or across-band modes.
- Authoring rules by clicking on 3D model facets directly (the editor stays 2D-SVG).
- Auto-generating rules from the chosen pair (still manual click-to-connect).
- Supporting partner-rule editing for non-shield algorithms in v1 — partner adjustments are shield-specific at runtime; the chooser only renders for shield variants. Mode tabs stay visible for hex/box but show synthetic mirror only.
- Editing rules by clicking on the distorted-ghost rendering does not change the rule data model — rules remain pair-arrays of flat indices over the spec's `unit`. The chooser changes WHAT'S DISPLAYED, not what gets stored.

## The core problem

Unit patterns don't need adjustment rules — two identical unit-shaped quads placed edge-to-edge already line up perfectly. Partner rules exist to handle mismatched real quads: the start-facet of band A and the end-facet of band B are neighbors in 3D, but their 2D flattened positions diverge because each quad was unrolled independently from a curved surface. The adjuster (`adjustShieldTesselation` in `adjuster.ts`) snaps selected target vertices to matching source vertices from the transformed partner, closing those gaps. Without distorted context in the editor, the user has no visual evidence of gap magnitudes or whether a rule helps.

## Approach

Pull actual `BandCutPattern` pairs from the current SuperGlobule and render them in the partner-mode viewport. The data is already computed and available: `band.meta.startPartnerBand` / `endPartnerBand` identify the partner band address, and `band.meta.startPartnerTransform` / `endPartnerTransform` carry the rigid translate+rotate that aligns the partner's coordinate frame to the main band's shared edge. This is the same transform `getTransformedPartnerCutPattern` already applies at adjustment time, so editor alignment matches runtime exactly.

When no model is loaded or no pair is selected, the viewport falls back to the existing symmetric-mirror ghost. The user must explicitly pick a pair to see real geometry. This keeps the "open the editor without a project" workflow intact.

## Architecture

```
PartnerPairChooser.svelte                 (new sidebar component)
  ├─ reads:  superGlobulePatternStore     (current bands + meta)
  ├─ owns:   snapshot state               { pair, snapshotJSON }
  ├─ writes: partnerHighlightStore        { start, end addresses }
  └─ emits:  distortedGhost prop          → RuleEditViewport

partner-pair-resolver.ts                  (new pure module)
  └─ resolvePair(band, mode, allBands)
       → { mainQuad, mainPath, ghostQuad, ghostPath, mainAddress, ghostAddress }
       (looks up partner band, applies stored transform via newTransformPS)

RuleEditViewport.svelte                   (modified)
  ├─ if distortedGhost: render mainPath in mainQuad, ghostPath in ghostQuad,
  │                     connection lines in distorted-frame coords
  └─ else:               unchanged symmetric-mirror behavior

partnerHighlightStore.ts                  (new writable, parallel to selectedProjection)
  └─ { start: GlobuleAddress_Facet | null, end: GlobuleAddress_Facet | null }

Highlight.svelte                          (modified)
  └─ now also reads partnerHighlightStore;
     materials.numbered[1] for the chooser-selected start
     materials.numbered[4] for the chooser-selected end
     (existing selectedProjection path untouched)
```

## Chooser UI

A new sidebar section visible only in `partnerStart` / `partnerEnd` modes, placed in the existing `.rule-row` flex layout (above the rule list, or beside it — final placement decided at implementation time):

```
┌─ Pair ───────────────────────────┐
│ [▼ Tube 0 / Band 0  ──┐ ]  🎲   │  ← dropdown + random button
│ ⚠ Model changed  [Refresh]      │  ← only when stale
│ Showing one pair — rules apply  │  ← caption, small/muted
│ to all                          │
└──────────────────────────────────┘
```

- **Dropdown** lists all bands with non-null `meta.startPartnerBand` (Partner Start mode) or non-null `meta.endPartnerBand` (Partner End mode), labeled by address `Tube N / Band M`. The empty top option clears the selection.
- **Random button (🎲)** picks any eligible pair uniformly. May repeat.
- **Generalization caption** is a small static text reminding the user that the rules apply globally, not just to the displayed pair.
- **Model-change detection:** subscribe to `superGlobulePatternStore`; on each tick, deep-compare the current pair's quad+path data to the snapshot; if different, show the refresh banner. Refresh re-pulls + re-snapshots.

## Snapshot semantics

When the user picks a pair (or hits random), the chooser captures `{ mainQuad, mainPath, ghostQuad, ghostPath, mainAddress, ghostAddress }` into local state and **freezes it**. Subsequent changes to `superGlobulePatternStore` do NOT update the displayed geometry. Editing stays stable.

When the underlying band changes, the chooser detects this (deep-compare on each store tick) and surfaces a "Model changed — Refresh?" banner. Refresh re-runs `partner-pair-resolver` against the current store and re-snapshots.

If the selected band's address no longer resolves at all (band deleted), show a "Pair no longer exists in model" banner with a [Clear] button; the viewport reverts to the symmetric-mirror fallback until the user picks a new pair.

## Distorted-ghost rendering

`RuleEditViewport.svelte` gains an optional prop:

```ts
distortedGhost?: {
    mainQuad: Quadrilateral;
    mainPath: PathSegment[];
    ghostQuad: Quadrilateral;
    ghostPath: PathSegment[];
    mainAddress: GlobuleAddress_Facet;
    ghostAddress: GlobuleAddress_Facet;
};
```

When present:

- The main unit's segments are replaced by `mainPath` (already in the quad's flattened coordinate frame from the cut-pattern pipeline).
- The ghost is rendered with `ghostPath` — the partner transform is baked in by `partner-pair-resolver`, so no separate `<g transform>` wrapper is needed for the ghost.
- The viewBox extends to fit both quads' bounding boxes, replacing the current static "extend by unit.height/width" partner-mode logic. (Compute bbox from `mainQuad ∪ ghostQuad` corners.)
- Vertex circles + labels still come from the spec's flat-index space — the unit-pattern vertex topology is preserved across pairs because all pairs are rendered through the same spec, so flat indices remain valid.
- Connection lines for existing rules render between vertex positions in the distorted geometry, not the unit's nominal positions.

When absent, the existing symmetric-mirror behavior is unchanged.

## 3D highlighting

A new writable store `partnerHighlightStore` exposes:

```ts
{ start: GlobuleAddress_Facet | null, end: GlobuleAddress_Facet | null }
```

The chooser writes both addresses on pair-select, sets both to null on clear/mode-switch/floater-close.

`Highlight.svelte` is modified to read this store in addition to its existing `selectedProjectionGeometry` source. The two stores' highlights coexist — the user's regular 3D selection isn't overwritten when a chooser-pair is active. Distinct materials per partner: `materials.numbered[1]` for the start partner, `materials.numbered[4]` for the end partner (matching the existing isStartPartner/isEndPartner color convention).

## State transitions & edge cases

| State                                    | Chooser                 | Viewport                          |
| ---------------------------------------- | ----------------------- | --------------------------------- |
| Mode entry, model loaded, eligible pairs | Empty top option active | Symmetric mirror                  |
| Mode entry, no model loaded              | Disabled, "No model"    | Symmetric mirror                  |
| Mode entry, model loaded, no eligible    | Disabled, "No partners" | Symmetric mirror                  |
| User picks pair                          | Selected entry          | Distorted ghost                   |
| Model changes, snapshot stale            | Refresh banner active   | Distorted ghost (frozen snapshot) |
| Selected band disappears                 | "Pair no longer exists" | Symmetric mirror                  |
| User picks empty top option              | Empty top option        | Symmetric mirror                  |
| Mode switch away                         | (unmounted)             | (mode-specific behavior)          |
| Mode switch back                         | Empty top option active | Symmetric mirror                  |

The chooser's selection is local to its lifetime — it does not persist across mode switches or floater close/reopen.

## Algorithm scoping

The partner-pair chooser only renders when the active variant's algorithm is `'shield-tesselation'`. Hex and box variants register no `adjustAfterTiling` for partner pairs, so the chooser would have nothing meaningful to display. Mode tabs (`Partner Start`, `Partner End`) stay visible for those algorithms — they currently show synthetic mirrors and that behavior continues — but the chooser sidebar simply does not render.

## Data flow (with resolved decisions)

```
1. User in Tile Editor, switches to Partner Start mode
   ├─ algorithm is 'shield-tesselation'
   ├─ chooser mounts, lists eligible bands from superGlobulePatternStore
   └─ no pair yet selected → distortedGhost = undefined
       → RuleEditViewport renders symmetric mirror

2. User picks "Tube 0 / Band 3" from dropdown
   ├─ chooser calls partner-pair-resolver:
   │    band = bands[0][3]
   │    ghost band = lookup band.meta.startPartnerBand
   │    apply newTransformPS(ghostBand.facet[0].path, band.meta.startPartnerTransform)
   ├─ snapshot state updated → distortedGhost prop emitted
   ├─ partnerHighlightStore.set({ start: bandAddr, end: ghostBandAddr })
   └─ RuleEditViewport renders distorted geometry; Highlight.svelte highlights both
      facets in the 3D viewport

3. User edits a model parameter (e.g., rowCount changes)
   ├─ superGlobulePatternStore updates with new geometry
   ├─ chooser deep-compares current pair to snapshot, finds difference
   └─ shows "Model changed — Refresh?" banner
       (viewport still shows the snapshot; user is in control)

4. User clicks Refresh
   ├─ chooser re-runs partner-pair-resolver against current store
   ├─ new snapshot captured → distortedGhost prop re-emitted
   └─ banner clears

5. User switches to Skip Remove mode
   ├─ chooser unmounts, partnerHighlightStore.set({ start: null, end: null })
   └─ 3D viewport's pair highlight clears
```

## Plan-time verification

Items to verify during implementation (not during design):

1. `band.meta.startPartnerBand` / `endPartnerBand` reliably populated when bands are partnered (spec Q1 — likely true based on `helpers.ts:101`, but confirm during plan).
2. Address space compatibility between `superGlobulePatternStore` (cut-pattern) and `superGlobuleStore` (3D geometry). Both use facet addresses — confirm field names and structure match before wiring `partnerHighlightStore` into `Highlight.svelte`.
3. `retarget` / flat-index invariants hold across pairs — the spec's unit determines the flat-index space; real quads render through the spec, so indices remain consistent across pair selections.
4. `newTransformPS` output matches `getTransformedPartnerCutPattern` exactly (no centering / coordinate-frame divergence). Compare ghost positions against a known partnered pair's runtime adjustment output before shipping.

## Risks

1. **Live read on `superGlobulePatternStore`** — even with snapshot-on-selection, the deep-compare on every store tick could be expensive for large models. Mitigation: throttle the comparison, or compare a hash/signature of just the chosen pair's quad coordinates.
2. **`band.meta` partial population** — during worker rehydration, `meta` may be transiently absent. The chooser must filter defensively (`band.meta?.startPartnerBand` everywhere) and handle empty results gracefully.
3. **Multi-color highlight overlap** — if the user has a regular 3D selection AND a chooser-pair active, both highlights render simultaneously. Visual overlap is acceptable (the user did both deliberately); but distinct material colors are essential. Verify `materials.numbered[1]` / `[4]` differ from the regular-selection color before assuming.
4. **Empty initial state surprise** — A user entering Partner mode for the first time sees a symmetric mirror and has to discover the chooser to get real geometry. Mitigation: caption text under the chooser ("Pick a pair from your model to see real distortion"); not a blocker.

## Decisions made during brainstorm

| #   | Question                     | Choice                                              |
| --- | ---------------------------- | --------------------------------------------------- |
| Q1  | Synthetic fallback in v1?    | **No.** Symmetric mirror remains the fallback.      |
| Q2  | Snapshot vs. live-track?     | **Snapshot on selection** with model-change banner  |
| Q3  | Default state on mode entry? | **Symmetric mirror** until user explicitly picks    |
| Q4  | Chooser placement            | Above or beside rule list in `.rule-row` (TBD impl) |
| Q5  | Random button cycling?       | Uniform random, can repeat                          |
| Q6  | Algorithm scope              | Shield only; chooser hides for hex/box variants     |
| Q7  | Multi-pair-per-band?         | Each band-end has at most one partner per spec      |
