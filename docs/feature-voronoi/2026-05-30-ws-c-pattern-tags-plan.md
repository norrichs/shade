# Pattern Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relocate the outlined-band self-tag from the start-cap edge to the band's middle quad (choosing the better of its two outer edges by a priority rule), and add an optional external tag that appends the band's WS-B group code to the self-tag text.

**Architecture:** Part 2 (self-tag relocation) is pure geometry, independent of WS-B: a new pure module `select-middle-quad-edge.ts` computes the middle-quad index, the two candidate outer-edge indices into the `OutlineEdge[]` walk array, and a deterministic edge-selection comparator; `generate-outlined-pattern.ts` is rewired to anchor the label on the chosen edge via the existing `computeOutlinedLabelAnchor`. Part 1 (external tag) is a config flag (`externalTag?: boolean`) threaded through `CutPatternRenderer.svelte` → `BandComponent.svelte` → `PatternLabel.svelte`, where a pure helper `buildSelfTagLines` decides the rendered text. Part 2 lands first (no WS-B dependency); Part 1 lands second (imports `buildBandCodeMap` from WS-B).

**Tech Stack:** TypeScript, Three.js (`Vector3`), SvelteKit (Svelte 5 runes), Jest (colocated under `**/__tests__/**/*.test.ts`).

---

## File Structure

| File | Create/Modify | Responsibility |
| --- | --- | --- |
| `src/lib/cut-pattern/select-middle-quad-edge.ts` | **Create** | Pure functions: `middleQuadIndex`, `middleQuadEdgeIndices`, `selectMiddleQuadEdgeIndex` (comparator). No Three.js, no I/O. |
| `src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts` | **Create** | Unit tests for the three pure functions above. |
| `src/lib/cut-pattern/generate-outlined-pattern.ts` | **Modify** | Add `partnerBand?: number` to `OutlineEdge`; populate it in `getOutlineEdges`; replace start-cap anchor block (`:505-534`) with middle-quad selection. |
| `src/lib/cut-pattern/build-self-tag-lines.ts` | **Create** | Pure helper: given the base address string, an optional group code, and whether the external tag is enabled, returns the `addressStrings: string[]` for the label. |
| `src/lib/cut-pattern/__tests__/build-self-tag-lines.test.ts` | **Create** | Unit tests for `buildSelfTagLines`. |
| `src/lib/types.ts` | **Modify** | Add `externalTag?: boolean` to the `selfTag` block (`:585-592`). |
| `src/components/cut-pattern/PatternLabel.svelte` | **Modify** | Accept `addressStrings` already-resolved (no change to internals) — text composition moves up to `BandComponent`. (No code change required if BandComponent passes the composed lines; see Task 7.) |
| `src/components/cut-pattern/BandComponent.svelte` | **Modify** | Accept `groupCode?: string` prop; compose self-tag lines via `buildSelfTagLines` and pass to `PatternLabel`. |
| `src/components/cut-pattern/CutPatternRenderer.svelte` | **Modify** | Build `buildBandCodeMap(sortIndex)` (WS-B) and pass `groupCode` to `BandComponent` in both render branches. |
| `src/components/modal/editor/LabelEditor.svelte` | **Modify** | Add an "External Tag" checkbox writing `selfTag.externalTag`. |

---

## Resolved decisions (verified against the codebase)

- **Walk order** (verified in `getOutlineEdges`, `generate-outlined-pattern.ts:183-265`) for `n = quads.length`:
  - `before` edges (quad `a→d`): indices `0 .. n-1`; quad `i` → index `i`.
  - far `end` edge: index `n`.
  - `after` edges (quad `c→b`, walked backward `i = n-1 .. 0`): index for quad `i` is `(n+1) + (n-1-i) = 2n - i`.
  - near `end` (start cap): index `2n+1`.
