# Prepare Download on a worker pool — design

## Problem

"Prepare Download" runs synchronously on the main thread. `NavHeader.runPrepare`
(`src/components/nav-header/NavHeader.svelte:83`) calls `collateTubes` then
`computeMergedBandPaths`, and the page is frozen until both return.

The measured cost, from `.superpowers/sdd/2026-09-16-pattern-splitting-fixes/prepare-download-perf-report.md`,
is roughly 537 ms per band after the `uniteMany` fix — about 16 s for the 30-band
"long tri hexparquet shade" config. `handlePrepare` already waits two animation frames
before starting, purely so the "Preparing…" indicator paints before the freeze lands.
That is the whole of the current mitigation.

The freeze is the defect. The 16 s is a second, separable defect.

## Goals

- The page stays interactive for the whole of a prepare run.
- Wall-clock falls roughly in proportion to available cores (~16 s → ~3 s at 6 threads).
- Progress is legible: how many bands are done, out of how many.
- A run can be cancelled.
- The architecture accepts the per-band post-processing described in
  `docs/specs/pattern-post-processing.md` without further structural change.

## Non-goals

- Changing what the merge computes. Output must be identical, band for band.
- Reducing the input size (merging collinear runs before stroke expansion). That is a
  separate optimisation on the same pipeline, noted in the perf report, and is not
  attempted here.
- Touching the CSV path, which calls `collateTubes` for its own purposes and never
  merges.

## Why a pool, and why not the existing worker

The app already has a geometry worker: `workerStore.ts:226` lazily creates **one**
singleton `Worker` and never terminates it, and the worker core holds the generated
`SuperGlobule` in `held` so a later `pattern` message can run against it without shipping
geometry back and forth.

Extending that worker with a third `prepare` message was considered. It gives the
smallest payloads, because the worker could merge against a pattern result it already
holds. It was rejected because a single worker is single-threaded: the merge would stay
serial at ~16 s, and would queue behind any in-flight `generate` or `pattern`.

Bands are independent — `computeTiledUnionPaths` and `computeMergedBandPaths` both loop
bands with no cross-band state — so they parallelise cleanly. A pool takes the wall-clock
win as well as the freeze win.

The pool is **created per run and torn down when the run ends**. Unlike the geometry
worker it retains nothing between runs, so leaving threads resident would buy nothing and
cost memory. Worker startup is a few milliseconds against seconds of work.

## Architecture

```
NavHeader.handlePrepare()
  │
  ├─ collateTubes()                       (main thread, unchanged)
  ├─ toBandMergePayloads(tubes)           (main thread, new — plain data, parent-aware)
  │
  ├─ pool.run(payloads, ctx, onProgress)
  │    ├─ spawn min(bands, cores-1, 8) workers
  │    ├─ dispatch bands from a queue as workers free up
  │    ├─ onProgress(done, total) ────────▶ "Preparing 12 / 30 bands"
  │    └─ terminate all workers on finish, failure, or cancel
  │
  └─ mergedBandPathsRaw.set(result) ──▶ stage 2 ──▶ mergedBandPaths ──▶ render
```

### Components

| File                                     | Purpose                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `cut-pattern/band-merge-payload.ts`      | `toBandMergePayloads(tubes)` → `BandMergePayload[]`. Plain data only; computes each piece's span within its parent band. |
| `cut-pattern/merge-band.ts`              | `mergeBand(payload, ctx)` — one band's merge, extracted verbatim from the existing loop bodies.                          |
| `workers/band-merge-worker-core.ts`      | Pure message handler. Unit-testable with no real `Worker`, mirroring the existing `super-globule-worker-core` split.     |
| `workers/band-merge.worker.ts`           | Thin `self.onmessage` binding, mirroring `super-globule.worker.ts`.                                                      |
| `workers/band-merge-pool.ts`             | Queue, dispatch, progress, cancel, teardown. Worker constructor is injectable so tests can drive a fake.                 |
| `cut-pattern/prepare-merge.ts`           | Refactored to call `mergeBand`. Its synchronous behaviour is unchanged and it remains the correctness oracle.            |
| `stores/mergedPathStore.ts`              | Gains `mergedBandPathsRaw` (see Caching).                                                                                |
| `components/nav-header/NavHeader.svelte` | `handlePrepare` awaits the pool; progress readout and Cancel button.                                                     |

