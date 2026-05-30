# Pattern Grouping Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each band-sort group a sequential, zero-padded `code` string and expose a pure band→code lookup so downstream tag/CSV consumers (WS-C, WS-D) can render and reference group codes.

**Architecture:** Extend `BandSortGroup` with an optional `code?: string`. Only `buildEndConnectionIndex` populates codes (one per ring, via `formatGroupCode(ringIndex)`); `buildTubeOrderIndex` leaves `code` undefined. A new pure helper `buildBandCodeMap(index)` walks coded groups and returns a `Map<bandKey, code>`. Existing `sliceBandSortIndex` already spreads `...group`, so codes survive slicing unchanged.

**Tech Stack:** TypeScript, Jest (ts-jest ESM preset), SvelteKit. Unit tests colocated under `src/lib/cut-pattern/__tests__/`.

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/lib/types.ts` | Modify (`BandSortGroup`, line 26-29) | Add optional `code?: string` to `BandSortGroup`. |
| `src/lib/cut-pattern/band-sort-index.ts` | Modify (lines 1-85) | Export `formatGroupCode`; set `code` on end-connection ring groups; add and export `buildBandCodeMap`. |
| `src/lib/cut-pattern/__tests__/band-sort-index.test.ts` | Create | Unit tests for `formatGroupCode`, code assignment in `buildBandSortIndex`, `buildBandCodeMap`, and code preservation through `sliceBandSortIndex`. |

### Interface contract delivered to WS-C and WS-D (final, do not change)

```ts
// src/lib/types.ts
export type BandSortGroup = {
	label: string;
	code?: string; // present only for coded modes (end-connection-tube); undefined otherwise
	bands: BandRef[];
};

// src/lib/cut-pattern/band-sort-index.ts
export const formatGroupCode = (n: number): string => String(n).padStart(4, '0');
export const buildBandCodeMap = (index: BandSortIndex): Map<string, string> => { /* ... */ };
```

`buildBandCodeMap` is keyed by `bandKey(ref)` = `` `${ref.globule}-${ref.tube}-${ref.band}` ``.

---

## Reference facts (verified against the codebase)

- `BandRef = GlobuleAddress_Band = { globule: number; tube: number; band: number }` (`src/lib/projection-geometry/types.ts:277`).
- `BandSortMode = 'tube-order' | 'end-connection-tube'` (`src/lib/types.ts:22`).
- `BandSortGroup` currently `{ label: string; bands: BandRef[] }` (`src/lib/types.ts:26-29`).
- `BandSortIndex = { mode: BandSortMode; groups: BandSortGroup[] }` (`src/lib/types.ts:31-34`).
- `IndexRange = { groups?: [number, number]; bandsInGroup?: [number, number] }` (`src/lib/types.ts:36-39`).
- `TubeCutPattern = { projectionType: 'patterned'; address: GlobuleAddress_Tube; bands: BandCutPattern[] }` (`src/lib/types.ts:375-379`). Each band has `address: GlobuleAddress_Band` and optional `meta.endPartnerBand: GlobuleAddress_Band` (`src/lib/types.ts:350-365`).
- `bandKey` is a module-private const in `band-sort-index.ts:3` — it stays private; `buildBandCodeMap` calls it internally.
- Run one test file: `npm run test:unit -- src/lib/cut-pattern/__tests__/band-sort-index.test.ts`
- Type check: `npm run check`
- Test fixture style (see `src/lib/cut-pattern/__tests__/collate-tubes.test.ts`): build `TubeCutPattern` literals and cast with `as unknown as TubeCutPattern` to avoid filling every optional field.

---

### Task 1: Add `code?` to the `BandSortGroup` type

**Files:**
- Modify: `src/lib/types.ts` (lines 26-29)
- Test: `src/lib/cut-pattern/__tests__/band-sort-index.test.ts` (create) — type-level assertion compiled by `npm run check`

This task is a type-only change. There is no runtime behavior to assert with Jest, so verification is via `npm run check`. We create the test file now with a compile-time assertion that `code` is assignable, then layer runtime tests onto it in later tasks.

- [ ] Create the test file with a compile-time check that a `BandSortGroup` accepts an optional `code`:

```ts
// src/lib/cut-pattern/__tests__/band-sort-index.test.ts
import type { BandSortGroup } from '$lib/types';