- **Middle-quad index:** `midQuad = Math.floor((quadCount - 1) / 2)` → for `quadCount` 1,2,3,4,5 yields `0,0,1,1,2` (round down for even counts).
- **Candidate edge indices** for `midQuad`: before = `midQuad`; after = `2 * quadCount - midQuad`.
- **Partner band number for the comparator:** `OutlineEdge` currently carries only `partnerOuter` points (`generate-outlined-pattern.ts:79-96`), not a band number. We add `partnerBand?: number` to `OutlineEdge` and populate it in `getOutlineEdges` from facet edge metadata. Quad `i` is built from facets `2i` (even, "before") and `2i+1` (odd, "after") — verified in `getQuadrilaterals` (`quadrilateral.ts:324-339`). `bandHasPartners` (`generate-outlined-pattern.ts:327-336`) reads the `ac` edge partner: even facet → `before` side, odd facet → `after` side. So: before-edge `partnerBand = band.facets[2*i]?.meta?.ac?.partner?.band`; after-edge `partnerBand = band.facets[2*i+1]?.meta?.ac?.partner?.band`. `GlobuleAddress_FacetEdge` has a `.band: number` (verified `projection-geometry/types.ts:277-291`). This replaces the spec's "assume ±1" with the real partner band number.
- **Comparator priority** (`selectMiddleQuadEdgeIndex`), pick the better of the two candidate indices, lower tier wins:
  1. **No tab** — prefer the candidate whose index is NOT in `tabsByIndex`.
  2. **No partner** — if tab-status ties, prefer the candidate whose edge has `partnerBand === undefined`.
  3. **Higher partner band number** — if still tied (both have partners), prefer the candidate whose `partnerBand` is numerically larger.
  4. **Final tie-break** — deterministic fallback to the `before` edge (the lower edge index) so the result is stable.
- **Degenerate guard:** `quadCount === 0` → no anchor (fall back to `{ x: 0, y: 0 }` as today). `quadCount === 1` → `midQuad = 0`, both candidates are the only quad's edges; comparator still returns a valid index.
- **External tag text:** when `externalTag` is true AND a `groupCode` is defined, the rendered line becomes `"<addressString> <groupCode>"` (space-joined, single line), e.g. `t0/b1 0003`. Otherwise the line is unchanged. Codes only exist in end-connection mode (WS-B); in tube-order mode `groupCode` is undefined so the external tag adds nothing — correct by design.

---

### Task 1: Pure middle-quad index + candidate edge indices

**Files:**
- Create: `src/lib/cut-pattern/select-middle-quad-edge.ts`
- Test: `src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts`

Steps:

- [ ] Write a failing test file `src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts` with REAL assertions:

```ts
import { middleQuadIndex, middleQuadEdgeIndices } from '../select-middle-quad-edge';

describe('middleQuadIndex', () => {
	test.each([
		[1, 0],
		[2, 0],
		[3, 1],
		[4, 1],
		[5, 2]
	])('quadCount %i -> %i', (quadCount, expected) => {
		expect(middleQuadIndex(quadCount)).toBe(expected);
	});
});

describe('middleQuadEdgeIndices', () => {
	// n = 5 quads; midQuad = 2.
	// before edge index = midQuad = 2.
	// after edge index = 2n - midQuad = 10 - 2 = 8.
	test('returns before and after edge indices for the middle quad', () => {
		expect(middleQuadEdgeIndices(5)).toEqual({ midQuad: 2, beforeIndex: 2, afterIndex: 8 });
	});

	// n = 4 quads; midQuad = 1.
	// before = 1; after = 8 - 1 = 7.
	test('round-down middle for even quad counts', () => {
		expect(middleQuadEdgeIndices(4)).toEqual({ midQuad: 1, beforeIndex: 1, afterIndex: 7 });
	});

	// n = 1 quad; midQuad = 0. before = 0; after = 2 - 0 = 2.
	test('single quad', () => {
		expect(middleQuadEdgeIndices(1)).toEqual({ midQuad: 0, beforeIndex: 0, afterIndex: 2 });
	});
});
```

- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts` — expect FAIL (module/exports do not exist).
- [ ] Create `src/lib/cut-pattern/select-middle-quad-edge.ts` with REAL minimal implementation:

```ts
/**
 * Index of the "middle" quad in a band of `quadCount` quads, rounding down for
 * even counts (quadCount 1,2,3,4,5 -> 0,0,1,1,2).
 */
export const middleQuadIndex = (quadCount: number): number =>
	Math.floor((quadCount - 1) / 2);

/**
 * The middle quad's index plus the indices of its two outer edges in the
 * `OutlineEdge[]` walk produced by `getOutlineEdges`. For `n = quadCount`:
 * - before (a->d) edge of quad i sits at index i
 * - after (c->b) edge of quad i sits at index 2n - i
 */