### The extraction refactor

`computeMergedBandPaths` (outlined) and `computeTiledUnionPaths` (tiled) each loop bands
and build one path per band. Both loop bodies move into a single `mergeBand(payload, ctx)`
that branches on `ctx.patternType`, exactly as the two functions do today.

The existing synchronous functions then become loops over `mergeBand`. **Their behaviour
does not change.** This matters three ways:

- The synchronous path survives as the oracle for equivalence tests.
- It is the inline path for jobs too small to be worth a pool.
- It keeps this refactor honest: if `mergeBand` is a faithful extraction, the sync
  functions are unchanged by construction, and any difference is a bug in the extraction
  rather than in the pool.

### Data contracts

`buildBandUnionPath` reads only `facet.path` and `facet.strokeWidth`; the tiled label
needs `band.id`, `tagAnchorPoint`, `tagAngle` and `tagAnchorAutoAngle`; the outlined merge
needs `band.facets[0].path` and the same tag fields. Nothing in that set is a Three.js
object, so the payload is small and structured-cloneable with no rehydration in either
direction — unlike the pattern result, which needs `rehydrate-pattern.ts`.

```ts
type BandMergePayload = {
	id: string;
	facets: { path: PathSegment[]; strokeWidth?: number }[];
	tagAnchorPoint?: Point;
	tagAngle?: number;
	tagAnchorAutoAngle?: number;
	/** This band's span within its parent, as fractions of the parent band. */
	pieceStartFraction: number;
	pieceEndFraction: number;
	/** This band's measured label bbox, or undefined to use the FALLBACK dims. */
	labelTextDims?: LabelTextDims;
	/** Deterministic per-band seed; see Post-processing. */
	seed: number;
};
```

`labelTextDims` is per-band and so rides in the payload rather than in `ctx`; extraction
resolves it from the `labelTextDimensions` store, leaving it undefined when the band has no
measurement yet so the worker applies `FALLBACK_TEXT_WIDTH` / `FALLBACK_TEXT_HEIGHT`
exactly as the synchronous path does today.

`ctx` carries only the per-run inputs that are identical for every band: `patternType`,
`labels.selfTag` and `keepConnected`.

The message protocol mirrors the existing worker's shape:

```ts
type MergeMessage = { type: 'merge'; bandId: string; payload: BandMergePayload; ctx: MergeCtx };
type MergeResponse =
	| { type: 'merge-result'; bandId: string; path: PathSegment[] }
	| { type: 'merge-error'; bandId: string; error: string };
```

### Pool sizing and the inline threshold

`min(bands.length, (navigator.hardwareConcurrency ?? 4) - 1, 8)`. One core is left for the
main thread so the UI it is meant to keep responsive actually stays responsive, and the
cap of 8 keeps memory bounded on many-core machines where the marginal band is not worth
another paper scope.

Below a small threshold (2 bands) the pool is skipped and `mergeBand` runs inline, because
spawning workers would cost more than the work.

## Forward compatibility with pattern post-processing

`docs/specs/pattern-post-processing.md` adds per-band hole dropping on the merged result.
Four decisions here exist to accept it without further structural change.

**The worker task is a staged pipeline.**

```
workerTask(payload, ctx):
   stage 1  mergeBand(payload, ctx)        ← this design
   stage 2  postProcessBand(merged, ctx)   ← hole dropping, later
```

Hole dropping lands as stage 2 and touches neither the pool, the protocol, nor the payload
plumbing.

**Payloads carry the parent span.** A split piece knows its `parentQuadOffset` and its own
`quadCount` (`types.ts:464-476`) but not its parent band's total, which is only derivable
by summing sibling pieces — visible to the main thread, never to a worker handed one band
in isolation. `toBandMergePayloads` computes `pieceStartFraction` / `pieceEndFraction`
during extraction. A hole's fraction along the parent is then
`pieceStartFraction + localFraction * (pieceEndFraction - pieceStartFraction)`.