describe('BandSortGroup type', () => {
	test('accepts an optional code string', () => {
		const withCode: BandSortGroup = { label: 'Ring 0', code: '0000', bands: [] };
		const withoutCode: BandSortGroup = { label: 'Tube 0', bands: [] };
		expect(withCode.code).toBe('0000');
		expect(withoutCode.code).toBeUndefined();
	});
});
```

- [ ] Run type check and confirm it FAILS because `code` is not yet a member of `BandSortGroup`:

```bash
npm run check
```

Expected failure (svelte-check / tsc): `Object literal may only specify known properties, and 'code' does not exist in type 'BandSortGroup'.`

- [ ] Add `code?: string` to `BandSortGroup` in `src/lib/types.ts` (lines 26-29). Replace:

```ts
export type BandSortGroup = {
	label: string;
	bands: BandRef[];
};
```

with:

```ts
export type BandSortGroup = {
	label: string;
	code?: string;
	bands: BandRef[];
};
```

- [ ] Run type check and confirm it PASSES:

```bash
npm run check
```

Expected: exits 0 with no errors (`svelte-check found 0 errors`).

- [ ] Run the new test file and confirm it PASSES:

```bash
npm run test:unit -- src/lib/cut-pattern/__tests__/band-sort-index.test.ts
```

Expected: `1 passed` (the `BandSortGroup type` suite).

- [ ] Commit:

```bash
git add src/lib/types.ts src/lib/cut-pattern/__tests__/band-sort-index.test.ts
git commit -m "feat(band-sort): add optional code to BandSortGroup type"
```

---

### Task 2: Export `formatGroupCode`

**Files:**
- Modify: `src/lib/cut-pattern/band-sort-index.ts` (add export near top, after line 3)
- Test: `src/lib/cut-pattern/__tests__/band-sort-index.test.ts` (append a `describe`)

- [ ] Append a `formatGroupCode` suite to the test file:

```ts
import { formatGroupCode } from '../band-sort-index';

describe('formatGroupCode', () => {
	test('pads single digit to 4 wide', () => {
		expect(formatGroupCode(0)).toBe('0000');
		expect(formatGroupCode(1)).toBe('0001');
	});

	test('pads two digits to 4 wide', () => {
		expect(formatGroupCode(42)).toBe('0042');
	});

	test('does not truncate numbers wider than 4 digits', () => {
		expect(formatGroupCode(10000)).toBe('10000');
	});
});
```

(Place the `import { formatGroupCode } from '../band-sort-index';` line with the other imports at the top of the file.)

- [ ] Run the test and confirm it FAILS because `formatGroupCode` is not exported yet:

```bash
npm run test:unit -- src/lib/cut-pattern/__tests__/band-sort-index.test.ts
```

Expected failure: `TypeError: (0 , _bandSortIndex.formatGroupCode) is not a function` (or a ts-jest error that `formatGroupCode` has no exported member).

- [ ] Add the exported helper to `src/lib/cut-pattern/band-sort-index.ts`, immediately after the `bandKey` const (line 3). Insert:

```ts
export const formatGroupCode = (n: number): string => String(n).padStart(4, '0');
```

So the top of the file reads:

```ts
import type { BandSortIndex, BandSortMode, BandSortGroup, BandRef, IndexRange, TubeCutPattern } from '$lib/types';

const bandKey = (ref: BandRef): string => `${ref.globule}-${ref.tube}-${ref.band}`;

