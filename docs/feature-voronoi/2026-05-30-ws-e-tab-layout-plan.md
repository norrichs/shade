# Smart Adjacent Tab Layout (inner/outer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `tabLayout: 'inner' | 'outer'` option that allocates adjacent (band-to-band "seam") tabs relative to a tube's center seam, with byte-identical legacy behavior when `tabLayout` is undefined.

**Architecture:** Extract the seam-allocation decision into three pure, exhaustively-tested functions (`centerSeamIndex`, `seamTabOwner`, and a `tabLayout`-aware branch inside `shouldHaveTab`). These functions take only plain numbers/strings (no Three.js), so they are trivially unit-testable. The tube's band count and each band's index are threaded from `generateOutlinedTubePattern` → `generateOutlinedBandPattern` → `buildOutlinePath` → `shouldHaveTab`. A small UI selector exposes the option.

**Tech Stack:** TypeScript, SvelteKit, Three.js (Vector3 in surrounding code only), Jest (colocated `__tests__`).

---

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `src/lib/types.ts` | Modify (`OutlinedTabConfig` ~623-629) | Add `tabLayout?: 'inner' \| 'outer'` field. |
| `src/lib/cut-pattern/seam-tab-layout.ts` | Create | PURE functions: `centerSeamIndex(bandCount)`, `seamTabOwner(seamIndex, bandCount, layout, bandEdge)`. No Three.js imports. |
| `src/lib/cut-pattern/__tests__/seam-tab-layout.test.ts` | Create | Unit tests for the two pure functions, incl. the worked example and inner/outer mirror. |
| `src/lib/cut-pattern/generate-outlined-pattern.ts` | Modify (`shouldHaveTab` ~348, `buildOutlinePath` ~383, `generateOutlinedBandPattern` ~442, `generateOutlinedTubePattern` ~554) | Thread `bandIndex`/`bandCount`; branch `shouldHaveTab` on `tabConfig.tabLayout`. |
| `src/lib/cut-pattern/__tests__/shouldHaveTab-tab-layout.test.ts` | Create | Unit tests for the exported `shouldHaveTab` wrapper across a 6-band tube, plus the undefined-layout regression. |
| `src/components/controls/TilingControl.svelte` | Modify (~150-167) | Add an inner/outer selector next to the existing Band Edge Tabs select. |

---

## Verified facts (do not re-derive)

- `OutlinedTabConfig` (`src/lib/types.ts:623-629`): `{ bandEdge?: TabEdgeOption; bandEnd?: TabEdgeOption; shape: TabShape; tabWidth: number; inset?: number; }`.
- `TabEdgeOption = 'before' | 'after' | 'beforeAndAfter'` (`types.ts:621`).
- `shouldHaveTab(edge, tabConfig, hasPartners, currentTube)` is a module-private `const` arrow fn at `generate-outlined-pattern.ts:348-374`. It is NOT currently exported.
- `buildOutlinePath(edges, tabConfig?, hasPartners?, currentTube?, tabsOut?)` calls `shouldHaveTab(edges[i], tabConfig, partners, currentTube ?? 0)` at line 404.
- `generateOutlinedBandPattern(band, bandIndex, config, pixelScale, tubeAddress, quads, neighborBefore?, neighborAfter?)` at line 442; it has `bandIndex` and calls `buildOutlinePath(edges, config.tabConfig, hasPartners, tubeAddress.tube, tabsByIndex)` at lines 455-461.
- `generateOutlinedTubePattern` at line 554 computes `alignedBands` (line 569) and maps `alignedBands.map((band, i) => generateOutlinedBandPattern(...))` at lines 574-585. `alignedBands.length` is the tube band count.
- `OutlineEdge.side` is `'after' | 'before' | 'end'` (`generate-outlined-pattern.ts:79`).
- `hasPartners` shape: `{ after: boolean; before: boolean }` (from `bandHasPartners`, line 327).
- TilingControl tab UI lives at `src/components/controls/TilingControl.svelte:135-185`; the Band Edge Tabs `<select>` is at lines 151-167 and writes `tabConfig.bandEdge`.
- Test style: colocated under `__tests__`, `import { Vector3 } from 'three'`, `describe/it/expect`. Run one file: `npm run test:unit -- <path>`.

---

## Resolved definitions (concrete)