export const middleQuadEdgeIndices = (
	quadCount: number
): { midQuad: number; beforeIndex: number; afterIndex: number } => {
	const midQuad = middleQuadIndex(quadCount);
	return {
		midQuad,
		beforeIndex: midQuad,
		afterIndex: 2 * quadCount - midQuad
	};
};
```

- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts` — expect PASS.
- [ ] Run: `npm run check` — expect no new type errors.
- [ ] Commit:

```bash
git add src/lib/cut-pattern/select-middle-quad-edge.ts src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts
git commit -m "feat(cut-pattern): add middle-quad index + edge-index helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Edge-selection comparator (`selectMiddleQuadEdgeIndex`)

**Files:**
- Modify: `src/lib/cut-pattern/select-middle-quad-edge.ts`
- Test: `src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts`

The comparator takes the two candidate edge indices plus a per-candidate descriptor (`hasTab`, `partnerBand`) and returns the winning edge index. It is decoupled from `OutlineEdge`/Three.js — the caller (Task 5) reads `tabsByIndex` and `edge.partnerBand` and passes plain descriptors.

Steps:

- [ ] Append failing tests to `src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts`:

```ts
import { selectMiddleQuadEdgeIndex } from '../select-middle-quad-edge';

describe('selectMiddleQuadEdgeIndex', () => {
	const candidate = (
		index: number,
		hasTab: boolean,
		partnerBand: number | undefined
	) => ({ index, hasTab, partnerBand });

	test('priority 1: prefers the edge with no tab', () => {
		const before = candidate(2, true, 0);
		const after = candidate(8, false, 5);
		expect(selectMiddleQuadEdgeIndex(before, after)).toBe(8);
	});

	test('priority 2: tab tie -> prefers the edge with no partner', () => {
		const before = candidate(2, false, 3); // has partner
		const after = candidate(8, false, undefined); // no partner
		expect(selectMiddleQuadEdgeIndex(before, after)).toBe(8);
	});

	test('priority 3: tab + partner tie -> prefers the higher partner band number', () => {
		const before = candidate(2, false, 1);
		const after = candidate(8, false, 4);
		expect(selectMiddleQuadEdgeIndex(before, after)).toBe(8);
	});

	test('priority 3 the other way: before wins when its partner band is higher', () => {
		const before = candidate(2, false, 9);
		const after = candidate(8, false, 4);
		expect(selectMiddleQuadEdgeIndex(before, after)).toBe(2);
	});

	test('full tie (both no-tab, both no-partner) -> deterministic before edge', () => {
		const before = candidate(2, false, undefined);
		const after = candidate(8, false, undefined);
		expect(selectMiddleQuadEdgeIndex(before, after)).toBe(2);
	});

	test('both tabbed, both partnered, equal partner band -> before edge', () => {
		const before = candidate(2, true, 7);
		const after = candidate(8, true, 7);
		expect(selectMiddleQuadEdgeIndex(before, after)).toBe(2);
	});
});
```

- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts` — expect FAIL (`selectMiddleQuadEdgeIndex` not exported).
- [ ] Append REAL implementation to `src/lib/cut-pattern/select-middle-quad-edge.ts`:

```ts
export type EdgeCandidate = {
	/** Index of this edge in the OutlineEdge[] walk array. */
	index: number;
	/** Whether this edge has a tab (its index is present in tabsByIndex). */
	hasTab: boolean;
	/** Partner band number if an adjacent band shares this edge, else undefined. */
	partnerBand: number | undefined;
};

/**
 * Pick the better of the middle quad's two outer edges. Lower tier wins:
 *  1. no tab over tab
 *  2. no partner over partner (when tab status ties)
 *  3. higher partner band number (when both still tie with partners)
 *  4. deterministic fallback to the `before` candidate (passed first)
 */
export const selectMiddleQuadEdgeIndex = (
	before: EdgeCandidate,
	after: EdgeCandidate
): number => {
	// 1. no tab over tab
	if (before.hasTab !== after.hasTab) {
		return before.hasTab ? after.index : before.index;
	}
	// 2. no partner over partner
	const beforeHasPartner = before.partnerBand !== undefined;
	const afterHasPartner = after.partnerBand !== undefined;
	if (beforeHasPartner !== afterHasPartner) {
		return beforeHasPartner ? after.index : before.index;
	}
	// 3. higher partner band number (only meaningful when both have partners)
	if (beforeHasPartner && afterHasPartner && before.partnerBand !== after.partnerBand) {
		return (before.partnerBand as number) > (after.partnerBand as number)
			? before.index
			: after.index;
	}
	// 4. deterministic fallback
	return before.index;
};
```

- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts` — expect PASS (all cases including Task 1).
- [ ] Run: `npm run check` — expect no new type errors.
- [ ] Commit:

```bash
git add src/lib/cut-pattern/select-middle-quad-edge.ts src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts
git commit -m "feat(cut-pattern): add middle-quad edge-selection comparator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Carry partner band number on `OutlineEdge`

**Files:**
- Modify: `src/lib/cut-pattern/generate-outlined-pattern.ts` (`OutlineEdge` type `:79-96`; `getOutlineEdges` `:170-266`)

`OutlineEdge` currently has no band-number field. Add `partnerBand?: number` and populate it for `before`/`after` edges inside `getOutlineEdges` from facet `ac` partner metadata. There is no colocated unit test for `getOutlineEdges` (it is not exported); this task is verified via `npm run check` and exercised end-to-end by Task 5's test. Keep the change minimal and type-driven.

Steps:

- [ ] In `src/lib/cut-pattern/generate-outlined-pattern.ts`, add the field to the `OutlineEdge` type (after `partnerOuter?` at `:86`):

```ts
	/** For partner tabs: the two outer points from the adjacent band's quad */
	partnerOuter?: { start: Vector3; end: Vector3 };
	/**
	 * Band number of the adjacent band sharing this edge, read from facet `ac`
	 * partner metadata. Only set for 'before'/'after' edges that have a partner.
	 * Used by the middle-quad self-tag edge selection.
	 */
	partnerBand?: number;
```

- [ ] In the `before` loop of `getOutlineEdges` (`:187-209`), set `partnerBand` from the even facet (`2*i`) `ac` partner. Change the `edges.push({...})` for the before edge to include:

```ts
			edges.push({
				start: q.a.clone(),
				end: q.d.clone(),
				side: 'before',
				interiorPoint: beforeInterior,
				partnerOuter,
				partnerBand: band.facets[2 * i]?.meta?.ac?.partner?.band
			});
```

- [ ] In the `after` loop of `getOutlineEdges` (`:228-251`), set `partnerBand` from the odd facet (`2*i+1`) `ac` partner. Change the `edges.push({...})` for the after edge to include:

```ts
			edges.push({
				start: q.c.clone(),
				end: q.b.clone(),
				side: 'after',
				interiorPoint: afterInterior,
				partnerOuter,
				partnerBand: band.facets[2 * i + 1]?.meta?.ac?.partner?.band
			});
```

- [ ] Run: `npm run check` — expect no new type errors (`FacetEdgeMeta.partner` is `GlobuleAddress_FacetEdge` which has `.band: number`; access guarded by `?.`).
- [ ] Commit:

```bash
git add src/lib/cut-pattern/generate-outlined-pattern.ts
git commit -m "feat(cut-pattern): carry partner band number on OutlineEdge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Anchor selection helper that consumes `OutlineEdge[]` (pure, testable)

**Files:**
- Modify: `src/lib/cut-pattern/select-middle-quad-edge.ts`
- Test: `src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts`

To keep Task 5's Svelte-free logic unit-testable, add a thin pure function `chooseMiddleQuadEdge` that, given `quadCount`, an `edges`-like array (only `partnerBand` matters per index) and a `tabbedIndices: Set<number>`, returns the chosen edge index using Tasks 1+2. This is the single seam the generator calls.

Steps:

- [ ] Append failing tests to `src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts`:

```ts
import { chooseMiddleQuadEdge } from '../select-middle-quad-edge';

