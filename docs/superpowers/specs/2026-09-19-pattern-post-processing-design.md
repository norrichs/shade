# Pattern post-processing: dropping internal holes — design

Provisional. Written against the in-flight worker-pool work
(`2026-09-19-prepare-download-worker-pool-design.md` and its plan), not against
finished code. The amendments this design makes to that plan are listed in
"Docking into the pool work"; they are to be re-checked against the landed pool
before implementation begins.

Feature source: `docs/specs/pattern-post-processing.md`.

## Problem

Merging a tiled band produces one path whose interior is full of holes — the
negative space of the tessellation. For some pieces that is the point; for
others the holes should be thinned out or removed entirely, either uniformly or
progressively along the band. There is no affordance for that today: the merged
path is whatever the union produced.

## Goals

- Drop internal holes from merged tiled band paths, under four modes: none, all,
  random by chance, and random by position along the band.
- Position is measured along the **parent** band, so a split piece's holes carry
  the fraction they would have had before the split.
- Changing the drop config re-renders in milliseconds. It must never re-run the
  merge.
- The same config and seed produce the same cut file, on any machine, at any
  pool size.

## Non-goals

- Outlined patterns. Their merged path is an outline plus a label; the only
  interior contours are label counters, which must not be dropped. The affordance
  is hidden for outlined.
- Filtering holes by size. `area` is computed and carried so a later minimum-area
  filter needs no new analysis, but no such control ships.
- Any change to what the merge computes.

## Architecture

The pipeline gains a stage. Analysis is config-independent and runs in the pool
worker; the drop decision is config-dependent and runs on the main thread.

```
geometry/label change ─▶ stage 1   mergeBand        (pool, seconds)  ─▶ mergedBandPathsRaw
                        stage 1b  buildHoleIndex   (pool, ms)       ─▶ bandHoleIndexes
drop config change    ─▶ stage 2   dropHoles        (main, ms)      ─▶ mergedBandPaths ─▶ render
```

### Why stage 2 is on the main thread

The pool is created per run and torn down when the run ends; it retains nothing.
Reaching a worker with a changed drop config therefore means spawning workers and
re-sending the band payload — which is the _input_ geometry, so the worker would
redo the stroke expansion and union to get back to the merged result. That is the
seconds this design exists to avoid.

Shipping the merged path plus its index out to a worker and back would avoid the
union, but the round trip and structured clone cost more than the work: dropping
is a seeded roll per hole and a copy of the surviving segment slices, low
single-digit milliseconds for a 30-band pattern.

The split is therefore by cost, not by principle. If stage 2 ever measures badly,
it is a pure function over plain data and can move to a long-lived worker without
touching anything around it.

This matches the pool plan's Task 6, which already ruled stage 2 out of the pool
worker on the same grounds. The `workerTask` sketch in
`docs/specs/pattern-post-processing.md` describes the logical order of the
stages, not their address.

### Why analysis is in the worker

Stage 1b needs the band's facet geometry, its `pieceStartFraction` /
`pieceEndFraction` and its `seed` — all of which the worker already holds, and
none of which the main thread would otherwise need. Running it there keeps
centerlines and facet geometry off the main thread entirely and parallelises the
analysis for free. Stage 2 then needs nothing but the index.

The cost is that an analysis bug requires a re-prepare to fix. Accepted.

## Components

| File                                         | Purpose                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `cut-pattern/hole-index.ts`                  | `buildHoleIndex(path, payload)` → `BandHoleIndex`. Pure; no paper, no config, no randomness.   |
| `cut-pattern/drop-holes.ts`                  | `dropHoles(path, index, config)` → `PathSegment[]`. Pure; seeded; the only place holes vanish. |
| `cut-pattern/hole-drop-config.ts`            | Config types, defaults, and `sampleDropCurve` (bezier → LUT).                                  |
| `workers/band-merge-worker-core.ts`          | Stage 1b call; `holes` added to the merge response.                                            |
| `workers/band-merge-pool.ts`                 | Collects per-band indexes alongside paths.                                                     |
| `stores/mergedPathStore.ts`                  | `bandHoleIndexes`; `mergedBandPaths` becomes derived.                                          |
| `components/modal/editor/PostProcess.svelte` | The config panel.                                                                              |
| `components/modal/sidebar-definitions.ts`    | Registers the panel under `patternConfigs`.                                                    |
| `components/nav-header/NavHeader.svelte`     | Writes both stores; invalidation key (see below).                                              |