export const formatGroupCode = (n: number): string => String(n).padStart(4, '0');
```

- [ ] Run the test and confirm the `formatGroupCode` suite PASSES:

```bash
npm run test:unit -- src/lib/cut-pattern/__tests__/band-sort-index.test.ts
```

Expected: all `formatGroupCode` tests green; total `4 passed` (1 type test + 3 format tests).

- [ ] Commit:

```bash
git add src/lib/cut-pattern/band-sort-index.ts src/lib/cut-pattern/__tests__/band-sort-index.test.ts
git commit -m "feat(band-sort): add formatGroupCode 4-wide zero-pad helper"
```

---

### Task 3: Assign sequential codes to end-connection ring groups (and leave tube-order uncoded)

**Files:**
- Modify: `src/lib/cut-pattern/band-sort-index.ts` (line 52, inside `buildEndConnectionIndex`)
- Test: `src/lib/cut-pattern/__tests__/band-sort-index.test.ts` (append `describe`)

The fixture builds two tubes whose bands form two rings via `meta.endPartnerBand`. Ring A: band (0,0,0) → (0,0,1) → back to (0,0,0). Ring B: band (0,1,0) → (0,1,1) → back. `buildEndConnectionIndex` walks in iteration order, so ring 0 = first unclaimed band encountered.

- [ ] Append a code-assignment suite to the test file (add `buildBandSortIndex` and the `TubeCutPattern` type to imports at the top):

```ts
import { buildBandSortIndex } from '../band-sort-index';
import type { TubeCutPattern } from '$lib/types';

const band = (
	globule: number,
	tube: number,
	bandIndex: number,
	endPartner?: { globule: number; tube: number; band: number }
) =>
	({
		address: { globule, tube, band: bandIndex },
		...(endPartner ? { meta: { endPartnerBand: endPartner } } : {})
	}) as unknown as TubeCutPattern['bands'][number];

const tube = (globule: number, tubeIndex: number, bands: TubeCutPattern['bands']): TubeCutPattern =>
	({
		projectionType: 'patterned',
		address: { globule, tube: tubeIndex },
		bands
	}) as unknown as TubeCutPattern;

// Two rings, each a 2-band cycle linked via endPartnerBand.
const twoRingTubes = (): TubeCutPattern[] => [
	tube(0, 0, [
		band(0, 0, 0, { globule: 0, tube: 0, band: 1 }),
		band(0, 0, 1, { globule: 0, tube: 0, band: 0 })
	]),
	tube(0, 1, [
		band(0, 1, 0, { globule: 0, tube: 1, band: 1 }),
		band(0, 1, 1, { globule: 0, tube: 1, band: 0 })
	])
];

describe('buildBandSortIndex code assignment', () => {
	test('end-connection mode assigns sequential 4-wide codes per ring', () => {
		const index = buildBandSortIndex(twoRingTubes(), 'end-connection-tube');
		expect(index.mode).toBe('end-connection-tube');
		expect(index.groups.map((g) => g.code)).toEqual(['0000', '0001']);
	});

	test('end-connection codes match ring iteration order', () => {
		const index = buildBandSortIndex(twoRingTubes(), 'end-connection-tube');
		// Ring 0 starts at the first band (0,0,0); ring 1 at (0,1,0).
		expect(index.groups[0].bands[0]).toEqual({ globule: 0, tube: 0, band: 0 });
		expect(index.groups[0].code).toBe('0000');
		expect(index.groups[1].bands[0]).toEqual({ globule: 0, tube: 1, band: 0 });
		expect(index.groups[1].code).toBe('0001');
	});

	test('tube-order mode leaves code undefined on every group', () => {
		const index = buildBandSortIndex(twoRingTubes(), 'tube-order');
		expect(index.mode).toBe('tube-order');
		expect(index.groups.length).toBe(2);
		for (const group of index.groups) {
			expect(group.code).toBeUndefined();
		}
	});
});
```

- [ ] Run the test and confirm the code-assignment suite FAILS:

```bash
npm run test:unit -- src/lib/cut-pattern/__tests__/band-sort-index.test.ts
```

Expected failure: `expect(index.groups.map((g) => g.code)).toEqual(['0000', '0001'])` receives `[undefined, undefined]` because ring groups do not yet carry a `code`.

- [ ] In `src/lib/cut-pattern/band-sort-index.ts`, set the ring code in `buildEndConnectionIndex` (line 52). Replace:

```ts
				groups.push({ label: `Ring ${ringIndex}`, bands: ring });
```

with:

```ts
				groups.push({ label: `Ring ${ringIndex}`, code: formatGroupCode(ringIndex), bands: ring });
