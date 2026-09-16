# Pattern Splitting and Explicit Size Setting — Design

**Date:** 2026-09-16
**Branch:** `feature/pattern-splitting-and-explicit-size`

## Motivation

Two related additions to the page-layout side of pattern rendering.

**Pattern splitting.** A pattern piece larger than the configured page cannot currently be
produced at all — the page-layout algorithms detect the overflow and refuse
(`flex-wrap.ts:17-35`, `skyline.ts:109-138`), offering only a `requiredScale` that shrinks the
whole model. Splitting subdivides an over-large pattern into pieces that each fit a page. The
pieces are cut separately and glued back together, and the glued result must look like the
original, unsplit pattern.

**Explicit size setting.** `pageScale` is currently set either by hand as a raw multiplier
(`PageLayout.svelte:282-289`) or by accepting the "Fit page" toast's suggestion
(`CutPatternRenderer.svelte:297`). Neither lets you say "make this dimension 500mm". The panel
already displays derived real-world measurements; this makes those readouts editable, deriving
`pageScale` from the number typed.

The two features share the page-layout panel and the same `pageScale` plumbing, but are
otherwise independent and can be built in either order.

## Decisions

Settled during brainstorming; recorded here with rationale because several of them narrow the
implementation substantially.

| Decision | Choice | Consequence |
| --- | --- | --- |
| Split sources | Both hand-placed and auto-derived, from the start | Needs a persisted split list and a solver |
| Split address | Absolute quad index, scoped to a tube | Propagation to sibling bands is inherent, not a separate action; a band with fewer quads than the index gets no split there |
| Authority across regeneration | Auto-split materializes into the list; thereafter it is plain hand data | No live solver, no dual authority; out-of-range indices are dropped |
| Seam joinery | Pattern-type dependent | Tiled: existing band-end overlap. Outlined: new split-end tab. Panel: not applicable |
| Split site in pipeline | Partition the **flattened** band | Pieces are a literal partition of one flat layout, so the glued result is exactly the original pattern |
| Legal split positions | Only where `quadIndex % subunitCount === 0` | The `subunitCount` divisibility check needs no escape hatch |
| Explicit size intent | One-shot: sets `pageScale`, then forgotten | No persisted lock, no re-derivation on regeneration |

### Why the flattened band, and not the 3D band

Flattening is isometric and `alignBands`/`reAlignBand` are rigid, so partitioning the flattened
facet array yields pieces that are a literal partition of the parent's 2D geometry — the
property that makes the glued result identical to the original. Splitting the 3D band instead
would restart the flatten chain in each piece, rebuilding the seam edge independently on each
side, and would move splitting upstream into the worker's geometry stage. Splitting is a
per-pattern-type output concern, so it belongs in the pattern stage.

A secondary benefit: each piece is re-aligned onto its own long axis by the existing
`alignBands`, which packs better than inheriting the parent's orientation.

### Piece orientation: inherit the parent's flip

`reAlignBand` (`generate-tiled-pattern.ts:509-529`) rotates a band by π when
`facets[0].triangle.a.y < facets[last].triangle.a.y`, evaluated in that band's own
minimal-bounding-box frame. Run per piece, each piece evaluates this on its own facets in its own
frame, so two pieces of one parent can come out counter-rotated.

This is **not** a correctness problem, and an earlier draft of this spec wrongly said it was. A
π rotation is rigid, so it does not change a flattened piece's shape; `rotateFacets` does not
reverse the facets array, so `facets[0]` stays `facets[0]` and end identity survives; and
`getEndPartnerTransform` (`generate-pattern.ts:475-522`) derives its transform from live quad
geometry, which is already how it copes with bands sitting at different orientations within a
tube. Seam matching works either way.

It is a **consistency** problem, and worth fixing for that reason: when pieces of one band are
cut out and matched up by hand, they should all come off the page in the same orientation. So the
flip is decided once on the parent and inherited by every piece, while each piece still gets its
own minimal bounding box and normalization so packing stays per-piece.

Mechanically, the flip test reads post-rotation coordinates, so a parent boolean cannot simply be
handed to a piece whose bbox rotation differs. `splitFlatBands` therefore stamps each piece with
the parent's decision and `reAlignBand` prefers it over its own test:

```ts
// optional field on Band, set only on pieces
parentAscending?: boolean;

// in reAlignBand, replacing the bare local computation
const isAscending =
	band.parentAscending ??
	newBand.facets[0].triangle.a.y < newBand.facets[newBand.facets.length - 1].triangle.a.y;
```

