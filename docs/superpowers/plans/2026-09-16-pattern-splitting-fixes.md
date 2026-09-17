# Pattern Splitting — Verification Fixes Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. One task per dispatch.

**Goal:** Fix every defect the 2026-09-16 verification pass found in Phases 0–4 of pattern splitting, so a split pattern generates for every tiled and outlined pattern type and glues back into the unsplit original.

**Spec:** `docs/superpowers/specs/2026-09-16-pattern-splitting-and-explicit-size-design.md` — binding. Read its final section, **"Amendments — 2026-09-16 verification rulings"**, before any task: it holds Ben's rulings that these tasks implement.

**Background:** `docs/superpowers/handoff/2026-09-16-pattern-splitting-verification.md` ("Verification results" at the end). The original feature plan is `docs/superpowers/plans/2026-09-16-pattern-splitting-and-explicit-size.md`; do not read it whole — its Global Constraints are restated below.

**Tech:** SvelteKit, TypeScript, Jest (`npm run test:unit`), `svelte-check` (`npm run check`).

## Global Constraints

- Tests are Jest, colocated in `__tests__/` beside the source, `*.test.ts`. Import globals explicitly: `import { describe, it, expect } from '@jest/globals';`. Run one file with `npm run test:unit -- path/to/file.test.ts`.
- **Jest does not type-check test files.** Never predict a type error as your RED failure.
- **Every new test must fail without the fix.** For each test, work out by hand what it would receive with the change absent; if that equals what it asserts, the test is worthless. The recurring trap on this branch: fixtures whose pieces are all the same length, or an optional parameter never passed. **Split fixtures must produce pieces of UNEQUAL length** unless a test is specifically about equal lengths.
- **Indentation is tabs.** Format only files you touched: `npx prettier --write <files>`. **Never `npm run format`** (rewrites ~62 unrelated files).
- `npm run check` baseline is **431 errors**. Judge by the change in count; it must not rise.
- Full suite baseline: **961 passed, 101 snapshots passed**. **Never `jest -u`** — the Phase 0 snapshot (`tube-pattern-characterization.test.ts`) is a correctness gate and must pass untouched.
- **Local-only app. Never `git push`.** Never `git stash`, `git checkout`, `git reset`, `git add -A`. Stage your own files by explicit path. The working tree has ~62 unrelated modified files (Prettier reflow) — never stage or revert them.
- Commit trailer: `Co-Authored-By: Claude <model> <noreply@anthropic.com>` naming your model.
- `patternConfigStore.update(...)` is broken until Task 1 lands; write config with `.set(...)` and a rebuilt object.
- Quad _k_ is built from facets _2k_ and _2k+1_ of a flat band. In tiled cut-pattern output (`BandCutPattern.facets`), there is **one facet per quad**.
- Pieces: a split band's pieces carry `address.piece`, `parentIndex`, `pieceIndex`, `parentQuadOffset`, `seamAt`. Uncut bands in a split tube carry `parentIndex` and no piece. Band indices (`address.band`) never renumber.
- **Neighbour identity is by address, never by array position** (spec amendment). This is the root cause shared by Tasks 3–6.
- Useful real-geometry harness: `src/lib/cut-pattern/__tests__/run-pattern-generation-splits.test.ts` builds a real `SuperGlobule` from `generateDefaultSuperGlobuleConfig()` and runs `runPatternGeneration` unmocked. Pattern type configs live in `tiledPatternConfigs` (`src/lib/shades-config.ts:304`); `tiledShieldTesselationPattern` has `endsMatched: true`. Hex, Box and Shield tesselation all run `adjustTesselation` (`src/lib/patterns/pattern-registry.ts:46-57`).

## Beads

| Task | Issue                                                                             |
| ---- | --------------------------------------------------------------------------------- |
| 1    | `shades-tb5`                                                                      |
| 2    | `shades-umy`                                                                      |
| 3    | `shades-guk`                                                                      |
| 4    | `shades-at0`                                                                      |
| 5    | `shades-a2a`                                                                      |
| 6    | `shades-azt` + deferred minor                                                     |
| 7    | spec §2 "report is surfaced in the UI" (no issue; controller files one if needed) |
| 8    | hidden-band investigation (review finding E)                                      |

