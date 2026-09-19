# Prepare Download on a worker pool — handoff report

**Date:** 2026-09-19
**Branch:** `perf/prepare-download-worker`
**Plan:** `docs/superpowers/plans/2026-09-19-prepare-download-worker-pool.md`

"Prepare Download" used to run the whole per-band merge synchronously on the main thread,
freezing the page for the duration. It now runs across a pool of Web Workers, with a
band-count readout, a Cancel button, and invalidation that cancels a run in flight.

---

## What shipped

| Piece                                          | What it is                                                      |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `src/lib/cut-pattern/band-merge-payload.ts`    | Plain, structured-cloneable per-band payloads                   |
| `src/lib/cut-pattern/merge-band.ts`            | The pure per-band merge, shared by worker and inline paths      |
| `src/lib/workers/band-merge-worker-core.ts`    | Transport-free message handling                                 |
| `src/lib/workers/band-merge-worker-factory.ts` | The one real `new Worker(...)`, loaded lazily                   |
| `src/lib/workers/band-merge-pool.ts`           | The pool: dispatch, progress, cancellation, failure attribution |
| `src/lib/stores/mergedPathStore.ts`            | Two-tier seam: `mergedBandPathsRaw` → `postProcessBandPaths`    |
| `src/components/nav-header/NavHeader.svelte`   | Integration: progress, Cancel, invalidation, generation guard   |
| `tests/prepare-download.spec.ts`               | End-to-end cover (this task)                                    |

---

## Measurement

### Hardware and pool size

- `navigator.hardwareConcurrency` = **10** (headless Chromium, macOS, Darwin 25.6.0).
- `defaultPoolSize(60)` = `min(60, 10 - 1, 8)` = **8 workers**. One core is deliberately left
  for the main thread, whose responsiveness is the point of the change.

### The target config

The plan named **"long tri hexparquet shade"** (`tiledHexparquetPattern-0`, described as 30
bands). The config **was** reachable from this environment — `.env` carries working Turso
credentials — and was loaded through the real UI (Configs panel → Load), so nothing below is
substituted or extrapolated from a different model. Two things about it have moved since the
2026-09-16 perf report, and both matter for reading the numbers:

1. It is saved as **id 63, 60 bands** (not 30), `patternViewConfig.patternSource: "globule"`.
   It was last updated **2026-09-19**, three days after the perf report was written.
2. Its saved `patternTypeConfig.type` is now **`outlined`**, not tiled, and its
   `tilePatternSpecs` array is **empty**. So the saved state is no longer the heavy tiled
   hexparquet state the ~16 s baseline was measured against. Toggling the Pattern tab to
   **Tiled** falls back to the default tile, `tiledShieldTesselationPattern` — comparable in
   cost, but it is not literally hexparquet, and this report does not pretend otherwise.

### Numbers

All figures are the `✓ ready (N ms)` readout, which times `runPrepare` only.

| Config / state                                     | Bands | Path                    | Time                    |
| -------------------------------------------------- | ----- | ----------------------- | ----------------------- |
| id 63, **as saved** (`outlined`, source `globule`) | 60    | pool, 8 workers         | **145 ms** / 127 ms     |
| id 63, **Tiled** (`tiledShieldTesselationPattern`) | 60    | pool, 8 workers         | **7 209 ms** / 7 065 ms |
| id 63, **Tiled** — same geometry, same `MergeCtx`  | 60    | **serial, main thread** | **37 401 ms**           |
| default config, Geometry → Voronoi, tiled          | 60    | pool, 8 workers         | ~1 500 ms               |

**Headline: 37 401 ms → 7 209 ms, a 5.2x speedup on 8 workers, and the main thread stays free.**

The serial figure is a **direct measurement, not an extrapolation**. It was taken by importing
the app's own live store and pipeline modules in-page and running `mergeBand` over the exact
same payloads and `MergeCtx` the pool received, in a loop on the main thread: 60 bands,
1 800 facets, mean **623 ms/band**, slowest band **726 ms**. That mean sits close to the
2026-09-16 perf report's 537 ms/band for one real band of this config, which is the expected
agreement.

5.2x on 8 workers is ~65% parallel efficiency. The shortfall is structural, not a defect:
per-band cost is uneven (623 ms mean against a 726 ms slowest band), so the tail of the run
drains on fewer and fewer workers, and worker startup is paid once per run because merge
workers hold nothing between runs.

### Responsiveness

Measured separately during Task 7 on the 60-band Voronoi config: **200** main-thread
round trips completed during a single run, worst-case round trip **57 ms**. Before this work
the same run was one unbroken freeze.

---

## Equivalence evidence — the output is unchanged

The merge itself was extracted, not rewritten. The evidence that extraction preserved output:

- **`src/lib/cut-pattern/__tests__/merge-band.test.ts`** — runs `buildDefaultGeometry()` +
  `generateProjectionTubes` through both the old `computeMergedBandPaths` oracle and the new
  `mergeBand` over `toBandMergePayloads`, and asserts `toEqual` per band id over **real
  geometry**. It also pins the one genuine disagreement between the two old loop bodies: the
  default label height (16 tiled, 14 outlined). That file's own comment is careful that this is
  a smoke test, not the fidelity gate, because `computeMergedBandPaths` is now implemented by
  `mergeBand` — it compares the extraction against itself.
- **The real regression gates are the four pre-existing suites**, which encode the old behaviour
  independently of `mergeBand`: `prepare-merge.test.ts` (outlined branch, tiled routing,
  skip conditions, dims fallback, per-band `tagAngle`), `prepare-merge.labels.test.ts` (label
  merge on/off and `tagAnchorAutoAngle` rotation), `build-band-union-path.test.ts` and
  `build-band-union-path.holes.test.ts`.
