# Distorted-Quad Partner Editing — Design

**Date:** 2026-05-03
**Branch:** `feature/surface-projection-bands`
**Status:** Spec — pending brainstorm + implementation plan

## Summary

The Tile Editor's partner-adjustment modes (Partner Start, Partner End) currently show the ghost as a rigid symmetric transform of the SAME unit pattern. This is sufficient for regular tessellations but doesn't expose the real purpose of partner rules: closing vertex-position gaps that arise when two partner band-ends have differently shaped quads due to 3D curvature. Phase 7 adds a distorted-quad context to the rule-editing viewport so the user is authoring against geometry that actually resembles what the adjuster sees at runtime.

## Goals

- Show real or realistic distorted quad geometry in the partner-rule viewport, not just a mirror of the unit.
- Let the user pick a specific partner pair from the active model and see those quads in the editor.
- Highlight the selected pair in the 3D viewport for spatial orientation.
- Preserve all existing unit-mode and within/across-band rule editing behavior unchanged.

## Non-goals (v1)

- Applying distorted-quad rendering to within-band or across-band modes (those modes already convey their geometry well).
- Authoring rules directly by clicking on the 3D model facets (the editor stays 2D-SVG).
- Auto-generating rules from the chosen pair (still manual click-to-connect).
- Supporting patterns other than shield-tesselation in this phase.
- Synthetic distortion presets as a standalone shipping feature (see Approaches below).

## The core problem

Unit patterns don't need adjustment rules — two identical unit-shaped quads placed edge-to-edge already line up perfectly. Partner rules exist to handle mismatched real quads: the start-facet of band A and the end-facet of band B are neighbors in 3D, but their 2D flattened positions diverge because each quad was unrolled independently from a curved surface. The adjuster (`adjustShieldTesselation` in `adjuster.ts`) snaps selected target vertices to matching source vertices from the transformed partner, closing those gaps. Without distorted context in the editor, the user has no visual evidence of gap magnitudes or whether a rule helps.

## Two approaches

### Approach 1: Synthetic distorted partners

Generate novel non-rectangular quad pairs inside the editor, parameterized by a preset or slider (e.g., "skewed left", "tapered", "fan-spread"). The hard constraint — the shared edge between the two partner quads must have identical length in both — is preserved. The other three edges of each quad vary freely.

The unit pattern would be rendered mapped onto the synthetic quad geometry (or just the quad outline + vertices, depending on implementation cost). The user picks a distortion preset in a sidebar, and the ghost reflects that distortion.

Pros: fully deterministic, no model dependency, works even when no globule is loaded, easy to test as a unit.

Cons: artificial. Rules tuned against synthetic quads might handle some real distortion shapes well and others poorly. The user is guessing what distortions matter; the synthetic quads don't reflect the actual distribution of distortions in their model.

### Approach 2: Real partner pairs from the active model (recommended)

Pull actual `BandCutPattern` pairs from the current SuperGlobule and render them in the editor viewport. The data is already computed and available: `band.meta.startPartnerBand` / `endPartnerBand` identify the partner band address, and `band.meta.startPartnerTransform` / `endPartnerTransform` carry the rigid translate+rotate that aligns the partner's coordinate frame to the main band's shared edge (this is what `newTransformPS` in `helpers.ts` already applies at adjustment time).

#### Chooser UI

A new sidebar section in the partner modes replaces the current implicit "canonical unit" context:

- **Pair selector:** a dropdown listing all valid partner-pair-eligible bands in the model. Each entry identifies a band by its address (tube + band index), e.g., "Tube 2 / Band 4". Selecting one loads that band's start or end facet (depending on mode) as the "main" quad, and its partner facet (via `startPartnerBand` / `endPartnerBand`) as the ghost.
- **Random button:** picks a random valid partner pair, useful when the user just wants a representative sample without scrolling a long list.
- **Fallback when no model loaded:** empty selector with a "No model loaded" placeholder; the viewport falls back to the current synthetic-mirror ghost behavior so the editor remains usable.

#### Rendering the distorted quads