describe('chooseMiddleQuadEdge', () => {
	// 5 quads -> midQuad 2, beforeIndex 2, afterIndex 8.
	const edgesWithPartnerBands = (byIndex: Record<number, number | undefined>) =>
		Array.from({ length: 12 }, (_, i) => ({ partnerBand: byIndex[i] }));

	test('no tabs, no partners -> before edge (index 2)', () => {
		const chosen = chooseMiddleQuadEdge(
			5,
			edgesWithPartnerBands({}),
			new Set<number>()
		);
		expect(chosen).toBe(2);
	});

	test('before edge tabbed -> after edge wins (index 8)', () => {
		const chosen = chooseMiddleQuadEdge(
			5,
			edgesWithPartnerBands({}),
			new Set<number>([2])
		);
		expect(chosen).toBe(8);
	});

	test('both untabbed, after has higher partner band -> after edge (index 8)', () => {
		const chosen = chooseMiddleQuadEdge(
			5,
			edgesWithPartnerBands({ 2: 1, 8: 4 }),
			new Set<number>()
		);
		expect(chosen).toBe(8);
	});

	test('quadCount 0 -> returns -1 (no anchor)', () => {
		expect(chooseMiddleQuadEdge(0, [], new Set<number>())).toBe(-1);
	});
});
```

- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts` — expect FAIL (`chooseMiddleQuadEdge` not exported).
- [ ] Append REAL implementation to `src/lib/cut-pattern/select-middle-quad-edge.ts`:

```ts
/**
 * Resolve which outer edge of the middle quad the self-tag should anchor to.
 * `edges` only needs a `partnerBand?: number` per index; `tabbedIndices` is the
 * set of edge indices that received a tab. Returns the chosen edge index, or -1
 * when there are no quads (caller falls back to no anchor).
 */
export const chooseMiddleQuadEdge = (
	quadCount: number,
	edges: ReadonlyArray<{ partnerBand?: number }>,
	tabbedIndices: ReadonlySet<number>
): number => {
	if (quadCount <= 0) return -1;
	const { beforeIndex, afterIndex } = middleQuadEdgeIndices(quadCount);
	return selectMiddleQuadEdgeIndex(
		{
			index: beforeIndex,
			hasTab: tabbedIndices.has(beforeIndex),
			partnerBand: edges[beforeIndex]?.partnerBand
		},
		{
			index: afterIndex,
			hasTab: tabbedIndices.has(afterIndex),
			partnerBand: edges[afterIndex]?.partnerBand
		}
	);
};
```

- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts` — expect PASS.
- [ ] Run: `npm run check` — expect no new type errors.
- [ ] Commit:

```bash
git add src/lib/cut-pattern/select-middle-quad-edge.ts src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts
git commit -m "feat(cut-pattern): add chooseMiddleQuadEdge seam for anchor selection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Rewire `generateOutlinedBandPattern` to anchor on the middle quad

**Files:**
- Modify: `src/lib/cut-pattern/generate-outlined-pattern.ts` (`generateOutlinedBandPattern` `:442-549`, specifically the start-cap block `:505-534`)

Replace the start-cap edge location (`:505-517`) and the `labelAnchor` computation (`:519-534`) with a middle-quad selection using `chooseMiddleQuadEdge` (Task 4). The reuse of `computeOutlinedLabelAnchor` is unchanged — it already returns the outer-edge-midpoint anchor (shifted by tab width when tabbed) and a perpendicular `autoAngle`. `quads.length` is the `quadCount`; `tabsByIndex` (built at `:454-461`) is the tabbed-index source; `edges[i].partnerBand` (Task 3) supplies partner band numbers.

Steps:

- [ ] Add the import near the existing `computeOutlinedLabelAnchor` import (`:31`):

```ts
import { computeOutlinedLabelAnchor } from './compute-label-anchor';
import { chooseMiddleQuadEdge } from './select-middle-quad-edge';
```

- [ ] Replace the start-cap block (`generate-outlined-pattern.ts:505-534`, from the comment `// Locate the start-cap edge ...` through the end of the `if (startCapIndex >= 0) { ... }` block) with the middle-quad selection:

```ts
	// Anchor the self-tag to the band's middle quad rather than the start cap.
	// `chooseMiddleQuadEdge` selects the better of the middle quad's two outer
	// edges (before a->d / after c->b) by priority: no-tab > no-partner >
	// higher-partner-band-number, with a deterministic fallback to the before
	// edge. Returns -1 when there are no quads.
	const tabbedIndices = new Set<number>(tabsByIndex.keys());
	const chosenEdgeIndex = chooseMiddleQuadEdge(quads.length, edges, tabbedIndices);

	let labelAnchor: { anchor: { x: number; y: number }; autoAngle: number } | undefined;
	if (chosenEdgeIndex >= 0) {
		const chosenEdge = edges[chosenEdgeIndex];
		const chosenTab = tabsByIndex.get(chosenEdgeIndex);
		// tabConfig is optional on OutlinedPatternConfig; guard with ?? 0.
		const chosenTabWidth = config.tabConfig?.tabWidth ?? 0;
		labelAnchor = computeOutlinedLabelAnchor({
			edgeStart: { x: chosenEdge.start.x, y: chosenEdge.start.y },
			edgeEnd: { x: chosenEdge.end.x, y: chosenEdge.end.y },
			interiorPoint: { x: chosenEdge.interiorPoint.x, y: chosenEdge.interiorPoint.y },
			hasTab: chosenTab !== undefined,
			tabWidth: chosenTabWidth
		});
	}
```