```

(`buildTubeOrderIndex` at lines 5-11 is intentionally left unchanged — it pushes groups without a `code`, so `code` stays `undefined`.)

- [ ] Run the test and confirm the code-assignment suite PASSES:

```bash
npm run test:unit -- src/lib/cut-pattern/__tests__/band-sort-index.test.ts
```

Expected: all three code-assignment tests green; total `7 passed`.

- [ ] Run type check:

```bash
npm run check
```

Expected: exits 0 (`svelte-check found 0 errors`).

- [ ] Commit:

```bash
git add src/lib/cut-pattern/band-sort-index.ts src/lib/cut-pattern/__tests__/band-sort-index.test.ts
git commit -m "feat(band-sort): assign sequential ring codes in end-connection mode"
```

---

### Task 4: Add `buildBandCodeMap` band→code lookup

**Files:**
- Modify: `src/lib/cut-pattern/band-sort-index.ts` (append exported helper after `sliceBandSortIndex`, end of file)
- Test: `src/lib/cut-pattern/__tests__/band-sort-index.test.ts` (append `describe`)

- [ ] Append a `buildBandCodeMap` suite to the test file (add `buildBandCodeMap` to imports at the top):

```ts
import { buildBandCodeMap } from '../band-sort-index';

describe('buildBandCodeMap', () => {
	test('maps every band in coded groups keyed by bandKey', () => {
		const index = buildBandSortIndex(twoRingTubes(), 'end-connection-tube');
		const map = buildBandCodeMap(index);
		expect(map.get('0-0-0')).toBe('0000');
		expect(map.get('0-0-1')).toBe('0000');
		expect(map.get('0-1-0')).toBe('0001');
		expect(map.get('0-1-1')).toBe('0001');
		expect(map.size).toBe(4);
	});

	test('omits bands in uncoded groups (tube-order)', () => {
		const index = buildBandSortIndex(twoRingTubes(), 'tube-order');
		const map = buildBandCodeMap(index);
		expect(map.size).toBe(0);
	});
});
```

- [ ] Run the test and confirm the `buildBandCodeMap` suite FAILS:

```bash
npm run test:unit -- src/lib/cut-pattern/__tests__/band-sort-index.test.ts
```

Expected failure: `TypeError: (0 , _bandSortIndex.buildBandCodeMap) is not a function` (or ts-jest no-exported-member error).

- [ ] Append the exported helper to the end of `src/lib/cut-pattern/band-sort-index.ts` (after `sliceBandSortIndex`, currently ending at line 85):

```ts

export const buildBandCodeMap = (index: BandSortIndex): Map<string, string> => {
	const map = new Map<string, string>();
	for (const group of index.groups) {
		if (group.code === undefined) continue;
		for (const ref of group.bands) map.set(bandKey(ref), group.code);
	}
	return map;
};
```

- [ ] Run the test and confirm the `buildBandCodeMap` suite PASSES:

```bash
npm run test:unit -- src/lib/cut-pattern/__tests__/band-sort-index.test.ts
```

Expected: both `buildBandCodeMap` tests green; total `9 passed`.

- [ ] Run type check:

```bash
npm run check
```

Expected: exits 0 (`svelte-check found 0 errors`).

- [ ] Commit:

```bash
git add src/lib/cut-pattern/band-sort-index.ts src/lib/cut-pattern/__tests__/band-sort-index.test.ts
git commit -m "feat(band-sort): add buildBandCodeMap band-to-code lookup"
```

---

### Task 5: Verify `sliceBandSortIndex` preserves codes (regression guard)

**Files:**
- Modify: none (behavior already correct via `...group` spread at `band-sort-index.ts:80-83`)
- Test: `src/lib/cut-pattern/__tests__/band-sort-index.test.ts` (append `describe`)

`sliceBandSortIndex` already spreads `...group` in both branches (the group-only branch returns `slicedGroups` directly, and the `bandsInGroup` branch maps `{ ...group, bands: ... }`). This task pins that behavior with a test so a future refactor cannot silently drop `code`. Per the spec, codes stay stable to their original group identity — there is **no renumbering** after slicing.

- [ ] Append a slicing-preservation suite to the test file (add `sliceBandSortIndex` to imports at the top):

```ts
import { sliceBandSortIndex } from '../band-sort-index';

