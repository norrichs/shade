# Tile Editor: Partner Mode Refactor — Design

**Date:** 2026-05-03
**Status:** Approved
**Replaces:** the existing 6-mode Tile Editor (Unit / Within Band / Across Bands / Partner Start / Partner End / Skip Remove) with a 2-editor structure (Unit / Partner).

## Goal

Make the Tile Editor easier to work with by collapsing four rule-editing modes into a single Partner editor that shows a chosen "base" quad surrounded by up to four real-model partner quads, all editable together.

## Architecture

A binary mode toggle (Unit / Partner) replaces the current 6-button mode bar. The Unit editor is unchanged in structure; Skip Remove folds into it as a tool. The Partner editor is a new top-level component that owns base-quad selection, partner resolution, and rule editing across all four rule sets in one viewport. The data model (`TiledPatternSpec.adjustments`) is not changed — the four existing rule arrays remain.

## File Structure

### New Files

- `src/components/modal/editor/tile-editor/PartnerEditor.svelte`
  - Top-level container for Partner mode. Owns base quad address, partner snapshot, refresh state. Subscribes to `superGlobulePatternStore`. Mounts `BaseQuadSelector`, `PartnersViewport`, and `PartnerRulesPanel`. Emits rule-set changes back to `TileEditor.svelte`.

- `src/components/modal/editor/tile-editor/BaseQuadSelector.svelte`
  - Four cascading dropdowns: Source → Tube → Band → Quad. Disables downstream selects until upstream is chosen. Emits a `BaseQuadAddress` (`{ source, globule, tube, band, facet }`) when all four are set.

- `src/components/modal/editor/tile-editor/PartnersViewport.svelte`
  - SVG viewport that renders base + up to four partners with the layout defined in the Geometry Layout section. Handles vertex clicks, connection clicks, vertex hover for tooltips. Performs the in-JS coordinate transform to keep label text upright.

- `src/components/modal/editor/tile-editor/PartnerRulesPanel.svelte`
  - Right-side panel with four subsections (Within Band, Across Bands, Partner Start, Partner End). Each subsection is a `RuleList` instance with section-appropriate source/target colors.

- `src/components/modal/editor/tile-editor/partner-neighbors.ts`
  - Pure module. Exports `resolveBaseAndPartners(allBands, baseAddress)` returning `{ base, top, bottom, left, right }` where each populated entry is a `ResolvedPartner` (`ResolvedPair`-shaped with added `role` and `ruleSet` tags). Uses `resolvePair` for cross-tube partners and direct address arithmetic plus a two-point rigid-transform helper for left/right.

### Modified Files

- `src/components/modal/editor/TileEditor.svelte`
  - Replace `ModeBar` with a 2-button toggle (Unit / Partner). Replace the rule-mode and skipRemove branches with a single `<PartnerEditor />`. Skip Remove logic stays here but is triggered by the Unit `tool` state instead of a top-level mode. Remove the partner-pair chooser and rule-edit viewport mounts.

- `src/components/modal/editor/tile-editor/editor-mode.ts`
  - Collapse `EditorMode` to `'unit' | 'partner'`. Delete `ghostTransform`, `ghostSvgTransform`, `ruleArrayKey`, `ruleModes`, `isRuleMode`.

- `src/components/modal/editor/tile-editor/partner-pair-resolver.ts`
  - Keep `transformQuad`, `resolvePair`, `pairsEqual`, `ResolvedPair`, `PartnerMode`. Delete `getEligibleBands`.

- `src/components/modal/editor/tile-editor/UnitToolbar.svelte`
  - Extend `UnitTool` to include `'skipRemove'`. Add a third toggle button.

- `src/components/modal/editor/SegmentPathEditor.svelte`
  - When the active tool is `'skipRemove'`, render the Skip Remove overlay (vertices togglable, marked indices visualized) inline instead of mounting a separate viewport.

- `src/lib/stores/partnerHighlightStore.ts`
  - Shape changes from `{ source, start, end }` to `{ source, base, top, bottom, left, right }`. Each role is `GlobuleAddress_Facet | null`.

- `src/lib/stores/selectionStores.ts`
  - Rename `chooserPairGeometry` to `partnerHighlightGeometry` (the chooser is gone). Read the new highlight shape and produce a list of highlight entries `{ role, geometry }` for the 3D viewport.