- [ ] Confirm the `result` object below still reads `labelAnchor` (no change needed — `:541-542` already use `labelAnchor ? labelAnchor.anchor : { x: 0, y: 0 }` and `labelAnchor?.autoAngle`).
- [ ] Run: `npm run check` — expect no new type errors. (`edges` rows now have an optional `partnerBand`, which structurally satisfies `chooseMiddleQuadEdge`'s `{ partnerBand?: number }[]` parameter.)
- [ ] Run the existing outlined-pattern-adjacent suites to confirm no regression:
  `npm run test:unit -- src/lib/cut-pattern/__tests__/collect-outlined-band-tabs.test.ts src/lib/cut-pattern/__tests__/compute-label-anchor.test.ts` — expect PASS.
- [ ] Manual check (UI glue not unit-testable): run `npm run dev`, open `/designer2`, enable an outlined pattern with self-tags, and confirm tags now sit on the middle quad with the stem perpendicular to the chosen edge and avoiding tabbed edges. (This is the only manual step; all selection logic is unit-tested in Tasks 1-4.)
- [ ] Commit:

```bash
git add src/lib/cut-pattern/generate-outlined-pattern.ts
git commit -m "feat(cut-pattern): anchor outlined self-tag to band middle quad

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

> **Tasks 1-5 above complete Part 2 (self-tag relocation) and have NO dependency on WS-B. Tasks 6-10 below implement Part 1 (external tag) and import `buildBandCodeMap` from WS-B's `band-sort-index.ts`. If WS-B is not yet merged when you reach Task 8, pause and confirm `buildBandCodeMap` / `code` are available; the relocation work is already complete and committed.**

---

### Task 6: Add `externalTag` to the self-tag config type

**Files:**
- Modify: `src/lib/types.ts` (`selfTag` block `:585-592`)

This is a type-only change; verified via `npm run check`.

Steps:

- [ ] Edit the `selfTag` block in `src/lib/types.ts` to add `externalTag?: boolean`:

```ts
	selfTag?: {
		enabled: boolean;
		externalTag?: boolean;
		height: number;
		angle: number;
		padding?: number;
		stemLength?: number;
		stemWidth?: number;
	};
```

- [ ] Run: `npm run check` — expect no new type errors.
- [ ] Commit:

```bash
git add src/lib/types.ts
git commit -m "feat(types): add selfTag.externalTag flag

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Pure helper `buildSelfTagLines`

**Files:**
- Create: `src/lib/cut-pattern/build-self-tag-lines.ts`
- Test: `src/lib/cut-pattern/__tests__/build-self-tag-lines.test.ts`

Encapsulates the rendered-text decision so `PatternLabel.svelte` stays untouched and the logic is unit-tested. Input: the base address string (e.g. `t0/b1`), the optional group code, and whether the external tag is enabled. Output: the `addressStrings: string[]` array `PatternLabel` consumes.

Steps:

- [ ] Write failing tests `src/lib/cut-pattern/__tests__/build-self-tag-lines.test.ts`:

```ts
import { buildSelfTagLines } from '../build-self-tag-lines';

describe('buildSelfTagLines', () => {
	test('external tag off -> base address only', () => {
		expect(buildSelfTagLines('t0/b1', '0003', false)).toEqual(['t0/b1']);
	});

	test('external tag on with code -> space-joined', () => {
		expect(buildSelfTagLines('t0/b1', '0003', true)).toEqual(['t0/b1 0003']);
	});

	test('external tag on but no code -> base address only', () => {
		expect(buildSelfTagLines('t0/b1', undefined, true)).toEqual(['t0/b1']);
	});

	test('external tag off with code -> base address only', () => {
		expect(buildSelfTagLines('t0/b1', '0003', false)).toEqual(['t0/b1']);
	});
});
```

- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/build-self-tag-lines.test.ts` — expect FAIL (module does not exist).
- [ ] Create `src/lib/cut-pattern/build-self-tag-lines.ts`:

```ts
/**
 * Compose the self-tag label lines. When `externalTagEnabled` is true and a
 * `groupCode` exists, the group code is appended to the address, space-joined
 * on a single line (e.g. "t0/b1 0003"). Otherwise the address is returned
 * unchanged. Group codes only exist in end-connection mode (WS-B); in tube
 * order mode `groupCode` is undefined and the address is returned as-is.
 */
export const buildSelfTagLines = (
	addressString: string,
	groupCode: string | undefined,
	externalTagEnabled: boolean
): string[] => {
	if (externalTagEnabled && groupCode !== undefined) {
		return [`${addressString} ${groupCode}`];
	}
	return [addressString];
};
```

- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/build-self-tag-lines.test.ts` — expect PASS.
- [ ] Run: `npm run check` — expect no new type errors.
- [ ] Commit:

```bash
git add src/lib/cut-pattern/build-self-tag-lines.ts src/lib/cut-pattern/__tests__/build-self-tag-lines.test.ts
git commit -m "feat(cut-pattern): add buildSelfTagLines helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Thread `groupCode` through `BandComponent.svelte`

**Files:**
- Modify: `src/components/cut-pattern/BandComponent.svelte` (`$props` `:12-34`, derived `:36-41`, `PatternLabel` usage `:103-120`)

Accept a `groupCode?: string` prop and use `buildSelfTagLines` to compose the `addressStrings` passed to `PatternLabel`. The base address string is the existing `concatAddress(band.address, 'tb-slash')`.

Steps:

- [ ] Add the import (alongside `concatAddress` import `:10`):

```ts
	import { concatAddress } from '$lib/util';
	import { buildSelfTagLines } from '$lib/cut-pattern/build-self-tag-lines';
```

- [ ] Add `groupCode` to the `$props` destructuring and its type (`:12-34`):

```ts
	let {
		band,
		index,
		origin,
		tube,
		showBounds = false,
		portal = false,
		tagAnchorPoint,
		tagAngle,
		groupCode = undefined,
		selectionTarget = 'projection',
		children
	}: {
		band: BandCutPattern;
		index: number;
		origin: Vector3;
		tube: TubeCutPattern;
		showBounds?: boolean;
		portal?: boolean;
		tagAnchorPoint: Point;
		tagAngle: number | undefined;
		groupCode?: string;
		selectionTarget?: 'projection' | 'surfaceProjection';
		children?: Snippet;
	} = $props();
```

- [ ] Add a derived for the external-tag flag and the composed lines (after `selfTagEnabled` `:40`):

```ts
	let externalTagEnabled = $derived(labels?.selfTag?.externalTag ?? false);
	let selfTagLines = $derived(
		buildSelfTagLines(concatAddress(band.address, 'tb-slash'), groupCode, externalTagEnabled)
	);
```

- [ ] Replace the `addressStrings` prop on `PatternLabel` (`:114`) to use the composed lines:

```ts
				addressStrings={selfTagLines}
```

- [ ] Run: `npm run check` — expect no new type errors.
- [ ] Commit:

```bash
git add src/components/cut-pattern/BandComponent.svelte
git commit -m "feat(cut-pattern): compose self-tag lines with optional group code

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Build the band→code map in `CutPatternRenderer.svelte` and pass `groupCode`

**Files:**
- Modify: `src/components/cut-pattern/CutPatternRenderer.svelte` (imports `:1-15`, derived after `:42`, both `BandComponent` usages `:165-175` and `:199-208`)

`buildBandCodeMap(sortIndex)` (WS-B) returns `Map<string, string>` keyed by `${globule}-${tube}-${band}`. `bandKey` is private to `band-sort-index.ts`; build the lookup key locally from `band.address`.

Steps:

- [ ] Add the import (with the existing `band-sort-index` / store imports near the top, after `:14`):

```ts
	import { buildBandCodeMap } from '$lib/cut-pattern/band-sort-index';
```

- [ ] Add derived map + a local key helper after `indexedBands` (`:42`):

```ts
	let codeMap = $derived(sortIndex ? buildBandCodeMap(sortIndex) : undefined);
	const groupCodeFor = (address: { globule: number; tube: number; band: number }) =>
		codeMap?.get(`${address.globule}-${address.tube}-${address.band}`);
```

- [ ] In the indexed render branch, add `groupCode` to `BandComponent` (`:165-175`, after `tagAngle={band.tagAngle}` `:172`):

```ts
				tagAngle={band.tagAngle}
				groupCode={groupCodeFor(band.address)}
```

- [ ] In the tube-order render branch, add `groupCode` to `BandComponent` (`:199-208`, after `tagAngle={band.tagAngle}` `:206`):

```ts
					tagAngle={band.tagAngle}
					groupCode={groupCodeFor(band.address)}
```

- [ ] Run: `npm run check` — expect no new type errors. (If WS-B is not merged, `buildBandCodeMap` will be unresolved — confirm WS-B is merged before this task per the gate note above.)
- [ ] Manual check: run `npm run dev`, open `/designer2`, switch the band sort mode to end-connection, enable the External Tag toggle (Task 10), and confirm self-tags read `t<i>/b<j> <code>`; switch to tube-order and confirm the code disappears (undefined by design).
- [ ] Commit:

```bash
git add src/components/cut-pattern/CutPatternRenderer.svelte
git commit -m "feat(cut-pattern): thread group code map into band labels

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: External Tag UI control in `LabelEditor.svelte`

**Files:**
- Modify: `src/components/modal/editor/LabelEditor.svelte` (`defaultSelfTag()` `:27-34`, handlers `:85-91`, markup self-tag `Enabled` control `:164-170`)

Add an "External Tag" checkbox under the Self Tag section, mirroring the existing "Enabled" checkbox pattern.

Steps:

- [ ] Add `externalTag: false` to the `defaultSelfTag()` object (`:27-34`):

```ts
	const defaultSelfTag = (): SelfTag => ({
		enabled: true,
		externalTag: false,
		height: 14,
		angle: 0,
		padding: 10,
		stemLength: 20,
		stemWidth: 4
	});
```

(Only the `externalTag: false` line is new; the other fields are the file's existing defaults. `defaultLabels()` `:14-24` does NOT need `externalTag` since the field is optional and reads default to `false`.)

- [ ] Add a handler mirroring `handleSelfTagEnabled` (after `:91`):

```ts
	const handleSelfTagExternalTag = (event: Event) => {
		const checked = (event.target as HTMLInputElement).checked;
		writeLabels({
			...labels,
			selfTag: { ...(labels.selfTag ?? defaultSelfTag()), externalTag: checked }
		});
	};
```

- [ ] Add an "External Tag" `LabeledControl` checkbox right after the Self Tag "Enabled" control (`:164-170`):

```svelte
				<LabeledControl label="External Tag">
					<input
						type="checkbox"
						checked={selfTag.externalTag ?? false}
						onchange={handleSelfTagExternalTag}
					/>
				</LabeledControl>
```

- [ ] Run: `npm run check` — expect no new type errors.
- [ ] Manual check: open `/designer2` → label editor, confirm the External Tag checkbox toggles `selfTag.externalTag` and the band labels update (verified jointly with Task 9's manual step).
- [ ] Commit:

```bash
git add src/components/modal/editor/LabelEditor.svelte
git commit -m "feat(ui): add External Tag toggle to label editor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run full unit suite for the touched modules:
  `npm run test:unit -- src/lib/cut-pattern/__tests__/select-middle-quad-edge.test.ts src/lib/cut-pattern/__tests__/build-self-tag-lines.test.ts src/lib/cut-pattern/__tests__/compute-label-anchor.test.ts src/lib/cut-pattern/__tests__/collect-outlined-band-tabs.test.ts` — expect all PASS.
- [ ] Run `npm run check` — expect no new type errors.
- [ ] Run `npm run lint` — expect clean (or only pre-existing warnings).
- [ ] Manual end-to-end in `/designer2`: outlined pattern, self-tags enabled — tags sit on the middle quad with perpendicular stems avoiding tabbed edges; toggling External Tag in end-connection mode appends the group code; tube-order mode shows no code.
