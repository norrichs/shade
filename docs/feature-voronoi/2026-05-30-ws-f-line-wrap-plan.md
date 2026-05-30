# Pattern Layout Line-Wrapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggle (`lineWrap`) and `wrapWidth` input to the cut-pattern view so bands flow left-to-right and break to a new row (offset by the measured row height) when the configured width is exceeded, defaulting to today's single-row layout.

**Architecture:** Extract the band-origin accumulator currently inlined in `CutPatternRenderer.svelte` into a pure, unit-tested function `computeWrappedOrigins(bands, opts)` that returns a flat `Vector3[]`. Both render branches feed their ordered band list (with `bounds` + `verticalAlignment`) through this one function; the tube-grouped branch re-wraps the flat result back into the `origins.tubes[t].bands[b]` shape its template consumes. New config fields live on `PatternViewConfig`, are wired through `defaultPatternViewConfig()`, and are edited from `CutPatternControl.svelte`.

**Tech Stack:** SvelteKit + Svelte 5 runes, TypeScript, Three.js `Vector3`, Jest (colocated `__tests__`).

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/cut-pattern/compute-wrapped-origins.ts` | **create** | Pure greedy layout accumulator returning `Vector3[]`; shared by both render branches. Exports `computeWrappedOrigins`, the `WrapInput` / `WrapOpts` types, and the `ROW_GAP` / `GAP_BETWEEN_BANDS` constants. |
| `src/lib/cut-pattern/__tests__/compute-wrapped-origins.test.ts` | **create** | Jest unit tests for the pure function (single-row regression, wrapping, over-wide band, heterogeneous heights, continuous cross-tube wrapping). |
| `src/lib/types.ts` | **modify** | Add `lineWrap?: boolean` and `wrapWidth?: number` to `PatternViewConfig` (`:41`–`:56`). |
| `src/lib/shades-config.ts` | **modify** | Add defaults `lineWrap: false`, `wrapWidth: 800` to `defaultPatternViewConfig()` (`:544`). |
| `src/components/cut-pattern/CutPatternRenderer.svelte` | **modify** | Replace inline `getFlatOrigins` / `getCumulativeOrigins` accumulation with calls to `computeWrappedOrigins`; read `lineWrap` / `wrapWidth` from the store. |
| `src/components/cut-pattern/CutPatternControl.svelte` | **modify** | Add the `lineWrap` checkbox and conditional `wrapWidth` number input. |

---

## Design decisions (resolved)

- **`ROW_GAP`**: reuse the existing horizontal gap value. Define `ROW_GAP = GAP_BETWEEN_BANDS` (both `20`) in the new module and re-export `GAP_BETWEEN_BANDS` so the Svelte file imports both from one place (DRY; today the renderer hardcodes `GAP_BETWEEN_BANDS = 20` at `:44`).
- **Row break rule**: break when `lineWrap && x > 0 && (x + w) > wrapWidth`. The `x > 0` guard means a band wider than `wrapWidth` still occupies its own row and never produces an empty leading row.
- **Row height**: `rowMaxHeight = max(band.bounds.height)` across bands placed in the current row. The next row's `rowY` advances by `rowMaxHeight + ROW_GAP` (measured, not last-band).
- **`alignedY`**: applied within the row, i.e. `y = rowY + alignedY(band, verticalAlignment)`. The standalone `alignedY` switch stays in the Svelte file (it depends only on `bounds.height`); the pure function receives each band's pre-computed `alignedYOffset` so it has zero Svelte/Three coupling beyond `Vector3`.
- **`lineWrap === false`**: the loop never breaks (`x` only ever grows), so output is byte-for-byte the current single-row `x += w + gap` accumulation. This is locked by a regression test.
- **Cumulative shape**: `getCumulativeOrigins` keeps returning `{ tubes: [{ bands: Vector3[] }] }`. It flattens `tubes.flatMap(t => t.bands)` into one ordered array, calls `computeWrappedOrigins` once (so wrapping is continuous across tube boundaries, not reset per tube), then slices the flat `Vector3[]` back into per-tube groups by band count. The old shared-mutable `cumulativeOrigin` Vector3 is removed.

## Pure function contract

```ts
// src/lib/cut-pattern/compute-wrapped-origins.ts
import { Vector3 } from 'three';

export const GAP_BETWEEN_BANDS = 20;
export const ROW_GAP = GAP_BETWEEN_BANDS;

export type WrapInput = {
	width: number;        // band.bounds?.width || 0
	height: number;       // band.bounds?.height || 0
	alignedYOffset: number; // result of alignedY(band, verticalAlignment)
};