### `centerSeamIndex(bandCount: number): number`
Seam `i` (0-based, `i ∈ 0..bandCount-2`) sits between bands `i` and `i+1` at position `i + 0.5`. Tube center = `(bandCount - 1) / 2`.

- **Even `bandCount`** (e.g. 6): single middle seam at `bandCount/2 - 1` (6 → 2, between bands 2 and 3).
- **Odd `bandCount`** (e.g. 5): there is a center *band* `(bandCount-1)/2`, and the two seams flanking it tie at distance 0.5. **Tie-break: pick the LOWER seam index.** Lower seam = `(bandCount-1)/2 - 1`. For `bandCount=5`: lower of seams 1 and 2 → `1`.

Both branches reduce to the same closed form: `Math.floor((bandCount - 1) / 2) - (bandCount % 2 === 0 ? 0 : 1) ... ` — DO NOT use a cute one-liner. Implement with an explicit `if (bandCount % 2 === 0)` branch for readability and so each branch is independently tested:
```ts
export const centerSeamIndex = (bandCount: number): number => {
	if (bandCount < 2) return -1; // no seams exist
	if (bandCount % 2 === 0) return bandCount / 2 - 1;
	// odd: center band is (bandCount-1)/2; tied seams are (c-1) and c; pick lower.
	const centerBand = (bandCount - 1) / 2;
	return centerBand - 1;
};
```
Verification table (tested): `N=2 → 0`, `N=3 → 0`, `N=4 → 1`, `N=5 → 1`, `N=6 → 2`.

### `seamTabOwner(seamIndex, bandCount, layout, bandEdge): { band: number; edge: 'before' | 'after' } | { band: number; edge: 'before' | 'after' }[]`
For seam `s` between bands `s` and `s+1`:

- **Center seam** (`s === centerSeamIndex(bandCount)`): allocate per `bandEdge`:
  - `'before'` → `{ band: s + 1, edge: 'before' }`
  - `'after'` → `{ band: s, edge: 'after' }`
  - `'beforeAndAfter'` → `[{ band: s + 1, edge: 'before' }, { band: s, edge: 'after' }]`
  - `undefined` bandEdge at center → treat as no owner (return `[]`); matches "no tab if bandEdge absent".
- **Non-center seam:** `center = (bandCount - 1) / 2`. `dist(b) = |b - center|`. `nearer` = band of `{s, s+1}` with smaller dist (since `s` and `s+1` straddle differently, exactly one is nearer; ties cannot occur for a non-center seam by construction).
  - `inner`: nearer band carries the tab on the edge facing the farther band:
    - if `nearer === s` → `{ band: s, edge: 'after' }`
    - if `nearer === s+1` → `{ band: s + 1, edge: 'before' }`
  - `outer`: farther band carries the tab on the edge facing the nearer band (mirror):
    - if `farther === s` → `{ band: s, edge: 'after' }`
    - if `farther === s+1` → `{ band: s + 1, edge: 'before' }`

Return type: a single owner or an array (only `beforeAndAfter` center yields an array). For uniform handling, ALWAYS return `Array<{ band; edge }>` (0, 1, or 2 entries). This keeps the consumer (`shouldHaveTab`) simple: "does any owner equal (this band, this edge)?".

**Worked example check (`before` + `inner`, `N=6`, centerSeam=2), verified:**
- seam0 → nearer=band1 → `{band:1, edge:'before'}`
- seam1 → nearer=band2 → `{band:2, edge:'before'}`
- seam2 (center, before) → `{band:3, edge:'before'}`
- seam3 → nearer=band3 → `{band:3, edge:'after'}`
- seam4 → nearer=band4 → `{band:4, edge:'after'}`

Per-band tabs: band0 none; band1 before; band2 before; band3 before+after; band4 after; band5 none. **Matches the spec example exactly.**

### `shouldHaveTab` integration (`before`/`after` edges only; `end` unchanged)
When `tabConfig.tabLayout` is set, for a `before`/`after` edge of band `b` in a tube of `bandCount` bands:
1. Map edge → seam:
   - `before` edge of band `b` → seam `b - 1` (shared with band `b-1`); valid only if `b > 0`.
   - `after` edge of band `b` → seam `b` (shared with band `b+1`); valid only if `b < bandCount - 1`.
