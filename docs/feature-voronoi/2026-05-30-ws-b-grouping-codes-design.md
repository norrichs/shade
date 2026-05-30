# WS-B · Pattern grouping codes

**Status:** Spec — approved design, pending implementation plan
**Item:** #4
**Depends on:** nothing
**Blocks:** WS-C (pattern tags), WS-D (CSV export)
**Worktree:** isolated; implementer = Sonnet
**Foundational** — land this first; C and D build on it.

---

## Goal

Give each band-sort **group** a sequential, zero-padded code string: `'0000'`, `'0001'`,
`'0002'`, … Expose a band→code lookup so downstream consumers (tags, CSV) can render and
reference it. The mechanism is **grouping-mode-agnostic**: codes attach to whatever groups a
mode produces. Today only end-connection mode produces meaningful groups, so only it
*populates* codes; tube-order keeps its existing built-in addressing and gets no codes.

---

## Current state

`src/lib/cut-pattern/band-sort-index.ts`:

```ts
export type BandSortGroup = { label: string; bands: BandRef[] };
export type BandSortIndex = { mode: BandSortMode; groups: BandSortGroup[] };
```

- `buildTubeOrderIndex` (`:5`) — one group per tube, label `Tube N`.
- `buildEndConnectionIndex` (`:13`) — walks rings via `band.meta.endPartnerBand`, one group
  per ring, label `Ring N`.
- `buildBandSortIndex(tubes, mode)` (`:61`) — dispatch.
- `sliceBandSortIndex` (`:70`) — range-slices groups.
- `bandKey(ref)` (`:3`) — `${globule}-${tube}-${band}` string key.

Consumed in `CutPatternRenderer.svelte` (`sortIndex` prop) to flatten/order bands.

---

## Design

### Type change

Add an optional `code` to groups:

```ts
export type BandSortGroup = { label: string; code?: string; bands: BandRef[] };
```

`code` is optional so modes that don't assign codes (tube-order) simply omit it; consumers
treat "no code" as "no group code".

### Code assignment

- **`buildEndConnectionIndex`**: when pushing each ring group, set
  `code: formatGroupCode(ringIndex)` where
  `formatGroupCode(n) = String(n).padStart(4, '0')`.
- **`buildTubeOrderIndex`**: leave `code` undefined (tube-order addressing is sufficient).
- Keep `formatGroupCode` exported (CSV and tags reuse it / parse it).

### Band → code lookup

Add a pure helper so consumers don't re-walk groups:

```ts
export const buildBandCodeMap = (index: BandSortIndex): Map<string, string> => {
  const map = new Map<string, string>();
  for (const group of index.groups) {
    if (group.code === undefined) continue;
    for (const ref of group.bands) map.set(bandKey(ref), group.code);
  }
  return map;
};
```

Keyed by `bandKey(ref)`. WS-C and WS-D consume this.

### Slicing

`sliceBandSortIndex` already spreads `...group`, so `code` is preserved automatically. Verify
no code-renumbering is desired after slicing (it is **not** — codes stay stable to their
original group identity).

---

## Testing

- Unit: `formatGroupCode` — `0 → '0000'`, `1 → '0001'`, `42 → '0042'`, `10000 → '10000'`
  (no truncation past 4 digits).
- Unit: `buildEndConnectionIndex` assigns sequential codes matching ring order; tube-order
  groups have `code === undefined`.
- Unit: `buildBandCodeMap` maps every band in coded groups; omits bands in uncoded groups.
- Unit: `sliceBandSortIndex` preserves `code` on sliced groups.

## Out of scope

- Rendering codes anywhere (that's WS-C / WS-D).
- New grouping modes (codes are designed to support them, but none are added here).

## Interface contract for downstream (C, D)

- `BandSortGroup.code?: string` — present only for coded modes.
- `buildBandCodeMap(index): Map<bandKey, code>` — the single source of truth for band→code.
- `formatGroupCode(n): string` — 4-wide zero-padded.