An unsplit band has no `parentAscending`, so it falls through to today's computation and behaves
identically — which the Phase 0 snapshot asserts.

---

## Section 1 — Data model and addressing

### Persisted splits

A new optional field on `PatternConfig`, beside `pageLayout` (`types.ts:265`):

```ts
export type TubeSplits = {
	tube: number;
	quads: number[]; // absolute quad indices, sorted ascending
};

export type SplitConfig = {
	tubeSplits: TubeSplits[];
};
```

An array rather than `Record<number, number[]>`, so it round-trips through JSON and Drizzle
without integer keys becoming strings.

Because the field is optional, no migration is required in `validators.ts` — the same reasoning
the `fill` field records at `types.ts:753-757`. A validator alongside `validateProceduralFillConfig`
(`validators.ts:134-149`) drops out-of-range and duplicate indices; this is also where the
"quad count shrank, so the index is dropped" rule from the authority decision lives.

### Piece addressing

The `band` index stays stable. Pieces get their own address component:

```ts
export type GlobuleAddress_BandPiece = GlobuleAddress_Band & { piece: number };
```

Keeping `band` stable matters because band indices are load-bearing elsewhere:
`finishOuterEdge`'s last-band test (`generate-tiled-pattern.ts:284`), `totalBandCount`, the band
sort index, and saved selections. It also means `bandExpand`'s range expansion for
`adjustAfterTiling` (`generate-pattern.ts:167`) still reaches the correct neighbours without
change, because pieces live *inside* a band index rather than shifting indices.

A band with no splits keeps a plain `GlobuleAddress_Band` and is byte-identical to today, so
unsplit output is provably unchanged.

### Five sites to generalize

Each of these is currently wrong for a piece-bearing address. All five must be fixed, and each
gets a characterization test locking today's behaviour **before** it is touched.

| Site | Current behaviour | Fix |
| --- | --- | --- |
| `util.ts:294` `isSameAddress` | `strict` mode bails on `Object.keys(a).length !== Object.keys(b).length`, so a piece-bearing address never matches a plain one; with `strict = false` the field walk covers only globule/tube/band/facet/edge, so `piece` is silently ignored and two siblings match each other | Replace the key-length heuristic with an explicit granularity comparison; add a `piece` clause |
| `util.ts:277` `concatAddress` | Dispatches Facet → Band → Tube by `Object.hasOwn`. A piece address (band + `piece`, no `facet`) falls through to `concatAddress_Band` and drops `piece`, so sibling pieces produce identical strings — duplicate keys in `CutPatternRenderer`'s keyed `{#each}` | Insert a piece branch **before** the band branch; add `concatAddress_BandPiece` producing e.g. `g0t0b2p1` |
| `generate-pattern.ts:525` `findBandByAddress` | `tube.bands.find((b) => b.address.band === address.band)` — first match wins, so siblings always resolve to piece 0 | Match on `band` **and** `piece` |
| `helpers.ts:123-125` | Inline duplicate of the same lookup, with a positional fallback | Extract and share the one fixed helper |
| `bandKey`, in **four** copies: `band-sort-index.ts:10`, `band-partner-info.ts:52`, `build-pattern-csv.ts:5`, and a variant at `ProjectionGeometryComponent.svelte:96` used as a Svelte `{#each}` key | All are `` `${globule}-${tube}-${band}` `` and so collide between siblings | Export **one** shared `bandKey` and delete the copies, rather than editing four. `build-pattern-csv.ts:5` even carries the comment "WS-B's `bandKey` is module-private; we mirror its shape" — the duplication is known and this is the occasion to remove it |
| `band.id` generation, at **four** sites fed by `globalBandIndex` (`generate-tiled-pattern.ts:270`): `id` and `address` on the error-band return (`:303`, `:306`) and on the normal return (`:453`, `:463`) | Collide between siblings | Include `piece` in both the id string and the address at all four |

`band.id` is called out separately from the address because `collate-tubes.ts:34-38` documents
that `mergedBandPaths` is keyed by `band.id` and that ids like `outlined-band-{idx}` already
collide across pattern variants. Sibling pieces would collide identically, handing a piece
another piece's merged geometry. Fixing the address alone is not sufficient.

