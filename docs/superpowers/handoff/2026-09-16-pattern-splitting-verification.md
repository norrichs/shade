# Handoff: Pattern Splitting — Verification Pass

**Date:** 2026-09-16
**Branch:** `feature/pattern-splitting-and-explicit-size`
**Written by:** the session that implemented Phases 0–4, for a fresh session
**Your job:** read the new code, check it against the spec and plan, then verify the functionality actually works.

---

## Start here: read order

1. **This file**, all of it — especially "Known unverified" and "Traps".
2. **The spec** — `docs/superpowers/specs/2026-09-16-pattern-splitting-and-explicit-size-design.md`. This is the binding authority. Where anything disagrees, the spec wins.
3. **The plan** — `docs/superpowers/plans/2026-09-16-pattern-splitting-and-explicit-size.md`. Tasks 1–13 are implemented; 14–18 are not.
4. **The ledger** — `.superpowers/sdd/2026-09-16-pattern-splitting-and-explicit-size/progress.md`. Every ruling made on Ben's behalf, every deferred minor, every review verdict. **One entry in it is false — see below.**

Per-task briefs and implementer/reviewer reports are in that same `.superpowers/sdd/…/` directory (`task-N-brief.md`, `task-N-report.md`, plus `plan-review-report.md` and `plan-amendment-report.md`).

---

## What the feature is

**Pattern splitting.** The app turns 3D parametric geometry into 2D cut patterns for manufacturing — cutting paper, etching wood, fabricating metal. A pattern larger than the configured page currently cannot be produced at all: the page-layout algorithms detect the overflow and refuse. Splitting subdivides an over-large pattern into pieces that each fit a page, to be cut separately and **glued back together so the glued result is indistinguishable from the original**.

Design decisions Ben made, which the code should reflect:

| Decision | Choice |
| --- | --- |
| Split sources | Both hand-placed and auto-derived |
| Split address | Absolute quad index, scoped to a **tube** — every band in that tube cuts at those indices; a band with fewer quads is simply not cut there |
| Authority | Auto-split materialises into the persisted list; thereafter plain hand data. Out-of-range indices are **dropped, never clamped** |
| Seam joinery | Pattern-type dependent. Tiled: existing band-end stroke overlap. Outlined: new split-end tab. Panel: not applicable |
| Split site | Partition the **flattened** band, so pieces are a literal partition of one flat layout |
| Legal positions | Only where `quadIndex % subunitCount === 0` |
| Cross-band partner resolution | Same piece index, falling back to the partner's **last** piece |
| Explicit size | One-shot: sets `pageScale`, then forgotten |

**Explicit size setting** (Phase 6, Tasks 17–18, not started) is a separate, independent half: make the page-layout panel's measurement readouts editable, deriving `pageScale` from the number typed.

---

## Current state — verified facts

- **31 commits** on the branch: 21 touching `src/`, 10 touching `docs/`.
- **Test suite: 961 passed, 101 snapshots passed.** `npm run test:unit`.
- **`npm run check`: 431 errors.** This is the clean baseline and contains **no** tolerated errors — earlier in the run it carried known noise, which has been cleared. Any rise is real signal. Judge by the diff in count; do not expect zero (the project's historical baseline is ~434).
- **62 modified files in the working tree.** These are *not* uncommitted feature work. They are Prettier reflow from a repo-wide `npm run format` run early in the session, verified semantically inert (line re-wrapping only). Left uncommitted deliberately: reverting needs `git checkout --` which this project forbids, and committing 62 unrelated formatting changes would bury the feature diff. **Do not commit them and do not treat them as yours.**

---

## What was built, by phase

**Phase 0 — characterization baseline** (Tasks 1–2, `8dad8b7`, `1d50be9`)
20 tests locking `isSameAddress`/`concatAddress` behaviour, plus a verified-real snapshot of an unsplit generated tube pattern. These exist so every later refactor can prove it changed nothing. Two are named `QUIRK` and deliberately assert behaviour nobody considers desirable.

**Phase 1 — piece addressing** (Tasks 3–6, `7023aa6`, `8b8f392`, `05206d0`, `98d5437`, `9797368`)
`GlobuleAddress_BandPiece` added; `isSameAddress`'s `Object.keys`-length heuristic replaced with an explicit granularity comparison; `concatAddress` made piece-aware (it's used as a Svelte `{#each}` key, so colliding strings were a live bug); four duplicate `bandKey` copies consolidated into one shared piece-aware helper; `findBandByAddress` given a two-pass lookup — exact match for seams, same-piece-index-then-last for cross-band partners.

