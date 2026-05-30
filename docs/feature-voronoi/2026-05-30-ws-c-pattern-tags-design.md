# WS-C · Pattern tags: external group-code tag + self-tag relocation

**Status:** Spec — approved design, pending implementation plan
**Item:** #5
**Depends on:** WS-B (grouping codes — needs `buildBandCodeMap` / `code`)
**Blocks:** nothing
**Worktree:** isolated; implementer = Sonnet

---

## Goal

Two changes to outlined-band labels:

1. **External tag** — an optional toggle that appends the band's **group code** (from WS-B)
   to the self-tag text, space-joined (e.g. `t0/b1` → `t0/b1 0003`). Only when a code exists.
2. **Self-tag relocation** — anchor the self-tag to the **middle quad** of the band instead
   of the band start-cap. Choose one of the middle quad's two outer edges by a priority rule;
   keep the stem perpendicular to the chosen edge.

---

## Current state

- `src/lib/cut-pattern/compute-label-anchor.ts` — `computeOutlinedLabelAnchor(input)` takes
  `edgeStart`, `edgeEnd`, `interiorPoint`, `hasTab`, `tabWidth` and returns `{ anchor,
  autoAngle }`. **Edge-agnostic** — works for any edge, not just the start cap.
- `src/lib/cut-pattern/generate-outlined-pattern.ts`:
  - `getOutlineEdges` (`:170`) builds `OutlineEdge[]` in walk order: **before** edges
    `[0..n-1]` (quad `a→d`), **far-end** at `n`, **after** edges `[n+1..2n]` (quad `c→b`,
    walked backward), **near-end (start cap)** at `2n+1`. Each edge carries `interiorPoint`,
    `partnerOuter?`, and side tag.
  - `generateOutlinedBandPattern` (`:442`) currently finds the **start-cap** edge
    (`:511-517`) and computes `labelAnchor` from it (`:519-534`), storing
    `tagAnchorPoint` / `tagAnchorAutoAngle` on the `BandCutPattern` (`:541-542`).
  - `tabsByIndex: Map<edgeIndex, TabGeometry>` records which edges got tabs.
- `CutPatternRenderer.svelte` — receives `sortIndex`, resolves/flattens bands, renders
  `BandComponent` with `tagAnchorPoint` / `tagAngle`. Self-tag text/rendering lives in
  `BandComponent` → `PatternLabel.svelte`.
- Self-tag config (`types.ts` ~`:580-592`): `selfTag?: { enabled, height, angle, padding?,
  stemLength?, stemWidth? }`.

---

## Design

### Part 1 — External tag (group code)

- Add `externalTag?: boolean` to the self-tag config block in `types.ts`
  (sibling of `enabled`). Add a UI control alongside the existing self-tag controls.
- Thread the band→code map into rendering:
  - In `CutPatternRenderer.svelte`, build `const codeMap = buildBandCodeMap(sortIndex)` (WS-B)
    when `sortIndex` exists, and pass `groupCode={codeMap.get(bandKey(band.address))}` to
    `BandComponent`. Falls through both the indexed and tube-order render branches.
- In `PatternLabel.svelte`: when `selfTag.externalTag` is true **and** `groupCode` is defined,
  set the rendered text to `${selfTagText} ${groupCode}`. Otherwise unchanged.

> Codes only exist in end-connection mode (WS-B). In tube-order mode `groupCode` is
> undefined, so the external tag adds nothing — correct by design.

### Part 2 — Self-tag relocation to middle quad

Replace the start-cap anchor logic (`generate-outlined-pattern.ts:511-534`) with a
middle-quad anchor.

**Middle quad index.** With `quadCount = quads.length` quads indexed `0..quadCount-1`:

```
midQuad = Math.floor((quadCount - 1) / 2)   // "round down" → lower-middle for even counts
```

(Document this as the agreed interpretation of "the middle quad … round down if even.")

**Candidate edges.** The middle quad's two **outer** edges are its `before` (`a→d`) and
`after` (`c→b`) edges. Their indices in the `edges` array:

- before edge index: `midQuad`
- after edge index: `(quadCount + 1) + (quadCount - 1 - midQuad)` = `2*quadCount - midQuad`

(Verify against the documented walk order in `getOutlineEdges`; compute from the array by
matching `side` + quad rather than hardcoding if safer.)

**Edge selection priority** (pick the better of the two candidate edges):

1. **No tab** — prefer the edge whose index is **not** in `tabsByIndex`.
2. **No partner** — if tab-status ties, prefer the edge with no `partnerOuter` (no adjacent
   band on that side).
3. **Higher partner band number** — if still tied, prefer the edge whose adjacent partner
   band has the **higher band index** (read from partner facet metadata:
   `before` side partner = band-1 neighborhood, `after` side partner = band+1; derive the
   actual partner band number from the quad/facet `partner` meta rather than assuming ±1).

Encode as a comparator producing a deterministic winner; document the tie-break order.

**Anchor.** Reuse `computeOutlinedLabelAnchor` unchanged with the chosen edge's
`start`, `end`, `interiorPoint`, `hasTab` (is its index in `tabsByIndex`), and
`tabWidth` (`config.tabConfig?.tabWidth ?? 0`). It already returns an anchor on the outer
edge midpoint (shifted by tab width if tabbed) and a perpendicular `autoAngle` — exactly the
"stem perpendicular to the anchored edge" requirement. Store into
`tagAnchorPoint` / `tagAnchorAutoAngle` as today.

**Degenerate guard:** if `quadCount === 0`, keep current fallback (no anchor / `minPoint`).
If `quadCount === 1`, `midQuad = 0` (the only quad) — fine.

---

## Testing

- Unit: middle-quad index — `quadCount` 1,2,3,4,5 → `0,0,1,1,2`.
- Unit: edge-selection comparator — covers each priority tier and tie-breaks
  (both-tabbed/one-tabbed; partner present/absent; higher-band-number wins).
- Unit: anchor reuse — chosen edge feeds `computeOutlinedLabelAnchor`; `autoAngle` is
  perpendicular to the chosen edge (spot-check a known edge).
- Unit/render: external tag — text becomes `"<self> <code>"` only when `externalTag` and a
  code are present; unchanged otherwise.
- Manual: self-tags visibly sit on the middle quad, stem perpendicular, avoiding tabbed edges.

## Out of scope

- Changing tab geometry or allocation (that's WS-E).
- Tag rendering for tiled patterns (outlined only).
- New label config beyond `externalTag`.

## Coordination notes

- Consumes WS-B's `buildBandCodeMap` / `bandKey` / `code`. If B isn't merged yet, stub the
  import behind a guard so the self-tag relocation (independent of B) can be developed first.
- The self-tag relocation has **no** dependency on WS-B — only the external-tag part does.