`BandRef` is a bare alias for `GlobuleAddress_Band` (`types.ts:29`), so the band sort index picks
up the piece component automatically once the address carries it — no separate change needed
there beyond the shared `bandKey`.

`GlobuleAddress_Quad` (`projection-geometry/types.ts:282`) already exists and is produced and
consumed by nothing. It is deliberately **left unused** by this design: splits are persisted as
a tube index plus plain quad indices, and the click handler identifies a boundary from
`band.address` plus a facet index already in lexical scope, so no quad-granular address is ever
constructed. It therefore needs no `concatAddress` branch. (Were it adopted later, note that it
would fall through to `concatAddress_Band` and silently drop `quad`, for the same reason a piece
address does.)

### Accepted behaviour change

`sliceBandSortIndex` (`band-sort-index.ts:104-118`) slices `group.bands` positionally. Once a
tube contains pieces, a saved band range selects a different set than it did before. This is
accepted rather than guarded.

---

## Section 2 — The split operation

### Module and insertion point

New pure module `src/lib/cut-pattern/split-flat-bands.ts`, inserted in
`generateTubeCutPattern` (`generate-tiled-pattern.ts:116-136`):

```ts
const flatBands = selectedBands.map((band) =>
	getFlatStripV2(band, { bandStyle: 'helical-right', pixelScale })
);
const splitResult = splitFlatBands(flatBands, splitQuads, subunitCount); // NEW
const alignedBands = alignBands(splitResult.bands);
const quadBands = alignedBands.map((flatBand) =>
	getQuadrilaterals(flatBand, pixelScale.value, flatBand.sideOrientation)
);
```

`splitQuads` is `tubeSplits.find((t) => t.tube === address.tube)?.quads ?? []` — the persisted
per-tube list from `patternConfig.splits`, selected by the tube being generated. An absent entry
yields an empty array and hence the no-op path.

`subunitCount` is not currently known at this point — it is resolved inside `generateTiling`
via `resolvePatternEntry` (`resolve-pattern.ts:7`). That call is pure and cheap, so it is
hoisted to the tube level and the resolved entry passed down, rather than resolving twice.

The equivalent insertion is needed in the outlined path, which performs the same
`getFlatStripV2` → `alignBands` → `getQuadrilaterals` sequence at
`generate-outlined-pattern.ts:621-626`.

### Legal split positions

```
legal  ⟺  quadIndex % subunitCount === 0  ∧  0 < quadIndex < quadCount
```

For `subunitCount === 1` patterns this is every quad boundary. For hexparquet
(`subunitCount === 3`, mapping subunit patterns to sets of three quads) it is every third
boundary — the split may only fall between `index % subunitCount === subunitCount - 1` and
`index % subunitCount === 0`.

Two consequences:

- **The divisibility check needs no opt-out.** `generateTiling` returns an `error` band when
  `quadBand.length % subunitCount !== 0` (`generate-tiled-pattern.ts:292-310`). If the parent
  satisfies that check — which it must today, or it would already be an error band — then
  cutting at a multiple of `subunitCount` leaves both pieces multiples too. The check passes
  untouched.
- **The even-facet constraint is subsumed.** Quad *k* begins at facet *2k*, always even, so
  `getQuadrilaterals`' `i % 2 === 1` pairing (`quadrilateral.ts:317`) can never drop a trailing
  facet. "Split at a quad boundary" is the only rule needed.

### Piece shape

```ts
type BandPiece = Band & {
	address: GlobuleAddress_BandPiece;
	parentQuadOffset: number; // this piece's first quad, in parent coordinates
	seamAt?: { start?: true; end?: true }; // which ends are cuts rather than original ends
};
```

These are added as **optional fields on `Band` itself**, not as a distinct subtype. `alignBands`,
`getQuadrilaterals` and `generateTiling` are all typed on `Band`, so a piece has to be assignable
to `Band` to flow through them unchanged; the type above is written as an intersection only to
show which fields a piece is guaranteed to carry. (This follows the precedent — and avoids
repeating the mistake — of `band.bounds`, which is written and read at
`generate-tiled-pattern.ts:478-480` but absent from the `Band` type, forcing the cast at `:305`.
These fields go on the type properly.)

The operation is array slicing only — no coordinate math — which is what makes the pieces a
provable partition of the parent's flat geometry.