2. Still gate on `hasPartners[side]` (no partner ⇒ no seam ⇒ no tab) — return `false` early if absent.
3. Compute `owners = seamTabOwner(seam, bandCount, layout, tabConfig.bandEdge)` and return `true` iff `owners` contains `{ band: b, edge: side }`.

When `tabConfig.tabLayout` is undefined → existing logic verbatim (regression).

---

## Task 1: Add `tabLayout` to `OutlinedTabConfig`

**Files:**
- Modify: `src/lib/types.ts:623-629`
- Test: covered indirectly by Task 2/4 (a type-only field needs no dedicated runtime test); verify via `npm run check`.

- [ ] Edit `OutlinedTabConfig` to add the field. New shape:
  ```ts
  export type OutlinedTabConfig = {
  	bandEdge?: TabEdgeOption;
  	bandEnd?: TabEdgeOption;
  	tabLayout?: 'inner' | 'outer';
  	shape: TabShape;
  	tabWidth: number;
  	inset?: number;
  };
  ```
- [ ] Run: `npm run check` — expected: no new type errors (field is optional, so all existing call sites still type-check).
- [ ] Commit:
  ```bash
  git add src/lib/types.ts
  git commit -m "feat(tabs): add optional tabLayout to OutlinedTabConfig"
  ```

---

## Task 2: PURE `centerSeamIndex` (TDD)

**Files:**
- Create: `src/lib/cut-pattern/seam-tab-layout.ts`
- Test: `src/lib/cut-pattern/__tests__/seam-tab-layout.test.ts`

- [ ] Write failing test file `src/lib/cut-pattern/__tests__/seam-tab-layout.test.ts`:
  ```ts
  import { centerSeamIndex } from '../seam-tab-layout';

  describe('centerSeamIndex', () => {
  	it('returns -1 when there are no seams (bandCount < 2)', () => {
  		expect(centerSeamIndex(0)).toBe(-1);
  		expect(centerSeamIndex(1)).toBe(-1);
  	});
  	it('returns the single middle seam for even bandCount', () => {
  		expect(centerSeamIndex(2)).toBe(0);
  		expect(centerSeamIndex(4)).toBe(1);
  		expect(centerSeamIndex(6)).toBe(2);
  	});
  	it('returns the LOWER tied seam for odd bandCount', () => {
  		expect(centerSeamIndex(3)).toBe(0);
  		expect(centerSeamIndex(5)).toBe(1);
  	});
  });
  ```
- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/seam-tab-layout.test.ts` — expected: FAIL (module `../seam-tab-layout` does not exist / `centerSeamIndex` undefined).
- [ ] Create `src/lib/cut-pattern/seam-tab-layout.ts` with ONLY `centerSeamIndex`:
  ```ts
  /**
   * Index of the seam closest to the tube center.
   *
   * Seam `i` sits between bands `i` and `i+1` at position `i + 0.5`.
   * Tube center = (bandCount - 1) / 2. Even bandCount has one middle seam;
   * odd bandCount has a center *band* with two tied flanking seams — we pick
   * the LOWER seam index deterministically.
   *
   * Returns -1 when no seams exist (bandCount < 2).
   */
  export const centerSeamIndex = (bandCount: number): number => {
  	if (bandCount < 2) return -1;
  	if (bandCount % 2 === 0) return bandCount / 2 - 1;
  	const centerBand = (bandCount - 1) / 2;
  	return centerBand - 1;
  };
  ```
- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/seam-tab-layout.test.ts` — expected: PASS.
- [ ] Run: `npm run check` — expected: no new errors.
- [ ] Commit:
  ```bash
  git add src/lib/cut-pattern/seam-tab-layout.ts src/lib/cut-pattern/__tests__/seam-tab-layout.test.ts
  git commit -m "feat(tabs): add pure centerSeamIndex with even/odd tie-break"
  ```

---

## Task 3: PURE `seamTabOwner` (TDD)

**Files:**
- Modify: `src/lib/cut-pattern/seam-tab-layout.ts`
- Test: `src/lib/cut-pattern/__tests__/seam-tab-layout.test.ts` (append)

