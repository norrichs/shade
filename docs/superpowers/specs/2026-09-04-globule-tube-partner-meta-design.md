# Partner Meta for Plain Globule Tubes

**Date:** 2026-09-04
**Status:** Approved design, ready for implementation planning
**Follows:** `docs/superpowers/specs/2026-09-03-grid-pattern-edge-segment-drop-design.md`

## Problem

Grid-pattern edge-segment dropping gates on whether a band's outer long edge has an
adjacent partner band, read from `facet.meta` in the 3D facet graph. Plain globule
tubes never populate that meta, so the gate is always false and the feature is inert
on them.

`generateGlobuleTube` (`src/lib/generate-shape.ts:869`) builds its bands with
`generateProjectionBands` — the same function projections use — but never runs the
partner-matching step. `matchTubeEnds` and `matchFacets` are called only from the
multi-tube pipeline (`src/lib/projection-geometry/generate-projection.ts:830-831`),
and no other site assigns `facet.meta` on this path. So every globule-tube facet has
`meta === undefined`, `bandHasFreeSide` returns true on the first facet it checks,
and `hasOuterPartner` is false for every band.

Edge-segment dropping on globule tubes is a requirement, not a nice-to-have.

## Scope

In scope: populating `facet.meta` for globule tubes, honestly.

Explicitly NOT in scope: no change to the drop feature itself. The pattern path is
already wired correctly — `globuleTubes` flow through `patternFor()` →
`generateProjectionPattern` → `generateTubeCutPattern` → `generateTiling`, which
passes `bands` and therefore computes `hasOuterPartner` per band. Once the meta
exists, dropping works with no further wiring. (The legacy
`generateSuperGlobulePattern` → `generateTiledBandPattern` path does NOT forward
`bands`, but globule tubes do not use it; leave it alone.)

Also NOT in scope: fixing `getFacetEdgeMeta`'s unconditional wrap, or the dead
`finishOuterEdge` condition that follows from it. Both are recorded in the previous
spec.

## Topology

`generateProjectionBands`' axial branch builds one band per `f` in
`[0, sectionLength - 1)`, and `generateFacetPair` indexes `points[pointIndex]` and
`points[pointIndex + 1]` with **no modulo**. So band `f` spans `p_f → p_(f+1)`, and
there are `sectionLength - 1` bands.

The consequence is that whether the tube closes is decided entirely by whether the
section's point list ends where it began:

- **Closed** — `points[last]` coincides with `points[0]`. Band `N-2`'s outer edge
  lands exactly on band 0's inner edge; the wrap is real.
- **Open** — `points[last]` is elsewhere. The wedge between `points[last]` and
  `points[0]` is covered by no band, and the last band's outer edge is genuinely
  free.

Globule cross-sections usually close but not always, so closure must be detected,
never assumed.

**Closure test — spatial proximity, not identity.** Use a tolerance _relative to the
section's own point spacing_, not a fixed absolute epsilon: globule coordinates are in
model units, and a fixed epsilon would misjudge very large or very small globules. A
section closes when the gap between its endpoints is negligible against the distance
between neighbouring points:

```
closingGap    = points[0].distanceTo(points[points.length - 1])
meanSpacing   = mean over i of points[i].distanceTo(points[i + 1])
sectionCloses = closingGap < meanSpacing * CLOSURE_RATIO      // CLOSURE_RATIO = 0.01
```

This is decisive because the two cases are far apart, not marginal: a closed profile
carries a duplicate closing point, so the gap is ~0, while an open one leaves a wedge
on the order of a full point spacing. Anything near the threshold is malformed input,
and the conservative branch handles it.

The tube is closed only when **every** section closes; if they disagree, treat the
tube as open. Failing to drop segments is a cosmetic miss; punching holes in an edge
that should be solid ruins a cut.

Do not reuse `FILL_DEGENERATE_EPSILON` (`src/lib/projection-geometry/fill-bands.ts:6`,
`1e-6`) — that is an absolute threshold for zero-length edges, a different question
from whether a profile closes.

This mirrors how `bandHasFreeSide` already works — read topology from the geometry,
not from config. There is no `closed`/`sweep` flag on `ShapeConfig` or `LevelConfig`
to read even if we wanted one.

## Design

### A sibling function, not a reuse

Add `matchGlobuleTubeFacets(tube: Tube): void` to
`src/lib/projection-geometry/generate-projection.ts`, beside `matchFacets` and
`getFacetEdgeMeta`. It belongs with the other partner-matching code and reuses
`getEdge`/`EDGE_MAP`, so edge naming stays in one place and `generate-shape.ts` does
not grow.