`parentQuadOffset` exists so parent-coordinate reasoning survives the partition. Its first
consumer is label anchoring: a `TagAnchor` using `segmentIndex` would otherwise land somewhere
different after renumbering, while `quadEdge` and `anchorUnitPoint` anchors are unaffected.
`segmentIndex` anchors are resolved in parent coordinates via `parentQuadOffset` so existing
labels stay put.

`seamAt` only *declares* which ends are cuts. How each pattern family consumes it is Section 3.

### Return shape and degenerate input

```ts
{ bands: Band[]; rejected: { quad: number; reason: string }[] }
```

Illegal and out-of-range splits are dropped and reported, never clamped, consistent with the
authority decision. The report is surfaced in the UI so a dropped split is visible rather than
mysterious.

**No-op guarantee:** a tube with no splits returns its input array unchanged. This is the
property the characterization snapshots assert.

---

## Section 3 — Seam wiring per pattern type

### The `meta` all-or-nothing problem

Case analysis on a parent split into pieces P₀…Pₙ:

- Middle pieces have a seam at both ends. Both resolve; nothing breaks.
- P₀'s start and Pₙ's end are the parent's original ends. If such an end had no partner (a free
  outer end), today's rule drops `meta` **entirely** — so the seam at the piece's other end
  would get no matching either, and the split would silently fail to overlap.

The rule appears in three places: `generate-tiled-pattern.ts:465` and
`generate-outlined-pattern.ts:555-556` set `meta` only when both partner addresses resolve, and
`getEndPartnerTransforms` (`generate-pattern.ts:542`) gates both transforms on both addresses.

Of those three, **only the tiled one and `getEndPartnerTransforms` change.**
`generate-outlined-pattern.ts:555-556` is left exactly as it is, because outlined seams are
handled by the `splitEnd` tab keyed off `seamAt` (below) and never consult `meta` — so relaxing
it there would widen behaviour for no benefit.

### Fix, without touching unsplit behaviour

- Widen `BandCutPattern.meta.startPartnerBand` / `endPartnerBand` to optional
  (`types.ts:437-444`). This is deliberately type-driven: the compiler then enumerates every
  consumer that assumed both were present.
- `generateTiling`'s condition becomes *both resolve* **OR** *this band has a seam and at least
  one end resolves*. For a band with no `seamAt` this reduces to the current condition exactly,
  so unsplit output is provably unchanged.
- `getEndPartnerTransforms` computes each end's transform independently rather than gating both
  on both. Where both are present — every band today — the result is identical.
- `getTransformedPartnerCutPattern` (`helpers.ts:118`) returns `undefined` for an end whose
  partner is absent. Again identical wherever both existed.

### Tiled: no new pattern code

**A seam end is treated as an ordinary partnered end.** The piece's cut end is wired to its
sibling in the partner graph and the existing machinery runs unchanged: `endsTrimmed` removes
the piece's own transverse end line, then `replaceInPlace` snaps its vertices onto the
sibling's (`adjuster.ts:121-139`). That coincident-stroke overlap is the glue surface — a thin
region of paper present on both pieces.

The facet-index disambiguation at `helpers.ts:127` works out on its own: when P₀ asks which end
of P₁ to match, `isSameAddress(P₁.meta.startPartnerBand, P₀.address)` is true, so it takes P₁'s
facet 0 — P₀'s end meets P₁'s start. This is contingent on Section 1's piece-aware
`isSameAddress` and band lookup. With those in place, tiled splitting needs no per-pattern work.

Patterns lacking `spec.adjustments.partner.startEnd` / `.endEnd`, or with `endsMatched` off, get
a plain butt seam — the same treatment their ordinary band ends already receive.

### Outlined: a new split-end tab

A new field on `OutlinedTabConfig` (`types.ts:707-717`), beside `bandEnd`:

```ts
splitEnd?: TabEdgeOption; // 'before' | 'after' | 'beforeAndAfter'
```

The existing `bandEnd` branch cannot be reused. It decides tab ownership by comparing
`edge.endPartnerTube` against `currentTube` (`generate-outlined-pattern.ts:387-393`), and
sibling pieces share a tube, so the comparison is degenerate.

- `OutlineEdge` (`generate-outlined-pattern.ts:83-106`) gains `seamPartnerPiece?: number`, set
  by `getOutlineEdges` on a cap edge when the band has `seamAt`.
- `shouldHaveTab` gains a seam branch **before** the generic `side === 'end'` branch, comparing
  **piece** indices: `'before'` means the lower-indexed piece owns the tab, `'after'` the
  higher. This yields a tab on exactly one side of each split.