- `src/components/projection/Highlight.svelte`
  - Render one highlight mesh per populated role using the role-specific material.

- `src/components/three-renderer/materials.ts`
  - Add `blue`, `beige`, `gray` materials (if absent) for the new role-specific highlights.

### Deleted Files

- `src/components/modal/editor/tile-editor/PartnerPairChooser.svelte`
- `src/components/modal/editor/tile-editor/RuleEditViewport.svelte`
- `src/components/modal/editor/tile-editor/ModeBar.svelte`
- `src/components/modal/editor/tile-editor/SkipRemoveViewport.svelte`
- `src/components/modal/editor/tile-editor/UnitLabels.svelte` (currently imported only by the deleted `RuleEditViewport.svelte`; double-check during implementation that no other consumer remains, then delete)

### Unchanged

- `src/components/modal/editor/tile-editor/RuleList.svelte` — reused inside `PartnerRulesPanel`.
- `src/components/modal/editor/tile-editor/VariantBar.svelte`
- `src/components/modal/editor/segment-vertices.ts` — both `computeVertices` (Unit editor) and `computeVerticesFromFlatPath` (Partner viewport) still used.
- `src/components/modal/editor/vertex-addressing.ts` — all helpers reused.

## Data Model & Rule-Set Mapping

`TiledPatternSpec.adjustments` is unchanged. Four arrays remain:

- `adjustments.withinBand`
- `adjustments.acrossBands`
- `adjustments.partner.startEnd`
- `adjustments.partner.endEnd`

Each partner around a base quad carries a `ruleSet` tag determined by base position:

| Partner | When it exists | Rule set |
|---|---|---|
| Top | base is not the last facet | `withinBand` |
| Top | base IS the last facet | `partner.endEnd` (cross-tube to `endPartnerBand`) |
| Bottom | base is not facet 0 | `withinBand` |
| Bottom | base IS facet 0 | `partner.startEnd` (cross-tube to `startPartnerBand`) |
| Left | adjacent band exists at `band - 1` (same tube) | `acrossBands` |
| Right | adjacent band exists at `band + 1` (same tube) | `acrossBands` |

### Resolution

- **Top in same band:** read `mainBand.facets[base.facet + 1]`. No transform.
- **Bottom in same band:** read `mainBand.facets[base.facet - 1]`. No transform.
- **Top cross-tube:** delegate to `resolvePair(allBands, baseAddress, 'partnerEnd')` — handles `endPartnerBand` lookup, ghost-facet disambiguation via `isSameAddress`, and `endPartnerTransform` application.
- **Bottom cross-tube:** delegate to `resolvePair(allBands, baseAddress, 'partnerStart')`.
- **Left:** find `{tube, band: base.band - 1, facet: base.facet}` in the same source's bands. Compute a rigid transform that maps `partner.b → base.a` and `partner.c → base.d`.
- **Right:** find `{tube, band: base.band + 1, facet: base.facet}`. Compute transform mapping `partner.a → base.b` and `partner.d → base.c`.

The two-point match fully determines a translate-plus-rotate. Edge lengths must agree, which they do under isometric flattening.

### `originalPath` Overlay

Rendered under each partner's adjusted path when `facet.meta.originalPath` is populated. The Shield adjuster currently populates this only for partner-start/end facets when `DEBUG_METADATA` is enabled. For within-band and across-bands partners the field may be absent; the overlay simply skips on those partners. **Extending the adjuster to populate originalPath uniformly is out of scope** for this refactor and may follow up separately.

### Adding a Rule via Click

The clicked partner carries its `ruleSet` directly, so dispatch is unambiguous. The handler appends an `IndexPair` (`target` = base vertex's flat index, `source` = partner vertex's flat index) to the rule array named by `ruleSet`.

## Base Quad Selection

`BaseQuadSelector.svelte` renders four dropdowns left-to-right.

### Cascade Rules

- **Source:** lists sources that have at least one tube populated, in fixed priority order: `projection`, `surface`, `globuleTube`, `super`. Disabled if no source has data.
- **Tube:** lists tubes from the chosen source. Disabled until source is chosen. Selecting source clears tube/band/quad.
- **Band:** lists bands within the chosen tube. Disabled until tube is chosen. Selecting tube clears band/quad.
- **Quad:** lists facet indices `0..band.facets.length - 1`. Disabled until band is chosen. Selecting band clears quad.

