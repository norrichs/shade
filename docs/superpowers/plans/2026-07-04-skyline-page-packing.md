# Skyline Page Packing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second page-layout algorithm, `'skyline'`, that packs band cut patterns densely using a global skyline with bounded-lookahead reordering and optional 90° rotation, selectable in the Page Layout editor alongside the untouched `'flex-wrap'` packer.

**Architecture:** A new pure `PageLayoutFn` (`skylinePageLayout`) implements bottom-left skyline placement. At each step it scans a window of the next `reorderWindow` unplaced items (× orientations) and places the lowest-scoring fit; when nothing in the window fits the current page it starts a new page and places the front item (starvation guard). The layout returns a per-item `rotations` array; the renderer applies a 90° rotation about each band's local bounds-center, with the origin computed so that center lands at the packer's chosen slot center.

**Tech Stack:** TypeScript, SvelteKit (Svelte 5 runes), Three.js (`Vector3`), Jest.

**Design doc:** `docs/superpowers/specs/2026-07-04-skyline-page-packing-design.md`

---

## File Structure

- **Modify** `src/lib/cut-pattern/page-layout/types.ts` — add `reorderWindow`/`allowRotation` to `PageGeom`; add `rotations` to `PageLayoutResult`.
- **Modify** `src/lib/types.ts` — widen `PageLayoutConfig.algorithm`, add `reorderWindow`/`allowRotation`.
- **Modify** `src/lib/cut-pattern/page-layout/flex-wrap.ts` — return `rotations: []` of zeros (no behaviour change).
- **Modify** `src/lib/cut-pattern/page-layout/registry.ts` — copy new fields in `buildPageGeom`; register `skyline`.
- **Create** `src/lib/cut-pattern/page-layout/skyline.ts` — the new packer.
- **Create** `src/lib/cut-pattern/page-layout/__tests__/skyline.test.ts` — packer tests.
- **Modify** `src/lib/shades-config.ts` — default `reorderWindow: 8`, `allowRotation: false`.
- **Modify** `src/lib/validators.ts` — backfill new fields in `migrateGlobulePatternConfig`.
- **Modify** `src/lib/__tests__/migrate-page-layout.test.ts` — assert the new backfill.
- **Create** `src/lib/cut-pattern/band-transform.ts` — pure `bandTransform()` helper.
- **Create** `src/lib/cut-pattern/__tests__/band-transform.test.ts` — helper tests.
- **Modify** `src/components/cut-pattern/BandComponent.svelte` — accept `rotation`/`pivot`, use `bandTransform`.
- **Modify** `src/components/cut-pattern/CutPatternRenderer.svelte` — pass `rotation`/`pivot` from `pageResult`.
- **Modify** `src/components/modal/editor/PageLayout.svelte` — algorithm select + skyline controls.

---

## Task 1: Extend types, defaults, and migration (no behaviour change)

This task widens the config/geometry/result types, keeps `flex-wrap` byte-for-byte identical in behaviour, and backfills the two new config fields. It must leave the project type-checking and all existing tests green.

**Files:**

- Modify: `src/lib/cut-pattern/page-layout/types.ts`
- Modify: `src/lib/types.ts:183-191`
- Modify: `src/lib/cut-pattern/page-layout/flex-wrap.ts:11-92`
- Modify: `src/lib/cut-pattern/page-layout/registry.ts:9-24`
- Modify: `src/lib/shades-config.ts:553-561`
- Modify: `src/lib/validators.ts:78-88`
- Test: `src/lib/__tests__/migrate-page-layout.test.ts`

- [ ] **Step 1: Add the failing migration test**

Append these two tests inside the `describe('migrateGlobulePatternConfig — page layout', ...)` block in `src/lib/__tests__/migrate-page-layout.test.ts`:

```ts
it('backfills reorderWindow and allowRotation when the pageLayout block is missing', () => {
	const out = migrateGlobulePatternConfig({
		patternConfig: {}
	} as Partial<GlobulePatternConfig>);
	expect(out.patternConfig?.pageLayout?.reorderWindow).toBe(8);
	expect(out.patternConfig?.pageLayout?.allowRotation).toBe(false);
});

it('backfills reorderWindow and allowRotation on an existing pageLayout that lacks them', () => {
	const out = migrateGlobulePatternConfig({
		patternConfig: {
			pageLayout: {
				pageSize: { width: 304.8, height: 304.8 },
				pageScale: 0.6562,
				margin: 12.7,
				gap: 20,
				displayUnit: 'inch',
				algorithm: 'flex-wrap',
				keepConnected: 0
			}
		}
	} as unknown as Partial<GlobulePatternConfig>);
	expect(out.patternConfig?.pageLayout?.reorderWindow).toBe(8);
	expect(out.patternConfig?.pageLayout?.allowRotation).toBe(false);
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm run test:unit -- src/lib/__tests__/migrate-page-layout.test.ts`
Expected: FAIL — the two new tests report `reorderWindow`/`allowRotation` as `undefined`.

- [ ] **Step 3: Widen `PageLayoutConfig` in `src/lib/types.ts`**

Replace the `PageLayoutConfig` type (lines 183-191) with:

```ts
export type PageLayoutConfig = {
	pageSize: { width: number; height: number }; // millimetres
	pageScale: number; // pattern-units per millimetre
	margin: number; // millimetres
	gap: number; // pattern units, spacing between patterns
	displayUnit: 'mm' | 'inch'; // editor display only
	algorithm: 'flex-wrap' | 'skyline';
	reorderWindow: number; // skyline only: lookahead window (>= 1); 1 = strict order
	allowRotation: boolean; // skyline only: permit 90° rotation
	keepConnected: number; // px-wide uncut bridge left in each prepared cut path (0 = off)
};
```

- [ ] **Step 4: Extend `PageGeom` and `PageLayoutResult`**

In `src/lib/cut-pattern/page-layout/types.ts`, add two fields to `PageGeom` (after `gap`):

```ts
gap: number; // spacing between items, pattern units
reorderWindow: number; // skyline lookahead window (>= 1)
allowRotation: boolean; // skyline: permit 90° rotation
```

And add `rotations` to `PageLayoutResult`:

```ts
export type PageLayoutResult = {
	origins: Vector3[];
	rotations: number[]; // per-item rotation in degrees (0 or 90), parallel to origins
	pages: PageRect[];
	overflow?: { itemIndex: number; requiredScale: number };
};
```

- [ ] **Step 5: Make `flex-wrap` return `rotations` (all zeros)**

In `src/lib/cut-pattern/page-layout/flex-wrap.ts`, update the overflow early-return (lines 29-33) and the final return (line 91).

Overflow return becomes:

```ts
return {
	origins: [],
	rotations: [],
	pages: [],
	overflow: { itemIndex: worst, requiredScale: pageScale * factor }
};
```

Final return becomes:

```ts
return { origins, rotations: origins.map(() => 0), pages };
```

- [ ] **Step 6: Populate new fields in `buildPageGeom`**

In `src/lib/cut-pattern/page-layout/registry.ts`, add the two fields to the returned object in `buildPageGeom` (inside the `return { ... }`, after `gap: cfg.gap`):

```ts
		gap: cfg.gap,
		reorderWindow: cfg.reorderWindow,
		allowRotation: cfg.allowRotation
```

- [ ] **Step 7: Update the config default**

In `src/lib/shades-config.ts`, replace the `pageLayout` block (lines 553-561) with:

```ts
	pageLayout: {
		pageSize: { width: 304.8, height: 304.8 }, // 12in × 12in
		pageScale: 0.6562, // ~200 pattern-units per 12in
		margin: 12.7, // 0.5in
		gap: 20,
		displayUnit: 'inch',
		algorithm: 'flex-wrap',
		reorderWindow: 8,
		allowRotation: false,
		keepConnected: 0
	},
```