export type WrapOpts = {
	gap?: number;       // horizontal gap, default GAP_BETWEEN_BANDS
	rowGap?: number;    // vertical gap, default ROW_GAP
	lineWrap?: boolean; // default false
	wrapWidth?: number; // default Infinity (no wrap)
};

export const computeWrappedOrigins = (bands: WrapInput[], opts?: WrapOpts): Vector3[];
```

Behavior: returns one `Vector3(x, rowY + alignedYOffset, 0)` per input band, in order, using the greedy accumulator described above.

---

## Task 1: Pure `computeWrappedOrigins` — single-row regression (lineWrap off)

**Files:**
- Test: `src/lib/cut-pattern/__tests__/compute-wrapped-origins.test.ts` (create)
- Impl: `src/lib/cut-pattern/compute-wrapped-origins.ts` (create)

- [ ] Write a failing test file. Import `{ computeWrappedOrigins, GAP_BETWEEN_BANDS } from '../compute-wrapped-origins'`. Add a helper `band(width: number, height: number, alignedYOffset = 0): WrapInput`. First test, `'lineWrap=false lays bands in a single row using x += width + gap'`:
  ```ts
  const bands = [band(100, 50), band(200, 30), band(150, 80)];
  const origins = computeWrappedOrigins(bands, { lineWrap: false });
  expect(origins.map((o) => o.x)).toEqual([0, 120, 340]);
  expect(origins.map((o) => o.y)).toEqual([0, 0, 0]);
  ```
  (x: 0, then 0+100+20=120, then 120+200+20=340; gap defaults to `GAP_BETWEEN_BANDS=20`.)
- [ ] Second test in same file, `'applies alignedYOffset within the (single) row'`:
  ```ts
  const origins = computeWrappedOrigins([band(100, 50, -25), band(100, 50, -25)], { lineWrap: false });
  expect(origins.map((o) => o.y)).toEqual([-25, -25]);
  ```
- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/compute-wrapped-origins.test.ts` — expect FAIL (Cannot find module `../compute-wrapped-origins`).
- [ ] Create `src/lib/cut-pattern/compute-wrapped-origins.ts` with the exact exports from the contract above. Minimal impl:
  ```ts
  import { Vector3 } from 'three';

  export const GAP_BETWEEN_BANDS = 20;
  export const ROW_GAP = GAP_BETWEEN_BANDS;

  export type WrapInput = { width: number; height: number; alignedYOffset: number };
  export type WrapOpts = {
  	gap?: number;
  	rowGap?: number;
  	lineWrap?: boolean;
  	wrapWidth?: number;
  };

  export const computeWrappedOrigins = (bands: WrapInput[], opts: WrapOpts = {}): Vector3[] => {
  	const gap = opts.gap ?? GAP_BETWEEN_BANDS;
  	const rowGap = opts.rowGap ?? ROW_GAP;
  	const lineWrap = opts.lineWrap ?? false;
  	const wrapWidth = opts.wrapWidth ?? Infinity;

  	let x = 0;
  	let rowY = 0;
  	let rowMaxHeight = 0;

  	return bands.map(({ width, height, alignedYOffset }) => {
  		if (lineWrap && x > 0 && x + width > wrapWidth) {
  			rowY += rowMaxHeight + rowGap;
  			x = 0;
  			rowMaxHeight = 0;
  		}
  		const origin = new Vector3(x, rowY + alignedYOffset, 0);
  		x += width + gap;
  		rowMaxHeight = Math.max(rowMaxHeight, height);
  		return origin;
  	});
  };
  ```
- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/compute-wrapped-origins.test.ts` — expect PASS.
- [ ] Commit:
  ```bash
  git add src/lib/cut-pattern/compute-wrapped-origins.ts src/lib/cut-pattern/__tests__/compute-wrapped-origins.test.ts
  git commit -m "feat(cut-pattern): pure computeWrappedOrigins with single-row default

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 2: Wrapping behavior — break, row height, over-wide band

**Files:**
- Test: `src/lib/cut-pattern/__tests__/compute-wrapped-origins.test.ts` (modify)
- Impl: `src/lib/cut-pattern/compute-wrapped-origins.ts` (already correct from Task 1 — these tests verify it)