### Empty State

Before quad is chosen, the viewport renders a hint ("Select a base quad to begin.") and no geometry. The rules panel always shows all four subsections — they're spec-level data and exist independently of base-quad selection.

### Defaults

None. Selectors start empty on mount. Switching variants or modes clears selection. Selection is component-local; not persisted.

### Labels

- Source: `projection`, `surface`, `globule tube`, `super`
- Tube: `Tube N`
- Band: `Band M`
- Quad: `Quad K`

## Geometry Layout & Rendering

### Coordinate Conventions

Quad corners: `a` = bottom-left, `b` = bottom-right, `c` = top-right, `d` = top-left. For the base, this also defines edge-to-partner mapping: `c-d` = top edge, `a-b` = bottom, `a-d` = left, `b-c` = right.

### Stage 1 — Position Partners in Base's Coordinate Frame

- Same-band top/bottom: cut-pattern flattening already lays them adjacent to the base. Use corners directly, no transform.
- Cross-tube top (Partner End): apply `endPartnerTransform` from `mainBand.meta` via `resolvePair`.
- Cross-tube bottom (Partner Start): apply `startPartnerTransform`.
- Left: rigid transform mapping `partner.b → base.a` and `partner.c → base.d`.
- Right: rigid transform mapping `partner.a → base.b` and `partner.d → base.c`.

### Stage 2 — Viewport Transform

Applied to all rendered points in JS so SVG text labels remain upright.

- **Rotation:** `-atan2(base.c.y - base.d.y, base.c.x - base.d.x)` so base's top edge `d→c` aligns with the +x axis.
- **Translation:** shift so the bounding-box center of base + populated partners sits at `(0, 0)`.

### ViewBox

Symmetric around origin: `[-halfW, -halfH, 2*halfW, 2*halfH]` plus padding. `halfW`/`halfH` derived from the transformed bbox of all rendered quads.

### Visual Stroke Scaling

Stroke widths and font sizes scale by `assembly_span / 42` (matching the unit-mode reference).

### Colors

All quad fills at α = 0.1 (90% transparent).

| Role | Quad fill | Original-path stroke |
|---|---|---|
| Base | `rgba(80, 130, 200, 0.1)` (light blue) | `rgba(40, 70, 130, 0.3)` |
| Same-band top/bottom (`withinBand`) | `rgba(180, 140, 80, 0.1)` (warm beige) | `rgba(120, 80, 30, 0.3)` |
| Left/right (`acrossBands`) | `rgba(120, 120, 120, 0.1)` (gray) | `rgba(60, 60, 60, 0.3)` |
| Cross-tube top (`partner.endEnd`) | `rgba(0, 200, 0, 0.1)` (green) | `rgba(0, 90, 0, 0.3)` |
| Cross-tube bottom (`partner.startEnd`) | `rgba(220, 0, 0, 0.1)` (red) | `rgba(90, 0, 0, 0.3)` |

Cross-tube green/red follows the existing convention from today's Partner End / Partner Start ghost rendering.

### Strokes

- **Adjusted path:** solid black on every quad.
- **Original path:** drawn under the adjusted path in the matched darker color from the table above. Skipped on any quad (base or partner) where `meta.originalPath` is missing.
- **Connection lines (rules):** blue, click-to-select, Delete-to-remove. Each line connects a base vertex to a specific partner vertex; the partner determines its rule set.

## Rule Editing UX

### Adding a Rule

Two clicks:

1. Click any vertex on the **base** → marked selected (orange ring).
2. Click any vertex on a **partner** → rule appended to that partner's rule set; selection clears.

Clicking a partner vertex first (no base selected) is a no-op. Clicking a different base vertex moves selection. Clicking the same selected base vertex deselects.

The clicked partner already carries its `ruleSet` tag, so routing is unambiguous. Each partner provides its own vertex-to-flat-index mapping via `computeVerticesFromFlatPath`, ensuring indices align with what the unit pattern's `flatIndex` would produce.

### Deleting a Rule