- [ ] **Step 8: Backfill in the migration**

In `src/lib/validators.ts`, update `migrateGlobulePatternConfig`. Replace the entire existing `const pc = ...` declaration and its `if` block (lines 78-88 — the `const pc` line through the closing `}` of the `pageLayout === undefined` branch) with the following. Do not leave the old `const pc` line in place:

```ts
const pc = config.patternConfig as { pageLayout?: Record<string, unknown> } | undefined;
if (pc && pc.pageLayout === undefined) {
	pc.pageLayout = {
		pageSize: { width: 304.8, height: 304.8 },
		pageScale: 0.6562,
		margin: 12.7,
		gap: 20,
		displayUnit: 'inch',
		algorithm: 'flex-wrap',
		reorderWindow: 8,
		allowRotation: false,
		keepConnected: 0
	};
} else if (pc && pc.pageLayout) {
	const pl = pc.pageLayout;
	if (pl.reorderWindow === undefined) pl.reorderWindow = 8;
	if (pl.allowRotation === undefined) pl.allowRotation = false;
	if (pl.algorithm === undefined) pl.algorithm = 'flex-wrap';
}
```

- [ ] **Step 9: Run the migration tests to verify they pass**

Run: `npm run test:unit -- src/lib/__tests__/migrate-page-layout.test.ts`
Expected: PASS — all migration tests, including the two new ones.

- [ ] **Step 10: Run the existing flex-wrap tests (unchanged behaviour)**

Run: `npm run test:unit -- src/lib/cut-pattern/page-layout/__tests__/flex-wrap.test.ts`
Expected: PASS — all six existing tests still pass (they do not assert on `rotations`).

- [ ] **Step 11: Type-check**

Run: `npm run check`
Expected: no new type errors. (If `CutPatternRenderer.svelte` complains that `pageResult` lacks `rotations`, it does not yet — `rotations` is additive; renderer consumption is Task 3.)

- [ ] **Step 12: Commit**

```bash
git add src/lib/types.ts src/lib/cut-pattern/page-layout/types.ts src/lib/cut-pattern/page-layout/flex-wrap.ts src/lib/cut-pattern/page-layout/registry.ts src/lib/shades-config.ts src/lib/validators.ts src/lib/__tests__/migrate-page-layout.test.ts
git commit -m "feat(page-layout): add reorderWindow/allowRotation config and rotations result field"
```

---

## Task 2: Skyline packer algorithm

Implements `skylinePageLayout` and registers it. Pure function, fully unit-tested.

**Files:**

- Create: `src/lib/cut-pattern/page-layout/skyline.ts`
- Create: `src/lib/cut-pattern/page-layout/__tests__/skyline.test.ts`
- Modify: `src/lib/cut-pattern/page-layout/registry.ts:5-7`

- [ ] **Step 1: Write the failing test file**

Create `src/lib/cut-pattern/page-layout/__tests__/skyline.test.ts`:

```ts
import { skylinePageLayout } from '../skyline';
import type { LayoutItem, PageGeom } from '../types';

const item = (width: number, height: number): LayoutItem => ({
	width,
	height,
	left: 0,
	top: 0,
	alignedYOffset: 0
});

const geom = (over: Partial<PageGeom> = {}): PageGeom => ({
	pageScale: 1,
	pageWidth: 300,
	pageHeight: 1000,
	contentWidth: 300,
	contentHeight: 1000,
	marginPx: 0,
	pageGap: 50,
	gap: 0,
	reorderWindow: 8,
	allowRotation: false,
	...over
});

// origin.x/y target the CENTER of the placed slot minus the item's bounds-center.
// With left=top=0, bounds-center = (width/2, height/2), so for an unrotated item
// placed at slot top-left (sx, sy): origin = (sx, sy).
describe('skylinePageLayout', () => {
	it('places the first item at content origin (top-left slot)', () => {
		const r = skylinePageLayout([item(100, 50)], geom());
		expect(r.origins[0].x).toBeCloseTo(0);
		expect(r.origins[0].y).toBeCloseTo(0);
		expect(r.rotations[0]).toBe(0);
		expect(r.pages).toHaveLength(1);
	});

	it('lays two equal items side by side, left to right', () => {
		// Equal scores → tie-break by x then original index, so item 0 lands at
		// x=0 and item 1 to its right at x=100, both at the top.
		const r = skylinePageLayout([item(100, 50), item(100, 50)], geom());
		expect(r.origins.map((o) => o.x)).toEqual([0, 100]);
		expect(r.origins.map((o) => o.y)).toEqual([0, 0]);
	});

	it('drops a following item onto the lowest ledge (unbounded push-up)', () => {
		// contentWidth 200, strict order (reorderWindow 1):
		//   item0 100×100 at x=0 (raises left column to 100),
		//   item1 100×20 at x=100 (raises right column to 20),
		//   item2 100×80 rests on the right ledge at top=20 — rising 20 above the
		//   baseline, which the flex-wrap midpoint clamp would have forbidden.
		const r = skylinePageLayout(
			[item(100, 100), item(100, 20), item(100, 80)],
			geom({ contentWidth: 200, reorderWindow: 1 })
		);
		expect(r.origins[2].x).toBeCloseTo(100);
		expect(r.origins[2].y).toBeCloseTo(20);
	});

	it('reorders within the window to place the best fit first (dense stacking)', () => {
		// Full-width (100) items of decreasing height. With a wide window the
		// packer places them shortest-first (lowest resulting top), so they stack
		// item2 (30) at y=0, item1 (50) at y=30, item0 (100) at y=80.
		const items = [item(100, 100), item(100, 50), item(100, 30)];
		const r = skylinePageLayout(items, geom({ contentWidth: 100, reorderWindow: 8 }));
		expect(r.origins[2].y).toBeCloseTo(0);
		expect(r.origins[1].y).toBeCloseTo(30);
		expect(r.origins[0].y).toBeCloseTo(80);
	});

	it('reorderWindow=1 keeps strict input order', () => {
		// Same items, window of 1 → placed in input order, stacking downward:
		// item0 at y=0, item1 at y=100, item2 at y=150.
		const items = [item(100, 100), item(100, 50), item(100, 30)];
		const r = skylinePageLayout(items, geom({ contentWidth: 100, reorderWindow: 1 }));
		expect(r.origins[0].y).toBeCloseTo(0);
		expect(r.origins[1].y).toBeCloseTo(100);
		expect(r.origins[2].y).toBeCloseTo(150);
	});

	it('rotates a tall-narrow item to fit when allowRotation is on', () => {
		// content 100 wide, 100 tall. A 40×90 item fits upright. A 40×90 second
		// item upright would need x=40..80 (ok). Force a case where rotation helps:
		// content only 50 tall; a 40×90 item cannot fit upright (90 > 50) but fits
		// rotated (90 wide > 100? no). Use content 100×50, item 30×80 -> rotated 80×30 fits.
		const g = geom({ contentWidth: 100, contentHeight: 50, pageHeight: 50, allowRotation: true });
		const r = skylinePageLayout([item(30, 80)], g);
		expect(r.rotations[0]).toBe(90);
		expect(r.pages).toHaveLength(1);
		expect(r.overflow).toBeUndefined();
	});

	it('breaks to a new page and places the front item when the window is stuck', () => {
		const g = geom({ contentWidth: 100, contentHeight: 150, pageHeight: 150, pageGap: 50 });
		const r = skylinePageLayout([item(100, 100), item(100, 100)], g);
		expect(r.pages).toHaveLength(2);
		expect(r.origins[0].y).toBeCloseTo(0);
		// second item on page 2: pageOffsetY = 1*(150+50) = 200, top 0
		expect(r.origins[1].y).toBeCloseTo(200);
	});

	it('reports overflow with the required scale when an item exceeds the content box', () => {
		const g = geom({ pageScale: 2, contentWidth: 300, contentHeight: 1000 });
		const r = skylinePageLayout([item(500, 50)], g);
		expect(r.overflow?.itemIndex).toBe(0);
		expect(r.overflow?.requiredScale).toBeCloseTo(3.333, 2);
		expect(r.origins).toHaveLength(0);
	});

	it('rotation can rescue an item that would otherwise overflow', () => {
		// content 100 wide, 400 tall. Item 300×80 overflows width upright, but
		// rotated (80×300) fits. No overflow expected.
		const g = geom({ contentWidth: 100, contentHeight: 400, pageHeight: 400, allowRotation: true });
		const r = skylinePageLayout([item(300, 80)], g);
		expect(r.overflow).toBeUndefined();
		expect(r.rotations[0]).toBe(90);
	});
});
```