## Stage 1b: the hole index

A merged band path is a flat `PathSegment[]` of `M … Z` runs — `paperToPathSegments`
emits one run per paper child. A contour is a `[start, end)` index range into that
array. Dropping a hole is deleting its slice; because the renderer fills
`evenodd`, the space fills in. Nothing is re-unioned.

1. **Split** the path into contour ranges. Flatten each to a polyline, sampling
   `C` segments at a fixed subdivision. Keep bbox, signed area and area-weighted
   centroid. A contour with degenerate area falls back to its bbox centre.
2. **Nest by containment.** Sort by `|area|` descending; test each contour's first
   point against only larger-area contours, bbox-prefiltered. **Odd depth means
   hole.** Containment, not winding: `uniteMany` deliberately does not normalise
   winding (see its doc comment), so signed area is not a reliable hole signal
   here.
3. **Centerline.** Tiled output is one facet per quad (`types.ts:464-470`), so the
   facet centroids in facet order form a clean one-point-per-quad polyline along
   the band. Keep cumulative lengths. Facet order also fixes which end is the
   start, with no orientation heuristic.
4. **Fraction.** For each hole centroid, find the closest point on the centerline;
   `localFraction` is its cumulative arc length over the total. Then

   ```
   bandFraction = pieceStartFraction + localFraction * (pieceEndFraction - pieceStartFraction)
   ```

   which yields the spec's cases: the centre of piece 2 of 3 gives 0.5, and a
   third of the way along piece 3 gives 7/9.

```ts
type HoleRef = { start: number; end: number; bandFraction: number; area: number };
type BandHoleIndex = { seed: number; holes: HoleRef[] };
```

`holes` is in contour order, which is deterministic from the path. `area` is
unused today and exists so a later size filter needs no re-analysis.

## Stage 2: dropping

```ts
dropHoles(path: PathSegment[], index: BandHoleIndex, config: HoleDropConfig): PathSegment[]
```

Pure. A mulberry32 PRNG seeded from `index.seed`, rolled over `index.holes` in
order, so the result is reproducible across runs and independent of how the pool
scheduled the bands. Worker and stage-2 code never call `Math.random()`.

- `none` — returns the input by reference.
- `all` — drops every hole.
- `random` — drops when `rand() < chance`.
- `variable` — drops when `rand() < lut(bandFraction)`, where `lut` linearly
  interpolates a 101-point sampled table over the unit square. The curve is read
  as **x = position along the band, y = drop chance**.

Dropping is one filtered rebuild of the segment array.

## Config

In `patternConfig`, optional in the same way and for the same reason as `splits?`:
absent decodes to "no dropping", so no saved config needs migrating.

```ts
type HoleDropConfig =
	| { mode: 'none' }
	| { mode: 'all' }
	| { mode: 'random'; chance: number }
	| { mode: 'variable'; curve: BezierConfig[] };

postProcess?: { dropHoles: HoleDropConfig; runSeed: number };
```

The curve is stored as `BezierConfig[]` — what `PathEditor` emits — and sampled to
the LUT at the store boundary, so the geometry code never sees a curve type and
nothing structured-cloned carries a bezier-js instance. `runSeed` is persisted, so
a reopened config re-cuts identically. Validators default the block when absent
and clamp `chance` and curve values into `[0, 1]`.

## Stores and invalidation

`mergedBandPathsRaw` (pool plan, Task 6) gains a sibling `bandHoleIndexes`,
written in the same breath by the same run. `mergedBandPaths` becomes derived:

```ts
mergedBandPaths = derived(
	[mergedBandPathsRaw, bandHoleIndexes, postProcessConfig],
	([raw, indexes, config]) => applyPostProcess(raw, indexes, config)
);
```

`postProcessConfig` is a `derived` slice of `patternConfigStore` that emits only
when the `postProcess` block changes — so an unrelated config edit does not
rebuild every band's path.