- Click a connection line in the viewport → selected (red highlight); press `Delete` or `Backspace`.
- Click the `×` button next to a rule entry in `PartnerRulesPanel` → removes that specific rule.

### Keyboard

- `Delete` / `Backspace`: remove selected connection.
- `Escape`: clear pending base-vertex selection.

### Edge Cases

- Routing is by partner identity, not direction. A bottom partner of `base.facet === 0` is `partner.startEnd`, never `withinBand`.
- Both left and right partners write to the same `acrossBands` array. The panel shows them as one flat list under "Across Bands" (no left/right grouping).

## Vertex Labels & Tooltips

### Default Rendering

Vertex circles drawn on every quad. **Labels are not drawn by default.** Only vertices that participate in at least one rule for the current spec are labeled.

A vertex is "in a rule" if:

- On the **base**: any rule's `target` matches its flat index (across all four rule sets).
- On a **partner**: any rule in *that partner's rule set* has a `source` matching its flat index.

### Default Label Content

The flat path index. Partner vertex labels render in the partner's color (matching the rule index colors in the side panel). Base vertex labels render in the base color (light blue) since one base vertex may be referenced by rules across multiple rule sets — using a single color keeps it readable.

### Hover Tooltip

When the user hovers any vertex (labeled or not), a small floating box appears next to it listing **all** flat indices for that geometric position (one position can reference multiple segments — same data as today's `flatIndexes(unit, vertex).join(',')`). The tooltip has a 3px left border in the quad's role color so base vs. partner is distinguishable.

### Implementation

Build a `Set<flatIndex>` lookup per quad once per render. Cheap.

## Refresh / Live Tracking

### Geometry Source

`PartnerEditor.svelte` subscribes to `superGlobulePatternStore`.

### Two-Tier Strategy

- **Available addresses** in the cascading dropdowns are always live. If the model changes such that the current selection no longer points to a valid quad, the selector clears to the deepest valid level.
- **Rendered geometry** in the viewport is taken from a snapshot captured at selection time. When live geometry diverges from the snapshot, a yellow refresh banner appears above the viewport with a "Refresh" button. Clicking re-snapshots from live data.

### Diff Detection

Deep-compare the snapshot bundle against the live bundle (5 partners' quads + paths + originalPaths). JSON-stringify and compare; cheap at this scale. Reuses today's `pairsEqual` style.

### Selection Clear

Clears snapshot, highlight store, and pending vertex selection when:

- User selects a different quad.
- User switches mode (Unit ↔ Partner).
- User switches variant.
- Editor is closed.

### Highlight Store Writes

On every snapshot, write populated facet addresses under their roles (`base`, `top`, `bottom`, `left`, `right`). `Highlight.svelte` reads and renders matching highlights using role-specific materials:

- Base → blue
- Top/bottom withinBand → beige
- Left/right → gray
- Cross-tube top → green (existing `numbered[4]`)
- Cross-tube bottom → red (existing `numbered[1]`)

`materials.ts` gains blue/beige/gray entries if not already present.

## Migration & Cleanup

### Removed Code

See "Deleted Files" above.

### Tests

- Existing tests for `PartnerPairChooser` (if any): deleted.
- Existing tests for `partner-pair-resolver`: kept (we still use `resolvePair`).
- New tests:
  - `partner-neighbors.test.ts` — `resolveBaseAndPartners` returns correct combinations for: middle-of-band base, first-facet base, last-facet base, outermost-band base (no left or right), single-facet band (top and bottom both cross-tube), no left/right at edge bands.
  - `BaseQuadSelector.test.ts` — cascade clearing behavior, disabled states, recovery when current selection becomes invalid.

### Spec / Data Migration

None. `TiledPatternSpec` is unchanged.

### Visual Regression Risk

Moderate. Unit mode gets a third tool button but otherwise renders identically. Partner mode is new. No pattern definitions change.

### Rollout

Single PR, single branch.

## Out of Scope

- Extending the Shield adjuster (or any other adjuster) to populate `meta.originalPath` for within-band and across-bands facets. The new viewport will show the original-path overlay only where the adjuster currently emits it.
- Changing `TiledPatternSpec` shape or merging rule-set arrays.
- Supporting multiple base quads simultaneously.
- Adding new rule sets or new partner directions beyond the four cardinal neighbors.