- [ ] **Step 2: Run the test file to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/page-layout/__tests__/skyline.test.ts`
Expected: FAIL — `skylinePageLayout` is not defined / module not found.

- [ ] **Step 3: Implement `skyline.ts`**

Create `src/lib/cut-pattern/page-layout/skyline.ts`:

```ts
import { Vector3 } from 'three';
import type { LayoutItem, PageGeom, PageLayoutResult, PageRect } from './types';

const EPS = 1e-6;

type SkySeg = { x: number; width: number; top: number };
type Orient = { w: number; h: number; rot: number };

const orientsOf = (it: LayoutItem, allowRotation: boolean): Orient[] =>
	allowRotation && Math.abs(it.width - it.height) > EPS
		? [
				{ w: it.width, h: it.height, rot: 0 },
				{ w: it.height, h: it.width, rot: 90 }
			]
		: [{ w: it.width, h: it.height, rot: 0 }];

// Resting top for an item of width w whose left edge sits at segment i's x.
// Null if it would run past contentWidth.
const restAt = (sky: SkySeg[], i: number, w: number, contentWidth: number): number | null => {
	if (sky[i].x + w > contentWidth + EPS) return null;
	let top = 0;
	let acc = 0;
	for (let j = i; j < sky.length && acc < w - EPS; j++) {
		top = Math.max(top, sky[j].top);
		acc += sky[j].width;
	}
	return top;
};

// Raise the span [x, x+w] to newTop, splitting/merging segments; keeps sky sorted.
const raise = (sky: SkySeg[], x: number, w: number, newTop: number): SkySeg[] => {
	const x1 = x + w;
	const split: SkySeg[] = [];
	for (const s of sky) {
		const s1 = s.x + s.width;
		if (s1 <= x + EPS || s.x >= x1 - EPS) {
			split.push(s);
			continue;
		}
		if (s.x < x - EPS) split.push({ x: s.x, width: x - s.x, top: s.top });
		const a = Math.max(s.x, x);
		const b = Math.min(s1, x1);
		split.push({ x: a, width: b - a, top: newTop });
		if (s1 > x1 + EPS) split.push({ x: x1, width: s1 - x1, top: s.top });
	}
	const merged: SkySeg[] = [];
	for (const s of split) {
		const last = merged[merged.length - 1];
		if (last && Math.abs(last.top - s.top) < EPS && Math.abs(last.x + last.width - s.x) < EPS) {
			last.width += s.width;
		} else {
			merged.push({ ...s });
		}
	}
	return merged;
};

type Placement = { o: Orient; x: number; top: number; score: number };

// Best (lowest resulting top) placement for one item on the current skyline.
const bestPlacement = (
	it: LayoutItem,
	sky: SkySeg[],
	contentWidth: number,
	contentHeight: number,
	allowRotation: boolean
): Placement | null => {
	let best: Placement | null = null;
	for (const o of orientsOf(it, allowRotation)) {
		for (let i = 0; i < sky.length; i++) {
			const top = restAt(sky, i, o.w, contentWidth);
			if (top === null || top + o.h > contentHeight + EPS) continue;
			const score = top + o.h;
			const x = sky[i].x;
			if (
				!best ||
				score < best.score - EPS ||
				(Math.abs(score - best.score) < EPS && x < best.x - EPS)
			) {
				best = { o, x, top, score };
			}
		}
	}
	return best;
};