- [ ] Append failing tests to `seam-tab-layout.test.ts`. Add `seamTabOwner` to the import:
  ```ts
  import { centerSeamIndex, seamTabOwner } from '../seam-tab-layout';
  ```
  Then add:
  ```ts
  describe('seamTabOwner', () => {
  	// Worked example from the spec: before + inner, 6 bands (centerSeam = 2).
  	it('reproduces the before+inner worked example for a 6-band tube', () => {
  		const owners = (s: number) => seamTabOwner(s, 6, 'inner', 'before');
  		expect(owners(0)).toEqual([{ band: 1, edge: 'before' }]);
  		expect(owners(1)).toEqual([{ band: 2, edge: 'before' }]);
  		expect(owners(2)).toEqual([{ band: 3, edge: 'before' }]); // center, before
  		expect(owners(3)).toEqual([{ band: 3, edge: 'after' }]);
  		expect(owners(4)).toEqual([{ band: 4, edge: 'after' }]);
  	});

  	it('center seam honors after', () => {
  		// 6 bands, centerSeam = 2, after => band 2 on its after edge.
  		expect(seamTabOwner(2, 6, 'inner', 'after')).toEqual([{ band: 2, edge: 'after' }]);
  		expect(seamTabOwner(2, 6, 'outer', 'after')).toEqual([{ band: 2, edge: 'after' }]);
  	});

  	it('center seam honors beforeAndAfter (two owners)', () => {
  		expect(seamTabOwner(2, 6, 'inner', 'beforeAndAfter')).toEqual([
  			{ band: 3, edge: 'before' },
  			{ band: 2, edge: 'after' }
  		]);
  	});

  	it('center seam with undefined bandEdge yields no owner', () => {
  		expect(seamTabOwner(2, 6, 'inner', undefined)).toEqual([]);
  	});

  	it('outer is the mirror of inner for every non-center seam', () => {
  		const bandCount = 6;
  		const center = centerSeamIndex(bandCount); // 2
  		for (let s = 0; s <= bandCount - 2; s++) {
  			if (s === center) continue;
  			const inner = seamTabOwner(s, bandCount, 'inner', 'before');
  			const outer = seamTabOwner(s, bandCount, 'outer', 'before');
  			// Both own exactly one of {band s on 'after', band s+1 on 'before'};
  			// outer picks the opposite of inner.
  			expect(inner.length).toBe(1);
  			expect(outer.length).toBe(1);
  			expect(outer[0]).not.toEqual(inner[0]);
  			const allowed = [
  				{ band: s, edge: 'after' },
  				{ band: s + 1, edge: 'before' }
  			];
  			expect(allowed).toContainEqual(inner[0]);
  			expect(allowed).toContainEqual(outer[0]);
  		}
  	});

  	it('center seam is identical for inner and outer (governed by bandEdge)', () => {
  		const center = centerSeamIndex(6);
  		expect(seamTabOwner(center, 6, 'inner', 'before')).toEqual(
  			seamTabOwner(center, 6, 'outer', 'before')
  		);
  	});
  });
  ```
- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/seam-tab-layout.test.ts` — expected: FAIL (`seamTabOwner` undefined).
- [ ] Append implementation to `seam-tab-layout.ts`:
  ```ts
  import type { TabEdgeOption } from '$lib/types';

  export type SeamTabOwner = { band: number; edge: 'before' | 'after' };

  /**
   * Which band+edge carries the tab for the seam between bands `seamIndex` and
   * `seamIndex + 1`. Returns 0, 1, or 2 owners (2 only for a beforeAndAfter center).
   *
   * - Center seam: governed by `bandEdge` (before => upper band's before edge;
   *   after => lower band's after edge; beforeAndAfter => both; undefined => none).
   * - Non-center seam: the band nearer the center owns it under `inner` (on the
   *   edge facing the farther band); under `outer` the farther band owns it (mirror).
   */
  export const seamTabOwner = (
  	seamIndex: number,
  	bandCount: number,
  	layout: 'inner' | 'outer',
  	bandEdge: TabEdgeOption | undefined
  ): SeamTabOwner[] => {
  	const lower = seamIndex;
  	const upper = seamIndex + 1;

  	if (seamIndex === centerSeamIndex(bandCount)) {
  		if (bandEdge === 'before') return [{ band: upper, edge: 'before' }];
  		if (bandEdge === 'after') return [{ band: lower, edge: 'after' }];
  		if (bandEdge === 'beforeAndAfter')
  			return [
  				{ band: upper, edge: 'before' },
  				{ band: lower, edge: 'after' }
  			];
  		return [];
  	}

  	const center = (bandCount - 1) / 2;
  	const nearer = Math.abs(lower - center) <= Math.abs(upper - center) ? lower : upper;
  	const owner = layout === 'inner' ? nearer : nearer === lower ? upper : lower;
  	// owner === lower => tab on its 'after' edge (faces upper);
  	// owner === upper => tab on its 'before' edge (faces lower).
  	const edge: 'before' | 'after' = owner === lower ? 'after' : 'before';
  	return [{ band: owner, edge }];
  };
  ```
  Note: `centerSeamIndex` is already defined above in this file, so the reference resolves. The `import type { TabEdgeOption }` belongs at the TOP of the file — when editing, hoist it above `centerSeamIndex`.
- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/seam-tab-layout.test.ts` — expected: PASS.
- [ ] Run: `npm run check` — expected: no new errors.
- [ ] Commit:
  ```bash
  git add src/lib/cut-pattern/seam-tab-layout.ts src/lib/cut-pattern/__tests__/seam-tab-layout.test.ts
  git commit -m "feat(tabs): add pure seamTabOwner with inner/outer allocation"
  ```

