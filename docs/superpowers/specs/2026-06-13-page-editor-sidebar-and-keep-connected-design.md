# Page Editor Sidebar + keepConnected Cut Breaks — Design

Date: 2026-06-13
Branch: `feature-page-layout`

Two independent changes to the page-based pattern layout feature.

## Feature 1 — Move the page layout editor into the HoverSidebar

### Current state

- The page layout editor (`src/components/cut-pattern/PageLayoutEditor.svelte`) is a
  standalone fixed panel toggled by the `pageEditorOpen` store
  (`src/lib/stores/pageEditorStore.ts`). It is rendered inside `PatternViewer.svelte`.
- It is opened by a **"Page editor"** button in `CutPatternControl.svelte` that renders
  **only when** `patternLayoutMode === 'page'`, plus an auto-open when the mode cycle
  button reaches `'page'`.
- The mode cycle button ("Layout: linear/line-wrap/page") lives in `CutPatternControl.svelte`.

### Target state

The editor becomes a first-class entry in the right-edge `HoverSidebar`, exactly like
Cross Section, Polyhedra, etc. — so its trigger button renders unconditionally alongside
the other sidebar buttons.

- New content component `src/components/modal/editor/PageLayout.svelte` (no panel chrome —
  the `Floater` supplies the header/close/positioning). It renders:
  - **Always:** a copy of the layout-mode cycle button (`linear → line-wrap → page`),
    driving `patternConfigStore.patternViewConfig.patternLayoutMode`.
  - **Always:** the new `keepConnected` number input (see Feature 2).
  - **Only when `patternLayoutMode === 'page'`:** the existing controls — preset, units,
    width, height, pageScale, margin, layout gap, the SVG preview, and the derived model
    size readout.
- Register a `'Page Layout'` entry (shortTitle `PL`) in `projectionConfigs`
  (`src/components/modal/sidebar-definitions.ts`). `designer2/+page.svelte` already renders
  `<HoverSidebar sidebarDefinition={projectionConfigs} />`, so the button appears
  unconditionally for free.
- `CutPatternControl.svelte`: remove the `{#if … 'page'}` "Page editor" button, the
  `pageEditorOpen` import, and the `if (next === 'page') $pageEditorOpen = true` auto-open.
  Keep the original "Layout: …" mode cycle button (the editor renders a _separate copy_).
- Remove the now-unused standalone panel and store: delete
  `src/components/cut-pattern/PageLayoutEditor.svelte`, remove `<PageLayoutEditor />` from
  `PatternViewer.svelte`, and delete `src/lib/stores/pageEditorStore.ts`.

### Why a Floater entry (not a coupled button)

"With the other floating sidebar buttons" + "render unconditionally" maps cleanly onto the
existing `Floater`/`HoverButton` system. Adding a feature-specific button to the generic
`HoverSidebar` would couple it; a sidebar definition entry is the idiomatic integration and
makes the trigger render unconditionally with zero extra wiring.

## Feature 2 — `keepConnected` cut breaks

### Intent

The merged cut outlines are paths a laser follows to cut a piece out. A fully-closed path
drops the piece immediately. `keepConnected > 0` leaves one small uncut bridge so the piece
stays attached to the surrounding sheet.

### Config

- Add `keepConnected: number` to `PageLayoutConfig` (`src/lib/types.ts`).
- Default `0` in `defaultPatternConfig().pageLayout` (`src/lib/shades-config.ts`).
- Editor control: always-visible number input (min 0, step 1) in `PageLayout.svelte`.

### Scope

Applies **only to the prepared merged paths** produced by `computeMergedBandPaths`
(`patternType === 'outlined'` with self-tag labels). Those are already single continuous
closed contours; no other modes are touched.

### Algorithm — `insertKeepConnectedBreak(path, gap)`

New util `src/lib/cut-pattern/keep-connected.ts`. Given a single closed contour
(`PathSegment[]` beginning with `M`, ending with `Z`) and `gap = keepConnected`:

1. If `gap <= 0` or the path is not a single contour (≠ exactly one `M`), return unchanged.
2. Expand into a cyclic list of boundary edges (each edge draws from its start point to its
   end point). The trailing `Z` becomes an explicit straight closing edge back to the start
   point. Curve edges (`C`/`Q`/`A`) are kept verbatim and never chosen.
3. Candidate edges = straight (`L`/closing) edges whose length `> gap`. Choose the **topmost**
   (minimum midpoint `y`; SVG y grows downward). If no candidate qualifies, return unchanged.
4. On the chosen edge `A → B`, center a gap of width `gap` at its midpoint:
   `gapStart = A + dir·(len/2 − gap/2)`, `gapEnd = A + dir·(len/2 + gap/2)`.
5. Rebuild as a single **open** path (drop the `Z`) that omits only the gap, traversing the
   loop once in the original direction:
   `M gapEnd`, `L B`, then every other edge in forward order (wrapping around to `A`),
   then `L gapStart`.

This is robust for mixed straight/curve contours and avoids `Z`-closing to the wrong point.

Example (`gap = 2`, chosen segment `(0,100) → (100,100)`):
the segment becomes `L 49 100`, `M 51 100`, `L 100 100` — i.e. cut everything except a 2px
bridge centered at x=50. (Note: a bare `M 49` without the preceding `L 49` would skip cutting
0→49; we cut up to the gap, lift across it, and resume.)

### Wiring

- `computeMergedBandPaths(tubes, labels, patternType, labelTextDims, keepConnected)` — new
  trailing param; after `mergeOutlineWithLabel`, apply `insertKeepConnectedBreak` when
  `keepConnected > 0`.
- `runPrepare` in `NavHeader.svelte` passes `config.patternConfig.pageLayout.keepConnected ?? 0`.
- The mergedBandPaths invalidation `$:` block in `NavHeader.svelte` also references
  `keepConnected` so changing it requires a re-prepare.

### Tests

Unit tests for `insertKeepConnectedBreak`: gap inserted on the topmost long straight segment;
no-op when `gap = 0`, when no segment is long enough, and on compound paths; resulting path is
open and omits exactly the gap span.

## Out of scope

- Tabs/bridges between adjacent pieces, multiple breaks per piece, breaks on curve segments.
- keepConnected for non-outlined / unlabeled bands.