export const skylinePageLayout = (items: LayoutItem[], geom: PageGeom): PageLayoutResult => {
	const {
		pageScale,
		pageWidth,
		pageHeight,
		contentWidth,
		contentHeight,
		marginPx,
		pageGap,
		reorderWindow,
		allowRotation
	} = geom;
	const W = Math.max(1, Math.floor(reorderWindow));

	// Overflow: an item that cannot fit a fresh empty page in any orientation.
	let worst = -1;
	let factor = 0;
	items.forEach((it, i) => {
		const os = orientsOf(it, allowRotation);
		const fits = os.some((o) => o.w <= contentWidth + EPS && o.h <= contentHeight + EPS);
		if (!fits) {
			const f = Math.min(...os.map((o) => Math.max(o.w / contentWidth, o.h / contentHeight)));
			if (f > factor) {
				factor = f;
				worst = i;
			}
		}
	});
	if (worst >= 0) {
		return {
			origins: [],
			rotations: [],
			pages: [],
			overflow: { itemIndex: worst, requiredScale: pageScale * factor }
		};
	}

	const queue = items.map((_, i) => i);
	const origins: Vector3[] = new Array(items.length);
	const rotations: number[] = new Array(items.length).fill(0);
	const pages: PageRect[] = [];

	let page = 0;
	let sky: SkySeg[] = [{ x: 0, width: contentWidth, top: 0 }];
	const ensurePage = (idx: number) => {
		if (!pages[idx]) {
			pages[idx] = { x: 0, y: idx * (pageHeight + pageGap), width: pageWidth, height: pageHeight };
		}
	};
	ensurePage(0);

	const commit = (qi: number, p: Placement) => {
		const idx = queue[qi];
		const it = items[idx];
		const pageOffsetY = page * (pageHeight + pageGap);
		const cx = it.left + it.width / 2; // local bounds-center
		const cy = it.top + it.height / 2;
		origins[idx] = new Vector3(
			marginPx + p.x + p.o.w / 2 - cx,
			pageOffsetY + marginPx + p.top + p.o.h / 2 - cy,
			0
		);
		rotations[idx] = p.o.rot;
		sky = raise(sky, p.x, p.o.w, p.top + p.o.h);
		queue.splice(qi, 1);
	};

	while (queue.length > 0) {
		const wEnd = Math.min(W, queue.length);
		let choiceQi = -1;
		let choice: Placement | null = null;
		for (let qi = 0; qi < wEnd; qi++) {
			const p = bestPlacement(items[queue[qi]], sky, contentWidth, contentHeight, allowRotation);
			if (!p) continue;
			const better =
				!choice ||
				p.score < choice.score - EPS ||
				(Math.abs(p.score - choice.score) < EPS &&
					(p.x < choice.x - EPS ||
						(Math.abs(p.x - choice.x) < EPS && queue[qi] < queue[choiceQi])));
			if (better) {
				choice = p;
				choiceQi = qi;
			}
		}
		if (choice) {
			commit(choiceQi, choice);
		} else {
			// Nothing in the window fits the current page: new page, place the front item.
			page += 1;
			ensurePage(page);
			sky = [{ x: 0, width: contentWidth, top: 0 }];
			const front = bestPlacement(items[queue[0]], sky, contentWidth, contentHeight, allowRotation);
			// Non-null: overflow was pre-checked, so it fits a fresh page.
			commit(0, front as Placement);
		}
	}

	return { origins, rotations, pages };
};
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/page-layout/__tests__/skyline.test.ts`
Expected: PASS — all skyline tests.

- [ ] **Step 5: Register the algorithm**

In `src/lib/cut-pattern/page-layout/registry.ts`, import and register it. Change the import line and the map:

```ts
import { flexWrapPageLayout, PAGE_STACK_GAP } from './flex-wrap';
import { skylinePageLayout } from './skyline';
import type { PageGeom, PageLayoutFn } from './types';

