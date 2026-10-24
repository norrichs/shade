---
name: creating-tiled-patterns
description: Use when Ben asks for a new tiled cut pattern in Shades, or a variant of an existing one (Asanoha, HexParquet, HexParquet2, grid, carnation…), usually from a drawing or screenshots of a unit, its subunits, or the band outline it should produce.
---

# Creating tiled patterns

A tiled pattern is a unit drawing mapped onto each quad of a band, optionally cycling
subunits one per quad, then adjusted per tube (drops, gains from neighbours, end caps).
The work is mostly **reading Ben's design exactly**. Collect the screenshots and answers
first, decode the geometry from pixels yourself, and render the result before Ben looks.

Work in a worktree (see the worktree recipe in memory). Base the new module on the
nearest existing pattern; HexParquet2 (`src/lib/patterns/tiled-hexparquet2-pattern.ts`)
is the reference for subunits plus an interlocking band outline.

## 1. Screenshots to request

Ask for whichever of these are missing, in one message:

| # | Screenshot | Why |
|---|---|---|
| A | The unit alone | The overall shape |
| B | The unit over its quads, alternating colours, **with a grid overlay**, plus the grid line positions in words (e.g. "6 columns; rows at 0, 2, 3, 6…") | Exact node coordinates, and the subunit boundaries |
| C | Several units tiled across 3+ bands, with **one band's outline** drawn heavy and the quads shaded | The seam curve: what a band gives away and what it takes |
| D | An edge band (open tube, e.g. surface projection): left edge, and right edge if it differs | Open-side outlines |
| E | Band start/end close-ups, and split seams if they differ from ends | Caps, closures, trims |

## 2. Brainstorm (AskUserQuestion, recommended option first)

- **Orientation:** the image top is the band's end (unit y = 1, quad i+1 above quad i). Which subunit is facet 0? The viewer may show bands mirrored relative to the drawings; agree with Ben whether that is acceptable.
- **Sources:** "based on X and Y": ask which part comes from each (geometry, snaps, outline, ends). Asanoha has an alias id (`tiledAsanohaSplitPattern-0`), and there are two HexParquets.
- **Seam ownership:** bands are cut apart, so each band should draw its whole outline. Recommend `keepPartnerSeam: true` in the new pattern's `tiledPatternConfigs` entry; the code falls back to `false` when the field is absent. Ask, don't assume.
- **Open right side:** mirror the open left side, or something else?
- **Split seams:** treat them as band ends, or interlock like Asanoha?
- **Columns:** with `columnCount > 1`, does the outline apply only at the band edges?

## 3. Decode the geometry

1. Measure grid pixels from B, so you get x in columns and `row` counted down from the unit's top. Read every line endpoint off the image and confirm slopes; on a √3 grid, 30° diagonals move one column per row.
2. Write segments in grid coordinates and convert with `toUnit`, as HexParquet2 does: `y = (totalRows − rowsPerSubunit·s − row) / rowsPerSubunit`.
3. Split each segment at every crossing that an outline or drop can stop at, and at subunit boundaries.
4. If every node lies in [0,1]², no snapping is needed. Otherwise follow HexParquet's snap rules.
5. Choose the hook. `adjustAfterMapping` sees one band at a time (snaps within the band). `adjustAfterTiling` sees the whole tube and is needed for anything that reads a neighbour band. Ben's "post-mapping adjustment" for an outline that reaches into neighbours means `adjustAfterTiling`.
6. Trace the outline from C as a polyline in grid coordinates, and tag each segment (`seamLeft`, `seamRight`, `giveRight`, `openLeft`, `pastStart`/`pastEnd`…). Gains are the partner's tagged segments, mapped through the partner's quad and `alignPrevBandPath`/`alignNextBandPath`.

## 4. Registration checklist

- Type id `tiled<Name>Pattern-0`, module `src/lib/patterns/tiled-<name>-pattern.ts`
- `src/lib/patterns/pattern-definitions.ts`: the entry (`subunitCount`, `getSubunitPatterns`, `getPattern` = stacked preview, `tagAnchor` (`{ facetIndex: 0, quadEdge: { edge: 'ab', position: 'midPoint' } }`), `adjustAfterTiling`, `adjustAfterTilingNeedsEndPartners: false`)
- `src/lib/shades-config.ts`: the `tiledPatternConfigs` default (this also creates the picker tile)
- `src/components/modal/editor/PatternView.svelte`: `SUBUNIT_PATTERN_TYPES`, if the pattern cycles subunits
- `src/lib/types.ts`: the `keepPartnerSeam` doc, if the pattern uses it (`TiledPattern` is a plain `string`, not a union)
- `.claude/skills/shades-control/reference/pattern-config.md`: a row for the new type
- Fixture tests that list every pattern:
  - `adjust-after-tiling-non-mutation.test.ts`: the registered list
  - `unsplit-geometry-characterization.test.ts`: `EXPECTED`, recorded with `GUARD_RECORD=<file>`. Existing hashes must not change.
- Once a second pattern shares HexParquet2's outline helpers, move them to `src/lib/patterns/adjust/`.

## 5. Verify before handing over

- **Unit tests:**
  - every node lies inside its quad;
  - **exactly-once tiling**: across a wrapping tube with the seam drawn once, every tiling line plus the end caps appears exactly once, with 1 and 2 columns;
  - one test per outline rule (gains, open sides, end trims, closed outline with the default config).
- **E2E on real projection geometry:** the default edge curve gives 4 quads per band, so set `divisions: 3` for 3 subunits (see `hexparquet2-pattern-projections.e2e.test.ts`).
- **Render and compare:** copy `render-bands.test.ts` (in this skill's directory) into `src/lib/patterns/__render__/`, run it per its header, convert the SVGs with `rsvg-convert`, Read the PNGs and compare them against C and D. Delete the copy.
- `yarn run check`, lint, and the `src/lib/patterns` and `src/lib/cut-pattern` suites.
- Start the worktree dev server and give Ben the URL; he judges visually. Merge to `main` only when he says so.

## Common mistakes

| Mistake | Fix |
|---|---|
| Leaving `keepPartnerSeam` false (copied from HexParquet) | Cut-apart bands need their whole outline; ask Ben, then set it in the config entry |
| Guessing open-right-side or split-seam behaviour silently | Ask in step 2, then list the answers in the hand-off |
| Asking Ben to type coordinates | Decode them from the grid screenshot |
| Treating the two fixture test failures as regressions | They list every pattern; add the new entry |
| Testing on the default projection | 4 quads per band; a 3-subunit pattern refuses every band |
| Trusting passing tests alone | Render and compare against the screenshots first |