- **Split geometry** is covered in `band-merge-payload.test.ts`: `spans an unsplit band across
the whole parent` and `spans split pieces contiguously across the parent, in order`. The
  split/unsplit distinction reaches the merge only through `pieceStartFraction` /
  `pieceEndFraction`, which is exactly what those two tests pin. It also asserts the payload
  `carries only structured-cloneable data` — the property that makes the worker boundary safe.
- **Transport and pool behaviour**: `band-merge-worker-core.test.ts` and
  `band-merge-pool.test.ts` (dispatch, progress, cancellation, dead-worker sweeps, spawn
  failure attribution).
- **End to end**: `tests/prepare-download.spec.ts` (below).

---

## End-to-end test

`tests/prepare-download.spec.ts`, three cases, all passing in 21.3 s:

1. `merges every band on the worker pool and reports progress`
2. `Cancel stops a run in flight and publishes nothing`
3. `Download SVG auto-preps for the outlined pattern type`

This supersedes the `paper-in-worker` spike probe, now deleted along with
`src/lib/workers/paper-probe.worker.ts` and `src/routes/sandbox-paper-worker/+page.svelte`: a
60-band prepare that completes and publishes real paths can only have gone through the pool,
so it proves paper.js runs inside real Workers more directly than the probe did.

**The test is discriminating, and that was verified empirically.** On a fresh `/designer2` the
pattern pane is empty — the default `patternSource` is `projection` and the default config has
no projection tubes — so a naive version would click Prepare, take the inline path on zero
payloads, publish an empty map, report `✓ ready (0 ms)` and pass having merged nothing and
never started a worker. Each test therefore switches Geometry to Voronoi first and then asserts
a real band count, both from the progress readout and from `mergedBandPaths.size`. Running a
copy of the spec with the Geometry switch removed fails all three, test 1 at exactly the band
assertion (`Expected: >= 20, Received: 0`).

**What it would catch:** a broken worker URL or worker bundle, a pool that hangs or never
settles, a regression that publishes nothing or publishes an empty map, Cancel failing to stop
a run or a cancelled run landing anyway, and the Download SVG auto-prep failing to await.

**What it would not catch:** whether merged path _geometry_ is correct — it asserts band counts,
not shapes; that is the unit suites' job. It also runs only the Voronoi source on the default
config, so it would not catch a source-specific or config-specific failure, and it has no
timing assertion, so it would not catch a performance regression that stayed under the timeout.

---

## Final counts

| Command                                              | Result                                            | Baseline     |
| ---------------------------------------------------- | ------------------------------------------------- | ------------ |
| `npm run test:unit`                                  | 1448 passed, 166 suites, 101 snapshots            | unchanged    |
| `npm run check`                                      | 431 errors, 74 warnings                           | unchanged    |
| `npx playwright test tests/prepare-download.spec.ts` | 3 passed (21.3 s)                                 | new          |
| `npx prettier --check .`                             | 4 pre-existing files flagged, none from this work | pre-existing |

The prettier warnings are `.beads/backup/backup_state.json`,
`docs/specs/pattern-post-processing.md` (the repo owner's own uncommitted work — deliberately
not touched), and two 2026-09-16 docs that were already committed unformatted.

---

## Left open

Recorded deliberately rather than fixed:

- **No watchdog.** A worker that neither replies nor fires `onerror` — a hung merge, a
  suppressed error event — still hangs the run. A timeout was considered and rejected: it risks
  killing legitimately slow bands, and the slowest band measured here is already 726 ms. Cancel
  is the escape hatch.
- **The `<= 2` band inline path has no per-band error isolation.** A throw there fails the whole
  prepare. Blast radius is two bands; the pool path collects per-band errors properly.
- **Zero-payload runs** publish an empty map and report `✓ ready (0 ms)` while `isPrepared`
  stays false. Harmless but confusing, and it is the exact failure mode the e2e test had to be
  written around.
- **`vite preview` is broken for the whole app** by a pre-existing SvelteKit/Rollup tree-shaking
  bug (root cause in `.superpowers/sdd/2026-09-19-prepare-download-worker-pool/task-1-report.md`).
  Unrelated to this work and still unfixed. It is why the e2e harness runs against `npm run dev`
  rather than a production build.
- **`playwright.config.ts` pins `reuseExistingServer: false`** deliberately. Vite does not rebuild
  worker bundles for a running dev server, so reusing one could serve a stale worker and launder
  a pass. Kill whatever holds port 9775 rather than flipping that flag.

### For the post-processing work in `docs/specs/pattern-post-processing.md`

- **The seam is already in place and already used.** `NavHeader` writes the raw pool output to
  `mergedBandPathsRaw` and publishes `postProcessBandPaths(raw)` to `mergedBandPaths`. Nothing
  writes `mergedBandPaths` directly except the invalidation clear. Keep that discipline: it is
  what makes stage 2 re-runnable without paying for the union again.
- **The signature will have to change.** `postProcessBandPaths(raw)` takes no config today.
  Hole dropping needs one, so it becomes `postProcessBandPaths(raw, config)`. The routing
  discipline survives that change; the signature does not.
- **Stage 2 should re-derive from `mergedBandPathsRaw` on config change, not re-prepare.** Stage 1
  is the 7 s; the per-band post-processing is milliseconds. The whole point of splitting the
  stores was to avoid re-running the union for a post-process config change.
- **Anything added to stage 2 must survive the invalidation block**, which clears both stores on
  geometry or label-config change.
- **If stage 2 ever becomes expensive enough to need the pool**, note that `NavHeader` currently
  assumes it is the pool's only caller. Its generation guard compares against a **local** run
  token, not `result.generation`, so a second call site is safe — but it would need its own
  token, not a share of this one.