**Randomness is seeded per band.** `Math.random()` in a pool would give a different pattern
on every prepare, and — since band-to-worker assignment varies with scheduling — a
different pattern between two otherwise identical runs. Output that gets cut on a machine
must be reproducible. Each payload carries `seed`, derived from `runSeed + band.id`, and
stage 2 uses a seeded PRNG. Bumping `runSeed` becomes the reroll affordance.

**Stage 2 does not re-run stage 1.** Stage 1 is seconds; stage 2 is milliseconds. See
below.

## Caching and invalidation

Today `mergedBandPaths` holds the prepared result and `isPrepared` derives from
`mergedBandPaths.size > 0`. That render-facing contract is preserved. A second store is
added behind it:

```
geometry/label change ──▶ stage 1 (pool, seconds) ──▶ mergedBandPathsRaw
post-process change   ──▶ stage 2 (inline, ms)    ──▶ mergedBandPaths ──▶ render
```

Until post-processing exists, stage 2 is the identity function and `mergedBandPaths`
mirrors `mergedBandPathsRaw`.

The invalidation block at `NavHeader.svelte:38` continues to clear prepared state when
geometry or label config changes, and additionally **cancels any run in flight** — a result
computed against superseded geometry must never be allowed to land.

## Progress, cancellation and errors

- The `'…preparing'` pulse becomes `Preparing 12 / 30 bands`, driven by the pool's
  per-band completion callback. The existing `✓ ready (N ms)` readout stays.
- A Cancel button terminates in-flight workers. paper offers no mid-union abort, so
  `terminate()` is the only real stop; the run resets to idle and the store is left
  untouched.
- **A failed band is not a failed run.** Per-band errors are collected, the other bands
  still land, and the readout reports `✓ ready (2.8 s, 1 band failed)`. This matches the
  existing tolerance for unpatternable bands, which already carry an `error` field.
- **No silent fallback to the main thread** if the pool fails outright. Falling back would
  reintroduce the 16 s freeze while appearing to succeed, which is worse than a visible
  failure. Pool failure surfaces as an error and leaves the state idle.

## Risks

**paper-core inside a browser Worker is unverified.** No worker-reachable code imports
paper today. The evidence is strong but indirect: `jest.config.js` sets
`testEnvironment: 'node'`, so the paper boolean-op suite already passes with no `document`
and no `window`, and paper-core is invoked with `typeof self === 'object' ? self : null`
(`paper-core.js:15711`), which a Worker satisfies. A Worker gives paper strictly more than
node does.

That is evidence, not proof, and if it fails every section above changes. **The first task
is a spike** that runs a paper boolean op inside a real browser Worker via Playwright,
before anything else is built.

Secondary risks:

- Peak memory rises: N workers each hold a paper scope and one band's geometry. Bounded by
  the pool cap, and each band's data is small.
- Per-run worker startup is paid on every prepare. Expected to be milliseconds against
  seconds of work; the inline threshold covers the degenerate case.

## Testing

- **Equivalence on real geometry.** Pool fan-out versus `computeMergedBandPaths` over the
  real saved config, asserting identical maps. This is the primary safety net, and it is
  the method that proved the `uniteMany` fix correct. Driven through the worker core
  directly, so it needs no real `Worker`.
- **Payload extraction.** Survives `structuredClone`, carries no Three.js objects, and
  computes parent spans correctly for unsplit bands and for pieces — including the 0.5 and
  7/9 cases from the post-processing spec.
- **Pool behaviour.** Dispatch, progress callbacks, cancellation, per-band error
  collection and worker teardown, against an injected fake worker factory.
- **Playwright.** The paper-in-Worker spike, and an end-to-end prepare on `designer2`.
- **Re-measure.** Against "long tri hexparquet shade" to confirm the ~16 s → ~3 s claim
  rather than assume it.

Baselines to hold: `npm run test:unit` currently 1405 passed / 101 snapshots across 161
suites; `npm run check` currently 431 errors, 76 warnings.
