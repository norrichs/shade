# WS-F · Pattern layout: line-wrapping

**Status:** Spec — approved design, pending implementation plan
**Item:** #8
**Depends on:** nothing
**Blocks:** nothing
**Worktree:** isolated; implementer = Sonnet

---

## Goal

A toggle to switch the cut-pattern layout between:

- **Non-wrapping** (current): all bands in a single horizontal row.
- **Wrapping:** bands flow left-to-right and break to a new row when a configurable
  `wrapWidth` is exceeded; each new row is offset vertically by the **measured height** of
  the row above it.

---

## Current state

`src/components/cut-pattern/CutPatternRenderer.svelte`:

- `GAP_BETWEEN_BANDS = 20` (`:44`).
- `alignedY(band, verticalAlignment)` (`:46`) — top/bottom/center offset from a band's
  `bounds.height`.
- `getCumulativeOrigins(tubes, gap, valign)` (`:58`) — used for the **tube-grouped** render
  branch; lays bands in one row, `x += band.bounds.width + gap`.
- `getFlatOrigins(bands, gap, valign)` (`:80`) — used for the **sortIndex** (flattened)
  render branch; same single-row accumulation.
- Each band exposes `bounds: { width, height }` (computed in `getBoundsFromPath`,
  `generate-outlined-pattern.ts:36`).
- Render branches at `:163` (indexed/flat) and `:196` (tube-grouped) consume `flatOrigins`
  / `origins`.

No wrapping exists today.

---

## Design

### Config

Add to `patternViewConfig` (in `patternConfigStore` / `types.ts`):

```ts
lineWrap?: boolean;     // default false (preserves current single-row layout)
wrapWidth?: number;     // px; used only when lineWrap is true
```

### Wrapping origin computation

Generalize both origin functions to accept `lineWrap` + `wrapWidth`. Shared core:

```
x = 0; rowY = 0; rowMaxHeight = 0
for each band in order:
  w = band.bounds.width  ; h = band.bounds.height
  if lineWrap and x > 0 and (x + w) > wrapWidth:   // would overflow → new row
    rowY += rowMaxHeight + ROW_GAP
    x = 0
    rowMaxHeight = 0
  origin = (x, rowY + alignedY(band, valign))
  x += w + gap
  rowMaxHeight = max(rowMaxHeight, h)
```

- The row break uses the **measured** `band.bounds.height` (max across the row) for the
  vertical offset — satisfies "aware of actual rendered height of each line".
- A single band wider than `wrapWidth` still occupies its own row (the `x > 0` guard prevents
  an empty leading row).
- `ROW_GAP` constant (reuse `GAP_BETWEEN_BANDS` or a separate vertical gap — pick one;
  document).
- When `lineWrap` is false → identical to current single-row output (regression-safe).

Apply to **`getFlatOrigins`** (the indexed/sortIndex branch — primary use). For
**`getCumulativeOrigins`** (tube-grouped branch), apply the same wrapping **per the whole
band sequence** (flatten the nested tube/band origins through the same accumulator so wrapping
is continuous across tubes, not reset per tube). Keep the nested return shape the renderer
expects.

> Note `getCumulativeOrigins` mutates a shared `cumulativeOrigin` Vector3 across the nested
> map — preserve that the returned structure still indexes as `origins.tubes[t].bands[b]`.

### UI

Add a `lineWrap` toggle and a `wrapWidth` numeric input to the pattern-view controls. Show
`wrapWidth` only when `lineWrap` is on.

---

## Testing

- Unit (extract the accumulator into a pure `computeWrappedOrigins(bands, opts)` helper):
  - `lineWrap=false` → single row, matches current `x` accumulation exactly.
  - `lineWrap=true` → breaks when `x + w > wrapWidth`; new row `y` = prior `rowMaxHeight`
    (+ gap); heterogeneous heights pick the row max, not the last band.
  - A band wider than `wrapWidth` gets its own row, no empty leading row.
  - Continuous wrapping across tube boundaries in the cumulative variant.
- Manual: toggle on/off; adjust `wrapWidth`; rows don't overlap with mixed band heights.

## Out of scope

- Justification / packing optimization (simple greedy left-to-right only).
- Page/print pagination.
- Reflowing labels (they ride their band's origin).