export const PAGE_LAYOUT_ALGORITHMS: Record<PageLayoutConfig['algorithm'], PageLayoutFn> = {
	'flex-wrap': flexWrapPageLayout,
	skyline: skylinePageLayout
};
```

- [ ] **Step 6: Type-check**

Run: `npm run check`
Expected: no new type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cut-pattern/page-layout/skyline.ts src/lib/cut-pattern/page-layout/__tests__/skyline.test.ts src/lib/cut-pattern/page-layout/registry.ts
git commit -m "feat(page-layout): implement skyline packer with bounded lookahead and rotation"
```

---

## Task 3: Render rotation in BandComponent

Thread `rotation` + `pivot` from the page-layout result into the band's SVG transform. Introduce a tested pure helper so the transform string is verified in isolation.

**Files:**

- Create: `src/lib/cut-pattern/band-transform.ts`
- Create: `src/lib/cut-pattern/__tests__/band-transform.test.ts`
- Modify: `src/components/cut-pattern/BandComponent.svelte:21-45,96-97,155`
- Modify: `src/components/cut-pattern/CutPatternRenderer.svelte:314-345`

- [ ] **Step 1: Write the failing helper test**

Create `src/lib/cut-pattern/__tests__/band-transform.test.ts`:

```ts
import { bandTransform } from '../band-transform';

describe('bandTransform', () => {
	it('returns a plain translate when rotation is 0', () => {
		expect(bandTransform({ x: 10, y: 20 }, 0, { x: 5, y: 5 })).toBe('translate(10 20)');
	});

	it('appends a rotate about the pivot when rotation is non-zero', () => {
		expect(bandTransform({ x: 10, y: 20 }, 90, { x: 5, y: 6 })).toBe(
			'translate(10 20) rotate(90 5 6)'
		);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/band-transform.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/cut-pattern/band-transform.ts`:

```ts
export type Point2 = { x: number; y: number };

// SVG transform for a band placed at `origin`, optionally rotated `rotation`
// degrees about `pivot` (the band's local bounds-center). Rotation 0 yields a
// plain translate so unrotated bands render exactly as before.
export const bandTransform = (origin: Point2, rotation: number, pivot: Point2): string => {
	const t = `translate(${origin.x} ${origin.y})`;
	return rotation ? `${t} rotate(${rotation} ${pivot.x} ${pivot.y})` : t;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/band-transform.test.ts`
Expected: PASS.

- [ ] **Step 5: Accept `rotation`/`pivot` props in `BandComponent.svelte`**

In `src/components/cut-pattern/BandComponent.svelte`, add the import at the top of the `<script>` (with the other imports):

```ts
import { bandTransform, type Point2 } from '$lib/cut-pattern/band-transform';
```

Add `rotation` and `pivot` to the `$props()` destructure and its type (lines 21-45). Add to the destructured names:

```ts
		rotation = 0,
		pivot = { x: 0, y: 0 },
```

And to the type block:

```ts
		rotation?: number;
		pivot?: Point2;
```

- [ ] **Step 6: Use `bandTransform` at both transform sites**

In `src/components/cut-pattern/BandComponent.svelte`, replace the group transform (line 97):

```svelte
transform={bandTransform(origin, rotation, pivot)}
```

And the PatternLabel portal transform (line 155):

```svelte
portal={isTiled ? { transform: bandTransform(origin, rotation, pivot) } : undefined}
```

- [ ] **Step 7: Pass `rotation`/`pivot` from the page-mode render loop**