It is a sibling rather than a call into `getFacetEdgeMeta` for two reasons, both
structural:

1. `getFacetEdgeMeta` throws when a first facet lacks `meta[base]` or a last facet
   lacks `meta[second]`. Those are normally seeded by `matchTubeEnds` from a
   _neighbouring tube_. A standalone globule tube has no neighbour and two genuinely
   open ends, so there is nothing to seed them with.
2. `getFacetEdgeMeta` sets `edgeMeta[outer].partner` unconditionally via
   `(b + bandOffset + bandCount) % bandCount`, with no check that the wrap is
   topologically real. That is exactly the false-positive this design must not
   reproduce.

### What it assigns

For each band `b` and each non-degenerate facet `f` (skip `facet.isDegenerate`
exactly as `matchFacets` does), using
`getEdge('base' | 'second' | 'outer', f, band.orientation)`:

| Edge     | Partner                  | Omitted when                                                         |
| -------- | ------------------------ | -------------------------------------------------------------------- |
| `base`   | facet `f - 1`, same band | `f === 0` — the tube's open start end                                |
| `second` | facet `f + 1`, same band | `f === facetCount - 1` — the open end end                            |
| `outer`  | band `b + bandOffset`    | `partnerBand` falls outside `[0, bandCount)` AND the profile is open |

where `bandOffset` is the same expression `getFacetEdgeMeta` uses:

```
bandOffset  = (orientation === 'axial-left' ? -1 : 1) * (f % 2 === 0 ? -1 : 1)
partnerBand = b + bandOffset          // NOT wrapped yet — the wrap is conditional
```

When `partnerBand` falls outside `[0, bandCount)`: wrap it modulo `bandCount` if the
profile is closed, and omit the `outer` partner entirely if it is open. This
conditional wrap is the single substantive difference from `getFacetEdgeMeta`, which
wraps unconditionally.

The omissions carry the meaning. An absent partner is what makes `bandHasFreeSide`
return true, which is what keeps a genuinely free edge solid.

### Pruning against the rendered set

`generateGlobuleTube` runs `getRenderable(config.renderConfig, bands)` after
generating bands, which can slice the set to a subset (its `'slice'` mode rotates
through `[...shapes, ...shapes]`, so a full-count slice is a rotation and a
partial count is a true subset).

Assign meta over the **full generated set**, so every partner names a real band and
indices stay consistent with `facet.address` (which is assigned pre-filter). Then
make a second pass over the **rendered** set and drop any `outer` partner pointing at
a band that did not survive filtering.

This gets both properties: truthful addresses and truthful cut edges. Slice out bands
3-7 and band 3's outer partner is pruned, so its edge stays solid on the cutting bed.
It fails in the safe direction — a pruned partner means "do not drop", never "punch
holes in a free edge".

### Type change

`FacetEdgeMeta.partner` is currently non-optional, so today "omitted" can only mean
the edge key is absent from the meta object. `bandHasFreeSide` already reads
`facet.meta?.[edge]?.partner`, so absence works at runtime, but the type cannot
express it. Make the three keys of `Facet['meta']` optional so the omission is
expressible rather than cast around.

Check whether this widening produces new `npm run check` errors at existing read
sites. If it does, fix those reads; do not revert the type change to avoid them.

## Testing

Unit tests over synthetic tubes, in `src/lib/projection-geometry/__tests__/`:

1. **Closed profile** — every band has an `outer` partner, including the last (its
   partner is band 0). First facet of each band has no `base`; last facet has no
   `second`.
2. **Open profile** — the last band's `outer` partner is absent; every interior
   band still has one.
3. **Closure detection** — a profile whose endpoints sit within the relative tolerance reads as
   closed; one just outside it reads as open; sections that disagree read as open.
4. **Degenerate facets** — facets flagged `isDegenerate` are skipped and keep
   whatever meta they had.
5. **Pruning** — with a render config that slices the band set, outer partners
   pointing outside the rendered set are absent, and partners inside it survive.
6. **Regression** — `npm run check` total does not rise above the ~434 baseline;
   the full unit suite (85 suites / 653 tests at time of writing) stays green.

### What tests cannot cover

That the drop actually appears on a globule in the app. That is a visual check in
`/designer2` with a globule selected and `Drop Edge Segments` on, using the headless
Playwright script from the repo root against the dev server on port 9775. Note that
the visual difference is small — the previous feature's change measured 236 pixels in
a full viewport — so compare crops or a pixel diff, not whole screenshots.
