# Skyline page packing with bounded lookahead + rotation

**Date:** 2026-07-04
**Status:** Approved (design)

## Problem

Page layout mode arranges band cut patterns onto printer pages so they can be
printed and cut. The current packer (`flexWrapPageLayout`,
`src/lib/cut-pattern/page-layout/flex-wrap.ts`) is a shelf/row packer with a
per-row "push-up" that is clamped so an item's vertical midpoint can never rise
above the row top. This leaves substantial wasted vertical space between rows,
so pages hold fewer patterns than they physically could — wasting material.

Two goals are in tension:

- **Preserve incoming order.** Bands arrive in a logical grouping; keeping
  grouped bands physically near each other on the page improves manufacturing
  efficiency.
- **Maximise density.** Fit as many patterns per page as possible to minimise
  paper/material.

The balance is achieved by allowing *limited, bounded* reshuffling.

## Solution overview

Add a **second** page-layout algorithm, `'skyline'`, alongside the existing
`'flex-wrap'`. `flex-wrap` is left completely unchanged. A UI selector in the
Page Layout editor chooses between them. Two new config knobs tune the skyline
packer: `reorderWindow` (bounded reshuffle) and `allowRotation` (90° rotation).

The default algorithm stays `'flex-wrap'`, so existing designs are unaffected
until the user opts in.

The skyline packer combines three levers that map directly onto the three
requirements:

- **Unbounded push-up** → a global per-page skyline instead of the per-row
  midpoint clamp. Items drop as far up as they physically fit.
- **Rotation** → each candidate is also evaluated turned 90°; the tighter
  orientation wins (gated by `allowRotation`).
- **Bounded reshuffle** → `reorderWindow` (W). At each step the packer looks at
  the next W unplaced items and places whichever best fills the current lowest
  notch. An item can therefore jump ahead of at most W−1 neighbours, so logical
  groups stay adjacent.

## Data-model changes

### `PageLayoutConfig` (`src/lib/types.ts`)

Add:

- `algorithm: 'flex-wrap' | 'skyline'` (widen the existing literal type)
- `reorderWindow: number` — lookahead window W. Skyline only. `1` = strict
  incoming order. Default `8`. Clamped `>= 1`.
- `allowRotation: boolean` — permit 90° rotation. Skyline only. Default `false`.

### `PageGeom` (`src/lib/cut-pattern/page-layout/types.ts`)

Add `reorderWindow: number` and `allowRotation: boolean`, populated by
`buildPageGeom` from the config. `flexWrapPageLayout` ignores them, so its
signature and behaviour are unaffected.

### `PageLayoutResult` (`src/lib/cut-pattern/page-layout/types.ts`)

Add `rotations: number[]` — one entry per item (`0` or `90`), parallel to
`origins`. This is what tells the renderer to rotate a band.
`flexWrapPageLayout` returns an all-zero array (or the renderer treats a missing
entry as `0`).

## Algorithm: `skyline.ts` (new file)

Implements the existing `PageLayoutFn` interface:
`(items: LayoutItem[], geom: PageGeom) => PageLayoutResult`.

### Skyline representation

Per page, keep a skyline: an ordered list of segments `{ x, width, top }`
spanning the packing width, initialised flat as a single segment
`{ x: 0, width: packWidth, top: 0 }`. `top` is the occupied height at that x
span (distance from the content-box top).

### Gap spacing

Like `flex-wrap`, the skyline packer honours `geom.gap` (the renderer injects
the shared `gap` so all layout modes stay consistent). Each item reserves `gap`
of spacing on its right and bottom: the packer works with inflated
`(w + gap) × (h + gap)` footprints inside a box expanded by `gap`
(`packWidth = contentWidth + gap`, `packHeight = contentHeight + gap`), with the
real item box left/top-aligned in its cell — so the origin uses the real
`(w, h)` while the skyline reserves the inflated footprint. The `+ gap` terms
cancel in the overflow fit-check, so overflow semantics match `gap = 0`.

### Placing one item

For an item of size `w × h`, evaluate candidate x-positions at each skyline
segment's left edge. The item spanning `[x, x + w]` rests at
`top = max(segment.top)` over the segments it overlaps. Reject if
`x + w > contentWidth`. Its **score = top + h** (the resulting elevation) —
lower is better (classic bottom-left skyline heuristic).

After placing, splice the skyline: raise the covered `[x, x + w]` span to
`top + h`, then merge adjacent equal-height segments.

### Main loop

The queue holds items in original order. Each step:

1. **Window** = the next `min(W, remaining)` items of the queue.
2. For every windowed item × orientation (`0°`, plus `90°` if `allowRotation`,
   which swaps `w`/`h`), compute its best score on the current page skyline.
