# Page-Based Pattern Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `page` cut-pattern layout mode that packs patterns inside real-world-dimensioned page rectangles, with a floating editor, derived real-world size readouts, and a swappable layout-algorithm seam.

**Architecture:** A new persisted `PageLayoutConfig` block holds physical page geometry and a `pageScale` (pattern-units per mm). `patternLayoutMode` (`'linear' | 'line-wrap' | 'page'`) replaces the `lineWrap` boolean. A pure, registry-selected `flexWrapPageLayout` function produces band origins and page rects; `CutPatternRenderer` dispatches on mode and renders pages underneath the bands. A floating `PageLayoutEditor` configures geometry and shows derived units.

**Tech Stack:** SvelteKit (Svelte 5 runes), Three.js (`Vector3`, `Box3`), TypeScript (strict), Jest unit tests.

**Spec:** `docs/superpowers/specs/2026-06-12-page-layout-design.md`

**Conventions:**
- Run a single test file: `npm run test:unit -- <path>`
- Type-check: `npm run check`
- Pattern-units and 3D-model-units share one metric scale (flattening is isometric). `pageScale` = pattern-units per mm.
- `1 inch === 25.4 mm`.

---

## File Structure

**Create:**
- `src/lib/cut-pattern/page-layout/types.ts` — `LayoutItem`, `PageGeom`, `PageLayoutResult`, `PageLayoutFn`.
- `src/lib/cut-pattern/page-layout/flex-wrap.ts` — `flexWrapPageLayout`, `PAGE_STACK_GAP`.
- `src/lib/cut-pattern/page-layout/registry.ts` — `PAGE_LAYOUT_ALGORITHMS`, `buildPageGeom`.
- `src/lib/cut-pattern/page-layout/units.ts` — `mmToInch`, `inchToMm`, `derivePageDimensions`.
- `src/lib/cut-pattern/page-layout/page-presets.ts` — `PAGE_PRESETS`.
- `src/lib/cut-pattern/page-layout/__tests__/flex-wrap.test.ts`
- `src/lib/cut-pattern/page-layout/__tests__/units.test.ts`
- `src/lib/stores/pageEditorStore.ts` — `pageEditorOpen` writable.
- `src/components/cut-pattern/PageGeometry.svelte` — renders page rects + margin insets.
- `src/components/cut-pattern/PageLayoutEditor.svelte` — floating editor.

**Modify:**
- `src/lib/types.ts` — add `PageLayoutConfig`, `patternLayoutMode`; extend `PatternConfig`/`PatternViewConfig`.
- `src/lib/shades-config.ts` — defaults for `pageLayout` + `patternLayoutMode`.
- `src/lib/validators.ts:59` — migrate `lineWrap` → `patternLayoutMode`, add `pageLayout`.
- `src/lib/validators.ts` `__tests__` (create test for migration).
- `src/lib/stores/toastStore.ts` — add `action` to `Toast`.
- `src/components/Toast.svelte` — render action button.
- `src/lib/stores/superGlobuleStores.ts` — add `model3dBoundsStore`.
- `src/components/cut-pattern/CutPatternRenderer.svelte` — dispatch on mode, render pages, overflow toast.
- `src/components/cut-pattern/CutPatternControl.svelte` — cycle button + open-editor button.
- `src/components/cut-pattern/PatternViewer.svelte` — mount `PageLayoutEditor`.

---

## Task 1: Config types, defaults, and migration

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/shades-config.ts`
- Modify: `src/lib/validators.ts:59`
- Test: `src/lib/__tests__/migrate-page-layout.test.ts` (create)

- [ ] **Step 1: Add types to `src/lib/types.ts`**

Add after the `PageSize` type definition:

```ts
export type PatternLayoutMode = 'linear' | 'line-wrap' | 'page';

export type PageLayoutConfig = {
	pageSize: { width: number; height: number }; // millimetres
	pageScale: number; // pattern-units per millimetre
	margin: number; // millimetres
	gap: number; // pattern units, spacing between patterns
	displayUnit: 'mm' | 'inch'; // editor display only
	algorithm: 'flex-wrap';
};
```

In `PatternConfig`, add `pageLayout: PageLayoutConfig;` to the object members and add `PageLayoutConfig` to the index-signature union. In `PatternViewConfig`, add `patternLayoutMode: PatternLayoutMode;`. Leave the existing `lineWrap?`, `wrapWidth?`, `gap?` fields in place (still used by line-wrap mode and read defensively elsewhere) — only the default and UI change.

- [ ] **Step 2: Add defaults in `src/lib/shades-config.ts`**

In `defaultPatternConfig()` add after the `pixelScale` line:

```ts
	pageLayout: {
		pageSize: { width: 304.8, height: 304.8 }, // 12in × 12in
		pageScale: 0.6562, // ~200 pattern-units per 12in
		margin: 12.7, // 0.5in
		gap: 20,
		displayUnit: 'inch',
		algorithm: 'flex-wrap'
	},
```

In `defaultPatternViewConfig()` add `patternLayoutMode: 'linear',` (keep the existing `lineWrap: false` line for back-compat).

- [ ] **Step 3: Write the failing migration test**

Create `src/lib/__tests__/migrate-page-layout.test.ts`:

```ts
import { migrateGlobulePatternConfig } from '../validators';
import type { GlobulePatternConfig } from '../types';