This amends Task 6, which kept it writable behind a convention that callers route
through `postProcessBandPaths`. Derived makes the seam structural, and a config
change re-renders with no imperative step. NavHeader is the only writer today
(`NavHeader.svelte:46,102`; every other site reads `$mergedBandPaths`), so nothing
downstream changes. `isPrepared` still derives from it and still goes false when
raw is cleared.

**The invalidation hazard.** NavHeader's invalidation block
(`NavHeader.svelte:38-53`) is Svelte 4 `$:` and reads `$patternConfigStore`. That
subscription re-fires on every emission of the store, whatever field changed —
the nested `void $patternConfigStore.patternTypeConfig.type` lines document intent
but do not narrow the dependency. Unguarded, putting the drop config in
`patternConfigStore` would clear the prepared merge on every drag of the
drop-chance input, forcing exactly the full re-prepare this design exists to
avoid.

Fix: derive an explicit invalidation key from the geometry and label fields and
clear only when that key changes. This lands as its own commit ahead of the
feature; it is a latent bug for `splits` and `keepConnected` today.

## UI

`PostProcess.svelte`, registered as a `patternConfigs` Floater beside Pattern
View, Pattern Scale and Tile Editor.

- `SelectInput` labelled "Drop internal holes": none (default), drop all,
  randomly drop, variably drop.
- `random` → `NumberInput`, range 0–1.
- `variable` → `PathEditor`, clamped to the unit square through its existing
  `LimitFunction`.
- A "Reroll" button that bumps `runSeed`. Stage 2 is milliseconds, so it
  re-randomises instantly without re-merging.
- Hidden when the pattern type is outlined.

All state lives in `patternConfigStore`, so the Floater's remount-on-close
behaviour cannot wipe it.

## Testing

- **Contour analysis.** Splitting, nesting with an island inside a hole, several
  disconnected outer contours, degenerate zero-area contours.
- **Fractions.** Arc-length positions on hand-built bands, including the 0.5 and
  7/9 split cases from the feature spec, and an unsplit band spanning [0, 1].
- **Dropping.** Same seed and config gives byte-identical output; over many holes
  the drop rate lands near the configured chance; `none` returns the input
  untouched; `variable` follows the LUT at the ends of the curve.
- **LUT sampling.** Bezier → 101 points, clamped to the unit square.
- **Integration.** A real saved config through pool → index → drop, asserting
  `none` is identical to the pre-feature output.
- **Playwright.** Prepare on `designer2`, switch mode, confirm the render changes
  with no re-prepare. Run as a script from the repo root; the Chrome extension is
  not available here.

Baselines to hold, from the pool design: `npm run test:unit` 1405 passed / 101
snapshots across 161 suites; `npm run check` 431 errors, 76 warnings.

## Docking into the pool work

Amendments to `2026-09-19-prepare-download-worker-pool.md`:

- **Task 4** — the worker core runs stage 1b after `mergeBand`; `MergeResponse`
  carries `holes: BandHoleIndex`.
- **Task 5** — the pool collects per-band indexes alongside paths.
- **Task 6** — `bandHoleIndexes` is added and `mergedBandPaths` becomes derived,
  replacing the identity `postProcessBandPaths` seam.
- **Task 7** — NavHeader writes both stores, and the invalidation block moves to
  a key comparison.

Everything else in this feature is new files. These amendments are provisional
until the pool work lands and is re-read.

## Risks

- **The pool work is unlanded.** Contracts here are written against its design
  document. If `MergeResponse` or the payload shape moves, stage 1b's wiring moves
  with it. Mitigated by re-checking before implementation.
- **Nesting cost.** Containment is O(n²) in contours per band, bbox-prefiltered.
  A dense tiled band can carry hundreds of contours; hundreds of thousands of
  bbox tests is fine, but it is worth measuring on the "long tri hexparquet
  shade" config rather than assuming.
- **Centerline fidelity.** Facet centroids approximate the band's spine. On a
  strongly tapered or curved band the arc-length fraction will drift slightly
  from a true medial axis. Acceptable: the fraction drives a probability, not a
  cut line.
