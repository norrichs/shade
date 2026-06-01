# Handoff: End-Connection Grouping Debug

Status as of this session. Goal: fix the **end-connection grouping** ("rings") so groups contain the
correct bands. Symptom: in the cut-pattern view, group `0000` shows **3** bands but should show **7**
(matching the working group `0001`).

This session did NOT fix the grouping bug. It (a) characterized the bug with live data, (b) built a
**band-selection / partner-inspection tool** to make further debugging tractable, and (c) fixed an
unrelated input bug that was blocking that tool. **Nothing is committed** — all changes are in the
working tree.

---

## 1. The actual bug (verified on live data)

Reproduction config: the default-loaded SuperGlobule in `localStorage` key `config-auto-persist`.
- Mode: **Voronoi Surface** (`patternSource: 'voronoiSurface'`), **Outlined** pattern, **End connection**
  band sort mode.
- voronoiConfig: icosahedron projector, seed `1089966294`, `pointCount: 27`,
  `surfaceProjectionDivisions: 2`. Generation is **deterministic** (verified: byte-identical partner map
  across regenerations).
- The displayed data is `voronoiSurfacePattern.projectionCutPattern.tubes` = **75 tubes, 450 bands**.
  ⚠️ NOT `store.data[0].data` (that's the 62-tube *projection* pattern — a wrong-object trap I fell into
  for a long time; measure the right object).

### What's actually wrong
Measured the band partner graph (`band.meta.startPartnerBand` / `endPartnerBand`) on the **correct**
75-tube voronoiSurface data:

```
reciprocity      556/616 directed edges (~90%)
degree histogram {2: 308}   ← every band-with-partners has undirected degree exactly 2
```