The main and ghost quads in partner modes are currently drawn from `spec.unit` dimensions (a clean rectangle). With a real pair selected, both quads come from the actual flattened `CutPattern.quad` geometry of the chosen facets. The ghost is translated/rotated using the precomputed `startPartnerTransform` / `endPartnerTransform` from `band.meta` — the same transform `getTransformedPartnerCutPattern` already computes — so alignment matches what the adjuster sees exactly. The unit pattern path is still rendered inside each quad (mapped through the quad's corner points) so the user sees deformation alongside rule arrows.

#### 3D highlighting

When a partner pair is selected in the chooser, the two facets are highlighted in the 3D viewport. The existing infrastructure handles this: `selectedProjectionGeometry` (in `selectionStores.ts`) exposes `isStartPartner` and `isEndPartner` address predicates, and `materials.ts` already maps those predicates to distinct colors (`materials.numbered[4]` and `materials.numbered[1]`). The `Highlight.svelte` component in `src/components/projection/` renders the highlighted geometry overlay. Phase 7 needs to write the chosen pair's addresses into `selectedProjection` (or a new parallel writable) so the existing highlight path fires — no new highlight machinery required.

## Recommendation

Approach 2 is the right primary direction. The whole point is authentic authoring context; synthetic quads sidestep the real problem. Approach 1 is worth keeping as a fallback mode (toggled in the sidebar) for situations where no model is loaded or the user wants a controlled, repeatable editing context for a canonical spec. Implement Approach 2 first; add the synthetic toggle as a polish item if it proves useful in practice.

## Data flow (sketch)

```
User selects pair in chooser
  → read band.meta.startPartnerBand / endPartnerBand address
  → look up both BandCutPattern objects from superGlobulePatternStore
  → extract facet[0] or facet[last] from each
  → apply startPartnerTransform / endPartnerTransform via newTransformPS
  → feed transformed path + quad into RuleEditViewport as "distortedGhost"
  → write both facet addresses into selectedProjection store
    → Highlight.svelte reflects selection automatically
```

The `RuleEditViewport` component gains an optional `distortedGhost` prop. When present it overrides the synthetic `ghostSvgTransform`; when absent the viewport behaves exactly as today. `editor-mode.ts` stays untouched.

## Open questions

1. **What counts as a partner-pair-eligible band?** The chooser should list only bands that actually have a `startPartnerBand` or `endPartnerBand` set in `band.meta`. Bands without partners (e.g., open tube ends) would clutter the list. Confirm that the `meta` field is reliably populated for all matched ends before building the list.

2. **Chooser scope: cut-pattern bands or 3D facets?** The editor currently operates on `BandCutPattern` from `superGlobulePatternStore`. The 3D highlighting uses `Facet` addresses from `superGlobuleStore`. These are parallel structures. Confirm the address spaces are compatible before wiring the pair selector into the highlight store.

3. **What does the user understand about rule generalization?** The editor shows one specific pair but rules apply to ALL pairs in the model. Does the UI need explicit language to that effect? A tooltip or caption on the chooser ("Showing one pair — rules apply globally") may be enough.

4. **Vertex count invariant.** The `retarget` function in `helpers.ts` maps flat indices over `(rows, columns, startCount, middleCount, endCount)`. Real quads are rendered via the spec's unit — their vertex count is determined by the spec, not by the quad shape. So index rules authored against one pair's vertex layout are valid for all pairs. This assumption should be verified explicitly before implementation.

5. **How does the synthetic fallback interact with a loaded model?** If the user has a model loaded but explicitly wants synthetic context (e.g., authoring a canonical default spec), a toggle is needed. Tab vs. sidebar toggle vs. auto-switch needs a decision.

6. **Multi-color highlighting for both partners simultaneously.** The `isStartPartner` and `isEndPartner` predicates in `selectedProjectionGeometry` already return distinct colors. But the current selection flow writes one `GlobuleAddress_Facet` into `selectedProjection` and derives partners from facet metadata. Highlighting both facets of a chosen pair with different colors may require writing both addresses explicitly or adding a new parallel store, rather than relying on the partner-derivation path.

## Risks

1. **Coupling the editor to the active model.** The Tile Editor is currently self-contained. Reading from `superGlobulePatternStore` adds a live dependency: if the user changes model parameters while the editor is open, the displayed quad geometry may shift. Mitigating this with a "snapshot on open" approach (freeze the pair geometry when the chooser selection is made) would keep editing stable.
2. **`band.meta` availability.** If `meta` is absent or partially populated on some bands (possible edge case during worker rehydration), the chooser would silently have fewer entries or crash on access. The chooser construction needs defensive checks.
3. **Transform correctness.** `newTransformPS` applies a rigid translate+rotate with no scale. If the stored `startPartnerTransform` / `endPartnerTransform` values are in a different coordinate space than the flattened quad (e.g., pre-centering vs. post-centering), the ghost alignment in the editor viewport will be wrong. This should be verified by comparing the editor ghost alignment to a known pair before shipping.