- [ ] Add failing test `'lineWrap=true breaks to a new row when x + width > wrapWidth'`:
  ```ts
  // wrapWidth 300, gap 20. b0 w=100 h=40 @x0; b1 w=150 h=60 (100+20=120, 120+150=270 <=300) @x120;
  // b2 w=200 h=30: x=120+150+20=290>0, 290+200=490>300 -> new row. rowMaxHeight of row0 = max(40,60)=60.
  const bands = [band(100, 40), band(150, 60), band(200, 30)];
  const origins = computeWrappedOrigins(bands, { lineWrap: true, wrapWidth: 300 });
  expect(origins.map((o) => o.x)).toEqual([0, 120, 0]);
  expect(origins.map((o) => o.y)).toEqual([0, 0, 60 + GAP_BETWEEN_BANDS]); // 80
  ```
- [ ] Add failing test `'row offset uses the row max height, not the last band height'`:
  ```ts
  // wrapWidth 250. b0 w=100 h=90; b1 w=100 h=20 (x=120, 120+100=220<=250) @x120;
  // b2 w=100 h=10: x=120+100+20=240>0, 240+100=340>250 -> new row at max(90,20)+20 = 110.
  const bands = [band(100, 90), band(100, 20), band(100, 10)];
  const origins = computeWrappedOrigins(bands, { lineWrap: true, wrapWidth: 250 });
  expect(origins[2].y).toBe(90 + GAP_BETWEEN_BANDS); // 110, from row max 90 not last band 20
  ```
- [ ] Add failing test `'a band wider than wrapWidth gets its own row with no empty leading row'`:
  ```ts
  // wrapWidth 100. b0 w=500 (oversized): x=0 so x>0 guard keeps it on row0 at x=0.
  // b1 w=50: x=500+20=520>0, 520+50>100 -> new row. row0 max height = 80.
  const bands = [band(500, 80), band(50, 40)];
  const origins = computeWrappedOrigins(bands, { lineWrap: true, wrapWidth: 100 });
  expect(origins.map((o) => o.x)).toEqual([0, 0]);
  expect(origins.map((o) => o.y)).toEqual([0, 80 + GAP_BETWEEN_BANDS]); // no empty leading row
  ```
- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/compute-wrapped-origins.test.ts` — expect PASS (Task 1 impl already satisfies these; if any fail, the impl is wrong — fix the impl, not the tests).
- [ ] Commit:
  ```bash
  git add src/lib/cut-pattern/__tests__/compute-wrapped-origins.test.ts
  git commit -m "test(cut-pattern): cover wrapping, row height, and over-wide band

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 3: Add `lineWrap` / `wrapWidth` to the type and defaults

**Files:**
- Impl: `src/lib/types.ts` (`PatternViewConfig`, `:41`–`:56`)
- Impl: `src/lib/shades-config.ts` (`defaultPatternViewConfig`, `:544`)
- Test (type-level): `npm run check`

> No Jest test here — these are purely additive optional fields. The TDD signal is `npm run check` passing plus the Task 4 renderer compiling against the new fields.

- [ ] In `src/lib/types.ts`, add to `PatternViewConfig` after `bandSortMode: BandSortMode;` (`:55`):
  ```ts
  	lineWrap?: boolean;
  	wrapWidth?: number;
  ```
- [ ] In `src/lib/shades-config.ts`, in `defaultPatternViewConfig()` (`:544`), add after `bandSortMode: 'tube-order'`:
  ```ts
  	lineWrap: false,
  	wrapWidth: 800
  ```
  (Update the preceding line to add a trailing comma.)