In `src/components/cut-pattern/CutPatternRenderer.svelte`, the page-mode loop begins at line 314 (`{#each pageBands as { band, tube }, i ...}`) rendering `<BandComponent ... origin={pageResult.origins[i]} ...>`. Add rotation and pivot props. Change the opening `<BandComponent>` prop list (around lines 315-325) to include:

```svelte
origin={pageResult.origins[i]}
rotation={pageResult.rotations[i] ?? 0}
pivot={pivotFor(band)}
```

Then add the `pivotFor` helper next to `toLayoutItems` (after line 173) so it uses the SAME bounds source the layout used (`effBoundsFor`):

```ts
const pivotFor = (band: BandCutPattern) => {
	const b = effBoundsFor(band);
	return { x: (b?.left ?? 0) + (b?.width ?? 0) / 2, y: (b?.top ?? 0) + (b?.height ?? 0) / 2 };
};
```

- [ ] **Step 8: Type-check**

Run: `npm run check`
Expected: no new type errors.

- [ ] **Step 9: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS — including flex-wrap, skyline, migration, and band-transform tests.

- [ ] **Step 10: Commit**

```bash
git add src/lib/cut-pattern/band-transform.ts src/lib/cut-pattern/__tests__/band-transform.test.ts src/components/cut-pattern/BandComponent.svelte src/components/cut-pattern/CutPatternRenderer.svelte
git commit -m "feat(page-layout): render skyline rotation via band transform"
```

---

## Task 4: Page Layout editor controls

Add the algorithm selector and skyline-only controls. UI-only; verified manually against the running app.

**Files:**

- Modify: `src/components/modal/editor/PageLayout.svelte:175-187` (inside the `{#if mode === 'page'}` block)

- [ ] **Step 1: Add the algorithm select and skyline controls**

In `src/components/modal/editor/PageLayout.svelte`, inside the `{#if mode === 'page'}` block, immediately after the opening `{#if mode === 'page'}` (line 175) and before the `Preset` label, insert:

```svelte
<label>
	Algorithm
	<select bind:value={$patternConfigStore.patternConfig.pageLayout.algorithm}>
		<option value="flex-wrap">Flex-wrap</option>
		<option value="skyline">Skyline</option>
	</select>
</label>

{#if $patternConfigStore.patternConfig.pageLayout.algorithm === 'skyline'}
	<label>
		reorder window
		<input
			type="number"
			min="1"
			step="1"
			bind:value={$patternConfigStore.patternConfig.pageLayout.reorderWindow}
		/>
	</label>
	<label class="indicator-toggle">
		<input
			type="checkbox"
			bind:checked={$patternConfigStore.patternConfig.pageLayout.allowRotation}
		/>
		allow rotation
	</label>
{/if}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new type errors.

- [ ] **Step 3: Manual verification in the app**

Run: `npm run dev`

Then, in the designer, open the pattern view and the Page Layout editor and verify:

1. Switch **Layout** to `Page`. The **Algorithm** select appears.
2. With **Flex-wrap**: layout is identical to before this change (rows with the old push-up). `reorder window` / `allow rotation` controls are hidden.
3. Switch **Algorithm** to **Skyline**: patterns re-pack more tightly (items drop into notches). The `reorder window` and `allow rotation` controls appear.
4. Set **reorder window** to `1`: items keep strict input order. Increase to `8`: denser packing, groups still adjacent.
5. Toggle **allow rotation** on: tall-narrow patterns may render rotated 90°; page count in the editor may drop.
6. Shrink `pageScale` until the overflow toast fires; confirm the "Fit page" action still works (overflow contract unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/components/modal/editor/PageLayout.svelte
git commit -m "feat(page-layout): add algorithm selector and skyline controls to editor"
```

---

## Final verification

- [ ] **Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Type-check and lint**

Run: `npm run check && npm run lint`
Expected: clean.

- [ ] **Confirm flex-wrap is unchanged**

Verify `src/lib/cut-pattern/page-layout/__tests__/flex-wrap.test.ts` still passes untouched (no assertions were modified), confirming the default algorithm behaves exactly as before.