**Phase 2 — the split itself** (Tasks 7–9a, `08c64cb`, `d07f474`, `0e1ee5e`, `86c2d17`, `7bc2838`)
`SplitConfig`/`TubeSplits` persisted on `PatternConfig` as an **optional** field (that optionality is load-bearing — it's what makes a migration unnecessary); `validateSplitConfig` dropping out-of-range indices; `splitFlatBands` partitioning the flattened facet array at legal quad boundaries; insertion into both the tiled and outlined generation paths; and **Task 9a**, which plumbs persisted splits through to generation.

**Phase 3 — tiled seams** (Tasks 10–11, `8c9f952`, `a06a7a6`, `808ab7e`, `b24c547`)
`meta`'s partner addresses widened to optional and to admit the piece-bearing form, with each band end resolved independently; seam partners wired **reciprocally** between sibling pieces so the existing `endsMatched` machinery produces the overlapping strokes that become the glue surface; `segmentIndex` label anchors resolved in parent coordinates via `parentQuadOffset`.

**Phase 4 — outlined seams** (Tasks 12–13, `1bd95a4`, `8481b6c`, `f8ec705`)
`OutlinedTabConfig.splitEnd` added, allocated by **piece** index (the existing `bandEnd` rule compares tube indices, and sibling pieces share a tube, so it's degenerate — two tabs or none); `OutlineEdge.seamPartnerPiece`; an integration test driving the real `generateOutlinedBandPattern → buildOutlinePath → shouldHaveTab` chain; and the `Split End` select in `PatternView.svelte`.

---

## What remains

| Task | Phase | What | Beads |
| --- | --- | --- | --- |
| 14 | 5 | Split placement UI — per-boundary click targets, `quad-split-select` interaction mode | `shades-rya` |
| 15 | 5 | `deriveAutoSplits` solver | `shades-rya` |
| 16 | 5 | Splits panel group + auto-split button | `shades-rya` |
| 17 | 6 | `derivePageScaleForTarget` + the missing zero guard in `derivePageDimensions` | `shades-ehy` |
| 18 | 6 | Editable size inputs on the measurement rows | `shades-ehy` |

Phase 6 (17–18) touches nothing Phases 0–5 touch and can land independently.

Briefs for all of these are already extracted in `.superpowers/sdd/…/task-N-brief.md` and are current as of this handoff — but see "Traps: briefs drift".

---

## Your task

### 1. Read the new code against the spec

The 21 `src/` commits above are the whole feature so far. Read them as a body, not commit by commit — `git diff 63f7017..HEAD -- src/` is the full picture.

Check it against the spec's decisions table. Specific things worth confirming, because they're the spec's load-bearing claims:

- **Unsplit output is unchanged.** This is the single most important property; the Phase 0 snapshot is the proof vehicle and must match without `-u`.
- **Band indices stay stable.** A piece is addressed by an added `piece` component, never by renumbering bands.
- **Pieces are a literal partition.** Concatenating the pieces' facet arrays reproduces the parent's exactly — that's the mechanical statement of "the glued result is the original."
- **Seam wiring is reciprocal.** Piece N's end partner is N+1 *and* N+1's start partner is N. One-directional wiring snaps each seam to the far end of its neighbour — working-looking code, unusable output.
- **`splitEnd` unset changes nothing** for outlined patterns.

### 2. Verify the functionality actually works

This is the part that has **not** been done, and it's why this handoff exists. The unit tests are thorough; nobody has confirmed the feature works in the app.

Suggested route:

1. `npm run dev` (port **9776**). **Start a fresh server** — see "Traps: stale server".
2. Open `/designer2` with the Chrome extension (`mcp__claude-in-chrome__*`; it works in this project).
3. **Reach the pattern editor via the HoverSidebar rail, by index into `nav .hover-button-container button`.** At last check that rail had 17 buttons with `PatternView` at **index 6**. Do not click the button labelled "Pattern" in the editor-tab row — that's the legacy `TilingControl`, a different component (see "Traps: two editors").
4. Confirm the `Split End` select renders for an outlined pattern with Tabs enabled, and that choosing a value persists.
5. There is **no UI to place a split yet** (that's Task 14). To exercise the actual splitting, write `patternConfig.splits` directly via `javascript_tool` — e.g. `{ tubeSplits: [{ tube: 0, quads: [2] }] }` — and confirm the pattern pane renders more bands than before.
6. The pattern pane is **empty until Geometry is switched to Voronoi**. An assertion made before that passes trivially against zero bands.
7. For a tiled pattern with `endsMatched` on, confirm two pieces' strokes meet at the seam. This check was deferred from Task 11 to Task 14 precisely because no UI could set a split.

---

## Known unverified, and one false record

**The ledger contains a false entry. Strike it.** Under Task 13 there is an entry beginning *"CONTROLLER CORRECTION — I WAS WRONG AND THE IMPLEMENTER WAS RIGHT"*, crediting a stale-HMR diagnosis. That conclusion was **wrong**. A cache-busted reload still showed no control, which killed the theory. The actual explanation is almost certainly "Traps: two editors" below — I was looking at `TilingControl`, not `PatternView`. Do not trust that entry; replace it with what you find.

**Task 13's UI control is unverified.** The markup is correct at `PatternView.svelte:240` and mirrors the Band End row exactly, using the file's uncontrolled `value=` + `onchange` + `setTab` idiom. Nobody has seen it render. It is the first thing to check.

**Nothing in the plan's fixtures covers a tube containing a hidden band.** Every fixture has all bands visible, so the visible-vs-real band index space is untested. That's the exact blind spot that made an early `address.band` bug invisible to the Phase 0 snapshot.

**Open deferred minor:** `generate-tiled-pattern.ts:446` has `(seamPiece as number)`, narrowing inside a closure after an external guard. Runtime-safe; the clean fix is passing `seamPiece` as a parameter.

**Open beads bug:** `shades-azt` — `partner-pair-resolver.ts:42` has a local piece-blind `findBandByAddress` that will resolve to the wrong sibling piece. Blast radius is one caller inside the tile editor, off the generation path, so manufacturing output is unaffected.

---

## Traps that cost this session real time

**Two editors.** `designer2/+page.svelte:81` mounts the legacy `components/controls/TilingControl.svelte`. `components/modal/editor/PatternView.svelte` is mounted separately, via `HoverSidebar` with `projectionConfigs` at `:87`. **Both render a panel with tab controls and near-identical labels.** `TilingControl` has `Tab Shape`, `Tab Width`, `Band Edge Tabs`, `Adjacent Tab Layout`, `Band End Tabs` as plain `<span>`s and **zero** `LabeledControl` usages; `PatternView` uses `LabeledControl` throughout. If you're looking at a panel with no `LabeledControl` elements in the DOM, you're in the legacy one and nothing from Tasks 12–13 will be there. I lost a dozen turns and produced three wrong theories to this.

**Stale server.** A dev server started *before* a commit can serve a page whose module graph predates it. Check the server's start time against your commit time. `curl http://localhost:9776/src/<path>.svelte | grep <marker>` tells you what the server is actually serving, without any UI navigation.

**Briefs drift.** A brief is a snapshot taken when it was extracted. Fix rounds keep landing in files later tasks also touch, so **re-run `scripts/task-brief` and reconnoitre the tree before each dispatch**. Twice a brief told an implementer to write code that already existed.

**Briefs predicted wrong RED failures, four times.** One reason is general: **Jest does not type-check `.test.ts` files**, so any brief predicting a *type error* as the RED failure is wrong by construction. Tasks 14–18 were audited and contain none of these.

**Tests that cannot fail — six instances.** The recurring shape is an optional parameter that is never passed: it type-checks, returns a plausible answer, and the test passes either way. Twice a brief itself mandated such a test and the implementer correctly refused. **For every test, work out by hand what it would receive if the change were absent.** If that equals what it asserts, the test is worthless.

**Review packaging ranges.** Plan commits interleave with code commits on this branch, so a naive `base..HEAD` sweeps documentation into a code review. Check `git log --oneline base..HEAD` before packaging; hand-build the diff if needed.

---

## Conventions

- **Never `git push`.** Local-only app. Commit and stop.
- Never `git stash`, `git checkout <branch>`, or `git reset`.
- **Indentation is tabs.** Format only files you touched: `npx prettier --write <files>`. **Never `npm run format`** — it rewrites ~62 unrelated files.
- Stage only your own files by explicit path. Never `git add -A`.
- **Never `jest -u`.** The snapshot is a correctness gate, not a record to refresh.
- Geometry generation runs in a Web Worker; Vite does not rebuild it on reload, so restart the dev server after touching anything under `src/lib/workers/`.
- Attribution on commits:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: <session url>`

---

## A note on the beads DB

`bd list --status=open` currently returns 8 issues, and **some are not from this plan** — `shades-bv5` ("Phase 3: remove the fixed pane and re-grid designer2") and `shades-mx7` ("Phase 4: delete Projection and Cut editors") belong to separate work and their phase numbers collide with this plan's. Don't conflate them.

`shades-1xp` (this plan's Phase 4) does not appear in the open list and I did not close it — **verify its state rather than assuming**. This plan's remaining issues are `shades-rya` (Phase 5), `shades-ehy` (Phase 6), the `shades-5a9` epic, and the `shades-azt` bug.
