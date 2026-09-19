# Pattern pipeline performance: design

Date: 2026-09-07. Branch: `perf/pattern-pipeline`.

## Problem

On the saved config "flattened voronoi solid sphere" (144 voronoi tubes, 1,440 bands,
17,460 facets, 36,860 SVG `<path>` elements) the 2D pattern pane freezes the page for
roughly a minute on every interaction.

Measured with a CDP CPU profile (scripts: `perf-profile.mjs`, `perf-run.ts` at the
worktree root, throwaway):

| Action                                           | Wall time            | Dominant cost                                                                                               |
| ------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Load config                                      | 47 s                 | geometry worker: brute-force closest-point scan in `smooth-chains.ts` (out of scope here, see Tier 3 below) |
| Pattern generation (flatten, tile, path strings) | 0.4 s                | negligible                                                                                                  |
| One pan click                                    | 75 s dev / 91 s prod | render cascade on the main thread                                                                           |
| One zoom click                                   | 58 s prod            | same cascade; only a `viewBox` string needed to change                                                      |

The cascade: any write to `patternConfigStore` (zoom, pan, toggles, range) re-runs the
`$:` block in `PatternViewer.svelte` because it reads
`$patternConfigStore.patternViewConfig.patternSource`. `collateTubes` returns a new
array, so the `tubes` prop of `CutPatternRenderer` changes identity, `filteredTubes`
re-slices every tube and band, and every band's label footprint
(`buildSelfTagLines` + `effectiveBandBounds` + `buildLabelOutlinePath`) is recomputed
three to four times (origins, alignedY, pivotFor, toLayoutItems), the skyline page
layout reruns, and every `BandComponent` receives a fresh `pivot` object, so every
keyed `{#each}` item re-renders. Svelte runtime bookkeeping over ~37k paths is about
half the time; the rest is the redundant layout math and GC.

Pattern generation itself runs synchronously inside a derived store on the main thread,
and the initial geometry generation on page load is also synchronous on the main thread.

## Goals

1. Zoom, pan and display toggles must not recompute layout or re-render bands.
2. Pattern regeneration (parameter change, range change) must not block the UI and must
   show the existing "...working" indicator.
3. Reduce DOM node count where it costs nothing visually.
4. No change to SVG output for a given config.

Out of scope (Tier 3, separate PR): replacing the linear closest-point scan in
`SurfaceProjector.closestPoint` with `MeshBVH.closestPointToPoint`.

## Design

### Tier 1: stop the cascade on view-only changes

**1a. Isolate the pattern source.** Export the existing `patternSourceStore`
(`superGlobuleStores.ts`) and use it in `PatternViewer.svelte` instead of reading
`$patternConfigStore`. `collateTubes` then only reruns when the pattern result, the view
controls, or the source change.

**1b. Hoist per-band layout into one derived value.** In `CutPatternRenderer.svelte`,
replace the ad hoc `effBoundsFor` / `pivotFor` / `minPoint` calls in three template
branches with a single `$derived` array of placed bands:

```ts
type PlacedBand = {
	band;
	tube;
	key;
	origin: Point;
	rotation: number;
	pivot: Point;
	tagAnchorPoint: Point;
	groupCode?: string;
};
```

Effective bounds are computed once per band per layout pass through a small pure module
`src/lib/cut-pattern/band-layout.ts` (`buildEffectiveBoundsIndex`, `placeBands`) so the
math is unit-testable without Svelte. Object identity of `pivot`, `origin`, and
`tagAnchorPoint` is then stable across renders that do not change layout inputs.

**1c. Quiet `persistable`.** Remove the `SET PERSISTABLE` console.log that serialises the
whole config on every store write. Debounce the localStorage write (trailing 250 ms) and
flush on `pagehide` so a reload immediately after a change still persists.

### Tier 2: non-blocking regeneration and fewer DOM nodes

**2a. Pattern generation in the worker.** Extend `super-globule.worker.ts` with a
`pattern` message. The worker keeps the most recent `SuperGlobule` it generated (with
live Three.js objects) keyed by its `requestId`, so the pattern request carries only the
small inputs:

```ts
{
	type: 'pattern';
	requestId;
	geometryRequestId;
	superConfig;
	genConfig;
	gates;
}
```

The body of today's `superGlobulePatternStoreInternal` moves to a pure function
`runPatternGeneration(superGlobule, superConfig, genConfig, gates)` in
`src/lib/cut-pattern/run-pattern-generation.ts`, called by the worker and, as a
fallback, on the main thread when the current geometry did not come from the worker
(SSR, tests). `workerStore.ts` records which `SuperGlobule` instance came from which
request in a `WeakMap`.

Results cross `postMessage` and lose prototypes, so `rehydratePatternResult` in
`src/lib/workers/rehydrate.ts` rebuilds `Vector3` (quad corners, `bounds.center`) and
`Triangle` (`facet.triangle`, `facet.triangles`, tab triangles) for every band. The
existing `rehydrateSuperGlobule` moves into the same module so both directions share
code. If the worker's cached geometry id does not match, it replies `stale` and the main
thread ignores it; the next geometry result triggers a fresh pattern request.

`superGlobulePatternStore` becomes a writable fed by a debounced (150 ms), latest-wins
async request. This also removes the current bug where the derived callback's `return
lastPatternResult` is treated by Svelte as a cleanup function. A new `isPatternWorking`
store is OR-ed into `isGenerating`, so the header indicator shows during pattern work.

**2b. Initial geometry generation goes through the worker too.** The first
`superConfigStore` subscription currently runs `generateSuperGlobule` synchronously for
"fast first render"; on this config that is a 46 s freeze on every page load. In the
browser it now uses `triggerAsyncGeneration` like every later change.

**2c. Skip hidden quad overlays.** `QuadPattern` emits a `<g>` and a hidden `<path>` per
facet even when `showQuads` and `showLabels` are both off. Render it only when one is
on. This removes ~35k DOM nodes from the default view. Per-facet pattern paths stay as
they are because they carry per-facet stroke widths.

## Testing

- Unit (Jest): `band-layout` (bounds computed once per band, stable identity,
  alignment), `persistable` debounce and flush (fake localStorage), `rehydrate` for the
  pattern result shape, `runPatternGeneration` returning the same structure as the old
  derived body on a small fixture, worker message routing (`stale`, `missing`).
- Manual/perf: rerun `perf-profile.mjs` for load, zoom, pan, range before and after and
  record the numbers in the PR. Visually confirm the pattern pane, band click selection,
  labels, and Prepare Download still work in designer2.

## Rollout

Two commits per tier so each is revertable: 1a+1b+1c, then 2a+2b, then 2c.
