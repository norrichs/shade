# WS-D · Pattern map CSV export

**Status:** Spec — approved design, pending implementation plan
**Item:** #7
**Depends on:** WS-B (grouping codes — needs `code` / `buildBandCodeMap` / `formatGroupCode`)
**Blocks:** nothing
**Worktree:** isolated; implementer = Sonnet

---

## Goal

A downloadable CSV describing the pattern well enough to reconstruct assembly relationships.
Two layouts, chosen by the active band-sort mode. UI: a nav-bar button that reads **"Make
CSV"**, switches to **"Download CSV"** once generated, then downloads on click.

---

## Current state

- `src/components/nav-header/NavHeader.svelte` (~`:128-183`) — button group containing the
  existing two-step **"Prepare Download" → "Download SVG"** flow (`runPrepare()` populates a
  store, then `downloadSvg()` serializes). Mirror this pattern.
- `src/lib/util.ts` — `downloadSvg` (file-download helper precedent).
- WS-B provides `BandSortIndex` with `code` per group, `buildBandCodeMap`, `formatGroupCode`.
- Band relationships available from metadata:
  - **End partners:** `band.meta.startPartnerBand` / `endPartnerBand` (`GlobuleAddress_Band`).
  - **Adjacent (within-tube) partners:** derived from facet `partner` metadata / neighbor
    bands in the same tube (the before/after neighbors used by outlined tab logic).

---

## Design

### Button (NavHeader)

Add a button beside the SVG export controls with local state:

```
state: 'idle' | 'ready'
label: state === 'idle' ? 'Make CSV' : 'Download CSV'
onclick:
  idle  → build CSV string, stash in a local var / store, set state='ready'
  ready → trigger download (Blob + anchor, like downloadSvg), keep state='ready'
```

Reset to `idle` when the underlying pattern/sort changes (subscribe to the same stores that
invalidate the SVG, or reset on regenerate).

### CSV builder (`src/lib/cut-pattern/build-pattern-csv.ts`)

Signature (pure, testable):

```ts
buildPatternCsv(index: BandSortIndex, tubes: TubeCutPattern[]): string
```

Branch on `index.mode`:

#### Mode `end-connection-tube` — row per ring group

| col 1 | col 2 | cols 3… |
|-------|-------|---------|
| ring code | partner ring codes (deduped) | constituent members `t{tube}/b{band}` |

- **Ring code:** `group.code`.
- **Partner ring codes:** for every member band in the group, find its **adjacent**
  partner bands (before/after neighbors). For each adjacent partner, look up its ring code
  via `buildBandCodeMap`. Collect across all members, **dedupe**, **exclude the group's own
  code**. (Example from the brief: a 3-member ring whose members each have 2 adjacent
  partners → up to 6 partner codes → dedupe.)
- **Members:** one column per member, value `t{tube}/b{band}` (use `group.bands` order).

#### Mode `tube-order` — row per band

| col 1 | col 2 | col 3 |
|-------|-------|-------|
| `t{tube}/b{band}` | adjacent `t/b` addresses | end-partner `t/b` addresses |

- **Address:** the band's own `t{tube}/b{band}`.
- **Adjacent:** within-tube before/after neighbor addresses.
- **End partners:** `meta.startPartnerBand` / `endPartnerBand` formatted `t/b` (dedupe,
  omit missing).

### CSV formatting

- Plain comma-separated. Variable column count per row is acceptable (it's a map, not a
  rectangular table) — but quote any field containing a comma/space-list per RFC 4180 if
  multiple values share a cell. Prefer: multi-value cells use a single quoted field with
  space- or semicolon-separated values, so column positions stay stable.
- A header row labeling the columns for the active mode.

---

## Testing

- Unit: `buildPatternCsv` (end-connection) — fixture with a known ring structure asserts
  ring code, deduped partner codes (self excluded), and member columns.
- Unit: `buildPatternCsv` (tube-order) — fixture asserts address, adjacent, and end-partner
  columns; missing partners omitted cleanly.
- Unit: CSV quoting — multi-value cells stay in one column; no stray commas break alignment.
- Manual: nav button cycles Make → Download; file downloads and opens in a spreadsheet.

## Out of scope

- Geometry/coordinate dumps (this is a relationship map, not a vector export).
- SVG changes.
- New grouping modes.

## Coordination notes

- Hard dependency on WS-B for `code` + `buildBandCodeMap` + `formatGroupCode`. Build after B
  merges (or against B's branch in the worktree).
- Reuses the established "adjacent partner" derivation; confirm the exact metadata source
  shared with WS-E (`bandHasPartners` / facet `partner` meta) to avoid two divergent
  notions of "adjacent".