describe('migrateGlobulePatternConfig — page layout', () => {
	it('maps legacy lineWrap=true to patternLayoutMode "line-wrap"', () => {
		const cfg = {
			patternViewConfig: { lineWrap: true }
		} as Partial<GlobulePatternConfig>;
		const out = migrateGlobulePatternConfig(cfg);
		expect(out.patternViewConfig?.patternLayoutMode).toBe('line-wrap');
	});

	it('maps absent/false lineWrap to "linear"', () => {
		const out = migrateGlobulePatternConfig({
			patternViewConfig: { lineWrap: false }
		} as Partial<GlobulePatternConfig>);
		expect(out.patternViewConfig?.patternLayoutMode).toBe('linear');
	});

	it('does not overwrite an existing patternLayoutMode', () => {
		const out = migrateGlobulePatternConfig({
			patternViewConfig: { patternLayoutMode: 'page', lineWrap: true }
		} as Partial<GlobulePatternConfig>);
		expect(out.patternViewConfig?.patternLayoutMode).toBe('page');
	});

	it('adds a default pageLayout block when missing', () => {
		const out = migrateGlobulePatternConfig({
			patternConfig: {}
		} as Partial<GlobulePatternConfig>);
		expect(out.patternConfig?.pageLayout?.algorithm).toBe('flex-wrap');
		expect(out.patternConfig?.pageLayout?.pageSize.width).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/__tests__/migrate-page-layout.test.ts`
Expected: FAIL (migration does not set `patternLayoutMode` / `pageLayout` yet).

- [ ] **Step 5: Implement migration in `src/lib/validators.ts`**

In `migrateGlobulePatternConfig`, before `return config;`, add:

```ts
	const pvc = config.patternViewConfig as
		| { lineWrap?: boolean; patternLayoutMode?: string }
		| undefined;
	if (pvc && pvc.patternLayoutMode === undefined) {
		pvc.patternLayoutMode = pvc.lineWrap ? 'line-wrap' : 'linear';
	}
	const pc = config.patternConfig as { pageLayout?: unknown } | undefined;
	if (pc && pc.pageLayout === undefined) {
		pc.pageLayout = {
			pageSize: { width: 304.8, height: 304.8 },
			pageScale: 0.6562,
			margin: 12.7,
			gap: 20,
			displayUnit: 'inch',
			algorithm: 'flex-wrap'
		};
	}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:unit -- src/lib/__tests__/migrate-page-layout.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Type-check**

Run: `npm run check`
Expected: no new errors from these files.

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/shades-config.ts src/lib/validators.ts src/lib/__tests__/migrate-page-layout.test.ts
git commit -m "feat(page-layout): add PageLayoutConfig, patternLayoutMode, and migration"
```

---

## Task 2: Pure layout types and `flexWrapPageLayout`

**Files:**
- Create: `src/lib/cut-pattern/page-layout/types.ts`
- Create: `src/lib/cut-pattern/page-layout/flex-wrap.ts`
- Test: `src/lib/cut-pattern/page-layout/__tests__/flex-wrap.test.ts`

- [ ] **Step 1: Create `src/lib/cut-pattern/page-layout/types.ts`**

```ts
import type { Vector3 } from 'three';

export type LayoutItem = {
	width: number;
	height: number;
	left: number; // bounds.left offset relative to band origin
	top: number; // bounds.top offset relative to band origin
	alignedYOffset: number; // vertical-alignment shift (0 for top-align)
};

export type PageGeom = {
	pageScale: number; // pattern-units per mm (for requiredScale computation)
	pageWidth: number; // full page, pattern units
	pageHeight: number;
	contentWidth: number; // page minus 2× margin
	contentHeight: number;
	marginPx: number; // margin in pattern units
	pageGap: number; // vertical gap between stacked pages, pattern units
	gap: number; // spacing between items, pattern units
};

export type PageRect = { x: number; y: number; width: number; height: number };

export type PageLayoutResult = {
	origins: Vector3[];
	pages: PageRect[];
	overflow?: { itemIndex: number; requiredScale: number };
};

export type PageLayoutFn = (items: LayoutItem[], geom: PageGeom) => PageLayoutResult;
```

- [ ] **Step 2: Write the failing test `__tests__/flex-wrap.test.ts`**

```ts
import { Box3, Vector3 } from 'three';
import { flexWrapPageLayout } from '../flex-wrap';
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
	...over
});

describe('flexWrapPageLayout', () => {
	it('lays a single row left-to-right, top-aligned, one page', () => {
		const r = flexWrapPageLayout([item(100, 50), item(120, 40)], geom());
		expect(r.origins.map((o) => o.x)).toEqual([0, 100]);
		expect(r.origins.map((o) => o.y)).toEqual([0, 0]);
		expect(r.pages).toHaveLength(1);
		expect(r.overflow).toBeUndefined();
	});

	it('wraps to a new row when an item exceeds content width', () => {
		// A(150,40)@0, B(150,100)@150 fill row0 (rowMaxH=100). C wraps.
		const r = flexWrapPageLayout([item(150, 40), item(150, 100), item(150, 50)], geom());
		expect(r.origins.map((o) => o.x)).toEqual([0, 150, 0]);
		// C over A's column (sky=40): top = max(40, rowTop(100) - 25) = max(40,75) = 75
		expect(r.origins.map((o) => o.y)).toEqual([0, 0, 75]);
	});

	it('limits push-up so the item midpoint never rises above the row top', () => {
		// A(150,10), B(150,100); C(150,80) over A col: sky=10, rowTop=100,
		// top = max(10, 100 - 40) = 60 (clamped by rowTop - h/2, not sky)
		const r = flexWrapPageLayout([item(150, 10), item(150, 100), item(150, 80)], geom());
		expect(r.origins[2].y).toBe(60);
	});

	it('breaks to a new stacked page when a row exceeds content height', () => {
		const g = geom({ contentWidth: 100, contentHeight: 150, pageHeight: 150, pageGap: 50 });
		// each item is its own row (width 100 == contentWidth)
		const r = flexWrapPageLayout([item(100, 100), item(100, 100)], g);
		expect(r.pages).toHaveLength(2);
		expect(r.origins[0].y).toBe(0);
		// page1 content origin Y = 1 * (pageHeight 150 + pageGap 50) + margin 0 = 200
		expect(r.origins[1].y).toBe(200);
	});

	it('offsets origins by margin and page index', () => {
		const g = geom({ marginPx: 10 });
		const r = flexWrapPageLayout([item(50, 50)], g);
		expect(r.origins[0].x).toBe(10);
		expect(r.origins[0].y).toBe(10);
		expect(r.pages[0]).toEqual({ x: 0, y: 0, width: 300, height: 1000 });
	});

	it('reports overflow with the required (larger) pageScale', () => {
		const g = geom({ pageScale: 2, contentWidth: 300, contentHeight: 1000 });
		const r = flexWrapPageLayout([item(500, 50)], g);
		expect(r.overflow?.itemIndex).toBe(0);
		// factor = max(500/300, 50/1000) = 1.6667; requiredScale = 2 * 1.6667 ≈ 3.333
		expect(r.overflow?.requiredScale).toBeCloseTo(3.333, 2);
		expect(r.origins).toHaveLength(0);
	});
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/page-layout/__tests__/flex-wrap.test.ts`
Expected: FAIL ("Cannot find module '../flex-wrap'").

- [ ] **Step 4: Implement `src/lib/cut-pattern/page-layout/flex-wrap.ts`**

```ts
import { Vector3 } from 'three';
import type { LayoutItem, PageGeom, PageLayoutResult, PageRect } from './types';

export const PAGE_STACK_GAP = 40; // pattern units (default vertical gap if geom.pageGap unset)

type Interval = { x0: number; x1: number; bottom: number };

const skylineBottom = (placed: Interval[], x0: number, x1: number): number =>
	placed.reduce((max, iv) => (iv.x1 > x0 && iv.x0 < x1 ? Math.max(max, iv.bottom) : max), 0);

export const flexWrapPageLayout = (items: LayoutItem[], geom: PageGeom): PageLayoutResult => {
	const { pageScale, pageWidth, pageHeight, contentWidth, contentHeight, marginPx, pageGap, gap } =
		geom;

	// Overflow: any single item larger than the content box. Compute the smallest
	// pageScale that makes every offending item fit both dimensions.
	let factor = 0;
	let worst = -1;
	items.forEach((it, i) => {
		if (it.width > contentWidth || it.height > contentHeight) {
			const f = Math.max(it.width / contentWidth, it.height / contentHeight);
			if (f > factor) {
				factor = f;
				worst = i;
			}
		}
	});
	if (worst >= 0) {
		return {
			origins: [],
			pages: [],
			overflow: { itemIndex: worst, requiredScale: pageScale * factor * 1.02 }
		};
	}

	const origins: Vector3[] = [];
	const pages: PageRect[] = [];

	let page = 0;
	let cursorX = 0;
	let rowTop = 0;
	let rowMaxH = 0;
	let placed: Interval[] = [];

	const ensurePage = (idx: number) => {
		if (pages[idx]) return;
		pages[idx] = { x: 0, y: idx * (pageHeight + pageGap), width: pageWidth, height: pageHeight };
	};
	ensurePage(0);

	for (const it of items) {
		// Wrap to a new row when the item would exceed the content width.
		if (cursorX > 0 && cursorX + it.width > contentWidth) {
			rowTop = rowTop + rowMaxH + gap;
			cursorX = 0;
			rowMaxH = 0;
		}
		// Page break when the row's top + this item's height exceeds content height.
		if (rowTop + it.height > contentHeight) {
			page += 1;
			ensurePage(page);
			cursorX = 0;
			rowTop = 0;
			rowMaxH = 0;
			placed = [];
		}

		// Push-up packing: raise the item into the previous row's ragged underside,
		// bounded so its vertical midpoint never rises above rowTop.
		const sky = skylineBottom(placed, cursorX, cursorX + it.width);
		let itemTop = Math.max(sky > 0 ? sky + gap : 0, rowTop - it.height / 2);
		itemTop = Math.min(itemTop, rowTop);
		itemTop = Math.max(itemTop, 0);

		const contentOriginX = marginPx;
		const contentOriginY = page * (pageHeight + pageGap) + marginPx;

		origins.push(
			new Vector3(
				contentOriginX + cursorX - it.left,
				contentOriginY + itemTop + it.alignedYOffset - it.top,
				0
			)
		);

		placed.push({ x0: cursorX, x1: cursorX + it.width, bottom: itemTop + it.height });
		cursorX += it.width + gap;
		rowMaxH = Math.max(rowMaxH, it.height);
	}

	return { origins, pages };
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/page-layout/__tests__/flex-wrap.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/cut-pattern/page-layout/types.ts src/lib/cut-pattern/page-layout/flex-wrap.ts src/lib/cut-pattern/page-layout/__tests__/flex-wrap.test.ts
git commit -m "feat(page-layout): pure flex-wrap page layout algorithm with push-up packing"
```

---

## Task 3: Geometry builder, registry, and unit helpers

**Files:**
- Create: `src/lib/cut-pattern/page-layout/registry.ts`
- Create: `src/lib/cut-pattern/page-layout/units.ts`
- Create: `src/lib/cut-pattern/page-layout/page-presets.ts`
- Test: `src/lib/cut-pattern/page-layout/__tests__/units.test.ts`

- [ ] **Step 1: Create `src/lib/cut-pattern/page-layout/registry.ts`**

```ts
import type { PageLayoutConfig } from '$lib/types';
import { flexWrapPageLayout, PAGE_STACK_GAP } from './flex-wrap';
import type { PageGeom, PageLayoutFn } from './types';

export const PAGE_LAYOUT_ALGORITHMS: Record<PageLayoutConfig['algorithm'], PageLayoutFn> = {
	'flex-wrap': flexWrapPageLayout
};

export const buildPageGeom = (cfg: PageLayoutConfig): PageGeom => {
	const s = cfg.pageScale;
	const pageWidth = cfg.pageSize.width * s;
	const pageHeight = cfg.pageSize.height * s;
	const marginPx = cfg.margin * s;
	return {
		pageScale: s,
		pageWidth,
		pageHeight,
		contentWidth: pageWidth - 2 * marginPx,
		contentHeight: pageHeight - 2 * marginPx,
		marginPx,
		pageGap: PAGE_STACK_GAP,
		gap: cfg.gap
	};
};
```

- [ ] **Step 2: Create `src/lib/cut-pattern/page-layout/page-presets.ts`**

```ts
export type PagePreset = { id: string; label: string; width: number; height: number }; // mm

export const PAGE_PRESETS: PagePreset[] = [
	{ id: '12x12', label: '12 × 12 in', width: 304.8, height: 304.8 },
	{ id: '8.5x11', label: '8.5 × 11 in', width: 215.9, height: 279.4 },
	{ id: '11x17', label: '11 × 17 in', width: 279.4, height: 431.8 }
];
```

- [ ] **Step 3: Write the failing test `__tests__/units.test.ts`**

```ts
import { Box3, Vector3 } from 'three';
import { mmToInch, inchToMm, derivePageDimensions } from '../units';

describe('unit helpers', () => {
	it('converts mm <-> inch', () => {
		expect(inchToMm(1)).toBeCloseTo(25.4, 6);
		expect(mmToInch(25.4)).toBeCloseTo(1, 6);
	});

	it('derives real-world model dimensions from bounds and pageScale', () => {
		const bounds = new Box3(new Vector3(0, 0, 0), new Vector3(10, 20, 30));
		const d = derivePageDimensions(bounds, 2); // pattern-units per mm
		expect(d.mm).toEqual({ x: 5, y: 10, z: 15 });
		expect(d.inch.x).toBeCloseTo(5 / 25.4, 6);
		expect(d.inch.z).toBeCloseTo(15 / 25.4, 6);
	});
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/page-layout/__tests__/units.test.ts`
Expected: FAIL ("Cannot find module '../units'").

- [ ] **Step 5: Implement `src/lib/cut-pattern/page-layout/units.ts`**

```ts
import { Vector3, type Box3 } from 'three';

export const MM_PER_INCH = 25.4;

export const inchToMm = (inch: number): number => inch * MM_PER_INCH;
export const mmToInch = (mm: number): number => mm / MM_PER_INCH;

export type DerivedDimensions = {
	mm: { x: number; y: number; z: number };
	inch: { x: number; y: number; z: number };
};

// Convert a 3D model bounding box (pattern/model units) into real-world page
// units. delta_mm = delta_units / pageScale (pageScale = pattern-units per mm).
export const derivePageDimensions = (bounds: Box3, pageScale: number): DerivedDimensions => {
	const size = new Vector3();
	bounds.getSize(size);
	const mm = { x: size.x / pageScale, y: size.y / pageScale, z: size.z / pageScale };
	return { mm, inch: { x: mmToInch(mm.x), y: mmToInch(mm.y), z: mmToInch(mm.z) } };
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/page-layout/__tests__/units.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Type-check and commit**

Run: `npm run check`
Expected: no new errors.

```bash
git add src/lib/cut-pattern/page-layout/registry.ts src/lib/cut-pattern/page-layout/page-presets.ts src/lib/cut-pattern/page-layout/units.ts src/lib/cut-pattern/page-layout/__tests__/units.test.ts
git commit -m "feat(page-layout): geometry builder, algorithm registry, unit helpers"
```

---

## Task 4: Toast action button

**Files:**
- Modify: `src/lib/stores/toastStore.ts`
- Modify: `src/components/Toast.svelte`

- [ ] **Step 1: Add `action` to the `Toast` interface in `src/lib/stores/toastStore.ts`**

Change the interface to:

```ts
export interface Toast {
	id: string;
	type: 'error' | 'warning' | 'info' | 'success';
	message: string;
	duration?: number;
	dismissible?: boolean;
	action?: { label: string; onClick: () => void };
}
```

(No change needed to `add` — it already spreads the whole toast object.)

- [ ] **Step 2: Render the action button in `src/components/Toast.svelte`**

Add the button between the `toast-message` span and the dismiss button:

```svelte
			<span class="toast-message">{toast.message}</span>
			{#if toast.action}
				<button
					class="toast-action"
					on:click={() => {
						toast.action?.onClick();
						handleDismiss(toast.id);
					}}>{toast.action.label}</button
				>
			{/if}
```

Add to the `<style>` block:

```css
	.toast-action {
		pointer-events: auto;
		background: rgba(0, 0, 0, 0.08);
		border: 1px solid rgba(0, 0, 0, 0.2);
		border-radius: 3px;
		padding: 4px 8px;
		font-family: monospace;
		font-size: 12px;
		cursor: pointer;
		flex-shrink: 0;
	}
	.toast-action:hover {
		background: rgba(0, 0, 0, 0.16);
	}
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/toastStore.ts src/components/Toast.svelte
git commit -m "feat(toast): optional action button on toasts"
```

---

## Task 5: `model3dBoundsStore` derived store

**Files:**
- Modify: `src/lib/stores/superGlobuleStores.ts`

- [ ] **Step 1: Add the derived store**

Near the other derived stores (after `superGlobuleStore` is defined, ~line 357), add:

```ts
// Live 3D bounding box of the current model, for deriving real-world page units.
export const model3dBoundsStore = derived(superGlobuleStore, ($superGlobuleStore) => {
	if (!$superGlobuleStore) return null;
	return extractMeshData($superGlobuleStore).bounds;
});
```

`derived` and `extractMeshData` are already in this file; confirm `derived` is imported from `svelte/store` (it is, used by `superGlobuleStore`).

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/superGlobuleStores.ts
git commit -m "feat(page-layout): model3dBoundsStore for derived real-world units"
```

---

## Task 6: `PageGeometry.svelte` render component

**Files:**
- Create: `src/components/cut-pattern/PageGeometry.svelte`

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
	import type { PageRect } from '$lib/cut-pattern/page-layout/types';

	let { pages = [], marginPx = 0 }: { pages?: PageRect[]; marginPx?: number } = $props();
</script>

{#each pages as page, i}
	<g class="page-geometry">
		<rect
			x={page.x}
			y={page.y}
			width={page.width}
			height={page.height}
			fill="#ffffff"
			stroke="#bbbbbb"
			stroke-width="1"
		/>
		{#if marginPx > 0}
			<rect
				x={page.x + marginPx}
				y={page.y + marginPx}
				width={page.width - 2 * marginPx}
				height={page.height - 2 * marginPx}
				fill="none"
				stroke="#dddddd"
				stroke-width="1"
				stroke-dasharray="6 6"
			/>
		{/if}
	</g>
{/each}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/cut-pattern/PageGeometry.svelte
git commit -m "feat(page-layout): PageGeometry svg component"
```

---

## Task 7: Wire page mode into `CutPatternRenderer`

**Files:**
- Modify: `src/components/cut-pattern/CutPatternRenderer.svelte`

The renderer currently reads `lineWrap` from config. Page mode needs a flat, ordered band list and the page layout result. We add a `mode`-derived value, a flat band list, a page-layout computation, and a `page`-mode render branch with `<PageGeometry>`.

- [ ] **Step 1: Add imports**

In the `<script>` block, add:

```ts
	import PageGeometry from './PageGeometry.svelte';
	import { buildPageGeom, PAGE_LAYOUT_ALGORITHMS } from '$lib/cut-pattern/page-layout/registry';
	import type { LayoutItem, PageLayoutResult } from '$lib/cut-pattern/page-layout/types';
	import { toastStore } from '$lib/stores/toastStore';
```

- [ ] **Step 2: Derive mode and map it to lineWrap**

Replace the existing line:

```ts
	let lineWrap = $derived($patternConfigStore.patternViewConfig.lineWrap ?? false);
```

with:

```ts
	let layoutMode = $derived($patternConfigStore.patternViewConfig.patternLayoutMode ?? 'linear');
	let lineWrap = $derived(layoutMode === 'line-wrap');
	let pageLayoutCfg = $derived($patternConfigStore.patternConfig.pageLayout);
```

- [ ] **Step 3: Add a helper that builds `LayoutItem[]` (top-aligned) from resolved bands**

After the `getFlatOrigins` function, add:

```ts
	const toLayoutItems = (bands: ResolvedBand[]): LayoutItem[] =>
		bands.map(({ band }) => {
			const bounds = effBoundsFor(band);
			return {
				width: bounds?.width || 0,
				height: bounds?.height || 0,
				left: bounds?.left || 0,
				top: bounds?.top || 0,
				alignedYOffset: 0 // page mode is top-aligned (flex-start)
			};
		});
```

- [ ] **Step 4: Build the flat ordered band list and compute the page layout**

After the `flatOrigins` derived declaration, add:

```ts
	// Flat, ordered band list for page mode: use the sort-index order when present,
	// else flatten filtered tubes in tube order.
	let pageBands = $derived.by((): ResolvedBand[] => {
		if (indexedBands) return indexedBands;
		return filteredTubes.flatMap((tube) => tube.bands.map((band) => ({ band, tube })));
	});

	let pageResult = $derived.by((): PageLayoutResult | undefined => {
		if (layoutMode !== 'page' || !pageLayoutCfg) return undefined;
		const items = toLayoutItems(pageBands);
		const geom = buildPageGeom(pageLayoutCfg);
		const algo = PAGE_LAYOUT_ALGORITHMS[pageLayoutCfg.algorithm];
		return algo(items, geom);
	});

	// Raise a fit-error toast (with a scale-fixing action) when a pattern overflows.
	let lastOverflowKey = '';
	$effect(() => {
		const ov = pageResult?.overflow;
		if (!ov) {
			lastOverflowKey = '';
			return;
		}
		const key = `${ov.itemIndex}:${ov.requiredScale.toFixed(4)}`;
		if (key === lastOverflowKey) return;
		lastOverflowKey = key;
		const suggested = Number(ov.requiredScale.toFixed(4));
		toastStore.add({
			type: 'error',
			message: `A pattern is too large to fit the page. Increase pageScale to ~${suggested} to fit.`,
			dismissible: true,
			action: {
				label: 'Fit page',
				onClick: () => {
					$patternConfigStore.patternConfig.pageLayout.pageScale = suggested;
				}
			}
		});
	});

	// In page mode without overflow, bands render flat at the page-layout origins.
	let pageMarginPx = $derived(pageLayoutCfg ? buildPageGeom(pageLayoutCfg).marginPx : 0);
	let usePageLayout = $derived(layoutMode === 'page' && !!pageResult && !pageResult.overflow);
```

- [ ] **Step 5: Add the page-mode render branch**

In the template, change the outer conditional. The current structure is:

```svelte
{#if showPattern}
	{#if indexedBands && flatOrigins}
		...indexed branch...
	{:else}
		...tube branch...
	{/if}
	...portals...
{/if}
```

Change the first `{#if indexedBands && flatOrigins}` to a three-way branch by inserting a page branch first:

```svelte
{#if showPattern}
	{#if usePageLayout && pageResult}
		<PageGeometry pages={pageResult.pages} marginPx={pageMarginPx} />
		{#each pageBands as { band, tube }, i (concatAddress(band.address))}
			<BandComponent
				{band}
				{tube}
				index={i}
				origin={pageResult.origins[i]}
				portal={true}
				tagAnchorPoint={band.tagAnchorPoint ?? minPoint(band.facets)}
				tagAngle={band.tagAngle}
				groupCode={groupCodeFor(band.address)}
				showBounds={false}
				{selectionTarget}
			>
				{#if band.projectionType === 'patterned'}
					<BandCutPatternComponent
						{band}
						renderAsSinglePath={true}
						highlightFirstFacet={false}
						partnerBands={getPartnerBands(band, tubes)}
						showQuadLabels={false}
						showPathPointIndices={false}
						partnerFacets={[
							band.meta?.translatedStartPartnerFacet,
							band.meta?.translatedEndPartnerFacet
						].filter((el) => el !== undefined)}
						showPartnerBands={false}
						showAdjacentFacets={false}
						showBounds={false}
					/>
				{/if}
			</BandComponent>
		{/each}
	{:else if indexedBands && flatOrigins}
```

Leave the rest of the indexed and tube branches unchanged (they now serve `linear`/`line-wrap` and the page-overflow fallback). The existing `{:else}` (tube branch) and the trailing portals stay as-is.

- [ ] **Step 6: Type-check**

Run: `npm run check`
Expected: no new errors. (If `ResolvedBand` is not exported/typed where `toLayoutItems` needs it, it is already a local `type` in this file — reuse it.)

- [ ] **Step 7: Manual verification**

Run: `npm run dev`. Open `/designer2`. With a generated pattern, the renderer still shows `linear` layout (default). No console errors. Pages do not yet appear until mode is set to `page` (next task adds the toggle) — temporarily set `patternViewConfig.patternLayoutMode` to `'page'` via the browser devtools/localStorage to confirm page rects render under the bands and overflow raises a toast with a "Fit page" button. Revert the temporary change.

- [ ] **Step 8: Commit**

```bash
git add src/components/cut-pattern/CutPatternRenderer.svelte
git commit -m "feat(page-layout): render page mode with PageGeometry and overflow toast"
```

---

## Task 8: Mode cycle button + open-editor button in `CutPatternControl`

**Files:**
- Create: `src/lib/stores/pageEditorStore.ts`
- Modify: `src/components/cut-pattern/CutPatternControl.svelte`

- [ ] **Step 1: Create `src/lib/stores/pageEditorStore.ts`**

```ts
import { writable } from 'svelte/store';

// Visibility of the floating page/layout editor.
export const pageEditorOpen = writable(false);
```

- [ ] **Step 2: Add imports + cycle helper to `CutPatternControl.svelte`**

In the `<script>` block add:

```ts
	import { pageEditorOpen } from '$lib/stores/pageEditorStore';
	import type { PatternLayoutMode } from '$lib/types';

	const MODE_ORDER: PatternLayoutMode[] = ['linear', 'line-wrap', 'page'];
	const MODE_LABEL: Record<PatternLayoutMode, string> = {
		linear: 'Linear',
		'line-wrap': 'Line-wrap',
		page: 'Page'
	};
	const cycleMode = () => {
		const cur = $patternConfigStore.patternViewConfig.patternLayoutMode ?? 'linear';
		const next = MODE_ORDER[(MODE_ORDER.indexOf(cur) + 1) % MODE_ORDER.length];
		$patternConfigStore.patternViewConfig.patternLayoutMode = next;
		if (next === 'page') $pageEditorOpen = true;
	};
```

- [ ] **Step 3: Replace the "line wrap" checkbox with the cycle button**

Replace this block:

```svelte
			<CheckboxInput
				label="line wrap"
				bind:value={$patternConfigStore.patternViewConfig.lineWrap as boolean}
			/>
			{#if $patternConfigStore.patternViewConfig.lineWrap}
				<NumberInput
					label="wrap width"
					min={50}
					max={5000}
					step={10}
					bind:value={$patternConfigStore.patternViewConfig.wrapWidth as number}
				/>
			{/if}
```

with:

```svelte
			<button class="mode-cycle" on:click={cycleMode}>
				Layout: {MODE_LABEL[
					$patternConfigStore.patternViewConfig.patternLayoutMode ?? 'linear'
				]}
			</button>
			{#if $patternConfigStore.patternViewConfig.patternLayoutMode === 'line-wrap'}
				<NumberInput
					label="wrap width"
					min={50}
					max={5000}
					step={10}
					bind:value={$patternConfigStore.patternViewConfig.wrapWidth as number}
				/>
			{/if}
			{#if $patternConfigStore.patternViewConfig.patternLayoutMode === 'page'}
				<button class="mode-cycle" on:click={() => ($pageEditorOpen = true)}>Page editor</button>
			{/if}
```

- [ ] **Step 4: Add minimal button styling**

In the `<style>` block add:

```css
	.mode-cycle {
		display: block;
		margin: 2px 0;
		padding: 2px 8px;
		font-family: monospace;
		font-size: 12px;
		cursor: pointer;
	}
```

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`. In `/designer2`, the "line wrap" checkbox is gone; a "Layout: Linear" button cycles Linear → Line-wrap → Page. The `wrap width` input shows only in Line-wrap. Selecting Page reveals a "Page editor" button and opens the editor flag (editor itself is added next task).

- [ ] **Step 7: Commit**

```bash
git add src/lib/stores/pageEditorStore.ts src/components/cut-pattern/CutPatternControl.svelte
git commit -m "feat(page-layout): mode cycle button replacing line-wrap checkbox"
```

---

## Task 9: Floating `PageLayoutEditor`

**Files:**
- Create: `src/components/cut-pattern/PageLayoutEditor.svelte`
- Modify: `src/components/cut-pattern/PatternViewer.svelte`

- [ ] **Step 1: Create `src/components/cut-pattern/PageLayoutEditor.svelte`**

```svelte
<script lang="ts">
	import { patternConfigStore } from '$lib/stores';
	import { pageEditorOpen } from '$lib/stores/pageEditorStore';
	import { model3dBoundsStore } from '$lib/stores/superGlobuleStores';
	import { PAGE_PRESETS } from '$lib/cut-pattern/page-layout/page-presets';
	import { derivePageDimensions, inchToMm, mmToInch } from '$lib/cut-pattern/page-layout/units';

	let cfg = $derived($patternConfigStore.patternConfig.pageLayout);
	let unit = $derived(cfg.displayUnit);
	const toDisplay = (mm: number) => (unit === 'inch' ? mmToInch(mm) : mm);
	const fromDisplay = (v: number) => (unit === 'inch' ? inchToMm(v) : v);

	// Preset selection (matches stored mm dims, else 'custom').
	let presetId = $derived.by(() => {
		const p = PAGE_PRESETS.find(
			(p) => Math.abs(p.width - cfg.pageSize.width) < 0.5 && Math.abs(p.height - cfg.pageSize.height) < 0.5
		);
		return p?.id ?? 'custom';
	});
	const applyPreset = (id: string) => {
		const p = PAGE_PRESETS.find((p) => p.id === id);
		if (p) $patternConfigStore.patternConfig.pageLayout.pageSize = { width: p.width, height: p.height };
	};

	let derived3d = $derived($model3dBoundsStore ? derivePageDimensions($model3dBoundsStore, cfg.pageScale) : null);

	// SVG preview: fit the page proportions into a 120×120 box.
	let preview = $derived.by(() => {
		const maxDim = Math.max(cfg.pageSize.width, cfg.pageSize.height) || 1;
		const k = 110 / maxDim;
		const w = cfg.pageSize.width * k;
		const h = cfg.pageSize.height * k;
		const m = cfg.margin * k;
		return { w, h, m, x: (120 - w) / 2, y: (120 - h) / 2 };
	});

	const fmt = (n: number) => n.toFixed(2);
</script>

{#if $pageEditorOpen}
	<div class="page-editor">
		<header>
			<span>Page Layout</span>
			<button on:click={() => ($pageEditorOpen = false)} aria-label="Close">×</button>
		</header>

		<label>
			Preset
			<select value={presetId} on:change={(e) => applyPreset(e.currentTarget.value)}>
				{#each PAGE_PRESETS as p}
					<option value={p.id}>{p.label}</option>
				{/each}
				<option value="custom">Custom</option>
			</select>
		</label>

		<label>
			Units
			<select bind:value={$patternConfigStore.patternConfig.pageLayout.displayUnit}>
				<option value="inch">inch</option>
				<option value="mm">mm</option>
			</select>
		</label>

		<label>
			Width ({unit})
			<input
				type="number"
				step="0.1"
				value={fmt(toDisplay(cfg.pageSize.width))}
				on:change={(e) =>
					($patternConfigStore.patternConfig.pageLayout.pageSize.width = fromDisplay(
						Number(e.currentTarget.value)
					))}
			/>
		</label>
		<label>
			Height ({unit})
			<input
				type="number"
				step="0.1"
				value={fmt(toDisplay(cfg.pageSize.height))}
				on:change={(e) =>
					($patternConfigStore.patternConfig.pageLayout.pageSize.height = fromDisplay(
						Number(e.currentTarget.value)
					))}
			/>
		</label>

		<label>
			pageScale (units/mm)
			<input
				type="number"
				step="0.001"
				bind:value={$patternConfigStore.patternConfig.pageLayout.pageScale}
			/>
		</label>

		<label>
			Margin ({unit})
			<input
				type="number"
				step="0.1"
				value={fmt(toDisplay(cfg.margin))}
				on:change={(e) =>
					($patternConfigStore.patternConfig.pageLayout.margin = fromDisplay(
						Number(e.currentTarget.value)
					))}
			/>
		</label>

		<label>
			Layout gap (units)
			<input type="number" step="1" bind:value={$patternConfigStore.patternConfig.pageLayout.gap} />
		</label>

		<svg class="preview" viewBox="0 0 120 120" width="120" height="120">
			<rect x={preview.x} y={preview.y} width={preview.w} height={preview.h} fill="#fff" stroke="#999" />
			<rect
				x={preview.x + preview.m}
				y={preview.y + preview.m}
				width={preview.w - 2 * preview.m}
				height={preview.h - 2 * preview.m}
				fill="none"
				stroke="#ccc"
				stroke-dasharray="3 3"
			/>
		</svg>

		<div class="derived">
			<strong>Model size</strong>
			{#if derived3d}
				<div>X: {fmt(derived3d.mm.x)} mm / {fmt(derived3d.inch.x)} in</div>
				<div>Y: {fmt(derived3d.mm.y)} mm / {fmt(derived3d.inch.y)} in</div>
				<div>Z: {fmt(derived3d.mm.z)} mm / {fmt(derived3d.inch.z)} in</div>
			{:else}
				<div>—</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.page-editor {
		position: fixed;
		top: 80px;
		right: 24px;
		z-index: 9000;
		width: 220px;
		padding: 10px 12px;
		background: white;
		border: 1px solid #ccc;
		border-radius: 6px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
		font-family: monospace;
		font-size: 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-weight: bold;
	}
	header button {
		border: none;
		background: none;
		font-size: 18px;
		cursor: pointer;
		line-height: 1;
	}
	label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
	}
	input,
	select {
		width: 90px;
		font-family: monospace;
		font-size: 12px;
	}
	.preview {
		align-self: center;
		border: 1px solid #eee;
	}
	.derived {
		border-top: 1px solid #eee;
		padding-top: 6px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
</style>
```

- [ ] **Step 2: Mount the editor in `PatternViewer.svelte`**

In the `<script>` block add:

```ts
	import PageLayoutEditor from './PageLayoutEditor.svelte';
```

In the template, after `<CutPatternControl />`, add:

```svelte
	<PageLayoutEditor />
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. In `/designer2`, cycle Layout to `Page`. The floating editor appears top-right. Verify:
- Selecting a preset (e.g. 8.5 × 11 in) changes the page rects in the viewer.
- Switching Units between inch/mm reformats the width/height/margin inputs without changing the stored geometry.
- Editing `pageScale` rescales pages and live-updates the "Model size" readout.
- Editing margin shows/moves the dashed inset on the pages.
- Reducing `pageScale` enough triggers the fit-error toast with a working "Fit page" button.
- Closing the editor (×) hides it; the "Page editor" button in the controls reopens it.

- [ ] **Step 5: Commit**

```bash
git add src/components/cut-pattern/PageLayoutEditor.svelte src/components/cut-pattern/PatternViewer.svelte
git commit -m "feat(page-layout): floating page layout editor with presets and derived units"
```

---

## Task 10: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the unit test suite**

Run: `npm run test:unit`
Expected: all tests pass, including the new `flex-wrap`, `units`, and `migrate-page-layout` tests.

- [ ] **Step 2: Type-check the whole project**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new lint errors in the created/modified files (run `npm run format` if formatting fails).

- [ ] **Step 4: Manual end-to-end pass**

Run: `npm run dev`. Confirm all three layout modes work: `Linear` and `Line-wrap` behave exactly as before; `Page` packs bands into stacked pages, respects sort order (Tube order vs End connection) and the in-range filter, and exports (existing SVG export) include the page rectangles.

- [ ] **Step 5: Final commit (if any formatting changes)**

```bash
git add -A
git commit -m "chore(page-layout): formatting and verification"
```

---

## Self-Review Notes (addressed)

- **Spec §4 config model** → Task 1. **§5 seam** → Tasks 2–3. **§6 algorithm** → Task 2. **§7 rendering** → Tasks 6–7. **§8 controls/editor** → Tasks 8–9. **§9 toast action** → Tasks 4 + 7. **§10 derived units** → Tasks 3, 5, 9. **§11 testing** → Tasks 2, 3, 1.
- **`requiredScale` direction:** increasing `pageScale` enlarges the page relative to fixed-size patterns; algorithm uses `pageScale × max(itemW/contentW, itemH/contentH)` with a ×1.02 safety margin (Task 2, matches corrected spec §6).
- **Type consistency:** `LayoutItem`/`PageGeom`/`PageLayoutResult`/`PageRect` defined in Task 2 and reused verbatim in Tasks 3, 6, 9. `PageLayoutConfig`/`PatternLayoutMode` defined in Task 1 and reused in Tasks 3, 6, 8, 9. `model3dBoundsStore` defined in Task 5, consumed in Task 9. `pageEditorOpen` defined in Task 8, consumed in Tasks 8, 9.
- **Page-mode flat ordering** reuses the renderer's existing `indexedBands` (sort-index order) or flattens `filteredTubes`, preserving sort mode + range filter (spec §6 "Ordering").