Unset by default, like `bandEnd` (`shades-config.ts:520-539`), so enabling splitting never
silently changes outlined output.

**Known limitation:** `shape: 'partner'` and `'partner-inset'` already degrade to `rectangle`
and `inset` on cap edges, because caps never carry `partnerOuter`
(`generate-outlined-pattern.ts:283-330`). Seam edges inherit this, so a split tab is effectively
rectangular, inset, or rounded. A partner-shaped split tab would require feeding the sibling's
edge geometry in, and is out of scope.

### Panel: splits ignored

One triangle per facet means partitioning a band changes no panel's geometry. Panel generation
operates on parent bands and never sees pieces. Nothing to configure.

---

## Section 4 — Click-to-place UI and auto-split

### Hit targets

The pattern SVG currently has exactly **one** hit target per band: the `<g role="button">` at
`BandComponent.svelte:123-139`, whose handler hardcodes `facet: 0` (`:104`). There is no
per-quad, per-facet, or per-edge target, and no screen→svg coordinate conversion anywhere in the
pattern view.

The existing quad DOM is not usable for this. `QuadPattern.svelte:37`'s quad paths are mounted
only when `showQuads || showLabels` (`BandCutPatternComponent.svelte:71`), carry
`class="hide"` with `opacity: 0` when `showQuads` is off, have no address attributes, and in the
`renderAsSinglePath` path a prepared merge collapses the whole band to a single `<path>`
(`BandCutPatternComponent.svelte:89`).

Instead: a **mode-gated overlay `<g>`** rendered inside `BandComponent`'s children snippet — the
one place where `band.address` and the facet index are both already in lexical scope, which
avoids needing to unpick the nested viewBox pair at `CutPatternSvg.svelte:30-40`. Each target is
a visible boundary line plus a fat transparent `<line>` as the click target, with
`stopPropagation()` so the band-level `onclick` (`:130`) does not also fire — the guard
`SegmentPathEditor.svelte:82-108` already uses for its per-vertex circles.

Boundary geometry needs no new math: quad *k*'s boundary with *k+1* is its `d→c` edge
(`quad[k+1].a === quad[k].d`, `quad[k+1].b === quad[k].c`), and `CutPattern.quad` is present on
every facet (`types.ts:281-297`).

Only legal boundaries get a target, so an illegal split position cannot be clicked.

### Interaction mode

A new `'quad-split-select'` variant in `interaction-mode.ts`, plus — mandatory — an entry in the
`interactions` map at `:89`; a mode without one leaves `interactions[$mode.type]` undefined and
`PointPick.svelte` dereferences it. 3D is unaffected: `Scene.svelte`'s `handleClick` branches on
known mode families, so an unrecognized type falls through to no action.

`interactionMode` is chosen over a local boolean because it is the codebase's established
mechanism for "clicks mean something different now", and it supplies the prompt banner.

### Propagation and toggling

Because splits are stored per tube, clicking one boundary applies tube-wide immediately.
Propagation is a consequence of the addressing, not a separate action. Clicking the same
boundary again removes it, matching the toggle semantics of `setAssemblerHighlight` and
`recordBandSelection`.

### Writes

Clicks write directly to `patternConfigStore.patternConfig.splits`, rebuilding object references
down the edited path (new `splits`, new `tubeSplits` array) rather than mutating in place,
because a panel reading through a `$derived` chain goes stale when a step returns the same
reference. One click therefore costs one regeneration. If that proves sluggish, batch behind an
explicit Apply.

### Auto-split

A button, consistent with the "materialize, then it is hand data" decision. It is a UI-side
computation over the already-generated pattern, not a pipeline stage:

1. Take the longest band in the tube. Splits are tube-wide, so sizing off the longest makes the
   result safe for its siblings.
2. Get the page content box from `buildPageGeom` (`registry.ts:11-28`).
3. Walk quad boundaries accumulating length, placing a split each time the next subunit group
   would overflow. Greedy first-fit, snapped to `subunitCount` multiples.
4. Write the result into `tubeSplits` as ordinary splits, indistinguishable from hand-placed
   ones.

### Placement