Close the task's issue with `bd close <id> --reason="..."` after its commit lands. `shades-0he` (spec wording) is already resolved by the spec amendment; the controller closes it.

---

### Task 1: Make `persistable.update` apply its updater

**Defect (`shades-tb5`):** `src/lib/persistable.ts:78-81` defines `update: function (value: T) { update((value) => value); if (getLocal(key)) schedulePersist(key, name, value); }`. The inner writable is updated with the identity function, so the store never changes; whatever was passed is handed to `schedulePersist` instead (a function, if the caller followed `Writable<T>`'s contract). `Persistable<T>` extends `Writable<T>`, whose `update` takes an updater `(value: T) => T`.

**Required behaviour:** `update(updater)` applies `updater` to the current value, sets the result, and schedules persistence of the **result** under the same condition as today (`getLocal(key)` truthy). Match `set`'s ordering.

**Before changing it:** grep every caller of `.update(` on a store created by `persistable(...)` (e.g. `patternConfigStore`, `superConfigStore`, and any other `persistable(` result). If any caller passes a _value_ rather than an updater, convert that caller to `.set(value)` in the same commit and list it in your report.

**Tests:** extend `src/lib/__tests__/persistable.test.ts`. A test that calls `update(v => ({...v, x: 2}))` and reads the store must see the change (fails today: the store is unchanged). Assert what gets persisted is the updated value, not a function. Follow the file's existing mocking of storage.

---

### Task 2: Resolve end partners by which end joins

**Defect (`shades-umy`):** Cross-tube end-partner addresses in `meta.startPartnerBand` / `meta.endPartnerBand` are stored **plain** (no `piece`). `isSameAddress` (`src/lib/util.ts:~329-340`) never equates a piece address with a plain one. So wherever code asks "is the partner's start partner _me_?" with one side a piece, the answer is always false and the code assumes "end":

- `getEndPartnerTransform` in `src/lib/cut-pattern/generate-pattern.ts` (~477-483): `isStartOrigin` / `isStartPartner`.
- `getTransformedPartnerCutPattern` in `src/lib/patterns/tesselation/shared/helpers.ts` (~127): `partnerFacetIndex`.

Separately, `findBandByAddress` (`generate-pattern.ts:574`) resolves a plain address onto a split partner by "same piece index as the asker, else last piece" (pass 2). The spec amendment rules that this is correct only for **side neighbours**; **end partners** resolve by which end joins.

Measured symptom (reviewer): splitting _only_ tube 6 of the default shield geometry moved tube 0 band 0's start transform ~570px off its true partner edge (7e-14 when unsplit). Unsplit tubes are corrupted by a split elsewhere.

**Required behaviour (spec amendment, "Partner resolution has two rules"):**

- An end partner is resolved independently of the asker's own piece index: if the partner's **start** meets this end → partner's **piece 0**; if the partner's **end** meets it → partner's **last piece**. An unsplit partner resolves to itself.
- "Does the partner's start meet me" compares **parent** addresses (globule, tube, band), ignoring `piece` on both sides. Consider the partner's pieces as a whole: its piece 0 carries the outer start partner, its last piece the outer end partner.
- Seam partners (sibling pieces, piece-bearing addresses) keep the exact match they have now.
- Do not change `isSameAddress`'s semantics (its characterization tests lock them); add a parent-address comparison helper where needed, or reuse one if it exists (`bandKey`/`src/lib/cut-pattern/band-key.ts` may be relevant).
- Keep `findBandByAddress`'s same-index behaviour available for side-neighbour callers (Tasks 3–4 need it). Choose a clear API — e.g. separate functions, or an explicit relationship argument — rather than a boolean flag whose default silently picks a rule. Update every existing caller to the rule matching its relationship, and state each caller's classification in your report.

**Tests (must fail before the fix):**

1. Real geometry (default super globule, shield tesselation, `endsMatched: true`): split **only a partner tube** (find one whose bands are end partners of tube 0's bands; tube 6 per the reviewer, verify) at an index giving unequal pieces. Assert tube 0's bands' `meta.startPartnerTransform` / `endPartnerTransform` equal (within 1e-9) the transforms from the unsplit run. Tube 0 is not split, so its transforms must not move.
2. Split **both** tube 0 and its partner tube at different indices; assert each outer end's transform maps its facet edge onto the correct partner edge (compare to the unsplit run's transform for the parent band — a split must not change where an outer end meets its partner, because pieces are rigid partitions of the parent in the flat layout... verify that alignment per piece doesn't make this false; if per-piece alignment changes the frame, compare the mapped edge geometry instead of raw transforms, and say which you did).
3. Unit tests for the resolver: partner start meets asker → piece 0; partner end meets asker → last piece; asker is itself a piece with index ≠ 0 → result unchanged.

---

### Task 3: Tiled cross-band neighbours by address

**Defect (`shades-guk`):** `adjustTesselation` (`src/lib/patterns/tesselation/shared/adjuster.ts:61-67`) takes `bands[(bands.length + b - 1) % bands.length]` as the previous band and pairs its facets with this band's by index. With pieces interleaved in the array, `b0p1`'s "previous band" is its own sibling, `b1p0`'s is `b0p1`, and `b0p0` wraps to the last band's last piece. Unequal piece lengths throw `Cannot read properties of undefined (reading 'quad')` (whole pattern fails, reproduced in app); equal lengths silently distort every piece (reviewer measured up to 11.7px non-rigid deviation). Same positional lookup at `src/lib/patterns/tiled-carnation-pattern.ts:73`. Check `withinBand` / `acrossBands` pair handling in the same loop for further positional assumptions. Also check the wrap-around semantics: the unsplit code wraps from band 0 to the last band — preserve that for the parent band index.

**Required behaviour:** The previous band of a piece is the band at parent index `band - 1` (wrapping as today) with the **same piece index**, falling back to that band's last piece if it has fewer pieces (spec amendment, side-neighbour rule). Facet _f_ of this piece pairs with facet _f_ of that neighbour piece. For an uncut band in a split tube whose neighbour _is_ split (the neighbour was long enough to cut and this band was not), the facet pairing must still be geometrically correct — use `parentQuadOffset` to map facet indices into parent coordinates rather than assuming both start at 0; say in your report how you handled it. A missing counterpart facet must not throw.

Unsplit tubes must produce byte-identical output — the Phase 0 snapshot and existing tesselation tests are the gate.

**Tests (must fail before the fix):**

1. No-crash: real geometry, Shield/Hex/Box, split at an index giving **unequal** pieces → `runPatternGeneration` does not throw, and every band has pieces.
2. **Glue invariant** — the property the whole feature exists for. For Shield with `endsMatched` off and on: generate unsplit and split. For every piece facet that is neither a seam-end facet nor an original band-end facet, compare its path to the unsplit parent facet at `parentQuadOffset + f`, **in that facet's own quad frame** (express path points in coordinates relative to the facet's quad, so rigid per-piece placement does not count as a difference). Assert equal within 1e-6. This test must fail on the current code with an **equal-length** split too (the silent-distortion case) — include that case.
3. Carnation: equivalent no-crash + invariant check if carnation is reachable via `tiledPatternConfigs`; if it isn't, say so in the report and cover it with a narrower unit test of the neighbour lookup.

---

### Task 4: Outlined side neighbours and tab layout by parent band

**Defect (`shades-at0`):** In `src/lib/cut-pattern/generate-outlined-pattern.ts` (~690-703), `generateOutlinedBandPattern` receives `allQuads[i - 1]`, `allQuads[i + 1]`, `bandCount = alignedBands.length` and `localBandIndex = i`, all indexed over the post-split pieces array. Consequences: `neighborBefore` / `neighborAfter` are a sibling or the wrong piece, so `partnerOuter` (partner-shaped side tabs) is built from wrong geometry; `seamTabOwner` under `tabLayout` alternates side-seam tab ownership between pieces instead of bands, so real band-to-band seams can get two tabs or none, and sibling-piece seams are treated as band seams.

**Required behaviour:** Neighbours are resolved by parent index ± 1 with the same piece index (side-neighbour rule, fallback to last piece). `bandCount` counts **parent** bands in the tube range and `localBandIndex` is the parent's local index, so tab-layout alternation is decided per band exactly as unsplit. When a neighbour piece's quad indices don't start at the same parent offset (uncut neighbour of a split band), map through `parentQuadOffset` as in Task 3. `splitEnd` behaviour from Task 12 is unchanged.

Unsplit outlined output must be byte-identical (existing outlined tests + reviewer confirmed `splitEnd` unset gives identical output — keep it so).

**Tests (must fail before the fix):** unequal-piece split with a `tabLayout` that alternates side tabs: assert every real band-to-band side seam has exactly one tab and that tab ownership per parent band matches the unsplit run. And: a partner-shaped side tab on a piece is built from the adjacent band's same-index piece's quads (assert the neighbour quads passed, or the resulting tab geometry matches the unsplit parent's tab at the same parent quad offset, in quad frame).

---

### Task 5: Band sort index and renderer with pieces

**Defect (`shades-a2a`):**

- `src/components/cut-pattern/CutPatternRenderer.svelte:69` `resolveBandWithTube` finds `tube.bands.find((b) => b.address.band === ref.band)`, so every piece resolves to piece 0: piece 0 renders repeatedly, later pieces never render, and the keyed `{#each}` at ~:357 (`concatAddress(band.address)`) gets duplicate keys, which Svelte rejects at runtime.
- `band-sort-index.ts` `neighboursOf` looks up plain partner addresses against piece-suffixed keys, so pieces drop out of end-connection chains.

Only non-`tube-order` `bandSortMode` values take this path.

**Required behaviour:** Refs in the band sort index identify pieces (include `piece` when present) and resolve exactly. End-connection chains follow the spec amendment: a piece's outer end connects to its end partner resolved by which end joins (use Task 2's resolver); sibling pieces connect to each other across their seam. Decide whether pieces of one band should stay adjacent in sort order (recommended: yes, in piece order) and state it in the report. The spec's out-of-scope note about "guarding `sliceBandSortIndex` against positional drift" — check whether this defect falls under it; if the fix requires touching `sliceBandSortIndex`, do the minimum and report it.

**Tests (must fail before the fix):** put the pure logic in `.ts` (extract `resolveBandWithTube` if needed rather than testing the Svelte component) and test: every piece of a split tube resolves to a distinct band object; the resolved list's `concatAddress` keys are unique; `neighboursOf` returns a piece's sibling and its correct end partner piece.

---

### Task 6: Remaining positional sites, `shades-azt`, deferred minor

Three smaller fixes in one task:

1. **`shades-azt`:** `src/components/modal/editor/tile-editor/partner-pair-resolver.ts` (~:42) has a local piece-blind `findBandByAddress` that resolves to the wrong sibling piece. Replace it with the shared resolver(s) from Task 2, using the rule matching each call's relationship. Existing test: `.../tile-editor/__tests__/partner-pair-resolver.test.ts`; add a piece case that fails today.
2. **Audit** `src/lib/cut-pattern/build-pattern-csv.ts:41-42` (`withinTubeAdjacentPartners` uses `tube.bands[i ± 1]`) and `src/lib/cut-pattern/resolve-tab-label.ts:43` (next band in tube by `bands[(baseIdx + 1) % length]`, and `findIndex` by `address.band` only). Fix each to identify neighbours by parent band ± 1 with the side-neighbour rule; for a piece, its sibling across a seam is not a "within-tube adjacent partner" unless the CSV/label semantics say so — read the surrounding code and decide, and state it. Add a failing piece case for each.
3. **Deferred minor:** `src/lib/cut-pattern/generate-tiled-pattern.ts` ~:446 `(seamPiece as number)` narrows inside a closure after an external guard. Pass `seamPiece` as a parameter so no cast is needed. Pure refactor; no new test.

Close `shades-azt` when done.

---

### Task 7: Surface dropped splits in the page

**Gap:** Spec §2: "Illegal and out-of-range splits are dropped and reported … The report is surfaced in the UI." Today `splitFlatBands` rejections only reach `console.warn` inside the Web Worker (`generate-tiled-pattern.ts:~132-135`, and the outlined path — verify), invisible in the page console. `validateSplitConfig` (`src/lib/validators.ts:~154`) is not called anywhere.

**Ruling (spec amendment, "Dropped splits are reported, data is untouched"):** generation keeps dropping; rejections travel back with the pattern result; the page shows them; the persisted `splits` list is **never** pruned.

**Required behaviour:**

- Collect rejections per tube (`{ tube, quad, reason }`) from both tiled and outlined generation, dedupe (the same split is rejected once per tube, not once per band or per pattern variant), and return them on `PatternGenerationResult` (`src/lib/cut-pattern/run-pattern-generation.ts`). It must survive the worker round-trip (`src/lib/workers/super-globule-worker-core.ts`, `src/lib/stores/workerStore.ts`) — plain data, no rehydration needed, but check nothing strips unknown fields.
- Remove the worker `console.warn`.
- Show them in the page. Reuse the existing toast mechanism that shows "A pattern is too large to fit the page" (find it from `CutPatternRenderer.svelte` ~:297); one toast summarising dropped splits, not one per split.
- Out-of-range must be judged against the **tube's full band set**, not the currently selected range: today `splitFlatBands` measures `maxQuads` over the selected bands only, so narrowing the view range can report a valid split as out of range. If the full-tube quad count isn't available at that point, pass it in; state how.
- `validateSplitConfig`: either use it as the single source of the rejection rules shared with `splitFlatBands` (preferred, if it reduces duplication), or delete it if it would only duplicate `splitFlatBands`' rules. It must not be used to rewrite persisted config. State which.

**Tests (must fail before the fix):** result carries a deduped rejection for an illegal split (non-multiple of `subunitCount` for hexparquet, and out-of-range) across both paths; a narrowed `range` does not produce an out-of-range rejection for a split valid for the whole tube; persisted config is not mutated.

**Dev-server note:** this task edits worker-imported modules; restart the dev server if you check it in a browser.

---

### Task 8: Hidden bands — investigate, then fix or amend

**Finding (reviewer E):** with **no splits**, output at `HEAD` differs from `63f7017` (the commit before the feature) for 27 bands when some bands are hidden. Suspected cause: commit `8c9f952` made `getEndPartnerTransforms` resolve each end independently; previously, when one partner address didn't resolve, neither transform was set and the other end snapped using the partner's raw untransformed path. Related pre-existing confusion: partner addresses in `meta` carry **real** band indices, while `address.band` / `parentIndex` are indices into the **visible/selected** band list, so with a hidden band a partner can resolve to the wrong band or to nothing. The renderer's partner lookup also changed from array position to address (`CutPatternRenderer`), another difference when bands are hidden or a range is set.

**Ruling (Ben: "investigate, then decide"):** decide on evidence.

**Steps:**

1. Find exactly what "hidden" means in the pipeline (band visibility / `range.bands` / `showBands` / selection — trace `selectedBands` in the generation path) and reproduce the 27-band difference: extract `63f7017` with `git archive 63f7017 | tar -x -C <scratch dir>` (never `git checkout`) and run the same generation on both trees, or build an equivalent in-repo comparison. Record the exact config.
2. For each differing band, determine which output is **geometrically correct**: does the end-matched facet land on its true partner's edge? (Map the facet's end edge through the transform and measure the distance to the partner's matching edge, as the reviewer did.)
3. Determine whether index-space confusion (real vs visible band index) causes wrong partner resolution at `HEAD`, independent of splits.
4. Decide and act:
   - If `HEAD` is correct and `63f7017` was wrong: add a hidden-band regression fixture proving the correct behaviour (a tube with at least one hidden band, including with a split), and write the outcome under the spec's "Hidden bands and the 'unchanged' guarantee" amendment (replace "Pending investigation" with the finding, and qualify the §1/§3 "unchanged" claims).
   - If `HEAD` is wrong (or both are, due to index-space confusion): fix it so partners resolve to the correct real band with hidden bands present, add the fixture, and record the outcome in the same spec section.
   - Either way the fixture must include a hidden band **and** a split with unequal pieces, because that is the blind spot this whole branch missed.

**Report:** the reproduction config, per-band verdict counts (HEAD correct / old correct / both wrong), what you changed, and the spec text you wrote.

---

### Task 9: Tile editor and 3D partner highlight on split tubes

**Defect (Task 6 review):** `resolvePair` (partner-pair-resolver.ts) is now correct, but its only caller path cannot reach it correctly on a split tube:

- `BaseQuadSelector.svelte` (~:61, :75, :108) passes an **array position** as `band`; in a split tube `band: 3` is b1p1, but `partner-neighbors.ts` local `findBand(tube, band)` (~:72-77) matches `address.band === 3`, a different parent.
- `crossTubeTop` (partner-neighbors.ts ~:145) checks `baseAddress.facet !== baseBand.facets.length - 1` against piece 0's length while `resolvePair(…, 'partnerEnd')` returns the last piece's end.
- Left/right side neighbours (`resolveLeft`, `band - 1`) are positional; use the side-neighbour rule (`findAdjacentSideNeighbour` / `findSideNeighbourInBands` in resolve-partner-band.ts).
- 3D partner highlight: `ghostAddress.facet` is piece-local, but `partnerHighlightGeometry` (via `PartnerEditor.svelte` ~:46-52 → `partnerHighlightStore`, selectionStores.ts) reads it as a parent quad index. Map piece-local facet → parent quad with `parentQuadOffset`.

**Ruling (controller, 2026-09-17):** the selector presents **each piece as its own selectable row**, labelled like pattern labels (e.g. `b3p1`; unsplit bands unchanged, e.g. `b3`). Selection state carries the full piece-bearing address, never an array position.

**Required behaviour:** selecting a piece and a quad in the tile editor produces the correct base band, the correct end/side partner ghosts (end partners by which end joins; side neighbours by same piece index; seam partners exact), and the 3D highlight on the correct parent quad. Unsplit behaviour unchanged.

**Tests (must fail before the fix):** pure logic in `.ts` (extract from `.svelte` if needed): selector options for a split tube enumerate pieces with correct addresses/labels; base band resolution by piece address; `crossTubeTop`/end ghost uses the piece that carries that end; left/right neighbours by side rule with unequal pieces; highlight maps a later piece's facet to `parentQuadOffset + facet`.

---

### Task 10: Labels and CSV name the exact physical piece

**Defects (Task 6 review):**

1. CSV `endPartners` column (`build-pattern-csv.ts`) and start/end tab labels (`resolve-tab-label.ts`) name the **plain parent** for outer end partners (e.g. `t6/b5`) while the physical parts are `t6/b5p0` / `t6/b5p1`. Resolve with the end-partner rule (`resolveEndPartner` / `resolveEndPartnerInBands`) and label the resolved piece's address. Tab labels may need all tubes passed in — thread them from the caller.
2. An **uncut band beside a split neighbour** (and, generally, any band whose side neighbour's piece boundaries differ from its own) names only one neighbour piece.

**Ruling (controller, 2026-09-17; recorded in the spec amendment "Labels name the physical piece"):**

- A mid/side tab label names the neighbour piece whose parent-quad range (`parentQuadOffset` … `parentQuadOffset + quads - 1`) contains the tab's own parent quad (`own parentQuadOffset + tab's local quad`).
- The CSV adjacency column lists **every** neighbour piece the band borders along its length (parent-quad ranges overlap), in piece order.
- Seam partners keep exact piece addresses (unchanged).
- Unsplit output (labels and CSV) must be byte-identical.

**Tests (must fail before the fix):** end-partner label/CSV cell names the joining piece (`p0` for a start join, last piece for an end join) with unequal pieces; uncut band beside a split neighbour: a mid tab over a quad in the neighbour's piece 1 names `…p1`; CSV lists both pieces; a split band beside an uncut neighbour names the plain neighbour; unsplit characterization unchanged.

---

### Task 11: Single-facet pieces get both ends matched

**Defect (Task 8 review):** in `adjustTesselation` (`src/lib/patterns/tesselation/shared/adjuster.ts`, the loop's `f === 0 || f === band.facets.length - 1` branch) and `getTransformedPartnerCutPattern` (`helpers.ts`), a band with **one** facet has `f === 0` and `f === last` on the same facet, and only the start branch runs (`f === 0 ? translatedStart… : translatedEnd…`, and `partnerSources` / `partnerTargets` chosen for one end). Its end is never matched. One-facet bands arise in practice from splits — any unequal split of a 4-quad band leaves a 1-quad piece — so that piece's seam gets no overlap stroke: no glue surface on a physical part. Check `endsTrimmed` handling on the same facet too, and any other `f === 0 … else last` pattern in the adjuster, carnation (`tiled-carnation-pattern.ts`) and `snap-adjacent-facets.ts`.

**Required behaviour:** a single-facet band has **both** its start end and its end end matched (and trimmed, when `endsTrimmed`), each against its own partner, exactly as a multi-facet band's first and last facets would be. Order of application must not let one end's snap corrupt the other's (they touch different vertices of the unit pattern; verify rather than assume). Multi-facet output byte-identical.

**Tests (must fail before the fix):** real geometry, Shield with `endsMatched: true` (and `endsTrimmed` both ways), split giving a 1-quad piece at a seam: assert the 1-quad piece's seam end strokes coincide with its sibling's (seam edge crossing points equal, in the quad frame, as in the Task 3 glue test / the verification pass's seam-crossing check) and its outer end is matched to its partner. Remove the one-facet exemption at `hidden-band-end-partners.test.ts:~341` if it becomes unnecessary.

**Constraint:** never delete or modify files outside your task (including untracked directories such as `test-results/`).

---

### Task 12: Map pattern band addresses back to 3D bands correctly

**Defect (Task 9 review, pre-existing):** code that maps a cut-pattern address back onto 3D geometry indexes the 3D band array by the pattern address's band number — e.g. `selectionStores.ts:~683` `tubes?.[addr.tube]?.bands[addr.band]` for the partner highlight. Pattern band indices are **pattern band space** (visible bands only; for fillAll surface projections the fill bands shift them — see Task 8, `pattern-band-index.ts`, and the spec's hidden-bands amendment), while the 3D band array is **real** band space. With a hidden band or a fillAll projection, the highlight lands on a neighbouring 3D band, split or not.

**Required behaviour:** one shared mapping from pattern band space → real 3D band (the inverse of Task 8's `buildPatternBandIndex` mapping, or derived from the same source), used by **every** site that maps a pattern address onto 3D geometry. Find them all: grep `src/lib/stores`, `src/components/three-renderer`, `src/components/cut-pattern`, and the assembler/selection code for band lookups into 3D tube/band arrays driven by pattern addresses (partner highlight, selection highlight, band click/hover sync between the pattern pane and the 3D view, `sameGlobuleBand` consumers in `materials.ts`, `bandRingStore`/assembler highlight). Also check the reverse direction (3D click → pattern address). List every site in the report with its direction and fix. Pieces map to their parent's real band (and to parent quad via `parentQuadOffset` where a quad is involved). All-visible, non-fill output unchanged.

**Tests (must fail before the fix):** with a hidden band (and separately a fillAll projection), a pattern address for band _k_ maps to the correct real 3D band for each site with pure logic; round-trip real → pattern → real is identity; unsplit all-visible unchanged.

**Constraint:** never delete or modify files outside your task (including untracked directories).