---

## Task 4: Export `shouldHaveTab` and branch it on `tabLayout` (TDD)

**Files:**
- Modify: `src/lib/cut-pattern/generate-outlined-pattern.ts` (`shouldHaveTab` ~348-374; add `bandIndex`/`bandCount` params)
- Test: `src/lib/cut-pattern/__tests__/shouldHaveTab-tab-layout.test.ts`

`shouldHaveTab` is currently module-private. To unit-test it we must export it AND extend its signature to accept `bandIndex` and `bandCount`. The existing OutlineEdge type already carries `side`. We build minimal `OutlineEdge`-shaped objects in tests (only `side`, plus dummy `start/end/interiorPoint` Vector3 to satisfy the type).

- [ ] Write failing test `src/lib/cut-pattern/__tests__/shouldHaveTab-tab-layout.test.ts`:
  ```ts
  import { Vector3 } from 'three';
  import { shouldHaveTab } from '../generate-outlined-pattern';
  import type { OutlinedTabConfig } from '$lib/types';

  // Minimal OutlineEdge for a before/after side. start/end/interiorPoint are
  // unused by shouldHaveTab for before/after sides but required by the type.
  const edge = (side: 'before' | 'after') => ({
  	start: new Vector3(),
  	end: new Vector3(),
  	side,
  	interiorPoint: new Vector3()
  });

  const cfg = (over: Partial<OutlinedTabConfig>): OutlinedTabConfig => ({
  	shape: 'rectangle',
  	tabWidth: 5,
  	...over
  });

  const bothPartners = { after: true, before: true };

  describe('shouldHaveTab with tabLayout (before+inner, 6-band tube)', () => {
  	const conf = cfg({ bandEdge: 'before', tabLayout: 'inner' });
  	// Expected per-band per-edge tab pattern from the worked example:
  	// band0: none | band1: before | band2: before
  	// band3: before+after | band4: after | band5: none
  	const cases: Array<[number, 'before' | 'after', boolean]> = [
  		[0, 'before', false],
  		[0, 'after', false],
  		[1, 'before', true],
  		[1, 'after', false],
  		[2, 'before', true],
  		[2, 'after', false],
  		[3, 'before', true],
  		[3, 'after', true],
  		[4, 'before', false],
  		[4, 'after', true],
  		[5, 'before', false],
  		[5, 'after', false]
  	];
  	it.each(cases)('band %i edge %s => %s', (band, side, expected) => {
  		expect(shouldHaveTab(edge(side), conf, bothPartners, 0, band, 6)).toBe(expected);
  	});

  	it('returns false on an edge whose side lacks a partner', () => {
  		// band1 before would be true, but no before partner => no seam => no tab.
  		expect(
  			shouldHaveTab(edge('before'), conf, { after: true, before: false }, 0, 1, 6)
  		).toBe(false);
  	});
  });

  describe('shouldHaveTab regression: tabLayout undefined matches legacy', () => {
  	it('before edge with bandEdge "before" => true regardless of band index', () => {
  		const conf = cfg({ bandEdge: 'before' });
  		expect(shouldHaveTab(edge('before'), conf, bothPartners, 0, 0, 6)).toBe(true);
  		expect(shouldHaveTab(edge('before'), conf, bothPartners, 0, 5, 6)).toBe(true);
  		expect(shouldHaveTab(edge('after'), conf, bothPartners, 0, 0, 6)).toBe(false);
  	});
  	it('after edge with bandEdge "after" => true; before => false', () => {
  		const conf = cfg({ bandEdge: 'after' });
  		expect(shouldHaveTab(edge('after'), conf, bothPartners, 0, 3, 6)).toBe(true);
  		expect(shouldHaveTab(edge('before'), conf, bothPartners, 0, 3, 6)).toBe(false);
  	});
  	it('beforeAndAfter => both sides true', () => {
  		const conf = cfg({ bandEdge: 'beforeAndAfter' });
  		expect(shouldHaveTab(edge('before'), conf, bothPartners, 0, 2, 6)).toBe(true);
  		expect(shouldHaveTab(edge('after'), conf, bothPartners, 0, 2, 6)).toBe(true);
  	});
  	it('respects hasPartners when layout undefined', () => {
  		const conf = cfg({ bandEdge: 'before' });
  		expect(
  			shouldHaveTab(edge('before'), conf, { after: true, before: false }, 0, 2, 6)
  		).toBe(false);
  	});
  });
  ```
- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/shouldHaveTab-tab-layout.test.ts` — expected: FAIL (`shouldHaveTab` not exported / wrong arity).
- [ ] Edit `generate-outlined-pattern.ts`. Add an import near the top (after the existing imports, line ~31):
  ```ts
  import { seamTabOwner } from './seam-tab-layout';
  ```
- [ ] Replace the `shouldHaveTab` definition (lines 348-374) with the exported, extended version. The `before`/`after` legacy branches stay byte-identical when `tabConfig.tabLayout` is undefined; a new layout-aware branch runs first when set. `end` branch unchanged. New `bandIndex`/`bandCount` params are appended (optional with safe defaults so the `end` path and any other callers are unaffected):
  ```ts
  export const shouldHaveTab = (
  	edge: OutlineEdge,
  	tabConfig: OutlinedTabConfig,
  	hasPartners: { after: boolean; before: boolean },
  	currentTube: number,
  	bandIndex = 0,
  	bandCount = 0
  ): boolean => {
  	if (edge.side === 'after' || edge.side === 'before') {
  		const side = edge.side;
  		if (!hasPartners[side]) return false;

  		if (tabConfig.tabLayout) {
  			// Map edge -> seam. before edge of band b => seam b-1; after => seam b.
  			const seam = side === 'before' ? bandIndex - 1 : bandIndex;
  			const seamValid = side === 'before' ? bandIndex > 0 : bandIndex < bandCount - 1;
  			if (!seamValid) return false;
  			const owners = seamTabOwner(seam, bandCount, tabConfig.tabLayout, tabConfig.bandEdge);
  			return owners.some((o) => o.band === bandIndex && o.edge === side);
  		}

  		// Legacy global allocation (unchanged behavior).
  		if (side === 'after') {
  			return tabConfig.bandEdge === 'after' || tabConfig.bandEdge === 'beforeAndAfter';
  		}
  		return tabConfig.bandEdge === 'before' || tabConfig.bandEdge === 'beforeAndAfter';
  	}
  	if (edge.side === 'end') {
  		if (edge.endPartnerTube === undefined) return false;
  		if (tabConfig.bandEnd === 'beforeAndAfter') return true;
  		if (tabConfig.bandEnd === 'before') return edge.endPartnerTube < currentTube;
  		if (tabConfig.bandEnd === 'after') return edge.endPartnerTube > currentTube;
  		return false;
  	}
  	return false;
  };
  ```
  Note: the legacy branch preserves the original `hasPartners[side] && (bandEdge match)` semantics — we hoisted the `!hasPartners[side] return false` guard so both legacy and layout paths share it, which is equivalent to the original (original returned `hasPartners.X && (...)`).
- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/shouldHaveTab-tab-layout.test.ts` — expected: PASS.
- [ ] Run the existing outlined tests to confirm no regression: `npm run test:unit -- src/lib/cut-pattern/__tests__/collect-outlined-band-tabs.test.ts` — expected: PASS (this file does not call `shouldHaveTab` directly but exercises the module; confirms no import/break).
- [ ] Run: `npm run check` — expected: no new errors.
- [ ] Commit:
  ```bash
  git add src/lib/cut-pattern/generate-outlined-pattern.ts src/lib/cut-pattern/__tests__/shouldHaveTab-tab-layout.test.ts
  git commit -m "feat(tabs): tabLayout-aware shouldHaveTab; export for testing"
  ```