3. If **any** fit: place the lowest-scoring one. Tie-break: smaller `x`, then
   earliest original index. Record its rotation, remove it from the queue,
   update the skyline.
4. If **none** in the window fit the current page: finalise the current page,
   start a fresh page (reset the skyline), and place the **front** item
   (`queue[0]`) on it.

Step 4 guarantees the oldest unplaced item is placed at every page break, so no
item is ever carried more than one page past the point it reached the front of
the queue. This is the starvation guard.

### Ordering guarantee

An item is only ever placed while inside the window, so it can jump ahead of at
most W−1 neighbours. `W = 1` reproduces strict incoming order — but with a
global unbounded skyline and optional rotation rather than clamped shelves.

### Overflow contract (unchanged)

If the front item cannot fit a *fresh empty page* in any allowed orientation
(i.e. it is larger than the content box even rotated), return
`{ origins: [], pages: [], rotations: [], overflow: { itemIndex, requiredScale } }`.
`requiredScale` is computed the same way as flex-wrap:
`pageScale * max(w / contentWidth, h / contentHeight)`, taking the smaller
factor across the two orientations when rotation is allowed. The existing toast
and line-wrap fallback in `CutPatternRenderer.svelte` fire as they do today.

### Determinism

All tie-breaks are deterministic (score → x → original index). Layouts are
stable across runs; no `Math.random`.

## Registry (`src/lib/cut-pattern/page-layout/registry.ts`)

- Register `skyline: skylinePageLayout` in `PAGE_LAYOUT_ALGORITHMS`.
- `buildPageGeom` copies `reorderWindow` and `allowRotation` from the config
  into the `PageGeom`.

## Renderer changes

### `CutPatternRenderer.svelte`

- In the page-mode render loop, pass `rotation={pageResult.rotations[i] ?? 0}`
  to `BandComponent`.

### `BandComponent.svelte`

- Accept an optional `rotation?: number` prop (default `0`).
- Render `transform="translate(x y) rotate(θ cx cy)"`, pivoting so the rotated
  bounding box lands in the slot the packer chose. The origin already accounts
  for the band's `left`/`top` bounds offsets; rotation adds a pivot term. Exact
  pivot formula pinned down during implementation and locked by a unit test on
  the layout output.
- Non-page modes pass no rotation → `0` → zero behavioural change.

## UI (`src/components/modal/editor/PageLayout.svelte`, page mode only)

- **Algorithm** `<select>`: `Flex-wrap` (`flex-wrap`) / `Skyline` (`skyline`),
  bound to `patternConfig.pageLayout.algorithm`.
- When `algorithm === 'skyline'`, show:
  - `reorderWindow` number input, `min=1`, `step=1`.
  - `allowRotation` checkbox.
- These controls are hidden for `flex-wrap`.

## Config migration & defaults

- `shades-config.ts`: default `pageLayout` gains `algorithm: 'flex-wrap'`,
  `reorderWindow: 8`, `allowRotation: false`.
- `migrate-page-layout.ts`: backfill the three new fields on any loaded config
  that lacks them (`algorithm` → `'flex-wrap'` to preserve existing behaviour,
  `reorderWindow` → `8`, `allowRotation` → `false`).
- `validators.ts`: clamp `reorderWindow` to `>= 1`; validate `algorithm`
  against the allowed set; coerce `allowRotation` to boolean.

## Testing

New `src/lib/cut-pattern/page-layout/__tests__/skyline.test.ts`:

- Bottom-left placement into the lowest notch.
- Unbounded push-up: an item rises more than half its height into a gap — the
  case the old per-row clamp forbade.
- `W`-bounded reorder: a later small item is pulled forward to fill a notch
  while an item further than W away is not.
- `W = 1` reproduces strict input order.
- Rotation reduces page count / lands a tall-narrow item where the upright
  orientation would not fit.
- Page break places the front item on the new page (starvation guard).
- Overflow contract: front item larger than the content box returns
  `overflow` with the correct `requiredScale`; empty `origins`.

Extend `src/lib/__tests__/migrate-page-layout.test.ts` for the new default
backfill.

## Risks & considerations

- **Label / tag orientation.** Rotating a band rotates its printed tags and
  labels too (relevant to the tiled-pattern label-anchor work). Accepted for
  this iteration — rotation is opt-in and off by default. A future
  counter-rotation of tag text to keep labels upright is a possible follow-up,
  out of scope here.
- **flex-wrap untouched.** The new `rotations` field and `PageGeom` additions
  must not change flex-wrap output. Covered by the existing `flex-wrap.test.ts`
  continuing to pass unchanged.

## Out of scope

- Counter-rotating tag/label text on rotated bands.
- MaxRects / free-rectangle nesting (considered and rejected as overkill for
  printer-page tiling).
- Changing the default algorithm away from `flex-wrap`.
