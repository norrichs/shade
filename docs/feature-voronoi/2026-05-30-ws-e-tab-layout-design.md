# WS-E · Smart adjacent tab layout (inner / outer)

**Status:** Spec — approved design, pending implementation plan
**Item:** #6
**Depends on:** nothing
**Blocks:** nothing
**Worktree:** isolated; implementer = Sonnet

---

## Goal

Add a `tabLayout: 'inner' | 'outer'` option controlling how **adjacent** (within-tube,
band-to-band "seam") tabs are allocated, relative to the tube's **center seam**. The center
seam keeps the existing `before`/`after` allocation; the other seams derive their side from
distance to center and the inner/outer choice.

---

## Background & definitions

- A tube has bands `0..N-1`. A **seam** sits between bands `i` and `i+1`
  (`i ∈ 0..N-2`). Position of seam `i` = `i + 0.5`. Tube center = `(N-1)/2`.
- The **center seam** is the seam closest to center. For even `N` this is the single middle
  seam (`i = N/2 - 1`, e.g. `N=6` → seam 2, between bands 2 and 3 — matches the brief).
- Each seam gets **one** tab, carried by exactly one of its two bands (on that band's
  `before` or `after` outer edge). Today this is governed globally by
  `tabConfig.bandEdge ∈ {'before','after','beforeAndAfter'}`.

### Worked example (from the brief: `before` + `inner`, bands 0–5)

```
center seam = between 2 and 3
0 — no tab
1 — tab on edge shared with 0   (inner: nearer-center band gets tab toward farther band)
2 — tab on edge shared with 1
3 — tab on edge shared with 2 (center seam, per `before`) AND edge shared with 4 (inner)
4 — tab on edge shared with 5
5 — no tab
```

This is internally consistent: every non-center seam's tab goes on the band **nearer** the
center, on the edge facing the **farther** band.

---

## Current state

`src/lib/cut-pattern/generate-outlined-pattern.ts`:

- `shouldHaveTab(edge, tabConfig, hasPartners, currentTube)` (`:348`) decides per-edge:
  - `after` side → tab if `hasPartners.after` and `bandEdge ∈ {after, beforeAndAfter}`.
  - `before` side → tab if `hasPartners.before` and `bandEdge ∈ {before, beforeAndAfter}`.
  - `end` side → tube-to-tube logic (unchanged here).
- This is **per-band**, with **no awareness of band index within the tube or the center
  seam** — so it can't express the inner/outer rule yet.
- `OutlinedTabConfig` (`types.ts ~:620-629`): `{ bandEdge?, bandEnd?, shape, tabWidth,
  inset? }`.
- `generateOutlinedBandPattern` (`:442`) receives `bandIndex` and per-band quads; the tube
  total band count is known in `generateOutlinedTubePattern` (`:554`,
  `alignedBands.length`).

---

## Design

### Type change

```ts
export type OutlinedTabConfig = {
  bandEdge?: TabEdgeOption;       // governs the CENTER seam only when tabLayout set
  bandEnd?: TabEdgeOption;
  tabLayout?: 'inner' | 'outer';  // NEW
  shape: TabShape;
  tabWidth: number;
  inset?: number;
};
```

When `tabLayout` is **undefined**, behavior is unchanged (legacy global `bandEdge`). When set,
the seam-aware rule below applies.

### Thread tube context into the decision

`shouldHaveTab` needs `bandIndex` and `bandCount`. Pass them down:

- `generateOutlinedTubePattern`: compute `bandCount = alignedBands.length`; pass `bandCount`
  into `generateOutlinedBandPattern`, which already has `bandIndex`.
- `generateOutlinedBandPattern` → `buildOutlinePath` → `shouldHaveTab`: add
  `{ bandIndex, bandCount }`.

### Seam-aware allocation

Define a helper deciding which band carries a given seam's tab:

```
seamTabOwner(seamIndex, bandCount, layout, centerRule): { band: number; edge: 'before'|'after' }
```

For seam `s` between bands `s` and `s+1`:

- **Center seam** (`s === centerSeamIndex`): allocate per `bandEdge`
  (`before` → band `s+1` on its `before` edge; `after` → band `s` on its `after` edge;
  `beforeAndAfter` → both). This preserves today's center behavior.
- **Non-center seam:** let `nearer` = the band of {`s`, `s+1`} closer to center,
  `farther` = the other.
  - `inner`: `nearer` carries the tab, on the edge shared with `farther`
    (if `nearer === s` → its `after` edge; if `nearer === s+1` → its `before` edge).
  - `outer`: `farther` carries the tab (opposite side).

`centerSeamIndex`: for even `N`, `N/2 - 1`. For odd `N` there is a center *band*
(`(N-1)/2`), not a center seam; the two seams adjacent to that band tie at distance 0.5.
**Tie-break:** treat the **lower** of the two tied seams as the center seam (deterministic),
and document it. (The brief only specifies even `N`; this keeps odd `N` well-defined.)

### shouldHaveTab integration

For `before`/`after` edges, when `tabLayout` is set:

1. Identify which seam this edge belongs to:
   - `before` edge of band `b` → seam `b-1` (shared with band `b-1`); only valid if `b > 0`.
   - `after` edge of band `b` → seam `b` (shared with band `b+1`); only valid if `b < N-1`.
2. Compute `seamTabOwner(seam, N, layout, bandEdge)` and return `true` iff the owner is
   `(this band, this edge)`. Still gate on `hasPartners[side]` (no partner ⇒ no seam ⇒ no tab).
3. `end` edges: unchanged.

When `tabLayout` is undefined: existing logic.

### UI

Add an `inner`/`outer` selector to the outlined-tab controls, next to `bandEdge`.

---

## Testing

- Unit: `centerSeamIndex` for `N` = 2,3,4,5,6 (even exact; odd → lower tied seam).
- Unit: `seamTabOwner` reproduces the worked example exactly for `before`+`inner`, bands 0–5.
- Unit: `outer` is the mirror of `inner` for every non-center seam; center seam identical to
  `before`/`after` in both.
- Unit: `shouldHaveTab` — for each band/edge in a 6-band tube, asserts the exact tab pattern
  from the example; `end` edges and no-partner edges unaffected.
- Unit: `tabLayout` undefined ⇒ byte-identical allocation to current behavior (regression).

## Out of scope

- End-cap (tube-to-tube) tab logic.
- Tab geometry/shape.
- Tiled patterns.

## Coordination notes

- Shares the "adjacent partner" notion with WS-D; keep the partner-presence source
  (`bandHasPartners` / facet `partner` meta) consistent.
- WS-C reads `tabsByIndex` to avoid anchoring self-tags on tabbed edges — its behavior should
  remain correct regardless of which edges this workstream tabs, since it reads the actual
  `tabsByIndex` result. No code coupling, but verify together at integration.
