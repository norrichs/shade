# Panel patterns: page layout for export

Status: todo. Follow-up from pattern post-processing 2 (`docs/superpowers/specs/2026-09-27-pattern-post-processing-2-design.md`).

## Problem

Panel patterns (one triangular facet per panel, for etching wood or cutting metal) are not laid out on pages. `ProjectionPanelPatterns.svelte` draws each panel at its own offset inside `#pattern-svg`. The page-layout pipeline in `CutPatternRenderer.svelte` only lays out cut-pattern bands.

Since post-processing 2, both downloads export in real-world units derived from page rects (`exportPagesStore`):

- **SVG**: the root is sized in mm from the page union, and content is scaled by `1/pageScale`.
- **`.lbrn2`**: one Group per page. Shapes are assigned to the page whose rect contains them, or else the nearest page.

With a panel pattern shown, the cut-pattern pipeline has zero bands. Flex-wrap over zero items returns one empty page (4000×4000 in the test setup), so the export goes ahead:

- The SVG is cropped to that empty page frame.
- The LightBurn geometry lands off the page. Measured: y up to ~4302 on a 4000 mm page, and x down to −14.

The panel geometry is now tagged, so the untagged-export guard no longer stops this:

- creases → `pattern-outline`
- holes → `pattern-hole`
- hinge, nut and registration marks → `label-text`
- design aids → `screen-only`

**Result today: panel downloads silently produce wrong files.** Until this is done, don't use Download for panel patterns.

A second problem: `PatternViewer.svelte` shows the panel layer whenever a panel `projectionPattern` exists and `showProjectionGeometry.any` is on. That gate ignores `patternSource`, so panel geometry can end up inside another pattern source's page export when both are visible.

## Goal

Panel patterns take part in page layout, so both exports are mm-true and every panel lands on a page. After that, a panel page can be selected and cut in LightBurn the same way a band page can.

## Starting points

- `CutPatternRenderer.svelte`:
  - `pageBands` → `toLayoutItems` → `PAGE_LAYOUT_ALGORITHMS` (flex-wrap / skyline) → `pageResult`
  - the `exportPagesStore` publish effect
  - the stage-3 wiring
- `src/lib/cut-pattern/page-layout/`: `LayoutItem` is `{ width, height, left, top, alignedYOffset }`. Panels need the same bounds.
- `ProjectionPanelPatterns.svelte`, `PanelComponent.svelte`, `HingePatternComponent.svelte`, `BandPanelComponent.svelte`: where panels are drawn and offset today.
- `src/lib/lightburn/collect-dom-shapes.ts` and `build-lb-project.ts`: exports read the live DOM transforms, so once panels are placed on pages nothing downstream should need to change.
- `tests/post-process-2.spec.ts`: extend it with a panel-mode case that asserts every `.lbrn2` vertex falls within the page union.

## Questions to settle in design

1. Should a panel be one layout item, or a whole hinge group?
2. Should panel page layout share `pageLayout` config (size, margin, scale, algorithm) with bands, or get its own?
3. Gate the panel layer on `patternSource`, or allow a combined band + panel export?
4. Should stage 3 (disconnect surround, page labels) apply to panel pages? Page labels are probably wanted; disconnect surround probably isn't.
5. Crease strokes: `PanelComponent.svelte` keeps `stroke-dasharray` (mountain/valley) on the exported `pattern-outline`. For cutting, drop the dashes in export, or map creases to their own geometry type and layer (e.g. `crease-mountain` / `crease-valley` → score layers).

## Interim option (not chosen)

A one-line refusal in `handleDownload` (`NavHeader.svelte`) while a panel projection pattern is shown would bring back an explicit error in place of the wrong file. It was considered and deferred in favour of this proper fix.