---

## Task 5: Thread `bandCount`/`bandIndex` through the call chain

**Files:**
- Modify: `src/lib/cut-pattern/generate-outlined-pattern.ts` (`buildOutlinePath` ~383-437; `generateOutlinedBandPattern` ~442-461; `generateOutlinedTubePattern` ~574-585)
- Test: covered by existing tests + `npm run check`; the wiring is exercised end-to-end in Task 6 manual verify. No new unit test (the decision logic is already fully tested in Task 4).

- [ ] Edit `buildOutlinePath` signature (line 383) to accept `bandIndex` and `bandCount`, and forward them to `shouldHaveTab`:
  ```ts
  const buildOutlinePath = (
  	edges: OutlineEdge[],
  	tabConfig?: OutlinedTabConfig,
  	hasPartners?: { after: boolean; before: boolean },
  	currentTube?: number,
  	tabsOut?: Map<number, TabGeometry>,
  	bandIndex = 0,
  	bandCount = 0
  ): PathSegment[] => {
  ```
- [ ] Update the `shouldHaveTab` call inside `buildOutlinePath` (currently line 404) to pass them:
  ```ts
  if (shouldHaveTab(edges[i], tabConfig, partners, currentTube ?? 0, bandIndex, bandCount)) {
  ```
- [ ] Edit `generateOutlinedBandPattern` signature (line 442) to accept `bandCount` (append as last param so existing positional args are unaffected up to that point):
  ```ts
  const generateOutlinedBandPattern = (
  	band: Band,
  	bandIndex: number,
  	config: OutlinedPatternConfig,
  	pixelScale: PixelScale,
  	tubeAddress: { globule: number; tube: number },
  	quads: Quadrilateral[],
  	neighborBefore?: Quadrilateral[],
  	neighborAfter?: Quadrilateral[],
  	bandCount = 0
  ): BandCutPattern => {
  ```
- [ ] Update its `buildOutlinePath` call (lines 455-461) to pass `bandIndex` and `bandCount`:
  ```ts
  const outlinePath = buildOutlinePath(
  	edges,
  	config.tabConfig,
  	hasPartners,
  	tubeAddress.tube,
  	tabsByIndex,
  	bandIndex,
  	bandCount
  );
  ```
  Note: `bandIndex` here is the GLOBAL index `rangeStart + i` passed by the tube fn. The seam math in `seamTabOwner` is relative to the tube's full band set and uses `bandCount`; see verification note below.
- [ ] Edit `generateOutlinedTubePattern` (lines 574-585) to compute and pass `bandCount`:
  ```ts
  const bandCount = alignedBands.length;
  const bandPatterns = alignedBands.map((band, i) =>
  	generateOutlinedBandPattern(
  		band,
  		rangeStart + i,
  		config,
  		pixelScale,
  		address,
  		allQuads[i],
  		allQuads[i - 1],
  		allQuads[i + 1],
  		bandCount
  	)
  );
  ```
- [ ] **Verification note (resolve indexing):** `alignedBands` is the already-sliced selection (`selectedBands`, length = `bandCount`), and `i` runs `0..bandCount-1`. The seam math must use the index WITHIN this aligned set (`i`), NOT the global `rangeStart + i`. If `rangeStart > 0`, passing the global `bandIndex` would desync from `bandCount`. RESOLUTION: pass the LOCAL index to the tab decision. Since `generateOutlinedBandPattern` uses `bandIndex` both for labels/addresses (must stay global) AND for the seam math (must be local), pass a separate `localBandIndex` param. Update the band fn signature instead to add `localBandIndex = bandIndex` defaulting and use it only in the `buildOutlinePath` call:
  ```ts
  const generateOutlinedBandPattern = (
  	band: Band,
  	bandIndex: number,            // GLOBAL: used for labels/address (unchanged)
  	config: OutlinedPatternConfig,
  	pixelScale: PixelScale,
  	tubeAddress: { globule: number; tube: number },
  	quads: Quadrilateral[],
  	neighborBefore?: Quadrilateral[],
  	neighborAfter?: Quadrilateral[],
  	bandCount = 0,
  	localBandIndex = bandIndex     // LOCAL: index within the aligned/selected set
  ): BandCutPattern => {
  ```
  and the `buildOutlinePath` call passes `localBandIndex` (not `bandIndex`):
  ```ts
  	tabsByIndex,
  	localBandIndex,
  	bandCount
  ```
  and the tube fn passes `i` as `localBandIndex`:
  ```ts
  		allQuads[i + 1],
  		bandCount,
  		i
  ```
- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/shouldHaveTab-tab-layout.test.ts` — expected: still PASS (signature of `shouldHaveTab` unchanged here).
- [ ] Run the full cut-pattern test dir to catch fallout: `npm run test:unit -- src/lib/cut-pattern/__tests__` — expected: PASS.
- [ ] Run: `npm run check` — expected: no new errors.
- [ ] Commit:
  ```bash
  git add src/lib/cut-pattern/generate-outlined-pattern.ts
  git commit -m "feat(tabs): thread local bandIndex + bandCount into tab decision"
  ```

---

## Task 6: UI selector for inner/outer

**Files:**
- Modify: `src/components/controls/TilingControl.svelte` (insert after the Band Edge Tabs `<select>` block, currently lines 151-167)
- Test: no unit test (Svelte control wiring); verify with `npm run check` + manual smoke (`npm run dev`).

- [ ] Insert a new `<div class="row">` block immediately AFTER the existing Band Edge Tabs block (after line 167, before the Band End Tabs block at line 168). It writes `tabConfig.tabLayout`:
  ```svelte
  <div class="row">
  	<span>Adjacent Tab Layout</span>
  	<select
  		value={$patternConfigStore.patternTypeConfig.tabConfig.tabLayout ?? 'none'}
  		on:change={(e) => {
  			const val = e.target.value;
  			$patternConfigStore.patternTypeConfig.tabConfig.tabLayout =
  				val === 'none' ? undefined : val;
  			$patternConfigStore = $patternConfigStore;
  		}}
  	>
  		<option value="none">none (legacy)</option>
  		<option value="inner">inner</option>
  		<option value="outer">outer</option>
  	</select>
  </div>
  ```
  This mirrors the existing `bandEdge` select pattern exactly (including the `$patternConfigStore = $patternConfigStore` reassignment to trigger reactivity), so no new helpers/imports are needed.
- [ ] Run: `npm run check` — expected: no new errors. (Svelte's `e.target.value` is typed loosely as in the sibling selects; if `check` flags it, cast as the sibling blocks do — they currently assign without an explicit cast, so this should match.)
- [ ] Manual smoke: `npm run dev`, open the designer, enable outlined tabs, toggle Adjacent Tab Layout between none/inner/outer, confirm the pattern recomputes (worker re-runs) and tab placement shifts to the center-seam-relative layout. Expected for a 6-band tube with `before`+`inner`: tabs match the worked example (band0 none, band1/2 before, band3 before+after, band4 after, band5 none).
- [ ] Commit:
  ```bash
  git add src/components/controls/TilingControl.svelte
  git commit -m "feat(tabs): add inner/outer Adjacent Tab Layout selector"
  ```

---

## Final verification

- [ ] Run: `npm run test:unit -- src/lib/cut-pattern/__tests__` — expected: all PASS.
- [ ] Run: `npm run check` — expected: clean.
- [ ] Run: `npm run lint` — expected: clean (fix any new issues inline).
- [ ] Confirm spec coverage:
  - `centerSeamIndex` tested for N=2,3,4,5,6 (Task 2). ✓
  - `seamTabOwner` reproduces the worked example (Task 3). ✓
  - `outer` is the mirror of `inner` for non-center seams; center identical (Task 3). ✓
  - `shouldHaveTab` asserts the exact 6-band pattern; `end`/no-partner unaffected (Task 4). ✓
  - `tabLayout` undefined ⇒ legacy regression (Task 4). ✓
  - UI selector added (Task 6). ✓

## Out of scope (do not implement)
- End-cap (tube-to-tube) tab logic — `end` branch left untouched.
- Tab geometry/shape changes.
- Tiled patterns.