So the partner graph IS clean degree-2 / ~90% reciprocal (the user's mental model was right). My earlier
"degree-7, 50% reciprocal" numbers were an artifact of reading the wrong object — discard them.

**Grouping output today:**
- Current `buildEndConnectionIndex` (greedy walk): **173 groups incl. 98 singletons** — badly broken.
- Plain connected-components: **75 groups**, sizes `{2:4, 3:14, 4:9, 5:23, 6:24, 7:1}`.

**But neither gives 7 for group 0000.** Both put `t0/b0` in a **3-band** group `[t0/b0, t28/b0, t40/b0]`,
because the partner DATA only links those three:

```
t0/b0 : sp=t28/b0  ep=t40/b0     (degree 2)
t28/b0: sp=null     ep=null       ← only INCOMING edge from t0/b0; no outgoing partners
t40/b0: sp=null     ep=null       ← same
```

So the component genuinely dead-ends at 3. The grouping walk is ALSO broken (singletons), but fixing the
walk alone will NOT turn 3 into 7 — the missing band-level edges aren't in the data.

### Two distinct bugs, both real
- **Bug A — grouping walk** (`src/lib/cut-pattern/band-sort-index.ts`, `buildEndConnectionIndex`): the
  greedy single-neighbour walk fragments real components into singletons. Connected-components over the
  symmetric partner closure (A~B if either names the other) gives the sane 75-group result. This is a
  straightforward rewrite — but insufficient alone.
- **Bug B — partner data** (`*PartnerBand` derivation): `t28/b0` / `t40/b0` (and systematically the
  `b0`/`b2`-suffix bands) end up with `meta = undefined`, losing their partners. See §2.

### Why b0/b2 bands lose partners — open question
Band-level partner meta is derived in the cut-pattern stage and assigned **all-or-nothing**:
```ts
// generate-tiled-pattern.ts:269 and generate-outlined-pattern.ts:531
meta = startPartnerBand && endPartnerBand ? { startPartnerBand, endPartnerBand } : undefined
```
If only one end resolves, BOTH partners are dropped. The reader takes the partner off a single facet
edge:
- Outlined (`generate-outlined-pattern.ts:523`): `band.facets[0].meta.ab.partner` and
  `band.facets[last].meta.ab.partner` (hardcoded `ab`).
- Tiled (`generate-tiled-pattern.ts:214-217`): `facets[0].meta[edges[0].base].partner` and
  `facets[last].meta[edges[1].second].partner`.

**3D facet meta IS present** on the voronoiSurface tubes (`facet.meta.{ab,bc,ac}` exist). For the broken
`t28/b0`, the 3D facets actually carry partners — e.g. its *last* facet has `ab → t0/b0`, but its
*first* facet's outward edge has **no cross-tube partner** (geometrically a true boundary: that end sits
at a voronoi cell center and shares no edge with any other tube — confirmed by vertex-coincidence test,
facets are NOT degenerate, there's simply nothing there to match).

### CRITICAL unresolved design question (ask the user first)
Is the `b0` "ring" SUPPOSED to close into 7 like the b1/b4 ring, or is it geometrically a 3-band open
chain? The user gave key topology context near the end:

> For a projection/voronoi surface tube, divide the tube's bands into halves. For a 4-band tube,
> `[b0,b1]` contribute to one voronoi cell / polygon, `[b2,b3]` to another. Tubes can be oriented in any
> direction — so a single ring may mix e.g. `b0`+`b3` or `b1`+`b2`. The **innermost** ring is composed of
> bands with either the **lowest or highest** index of their tube; one ring out uses indices
> `(1, last-1)`, etc.

So a ring is NOT "all same band-suffix." The grouping must follow the partner graph across tubes, and the
b0 trio being only 3 is most likely a **partner-data** problem (Bug B), not "b0 is supposed to be small."
But CONFIRM the expected ring composition with the user before assuming 3→7 is the target.

Band-suffix → component-size pattern observed (sample member mixes):
```
size 3: all b0   (also a separate all-b2 component)
size 7: b1×4, b4×3        ← the working one
size 4/5/6: b1/b3/b4 mixes
```

---

## 2. Where to dig next (Bug B)

Trace why `b0`/`b2` end-facets don't carry a cross-tube partner on the edge the band-reader reads.

Upstream matchers for the voronoiSurface path (`src/lib/projection-geometry/generate-projection.ts`):
- `generateSurfaceProjectionBands` (~line 1224) → calls, in order (~line 1390):
  1. `matchSurfaceProjectionCrossBandPartners` (~1411) — within-tube cross-band (shared middle edge)
  2. `matchSurfaceProjectionTubeEnds` (~1504) — cross-tube end-facet matching (the end connections)
  3. `matchSurfaceProjectionSequentialPartners` (~1448) — within-band sequential, preserves prepopulated
- `matchSurfaceProjectionTubeEnds` was instrumented this session and measured CLEAN on this data:
  `endFacets=120, matchPairs=60, WRITTEN_EDGES={"ab":120}`, 0 degenerate, 0 unmatched, 0 overwrites,
  mutual both-direction writes. (Note: that run reported 30 tubes — it was a *surfaceProjection* probe,
  NOT the 75-tube voronoi path. Re-instrument on the actual voronoiResult path before trusting it.)
- NOTE the project's recent git history is all `feat(fillAll)` voronoi work that "skip[s] degenerate
  facets in partner matchers" — degenerate-facet handling there is a prime suspect for dropped partners.

Suggested next step: with the NEW selection tool (§3), click the 7 bands that visually form a ring and
the 3 that form the broken group, record their addresses, then dump each one's 3D facet `meta.{ab,bc,ac}`
on the voronoiSurface tubes to see exactly which end-facet edge is missing a partner and why.

Reusable reader: `src/lib/cut-pattern/band-partner-info.ts` → `getBandPartnerInfo(tubes, address)`
returns `{ startPartners, endPartners }` reading ALL three edges of both end facets (cross-tube only),
i.e. ground truth independent of the all-or-nothing band derivation.

---

## 3. New tooling built this session (UNCOMMITTED, in working tree)

A generalized **click-to-select band + partner readout** for ANY 3D geometry source. Verified working.

New files:
- `src/lib/cut-pattern/band-partner-info.ts` — `getBandPartnerInfo`, `formatBandAddress`. Reads end-
  connection partners straight from 3D facet meta. + `__tests__/band-partner-info.test.ts` (5 tests).
- `src/components/three-renderer/selection-helpers.ts` — `handleFacetSelect` (nearest-intersection guard
  + records selection) and `isNearestIntersection`.
- `src/components/projection/BandSelectionPanel.svelte` — floating readout panel (top-left of 3D pane),
  lists clicked bands with `start → …` / `end → …` partners; click toggles, "clear" empties.

Modified:
- `src/lib/stores/selectionStores.ts` — added `GeometrySource`, `tubesForGeometrySource`,
  `selectedBandLog`, `recordBandSelection`, `clearBandSelectionLog`, derived `selectedBandLogInfo`.
- `src/components/projection/ProjectionGeometryComponent.svelte` — all 5 facet sources (projection,
  surfaceProjection, voronoi, voronoiSurface, globuleTube) route clicks through `handleFacetSelect`;
  non-interactive meshes (surface, bands, sections) got `raycast={noRaycast}` so they don't swallow
  facet clicks. Added `facetKey()` for `{#each}` keys.
- `src/routes/designer2/+page.svelte` — mounts `<BandSelectionPanel />` OUTSIDE `<Canvas>` (Scene's own
  DOM readout never renders because Scene is inside the Canvas).
- `src/components/three-renderer/Scene.svelte` — see §4.

`npm run build` clean; `npx jest src/lib/cut-pattern src/lib/stores` → 139/139 pass.

There are two pre-existing `console.debug("Scene click")` / `"handleProjectionClick"` lines in
`Scene.svelte` that are the USER's, not from this session — leave them.

---

## 4. The selection-tool input bug we fixed (root cause + fix)

Clicking did nothing on the user's machine while programmatic clicks worked. Root cause: **OrbitControls**
(`@threlte/extras`, in `DesignerCamera.svelte`) shares the canvas. A **touchpad** tap drifts a few pixels
between press and release; Threlte's interactivity treats a `click` as a selection only if movement
≤ `clickDistanceThreshold` (default **8px**) — so touchpad taps were classified as camera-orbit drags and
never fired `onclick`. (Tell: ctrl-click shows no context menu over the Scene — OrbitControls owns the
pointer there.)

Fix applied in `Scene.svelte`:
```ts
interactivity({ clickDistanceThreshold: 25 });
```
Confirmed working by the user. Versions: `@threlte/core` 8.5.14, `@threlte/extras` 9.18.0, Svelte 5.
(`onclick` lowercase on `<T.Mesh>` is correct for this version; `<Interactivity />` component does NOT
exist here — only the `interactivity()` function.)

---

## 5. Gotchas / lessons for the next session

- **Measure the right object.** Displayed voronoiSurface data =
  `superGlobulePattern... voronoiResult.surfaceProjectionTubes` (3D) /
  `voronoiSurfacePattern.projectionCutPattern.tubes` (cut pattern), 75 tubes. NOT the 62-tube projection.
- **HMR is unreliable with Threlte interactivity.** After editing scene/handler code, do a FULL page
  reload (Cmd+Shift+R); ~15 rapid HMR updates desynced the interactivity plugin and made clicks dead.
- **`bd` / beads** is the task tracker for this repo (see SESSION CLOSE PROTOCOL). Not used this session.
- In-app debug: the Utilities floating editor has "Print all data" (`$superGlobuleStore`, the 3D data)
  and "Print patterns" (`$superGlobulePatternStore`, the cut-pattern data) buttons.
- To read partner graph in the browser console quickly, import the live store:
  `const m = await import('/src/lib/stores/index.ts'); let sg; m.superGlobuleStore.subscribe(x=>sg=x)();`
  then walk `sg.voronoiResult.surfaceProjectionTubes`.

## 6. Recommended first actions next session
1. Ask the user to confirm expected ring composition for the b0 group (3 vs 7) given §1 topology notes.
2. Use the selection tool: click the visually-correct ring + the broken group, record addresses.
3. Dump those bands' 3D facet `meta` and find which end-facet edge lacks a cross-tube partner.
4. Trace into the surfaceProjection matchers (§2), focusing on degenerate-facet skipping, on the 75-tube
   voronoi path (re-instrument; the earlier clean reading was the wrong path).
5. Then fix Bug B (data) and Bug A (grouping walk → connected-components) together; the user previously
   chose "Both, B first".