The `PageLayout.svelte` panel, which already owns `pageScale`, page size, the measurement rows,
and the measure-mode entry (`:70-76`). A new "Splits" group following the `PatternView.svelte`
header + enable + conditional-controls pattern: mode toggle, Auto-split, per-tube split count,
Clear splits, and a warning row listing splits dropped as out-of-range.

Existing splits draw as a distinct line across the band at all times, not only in split mode, so
piece divisions are always visible.

---

## Section 5 — Explicit size setting

### The input

A numeric field to the right of each model-size row (`PageLayout.svelte:333-341`) and each
measurement row (`:343-353`). Values are entered in the current `displayUnit` and converted with
the existing `fromDisplay` helper (`:27-29`). The field is left blank with a placeholder rather
than pre-filled, so it reads as "set to…" rather than as an editable mirror of the readout.

### The math

`derivePageDimensions` computes `mm = size / pageScale` (`units.ts:15-20`), so the inverse is
exact and requires no search:

```
pageScale = rawPatternUnits / targetMm
```

`raw` is `bounds.getSize().x|y|z` for a model-size row, or `a.distanceTo(b)` for a measurement
row (matching `deriveDistance`, `units.ts:31-35`). The row then reads back exactly the target.

Commit on Enter/blur, not per keystroke, to avoid a regeneration per digit. The write follows
the path the "Fit page" toast already uses (`CutPatternRenderer.svelte:297`), with references
rebuilt — but stores full precision rather than rounding up, since the goal is the number typed,
not a fit safety margin.

Because there is a single `pageScale`, setting any one row rescales all the others. This is
inherent and intended.

### Zero guard

`derivePageDimensions` has **no** zero guard, unlike its sibling `deriveDistance`
(`units.ts:32`, `pageScale || 1`). A target of 0 would set `pageScale = Infinity` and poison
every readout in the panel. Non-positive and non-finite targets are rejected at the input, and
`derivePageDimensions` is brought in line with `deriveDistance`. The latter is a latent bug
today, independent of this feature.

---

## Testing

**Characterization first**, before anything is touched:

- The four address helpers: `isSameAddress`, `concatAddress`, `findBandByAddress`, `bandKey`.
  `isSameAddress` especially, since its strict key-length mechanism is being replaced rather
  than extended.
- A full generated tube pattern with no splits, asserting byte-identical output after the
  address refactor.

**Unit:**

- `splitFlatBands`: legal-position filter, subunit snapping, facet-count conservation, no-op on
  empty splits, `rejected` reporting, `parentQuadOffset`.
- Inverse-scale round trip through `derivePageDimensions` and `deriveDistance`, including the
  zero guard.
- Auto-split solver: greedy fit, snapping, longest-band sizing.

**Integration:**

- Split a tube; assert both pieces' quad counts are multiples of `subunitCount`, neither is an
  `error` band, seam `meta` is symmetric, and piece-aware lookups resolve to the correct sibling.

**UI verification** uses the established headless recipe: dev server on port 9776, a `.mjs`
Playwright script at the repo root (so it can resolve `@playwright/test`), run with node.
Floaters are targeted by index into `nav .hover-button-container button` (index 0 is the
showMode toggle), because the HoverSidebar rail renders titles as split letters. The pattern
pane requires Geometry switched to Voronoi to be non-empty.

`npm run check` is judged on its diff from the ~434-error baseline, not on reaching zero.

## Build order

| Phase | Content | Verified by |
| --- | --- | --- |
| 0 | Characterization snapshots | Tests pass, nothing changed |
| 1 | Address generalization (the five sites) | Snapshots byte-identical |
| 2 | `splitFlatBands` + config + validator + pipeline insertion, no UI | Unit tests, hardcoded split |
| 3 | Seam wiring: `meta` widening + three consumers | Tiled seam overlaps end to end |
| 4 | Outlined `splitEnd` tab + its input | Visual check; outlined unchanged when unset |
| 5 | Split-placement UI + auto-split | Headless Playwright |
| 6 | Explicit size inputs | Unit tests + panel check |

Phase 6 touches nothing that phases 0–5 touch, and can land first as a standalone.

## Out of scope

- Partner-shaped (`'partner'` / `'partner-inset'`) split tabs for outlined patterns.
- A live constraint solver that re-derives splits on regeneration; auto-split is one-shot.
- A persisted size lock that holds one dimension across regeneration; size setting is one-shot.
- Guarding `sliceBandSortIndex` against positional drift once pieces exist.
- Splitting in more than one axis; splits partition a band along its length only.