- [ ] Run: `npm run check` — expect PASS (no new type errors). Persisted configs without these fields stay valid because both are optional; `migrateGlobulePatternConfig` needs no change.
- [ ] Commit:
  ```bash
  git add src/lib/types.ts src/lib/shades-config.ts
  git commit -m "feat(cut-pattern): add lineWrap/wrapWidth to PatternViewConfig

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 4: Wire the renderer to the pure function (both branches)

**Files:**
- Impl: `src/components/cut-pattern/CutPatternRenderer.svelte` (`:44` constant, `:58`–`:92` accumulators, `:158`–`:159` derived)
- Test: `npm run check` + described manual check

> The pure layout math is already covered by Jest (Tasks 1–2). This task is Svelte glue: verified by `npm run check` and a manual visual check.

- [ ] At the top of the `<script>` block add the import (next to the existing `three` import at `:7`):
  ```ts
  import {
  	computeWrappedOrigins,
  	GAP_BETWEEN_BANDS,
  	type WrapInput
  } from '$lib/cut-pattern/compute-wrapped-origins';
  ```
- [ ] Remove the local constant `const GAP_BETWEEN_BANDS = 20;` (`:44`) — it now comes from the import.
- [ ] Keep `alignedY` (`:46`–`:56`) unchanged (it is the Svelte-side adapter feeding `WrapInput.alignedYOffset`).
- [ ] Replace `getFlatOrigins` (`:80`–`:92`) with a version that maps to `WrapInput[]` and delegates:
  ```ts
  const getFlatOrigins = (
  	bands: ResolvedBand[],
  	gap: number = GAP_BETWEEN_BANDS,
  	verticalAlignment: 'top' | 'bottom' | 'center' = 'center',
  	lineWrap = false,
  	wrapWidth?: number
  ): Vector3[] => {
  	const inputs: WrapInput[] = bands.map(({ band }) => ({
  		width: band.bounds?.width || 0,
  		height: band.bounds?.height || 0,
  		alignedYOffset: alignedY(band, verticalAlignment)
  	}));
  	return computeWrappedOrigins(inputs, { gap, lineWrap, wrapWidth });
  };
  ```
- [ ] Replace `getCumulativeOrigins` (`:58`–`:78`) so it flattens, wraps once (continuous across tubes), then re-nests — preserving the `origins.tubes[t].bands[b]` shape the template at `:203` reads:
  ```ts
  const getCumulativeOrigins = (
  	tubes: TubeCutPattern[],
  	gap: number = GAP_BETWEEN_BANDS,
  	verticalAlignment: 'top' | 'bottom' | 'center' = 'center',
  	lineWrap = false,
  	wrapWidth?: number
  ) => {
  	const flatBands = tubes.flatMap((tube) => tube.bands);
  	const inputs: WrapInput[] = flatBands.map((band) => ({
  		width: band.bounds?.width || 0,
  		height: band.bounds?.height || 0,
  		alignedYOffset: alignedY(band, verticalAlignment)
  	}));
  	const flat = computeWrappedOrigins(inputs, { gap, lineWrap, wrapWidth });

  	let cursor = 0;
  	return {
  		tubes: tubes.map((tube) => ({
  			bands: tube.bands.map(() => flat[cursor++])
  		}))
  	};
  };
  ```
- [ ] Add derived reads of the new config near `range` (`:139`):
  ```ts
  let lineWrap = $derived($patternConfigStore.patternViewConfig.lineWrap ?? false);
  let wrapWidth = $derived($patternConfigStore.patternViewConfig.wrapWidth ?? 800);
  ```
- [ ] Update the two `$derived` origin lines (`:158`–`:159`) to pass the new args:
  ```ts
  let origins = $derived(
  	getCumulativeOrigins(filteredTubes, GAP_BETWEEN_BANDS, 'center', lineWrap, wrapWidth)
  );
  let flatOrigins = $derived(
  	indexedBands ? getFlatOrigins(indexedBands, GAP_BETWEEN_BANDS, 'center', lineWrap, wrapWidth) : undefined
  );
  ```
- [ ] Run: `npm run check` — expect PASS. Confirm both template branches still index origins identically: `flatOrigins[i]` (`:169`) and `origins.tubes[t].bands[b]` (`:203`) are unchanged.
- [ ] Manual check (described, no code): `npm run dev`, open the cut-pattern view (`/designer2`). With `lineWrap` off, layout is unchanged single-row. (Toggle UI lands in Task 5; for now temporarily confirm via Drizzle/localStorage or defer the visual wrap check to after Task 5.)
- [ ] Commit:
  ```bash
  git add src/components/cut-pattern/CutPatternRenderer.svelte
  git commit -m "refactor(cut-pattern): route band origins through computeWrappedOrigins

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 5: UI controls — `lineWrap` toggle + conditional `wrapWidth` input

**Files:**
- Impl: `src/components/cut-pattern/CutPatternControl.svelte` (controls block, near `:46`–`:55` checkboxes / `:92`–`:112` selects)
- Test: `npm run check` + described manual check

> UI glue. No Jest. Verified by `npm run check` and the manual toggle check below.

- [ ] In `src/components/cut-pattern/CutPatternControl.svelte`, inside the existing checkbox `<div>` (`:46`–`:55`), add after the "show Labels" checkbox:
  ```svelte
  <CheckboxInput
  	label="line wrap"
  	bind:value={$patternConfigStore.patternViewConfig.lineWrap}
  />
  {#if $patternConfigStore.patternViewConfig.lineWrap}
  	<NumberInput
  		label="wrap width"
  		min={50}
  		max={5000}
  		step={10}
  		bind:value={$patternConfigStore.patternViewConfig.wrapWidth}
  	/>
  {/if}
  ```
  (`CheckboxInput` props are `{ value, label }`; `NumberInput` accepts `label`/`min`/`max`/`step`/`bind:value` — both already imported at `:4`–`:5`.)
