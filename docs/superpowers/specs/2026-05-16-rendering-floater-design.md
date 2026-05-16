# Rendering Floater — Design

**Date:** 2026-05-16
**Status:** Spec — ready for implementation plan

## Summary

Move the rendering controls (computation mode dropdown, Manual checkbox, Pause Patterns checkbox + Refresh button) out of the inline designer header and into a Floater registered as `Rendering` in the `utilities` sidebar group. Reuse the already-existing `ComputationMode.svelte` component as the floater body (renamed `Rendering.svelte`) with minor label trims.

## Motivation

The inline controls in `/designer2/+page.svelte`'s `<header>` (`mode-control`, `manual-mode-control`, `pattern-control`) push the `SelectBar` (Silhouette / Spine / Shape / …) to the left, hiding entries off-screen at typical viewport widths. Moving the rendering UI into a floater frees up the menu bar and brings rendering controls into line with every other configuration surface in the app, which is already floater-based.

## Component

`src/components/modal/editor/ComputationMode.svelte` already exists as a fully formed floater body (wrapped in `<Editor>`, uses `Container` and the same store bindings). It is currently not registered. Rename to `Rendering.svelte` to match the floater title.

### Label edits inside the component

| Before | After |
| --- | --- |
| `<header>Computation Mode</header>` (section header) | removed entirely |
| Checkbox label `Manual Mode` | `Manual` |
| Checkbox label `Pause Pattern Updates` | `Pause Patterns` |
| Dropdown label `Mode` | unchanged |
| Dropdown options `Continuous / 3D Only / 2D Only` | unchanged |
| Pending tag `⚠ pending` | unchanged |
| `Refresh` button (visible when paused) | unchanged |

The `<section>…<Container>…</Container></section>` wrapper stays; only the `<header>` line inside `<section>` is removed.

## Registration

Add to the `utilities` Map in `src/components/modal/sidebar-definitions.ts`:

```ts
['Rendering', { shortTitle: 'RN', title: 'Rendering', content: Rendering }]
```

Placement: at the end of the existing `utilities` Map (after `Configs`). `utilities` is spread into both `projectionConfigs` and `globuleConfigs`, so the floater is automatically available in both designer modes.

`closeOnClickAway` is left at its default — the controls (dropdown, checkboxes) are non-destructive and clicking away is acceptable.

## Inline UI removal

In `src/routes/designer2/+page.svelte`:

- Delete the three header blocks: `<div class="mode-control">`, `<div class="manual-mode-control">`, `<div class="pattern-control">` (currently lines ~77–102 within `<header>`).
- Delete the `refreshPatterns` function (currently lines ~33–37).
- Delete the now-unused store imports: `computationMode`, `pausePatternUpdates`, `isManualMode`, `hasPendingChanges` from the `$lib/stores/uiStores` import statement.
- Delete the `superGlobulePatternStore` import if it becomes unused after `refreshPatterns` removal.
- Delete the matching CSS rules: `.mode-control`, `.manual-mode-control`, `.pattern-control`, `.pending-indicator`, `.refresh-btn` from the page's `<style>` block.

## Not changing

- The `{#if $computationMode !== '3d-only'}` gate around `<PatternViewer />` stays — that's render-mode gating, not UI placement.
- The `$computationMode` store and the `uiStores` module are unchanged. The Rendering floater binds to the same writables the inline UI used.
- `Floater.svelte`, `HoverSidebar.svelte`, sidebar bar plumbing — unchanged.

## Testing

- Manual smoke check on `/designer2`:
  1. Sidebar shows the new `RN` button alongside `UT`, `SL`, `CF`.
  2. Opening it renders the three controls; toggling each still mutates state (3D viewport stops re-rendering in 2D Only, Pause Patterns shows the Refresh button, Manual + pending indicator works).
  3. Menu bar (`SelectBar` row) no longer has rendering UI to its right; all entries fit at normal widths.
- No new unit/E2E tests. Component is a thin store-bound surface.

## Risks

1. **Stale references**: any other component reading from the deleted inline element by selector or DOM query would break. None known in the current codebase, but a quick grep for `.mode-control` / `.manual-mode-control` / `.pattern-control` during implementation will confirm.
2. **Floater overlap on first open**: the floater opens at its default coordinates; on small viewports it may sit over the 3D viewport. Acceptable — every other floater behaves the same.

## Out of scope

- Persisting the floater's open/closed state across sessions.
- Restyling the controls beyond the label trims above.
- Touching any other inline header element (`SelectBar`, etc.).