describe('sliceBandSortIndex preserves code', () => {
	test('group-only slice keeps the original code (no renumbering)', () => {
		const index = buildBandSortIndex(twoRingTubes(), 'end-connection-tube');
		const sliced = sliceBandSortIndex(index, { groups: [1, 2] });
		expect(sliced.groups.length).toBe(1);
		// The kept group is the original ring 1, so its code stays '0001' (not re-zeroed).
		expect(sliced.groups[0].code).toBe('0001');
	});

	test('bandsInGroup slice keeps the code while trimming bands', () => {
		const index = buildBandSortIndex(twoRingTubes(), 'end-connection-tube');
		const sliced = sliceBandSortIndex(index, { groups: [0, 1], bandsInGroup: [0, 1] });
		expect(sliced.groups[0].code).toBe('0000');
		expect(sliced.groups[0].bands).toHaveLength(1);
	});
});
```

- [ ] Run the test and confirm the slicing suite PASSES immediately (no implementation change needed — this is a regression guard):

```bash
npm run test:unit -- src/lib/cut-pattern/__tests__/band-sort-index.test.ts
```

Expected: both slicing tests green; total `11 passed`. If either fails, do NOT modify the test to match — investigate `sliceBandSortIndex` (it should be spreading `...group`).

- [ ] Run the full unit suite to confirm no regressions elsewhere:

```bash
npm run test:unit
```

Expected: all suites pass.

- [ ] Run type check:

```bash
npm run check
```

Expected: exits 0 (`svelte-check found 0 errors`).

- [ ] Commit:

```bash
git add src/lib/cut-pattern/__tests__/band-sort-index.test.ts
git commit -m "test(band-sort): guard code preservation through sliceBandSortIndex"
```

---

## Self-review

### Spec coverage

| Spec requirement | Task |
| --- | --- |
| `BandSortGroup.code?: string` added | Task 1 |
| `formatGroupCode(n) = String(n).padStart(4,'0')`, exported | Task 2 |
| `formatGroupCode` cases `0→'0000'`, `1→'0001'`, `42→'0042'`, `10000→'10000'` | Task 2 |
| `buildEndConnectionIndex` assigns `formatGroupCode(ringIndex)` | Task 3 |
| `buildTubeOrderIndex` leaves `code` undefined | Task 3 |
| `buildBandCodeMap(index): Map<bandKey, code>`, keyed by `bandKey`, exported | Task 4 |
| `buildBandCodeMap` maps coded groups, omits uncoded | Task 4 |
| `sliceBandSortIndex` preserves `code`, no renumbering | Task 5 |
| Out of scope: rendering, new modes | Not implemented (correct) |

### Placeholder scan

No "TBD", "TODO", "handle edge cases", or "similar to" steps. Every code step shows real, final code. Every command is exact and copy-pasteable.

### Type consistency

- `BandRef` / `GlobuleAddress_Band` shape `{ globule; tube; band }` matches fixture literals and `bandKey`/map-key strings (`'0-0-0'` etc.).
- `formatGroupCode` and `buildBandCodeMap` signatures are byte-identical to the WS-C/WS-D interface contract.
- `bandKey` remains module-private; `buildBandCodeMap` is the only public band→code entry point, matching the spec's "single source of truth".
- Test fixtures use the `as unknown as TubeCutPattern` cast pattern already established in `collate-tubes.test.ts`, so only the fields the code reads (`address`, `meta.endPartnerBand`, `bands`) need to be populated.

### Resolved ambiguity

- The spec's `buildBandCodeMap` snippet calls `bandKey` directly; the codebase keeps `bandKey` private. Resolved by implementing `buildBandCodeMap` inside the same module so it reuses the private `bandKey` — no new export of `bandKey` is introduced, preserving the spec's intent that `buildBandCodeMap` is the single public band→code surface.
- The spec did not specify ring iteration order for code numbering. Resolved by reusing the existing first-unclaimed-band walk order in `buildEndConnectionIndex`; the Task 3 fixture pins ring 0 to the first encountered band so the test is deterministic.