- [ ] Note: persisted configs may have `lineWrap` / `wrapWidth` as `undefined` initially. `CheckboxInput` binds `checked={undefined}` (renders unchecked, fine) and the `{#if}` only shows the number input once toggled on. The defaults in Task 3 cover fresh configs.
- [ ] Run: `npm run check` — expect PASS.
- [ ] Manual check (described): `npm run dev`, open the cut-pattern view. Toggle "line wrap" on → "wrap width" input appears. Set `wrapWidth` to a value smaller than the current single-row total → bands break into multiple rows; rows with mixed band heights do not overlap (the taller band in a row sets the next row's offset). Toggle off → layout returns to the original single row.
- [ ] Commit:
  ```bash
  git add src/components/cut-pattern/CutPatternControl.svelte
  git commit -m "feat(cut-pattern): line-wrap toggle and wrap-width control

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 6: Cross-tube continuity test for the cumulative wrapping path

**Files:**
- Test: `src/lib/cut-pattern/__tests__/compute-wrapped-origins.test.ts` (modify)
- Impl: none (locks the Task 4 cumulative behavior at the pure-function level)

> Task 4's cumulative variant flattens all tube bands into one ordered list before wrapping. The continuity guarantee lives in the pure function: a single ordered call wraps continuously regardless of tube grouping. This test pins that exact ordering/wrapping that the renderer relies on.

- [ ] Add failing test `'wrapping is continuous across a flattened multi-tube sequence'`:
  ```ts
  // Simulate two tubes flattened in order: tubeA=[w=100], tubeB=[w=100, w=100]. wrapWidth 250, gap 20.
  // x: b0@0 -> 120; b1@120 (120+100=220<=250) -> 240; b2: 240>0, 240+100=340>250 -> new row @0.
  const flat = [band(100, 30), band(100, 30), band(100, 50)];
  const origins = computeWrappedOrigins(flat, { lineWrap: true, wrapWidth: 250 });
  expect(origins.map((o) => o.x)).toEqual([0, 120, 0]);
  // row0 max height = max(30,30) = 30, so b2 row offset = 30 + gap = 50
  expect(origins[2].y).toBe(30 + GAP_BETWEEN_BANDS);
  ```
- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/compute-wrapped-origins.test.ts` — expect PASS.
- [ ] Run the full suite once: `npm run test:unit` — expect PASS (no regressions in sibling `cut-pattern` tests).
- [ ] Commit:
  ```bash
  git add src/lib/cut-pattern/__tests__/compute-wrapped-origins.test.ts
  git commit -m "test(cut-pattern): pin continuous cross-tube wrapping order

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Self-review checklist (completed during planning)

- **Spec coverage:** single-row regression (Task 1), break rule + row max height + over-wide band (Task 2), config fields (Task 3), apply to both `getFlatOrigins` and `getCumulativeOrigins` preserving nested shape (Task 4), UI toggle + conditional width (Task 5), continuous cross-tube wrapping (Task 6). All spec bullets mapped.
- **Placeholder scan:** every referenced symbol is real and verified — `PatternViewConfig` (`types.ts:41`), `defaultPatternViewConfig` (`shades-config.ts:544`), `BandCutPattern.bounds` (`types.ts:351`), `alignedY` / `getFlatOrigins` / `getCumulativeOrigins` / `GAP_BETWEEN_BANDS` (`CutPatternRenderer.svelte:44–92`), template indices `flatOrigins[i]` / `origins.tubes[t].bands[b]` (`:169`/`:203`), `CheckboxInput` props `{ value, label }`, `NumberInput` (both imported in `CutPatternControl.svelte:4–5`), `patternConfigStore` (`globulePatternStores.ts:14`), Jest via `npm run test:unit` (`package.json:10`). `ROW_GAP`, `WrapInput`, `WrapOpts`, `computeWrappedOrigins` are all defined in Task 1 before any later reference.
- **Type consistency:** `computeWrappedOrigins` is Svelte-free (only `Vector3` + plain numbers); the renderer adapts `BandCutPattern` → `WrapInput` via the existing `alignedY`. New config fields are optional → persisted configs and `migrateGlobulePatternConfig` need no migration.
- **DRY/YAGNI:** one accumulator, one gap constant exported from one module; greedy left-to-right only (no justification/pagination, per Out of Scope).
