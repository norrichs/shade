# Prepare Download — Merge Outline+Label Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-triggered "Prepare Download" button that merges each eligible outlined-band's outline path with its self-tag label outline into a single continuous contour, swaps the on-screen rendering to show the merged result, and feeds into Download SVG (with auto-prep fallback).

**Architecture:** Two new stores (`mergedBandPaths` and `labelTextDimensions`) hold per-band state. Three new pure modules handle outline construction (`buildLabelOutlinePath`), coordinate-space transformation (`transformLabelOutlineToBandSpace`), and the prep computation (`computeMergedBandPaths`). Three component touches: `PatternLabel` writes measured text dims and conditionally hides its outline; `BandCutPatternComponent` swaps `d=` when a merged path is available; `NavHeader` adds the button and the invalidation effect.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Jest, existing `$lib/paper` and `$lib/cut-pattern/merge-outline-with-label` utilities, existing `rotatePS`/`translatePS` from `$lib/patterns/utils`.

---

## Workspace setup

The spec is on `main`. Implementation goes on a feature branch.

- [ ] **Branch off main**

```bash
git checkout main
git pull origin main
git checkout -b feature/prepare-download-merge
```

Expected: clean checkout, branch created.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/stores/mergedPathStore.ts` | NEW. Two writable Map stores: `mergedBandPaths` (bandId → merged PathSegment[]) and `labelTextDimensions` (bandId → measured w/h). |
| `src/lib/cut-pattern/label-outline-path.ts` | NEW. `buildLabelOutlinePath(input): PathSegment[]` — pure outline builder extracted from PatternLabel. |
| `src/lib/cut-pattern/__tests__/label-outline-path.test.ts` | NEW. Shape/dimension assertions on the built outline. |
| `src/lib/cut-pattern/transform-label-outline.ts` | NEW. `transformLabelOutlineToBandSpace(localPath, renderAnchor, angleRad): PathSegment[]`. |
| `src/lib/cut-pattern/__tests__/transform-label-outline.test.ts` | NEW. Tests for identity, pure rotation, pure translation, combined. |
| `src/lib/cut-pattern/prepare-merge.ts` | NEW. `computeMergedBandPaths(tubes, labels, patternType, labelTextDims): Map<string, PathSegment[]>` — pure function. |
| `src/lib/cut-pattern/__tests__/prepare-merge.test.ts` | NEW. Eligibility filtering, fallback dims, end-to-end producing a single-contour result for an overlapping case. |
| `src/components/cut-pattern/PatternLabel.svelte` | MODIFY. Replace inline outline builder with extracted helper, add `bandId` prop, write to `labelTextDimensions`, gate standalone outline `<path>` on absence-from-`mergedBandPaths`. |
| `src/components/cut-pattern/BandComponent.svelte` | MODIFY. Pass `bandId={band.id}` to `<PatternLabel>`. |
| `src/components/cut-pattern/BandCutPatternComponent.svelte` | MODIFY. In `renderAsSinglePath` branch, swap `d=` to merged path when `$mergedBandPaths.has(band.id)`. |
| `src/components/nav-header/NavHeader.svelte` | MODIFY. Add "Prepare Download" button before "Download SVG", modify Download SVG handler to auto-prep, add invalidation `$effect`. |

---

## Task 1: Store module — `mergedBandPaths` + `labelTextDimensions`

**Files:**
- Create: `src/lib/stores/mergedPathStore.ts`
- Modify: `src/lib/stores/index.ts` (add re-export)

- [ ] **Step 1: Create the store module**

Create `src/lib/stores/mergedPathStore.ts`:

```ts
import { writable, type Writable } from 'svelte/store';
import type { PathSegment } from '$lib/types';

export type LabelTextDims = { width: number; height: number };

/**
 * Per-band merged outline+label path, keyed by band.id. Presence of an entry
 * means the band's merge has been prepared and should be rendered in place of
 * the standalone band path + label outline. Empty map = "not prepared".
 *
 * Populated by `computeMergedBandPaths` (via the "Prepare Download" button).
 * Cleared by an invalidation $effect in NavHeader when relevant config or
 * geometry changes.
 */
export const mergedBandPaths: Writable<Map<string, PathSegment[]>> = writable(new Map());

/**
 * Per-band measured label-text bbox in label-local coordinate units. Written
 * by PatternLabel after its getBBox() measurement settles. Read by
 * `computeMergedBandPaths` to size the label outline accurately. Cleared
 * alongside `mergedBandPaths` so a fresh measurement cycle drives the next
 * prep.
 */
export const labelTextDimensions: Writable<Map<string, LabelTextDims>> = writable(new Map());
```

- [ ] **Step 2: Re-export from the stores barrel**

Edit `src/lib/stores/index.ts`. Currently:

```ts
export * from '$lib/stores/superGlobuleStores';
export * from '$lib/stores/globulePatternStores';
export * from '$lib/stores/stores';
export * from '$lib/stores/selectionStores';
export * from '$lib/stores/uiStores';
export * from '$lib/stores/viewControlStore';
export * from '$lib/stores/workerStore';
export * from '$lib/stores/partnerHighlightStore';
```

Add at the end:

```ts
export * from '$lib/stores/mergedPathStore';
```

- [ ] **Step 3: Type-check**

Run: `npm run check 2>&1 | grep "mergedPathStore" | head`

Expected: no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/mergedPathStore.ts src/lib/stores/index.ts
git commit -m "feat(stores): add mergedBandPaths and labelTextDimensions stores"
```

---

## Task 2: `buildLabelOutlinePath` — pure outline builder + tests + PatternLabel refactor

**Files:**
- Create: `src/lib/cut-pattern/label-outline-path.ts`
- Create: `src/lib/cut-pattern/__tests__/label-outline-path.test.ts`
- Modify: `src/components/cut-pattern/PatternLabel.svelte`

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/__tests__/label-outline-path.test.ts`:

```ts
import { buildLabelOutlinePath } from '../label-outline-path';

describe('buildLabelOutlinePath', () => {
	test('returns a closed path starting with M and ending with Z', () => {
		const path = buildLabelOutlinePath({
			measuredWidth: 100,
			measuredHeight: 30,
			radius: 5,
			padding: 10,
			stemLength: 20,
			stemWidth: 4
		});
		expect(path[0][0]).toBe('M');
		expect(path[path.length - 1][0]).toBe('Z');
	});

	test('stem tip is at (0, 0)', () => {
		const path = buildLabelOutlinePath({
			measuredWidth: 100,
			measuredHeight: 30,
			radius: 5,
			padding: 10,
			stemLength: 20,
			stemWidth: 4
		});
		// First segment is the M to the stem tip.
		expect(path[0]).toEqual(['M', 0, 0]);
	});

	test('stem base sides are at internal x = ±stemWidth/2', () => {
		const path = buildLabelOutlinePath({
			measuredWidth: 100,
			measuredHeight: 30,
			radius: 5,
			padding: 10,
			stemLength: 20,
			stemWidth: 6
		});
		// The first L after M goes to (stemWidth/2, 0) — the +x side at the band edge.
		expect(path[1]).toEqual(['L', 3, 0]);
	});

	test('body height equals measuredHeight + 2*padding', () => {
		const path = buildLabelOutlinePath({
			measuredWidth: 100,
			measuredHeight: 30,
			radius: 5,
			padding: 10,
			stemLength: 20,
			stemWidth: 4
		});
		// One of the L segments lands at y = stemLength + bodyHeight = 20 + 50 = 70.
		// Find any segment with y close to 70.
		const hasBottomEdge = path.some((s) => {
			if (s[0] === 'L') return Math.abs((s[2] as number) - 70) < 0.001;
			return false;
		});
		expect(hasBottomEdge).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/label-outline-path.test.ts`

Expected: FAIL — module `../label-outline-path` not found.

- [ ] **Step 3: Implement the function**

Create `src/lib/cut-pattern/label-outline-path.ts`:

```ts
import type { PathSegment } from '$lib/types';

export type LabelOutlineInput = {
	measuredWidth: number;
	measuredHeight: number;
	radius: number;
	padding: number;
	stemLength: number;
	stemWidth: number;
};

/**
 * Build the self-tag label outline (stem + body) in label-local coordinates
 * with the stem tip at (0, 0).
 *
 * Mirrors the geometry previously inline in PatternLabel.svelte's
 * getLabelPathSegments. The body sits above the stem (y from stemLength to
 * stemLength + bodyHeight), the stem occupies y in [0, stemLength] with
 * the two long sides at x = ±stemWidth/2. Body corners are rounded with
 * quadratic curves of radius `radius`.
 *
 * `measuredWidth` and `measuredHeight` are the rendered text bbox dims;
 * the body is sized to text + 2 * padding on each axis.
 */
export const buildLabelOutlinePath = (input: LabelOutlineInput): PathSegment[] => {
	const { measuredWidth, measuredHeight, radius: r, padding, stemLength, stemWidth } = input;
	const halfWidth = (measuredWidth + padding * 2) / 2;
	const bodyHeight = measuredHeight + padding * 2;
	return [
		['M', 0, 0],
		['L', stemWidth / 2, 0],
		['L', stemWidth / 2, stemLength],
		['L', halfWidth - r, stemLength],
		['Q', halfWidth, stemLength, halfWidth, r + stemLength],
		['L', halfWidth, stemLength + bodyHeight - r],
		['Q', halfWidth, bodyHeight + stemLength, halfWidth - r, bodyHeight + stemLength],
		['L', r - halfWidth, bodyHeight + stemLength],
		['Q', -halfWidth, bodyHeight + stemLength, -halfWidth, bodyHeight - r + stemLength],
		['L', -halfWidth, r + stemLength],
		['Q', -halfWidth, stemLength, r - halfWidth, stemLength],
		['L', -stemWidth / 2, stemLength],
		['L', -stemWidth / 2, stemLength],
		['L', -stemWidth / 2, 0],
		['Z']
	];
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/label-outline-path.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 5: Refactor PatternLabel to use the extracted helper**

In `src/components/cut-pattern/PatternLabel.svelte`, find the import block at the top (around lines 1-9):

```ts
	import { getPathSize, svgPathStringFromSegments, translatePS } from '$lib/patterns/utils';
	import type { PathSegment } from '$lib/types';
	import type { Point } from 'bezier-js';
	import { tick } from 'svelte';
	import { numberPathSegments } from './number-path-segments';
	import { onDestroy, onMount } from 'svelte';
	import { LABEL_TAG_PORTAL_ID } from './constants';
	import LabelText from './LabelText.svelte';
```

Add the new import below them:

```ts
	import { buildLabelOutlinePath } from '$lib/cut-pattern/label-outline-path';
```

Then find the `getLabelPathSegments` function (around lines 102-158). Currently it builds the outline inline. Replace the inner `labelOutlinePathSegments` array literal with a call to the extracted helper.

Currently (around lines 134-152):

```ts
		const halfWidth = (width + padding * 2) / 2;
		const bodyHeight = height + padding * 2;
		const labelOutlinePathSegments: PathSegment[] = [
			['M', 0, 0],
			['L', stemWidth / 2, 0],
			['L', stemWidth / 2, stemLength],
			['L', halfWidth - r, stemLength],
			['Q', halfWidth, stemLength, halfWidth, r + stemLength],
			['L', halfWidth, stemLength + bodyHeight - r],
			['Q', halfWidth, bodyHeight + stemLength, halfWidth - r, bodyHeight + stemLength],
			['L', r - halfWidth, bodyHeight + stemLength],
			['Q', -halfWidth, bodyHeight + stemLength, -halfWidth, bodyHeight - r + stemLength],
			['L', -halfWidth, r + stemLength],
			['Q', -halfWidth, stemLength, r - halfWidth, stemLength],
			['L', -stemWidth / 2, stemLength],
			['L', -stemWidth / 2, stemLength],
			['L', -stemWidth / 2, 0],
			['Z']
		];
```

Replace with:

```ts
		const halfWidth = (width + padding * 2) / 2;
		const labelOutlinePathSegments: PathSegment[] = buildLabelOutlinePath({
			measuredWidth: width,
			measuredHeight: height,
			radius: r,
			padding,
			stemLength,
			stemWidth
		});
```

(The `halfWidth` local is still needed for the text translation that follows on line ~156 — leave that line alone.)

- [ ] **Step 6: Run full suite to confirm no behavior change**

Run: `npm run test:unit 2>&1 | tail -5`

Expected: baseline (171 on main) + 4 new tests = 175 passing. No regressions.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cut-pattern/label-outline-path.ts src/lib/cut-pattern/__tests__/label-outline-path.test.ts src/components/cut-pattern/PatternLabel.svelte
git commit -m "refactor(cut-pattern): extract buildLabelOutlinePath as pure helper"
```

---

## Task 3: `transformLabelOutlineToBandSpace` — pure transform + tests

**Files:**
- Create: `src/lib/cut-pattern/transform-label-outline.ts`
- Create: `src/lib/cut-pattern/__tests__/transform-label-outline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/__tests__/transform-label-outline.test.ts`:

```ts
import type { PathSegment } from '$lib/types';
import { transformLabelOutlineToBandSpace } from '../transform-label-outline';

describe('transformLabelOutlineToBandSpace', () => {
	test('identity (zero angle, zero translation) leaves coords unchanged', () => {
		const path: PathSegment[] = [
			['M', 0, 0],
			['L', 10, 0],
			['L', 10, 10],
			['Z']
		];
		const out = transformLabelOutlineToBandSpace(path, { x: 0, y: 0 }, 0);
		expect(out[0]).toEqual(['M', 0, 0]);
		expect(out[1]).toEqual(['L', 10, 0]);
		expect(out[2]).toEqual(['L', 10, 10]);
		expect(out[3]).toEqual(['Z']);
	});

	test('pure translation shifts every coord', () => {
		const path: PathSegment[] = [
			['M', 0, 0],
			['L', 10, 0],
			['Z']
		];
		const out = transformLabelOutlineToBandSpace(path, { x: 5, y: 7 }, 0);
		expect(out[0]).toEqual(['M', 5, 7]);
		expect(out[1]).toEqual(['L', 15, 7]);
	});

	test('pure rotation by π/2 around origin sends (1, 0) → (0, 1)', () => {
		const path: PathSegment[] = [
			['M', 0, 0],
			['L', 1, 0],
			['Z']
		];
		const out = transformLabelOutlineToBandSpace(path, { x: 0, y: 0 }, Math.PI / 2);
		// rotate(π/2) takes (1, 0) to (cos(π/2)*1, sin(π/2)*1) = (0, 1)
		expect(out[1][0]).toBe('L');
		expect(out[1][1] as number).toBeCloseTo(0);
		expect(out[1][2] as number).toBeCloseTo(1);
	});

	test('rotate then translate: rotate first around origin, then translate', () => {
		const path: PathSegment[] = [
			['M', 1, 0]
		];
		// rotate(π/2) takes (1, 0) → (0, 1); then translate by (5, 7) → (5, 8).
		const out = transformLabelOutlineToBandSpace(path, { x: 5, y: 7 }, Math.PI / 2);
		expect(out[0][0]).toBe('M');
		expect(out[0][1] as number).toBeCloseTo(5);
		expect(out[0][2] as number).toBeCloseTo(8);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/transform-label-outline.test.ts`

Expected: FAIL — module `../transform-label-outline` not found.

- [ ] **Step 3: Implement the function**

Create `src/lib/cut-pattern/transform-label-outline.ts`:

```ts
import type { PathSegment } from '$lib/types';
import { rotatePS, translatePS } from '$lib/patterns/utils';

/**
 * Lift a label outline from label-local coords (stem tip at origin) into the
 * band's local coord space by applying rotation around the origin, then
 * translation by `renderAnchor`.
 *
 * This matches the SVG transform pipeline `translate(anchor) rotate(angle)`
 * which is applied right-to-left at render time (rotate first, then
 * translate). The output is in band-local coords — the same space as
 * `band.facets[0].path`.
 *
 * `effectiveAngleRad` is in radians (NOT degrees).
 */
export const transformLabelOutlineToBandSpace = (
	localPath: PathSegment[],
	renderAnchor: { x: number; y: number },
	effectiveAngleRad: number
): PathSegment[] => {
	const rotated = rotatePS(localPath, effectiveAngleRad, { x: 0, y: 0 });
	return translatePS(rotated, renderAnchor.x, renderAnchor.y);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/transform-label-outline.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cut-pattern/transform-label-outline.ts src/lib/cut-pattern/__tests__/transform-label-outline.test.ts
git commit -m "feat(cut-pattern): add transformLabelOutlineToBandSpace pure helper"
```

---

## Task 4: `computeMergedBandPaths` — pure prep computation + tests

**Files:**
- Create: `src/lib/cut-pattern/prepare-merge.ts`
- Create: `src/lib/cut-pattern/__tests__/prepare-merge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/__tests__/prepare-merge.test.ts`:

```ts
import type { BandCutPattern, PathSegment, TubeCutPattern } from '$lib/types';
import { computeMergedBandPaths } from '../prepare-merge';

const rect = (x: number, y: number, w: number, h: number): PathSegment[] => [
	['M', x, y],
	['L', x + w, y],
	['L', x + w, y + h],
	['L', x, y + h],
	['Z']
];

const makeBand = (overrides: Partial<BandCutPattern> = {}): BandCutPattern => ({
	id: 'band-1',
	projectionType: 'patterned',
	facets: [
		{ path: rect(0, 0, 100, 60), svgPath: '', label: 'outline' }
	],
	svgPath: '',
	tagAnchorPoint: { x: 50, y: 60 },
	tagAnchorAutoAngle: 0,
	address: { globule: 0, tube: 0, band: 0 },
	...overrides
}) as BandCutPattern;

const makeTube = (band: BandCutPattern): TubeCutPattern =>
	({ bands: [band] } as TubeCutPattern);

const labels = {
	selfTag: {
		enabled: true,
		angle: 0,
		padding: 10,
		stemLength: 20,
		stemWidth: 4,
		height: 14
	}
} as unknown as Parameters<typeof computeMergedBandPaths>[1];

describe('computeMergedBandPaths', () => {
	test('produces a merged path for an eligible outlined band', () => {
		const band = makeBand();
		const result = computeMergedBandPaths(
			[makeTube(band)],
			labels,
			'outlined',
			new Map([['band-1', { width: 50, height: 20 }]])
		);
		expect(result.has('band-1')).toBe(true);
		const merged = result.get('band-1')!;
		// Merged path should be a non-trivial closed contour.
		expect(merged.length).toBeGreaterThan(3);
		expect(merged[0][0]).toBe('M');
		expect(merged[merged.length - 1][0]).toBe('Z');
	});

	test('skips tiled bands', () => {
		const band = makeBand();
		const result = computeMergedBandPaths(
			[makeTube(band)],
			labels,
			'tiled',
			new Map([['band-1', { width: 50, height: 20 }]])
		);
		expect(result.size).toBe(0);
	});

	test('skips bands without tagAnchorAutoAngle', () => {
		const band = makeBand({ tagAnchorAutoAngle: undefined });
		const result = computeMergedBandPaths(
			[makeTube(band)],
			labels,
			'outlined',
			new Map([['band-1', { width: 50, height: 20 }]])
		);
		expect(result.size).toBe(0);
	});

	test('skips bands when selfTag is disabled', () => {
		const band = makeBand();
		const disabledLabels = {
			...labels,
			selfTag: { ...labels.selfTag, enabled: false }
		};
		const result = computeMergedBandPaths(
			[makeTube(band)],
			disabledLabels,
			'outlined',
			new Map([['band-1', { width: 50, height: 20 }]])
		);
		expect(result.size).toBe(0);
	});

	test('falls back to default dims when bandId is not in labelTextDimensions', () => {
		const band = makeBand();
		// Empty dims map — function should use FALLBACK_WIDTH/HEIGHT.
		const result = computeMergedBandPaths([makeTube(band)], labels, 'outlined', new Map());
		// Still produces a merged path, just using fallback sizes.
		expect(result.has('band-1')).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/prepare-merge.test.ts`

Expected: FAIL — module `../prepare-merge` not found.

- [ ] **Step 3: Implement the function**

Create `src/lib/cut-pattern/prepare-merge.ts`:

```ts
import type { PathSegment, PatternLabelsConfig, TubeCutPattern } from '$lib/types';
import { buildLabelOutlinePath } from './label-outline-path';
import { transformLabelOutlineToBandSpace } from './transform-label-outline';
import { mergeOutlineWithLabel } from './merge-outline-with-label';
import type { LabelTextDims } from '$lib/stores/mergedPathStore';

const FALLBACK_WIDTH = 350;
const FALLBACK_HEIGHT = 280;

/**
 * Compute merged outline+label paths for every eligible band in `tubes`.
 *
 * A band is eligible when:
 *  - `patternType === 'outlined'`
 *  - `labels.selfTag.enabled === true`
 *  - `band.tagAnchorAutoAngle !== undefined`
 *  - `band.facets[0]?.path` is non-empty
 *
 * For each eligible band, computes the label outline using the current label
 * config + measured text dims (falling back to FALLBACK_WIDTH/HEIGHT when the
 * band's dims aren't in `labelTextDims`), transforms it to band-local coords,
 * and merges with the band outline via `mergeOutlineWithLabel`.
 *
 * Returns a new Map<bandId, PathSegment[]> with one entry per merged band.
 * Pure; does not write to any store. The caller is responsible for writing
 * the result to `mergedBandPaths`.
 */
export const computeMergedBandPaths = (
	tubes: TubeCutPattern[],
	labels: PatternLabelsConfig | undefined,
	patternType: string,
	labelTextDims: Map<string, LabelTextDims>
): Map<string, PathSegment[]> => {
	const result = new Map<string, PathSegment[]>();
	if (patternType !== 'outlined') return result;
	const selfTag = labels?.selfTag;
	if (!selfTag?.enabled) return result;

	const stemLength = selfTag.stemLength ?? 20;
	const stemWidth = selfTag.stemWidth ?? 4;
	const padding = selfTag.padding ?? 10;
	const height = selfTag.height ?? 14;
	const radius = height / 4;
	const configuredAngle = selfTag.angle ?? 0;

	for (const tube of tubes) {
		for (const band of tube.bands) {
			if (band.tagAnchorAutoAngle === undefined) continue;
			const bandPath = band.facets[0]?.path;
			if (!bandPath || bandPath.length === 0) continue;

			const dims = labelTextDims.get(band.id) ?? {
				width: FALLBACK_WIDTH,
				height: FALLBACK_HEIGHT
			};

			const localPath = buildLabelOutlinePath({
				measuredWidth: dims.width,
				measuredHeight: dims.height,
				radius,
				padding,
				stemLength,
				stemWidth
			});

			const effectiveAngle = (band.tagAngle ?? configuredAngle) + band.tagAnchorAutoAngle;
			const renderAnchor = {
				x: band.tagAnchorPoint.x - (stemWidth / 2) * Math.cos(effectiveAngle),
				y: band.tagAnchorPoint.y - (stemWidth / 2) * Math.sin(effectiveAngle)
			};

			const bandSpacePath = transformLabelOutlineToBandSpace(
				localPath,
				renderAnchor,
				effectiveAngle
			);

			const merged = mergeOutlineWithLabel(bandPath, bandSpacePath);
			result.set(band.id, merged);
		}
	}

	return result;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/prepare-merge.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Confirm full suite still passes**

Run: `npm run test:unit 2>&1 | tail -5`

Expected: 184 passing (171 baseline + 4 + 4 + 5 across Tasks 2-4).

- [ ] **Step 6: Commit**

```bash
git add src/lib/cut-pattern/prepare-merge.ts src/lib/cut-pattern/__tests__/prepare-merge.test.ts
git commit -m "feat(cut-pattern): add computeMergedBandPaths prep function"
```

---

## Task 5: PatternLabel — `bandId` prop, dims write, conditional outline hide

**Files:**
- Modify: `src/components/cut-pattern/PatternLabel.svelte`

- [ ] **Step 1: Add `bandId` prop**

In the script block of `PatternLabel.svelte`, find the `$props()` block (around lines 11-37). Currently:

```ts
	let {
		id = undefined,
		color = 'black',
		value,
		addressStrings = undefined,
		radius = 10,
		height = 14,
		angle = 0,
		autoAngle = undefined,
		anchor = { x: 0, y: 0 },
		padding = 10,
		stemLength = 20,
		stemWidth = 4,
		portal = undefined
	}: {
		id?: string | undefined;
		color?: string;
		value: number;
		addressStrings?: string[] | undefined;
		radius?: number;
		height?: number;
		angle?: number;
		autoAngle?: number | undefined;
		anchor?: Point;
		padding?: number;
		stemLength?: number;
		stemWidth?: number;
		portal?: { transform: string } | undefined;
	} = $props();
```

Add `bandId` next to `id`:

```ts
	let {
		id = undefined,
		bandId = undefined,
		color = 'black',
		value,
		addressStrings = undefined,
		radius = 10,
		height = 14,
		angle = 0,
		autoAngle = undefined,
		anchor = { x: 0, y: 0 },
		padding = 10,
		stemLength = 20,
		stemWidth = 4,
		portal = undefined
	}: {
		id?: string | undefined;
		bandId?: string | undefined;
		color?: string;
		value: number;
		addressStrings?: string[] | undefined;
		radius?: number;
		height?: number;
		angle?: number;
		autoAngle?: number | undefined;
		anchor?: Point;
		padding?: number;
		stemLength?: number;
		stemWidth?: number;
		portal?: { transform: string } | undefined;
	} = $props();
```

- [ ] **Step 2: Import the stores and add the dims-writing effect**

In the imports block at the top of the `<script>` (after the existing imports), add:

```ts
	import { mergedBandPaths, labelTextDimensions } from '$lib/stores';
```

Then, after the existing `$effect` that calls `measureText()` (around line 94-100), add a new effect that writes dims when measurement settles:

```ts
	$effect(() => {
		if (textMeasured && bandId) {
			labelTextDimensions.update((m) => {
				const next = new Map(m);
				next.set(bandId, { width: textBbox.width, height: textBbox.height });
				return next;
			});
		}
	});
```

- [ ] **Step 3: Gate the standalone outline path on absence-from-mergedBandPaths**

Find the two `<path d={path} ...>` elements in the template (around lines 298 and 314 — one in the portal branch, one in the non-portal branch).

Currently the portal branch (around line 298):

```svelte
		<path d={path} fill-rule="evenodd" stroke={color} fill="none" />
```

Wrap with `{#if}`:

```svelte
		{#if !bandId || !$mergedBandPaths.has(bandId)}
			<path d={path} fill-rule="evenodd" stroke={color} fill="none" />
		{/if}
```

And the non-portal branch (around line 314):

```svelte
		<path d={path} fill-rule="evenodd" fill="none" stroke={color} />
```

Wrap identically:

```svelte
		{#if !bandId || !$mergedBandPaths.has(bandId)}
			<path d={path} fill-rule="evenodd" fill="none" stroke={color} />
		{/if}
```

- [ ] **Step 4: Type-check**

Run: `npm run check 2>&1 | grep "PatternLabel" | head`

Expected: only the pre-existing `tagElement`/`textElement` warnings; nothing new.

- [ ] **Step 5: Run full suite**

Run: `npm run test:unit 2>&1 | tail -5`

Expected: all tests pass (184 total after Task 4: 171 baseline + 4 + 4 + 5). No regressions.

- [ ] **Step 6: Commit**

```bash
git add src/components/cut-pattern/PatternLabel.svelte
git commit -m "feat(pattern-label): add bandId prop, write measured dims, hide outline when merged"
```

---

## Task 6: BandComponent passes `bandId` to PatternLabel

**Files:**
- Modify: `src/components/cut-pattern/BandComponent.svelte`

- [ ] **Step 1: Pass `bandId={band.id}` through to PatternLabel**

Find the `<PatternLabel ...>` block in `src/components/cut-pattern/BandComponent.svelte` (around lines 103-118). Currently:

```svelte
		{#if selfTagEnabled}
			<PatternLabel
				id={`band-self-${band.id}`}
				{color}
				value={index}
				radius={(labels?.selfTag?.height ?? 16) / 4}
				height={labels?.selfTag?.height ?? 14}
				angle={band.tagAngle ?? labels?.selfTag?.angle ?? 0}
				autoAngle={band.tagAnchorAutoAngle}
				anchor={tagAnchorPoint || { x: -50, y: -50 }}
				addressStrings={[concatAddress(band.address, 'tb-slash')]}
				padding={labels?.selfTag?.padding ?? 10}
				stemLength={labels?.selfTag?.stemLength ?? 20}
				stemWidth={labels?.selfTag?.stemWidth ?? 4}
				portal={isTiled ? { transform: `translate(${origin.x} ${origin.y})` } : undefined}
			/>
		{/if}
```

Add `bandId={band.id}` after the `id=` line:

```svelte
		{#if selfTagEnabled}
			<PatternLabel
				id={`band-self-${band.id}`}
				bandId={band.id}
				{color}
				value={index}
				radius={(labels?.selfTag?.height ?? 16) / 4}
				height={labels?.selfTag?.height ?? 14}
				angle={band.tagAngle ?? labels?.selfTag?.angle ?? 0}
				autoAngle={band.tagAnchorAutoAngle}
				anchor={tagAnchorPoint || { x: -50, y: -50 }}
				addressStrings={[concatAddress(band.address, 'tb-slash')]}
				padding={labels?.selfTag?.padding ?? 10}
				stemLength={labels?.selfTag?.stemLength ?? 20}
				stemWidth={labels?.selfTag?.stemWidth ?? 4}
				portal={isTiled ? { transform: `translate(${origin.x} ${origin.y})` } : undefined}
			/>
		{/if}
```

- [ ] **Step 2: Type-check + tests**

Run: `npm run check 2>&1 | grep "BandComponent" | head` (expect no new errors)
Run: `npm run test:unit 2>&1 | tail -5` (expect 170 passing)

- [ ] **Step 3: Commit**

```bash
git add src/components/cut-pattern/BandComponent.svelte
git commit -m "feat(band-component): pass bandId to PatternLabel for merged-path keying"
```

---

## Task 7: BandCutPatternComponent swaps `d=` to merged path

**Files:**
- Modify: `src/components/cut-pattern/BandCutPatternComponent.svelte`

- [ ] **Step 1: Import the store and the segments-to-string util**

In the script block of `src/components/cut-pattern/BandCutPatternComponent.svelte`, find the existing imports (around lines 1-9):

```ts
	import { getMidPoint, svgPathStringFromSegments } from '$lib/patterns/utils';
	import type { TransformConfig } from '$lib/projection-geometry/types';
	import { patternConfigStore } from '$lib/stores';
	import type { BandCutPattern, CutPattern, Quadrilateral } from '$lib/types';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';
	import BoundsPattern from './BoundsPattern.svelte';
	import PathPointIndices from './PathPointIndices.svelte';
	import QuadLabels from './QuadLabels.svelte';
```

Add `mergedBandPaths` to the `$lib/stores` import line:

```ts
	import { patternConfigStore, mergedBandPaths } from '$lib/stores';
```

(`svgPathStringFromSegments` is already imported.)

- [ ] **Step 2: Swap `d=` in the `renderAsSinglePath` branch**

Find the `renderAsSinglePath` `<path>` (around lines 74-81):

```svelte
{#if renderAsSinglePath}
	<path
		d={band.svgPath}
		fill="none"
		stroke-width={band.facets[0].strokeWidth}
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
{:else}
```

Change `d={band.svgPath}` to a conditional that uses the merged path when available:

```svelte
{#if renderAsSinglePath}
	<path
		d={$mergedBandPaths.has(band.id)
			? svgPathStringFromSegments($mergedBandPaths.get(band.id)!)
			: band.svgPath}
		fill="none"
		stroke-width={band.facets[0].strokeWidth}
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
{:else}
```

- [ ] **Step 3: Type-check + tests**

Run: `npm run check 2>&1 | grep "BandCutPatternComponent" | head` (expect no new errors)
Run: `npm run test:unit 2>&1 | tail -5` (expect 170 passing)

- [ ] **Step 4: Commit**

```bash
git add src/components/cut-pattern/BandCutPatternComponent.svelte
git commit -m "feat(band-cut-pattern): swap d= to merged path when available"
```

---

## Task 8: NavHeader — Prepare Download button + Download SVG auto-prep + invalidation effect

**Files:**
- Modify: `src/components/nav-header/NavHeader.svelte`

- [ ] **Step 1: Add imports**

Find the script block in `src/components/nav-header/NavHeader.svelte`. Add these imports near the existing imports:

```ts
	import {
		mergedBandPaths,
		labelTextDimensions,
		superGlobulePatternStore,
		patternConfigStore
	} from '$lib/stores';
	import { computeMergedBandPaths } from '$lib/cut-pattern/prepare-merge';
	import { get } from 'svelte/store';
```

(Some of these may already be imported — confirm and dedupe.)

- [ ] **Step 2: Add a helper that runs the prep**

In the script block, add a helper function:

```ts
	const runPrepare = () => {
		const patternState = get(superGlobulePatternStore);
		const config = get(patternConfigStore);
		const labelDims = get(labelTextDimensions);
		const tubes = patternState.projectionPattern?.projectionCutPattern?.tubes
			?? patternState.globuleTubePattern?.projectionCutPattern?.tubes
			?? patternState.surfaceProjectionPattern?.projectionCutPattern?.tubes
			?? [];
		const labels = config.patternTypeConfig.labels;
		const patternType = config.patternTypeConfig.type;
		const merged = computeMergedBandPaths(tubes, labels, patternType, labelDims);
		mergedBandPaths.set(merged);
	};
```

- [ ] **Step 3: Add the invalidation reactive statement**

NavHeader is in Svelte 4 style (`$:` reactive statements). After the existing `$:` statements (around line 12-40), add:

```ts
	// Invalidate prepared merge state whenever underlying geometry or label
	// config changes. User must re-click "Prepare Download" (or just click
	// Download SVG, which auto-preps) to refresh.
	$: {
		// Reference each dep so Svelte tracks it.
		void $superGlobulePatternStore;
		void $patternConfigStore.patternTypeConfig.type;
		void $patternConfigStore.patternTypeConfig.labels?.selfTag;
		mergedBandPaths.set(new Map());
		labelTextDimensions.set(new Map());
	}
```

- [ ] **Step 4: Add "Prepare Download" button + auto-prep on Download SVG**

Find the existing "Download SVG" button (around lines 113-116):

```svelte
				<Button
					onclick={() => downloadSvg('pattern-svg', `globule-pattern ${$superGlobuleStore.name}.svg`)}
					>Download SVG</Button
				>
```

Replace with two buttons (Prepare Download placed BEFORE Download SVG):

```svelte
				<Button onclick={runPrepare}>Prepare Download</Button>
				<Button
					onclick={() => {
						if ($mergedBandPaths.size === 0) runPrepare();
						downloadSvg('pattern-svg', `globule-pattern ${$superGlobuleStore.name}.svg`);
					}}
					>Download SVG</Button
				>
```

- [ ] **Step 5: Type-check + tests**

Run: `npm run check 2>&1 | grep "NavHeader" | head` (expect no new errors)
Run: `npm run test:unit 2>&1 | tail -5` (expect 170 passing)

- [ ] **Step 6: Commit**

```bash
git add src/components/nav-header/NavHeader.svelte
git commit -m "feat(nav-header): add Prepare Download button + invalidation effect"
```

---

## Task 9: Manual visual verification + push

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

Open the designer in browser, load or create a SuperGlobule, switch to outlined pattern type, enable self-tag labels.

- [ ] **Step 2: Verify pre-prepare state**

Confirm: each band renders with two separate paths — the band outline and the label outline + text. As today.

- [ ] **Step 3: Click "Prepare Download"**

Confirm: on-screen rendering swaps. Each band now shows a single continuous contour incorporating the label callout. Label text still renders on top.

- [ ] **Step 4: Click "Download SVG"**

Confirm: the downloaded SVG opens, contains merged paths for outlined bands.

- [ ] **Step 5: Change a label config value (e.g. padding)**

Confirm: on-screen rendering reverts to separate paths (invalidation triggered). Re-clicking Prepare Download applies the change.

- [ ] **Step 6: Switch to tiled pattern**

Confirm: tiled bands render as today, unaffected by the merge logic. Clicking Prepare Download has no visible effect on tiled.

- [ ] **Step 7: Stop dev server, push**

```bash
git push -u origin feature/prepare-download-merge
```

Expected: branch pushed to remote.

---

## Notes / Out of scope

- **No end-cap labels.** Only `endIsStartCap === true` bands have `tagAnchorAutoAngle` set today; end-cap support is a future plan.
- **Fallback dims may produce a slightly inaccurate merge** for bands whose label hasn't rendered yet (e.g. labels outside the visible range). User can re-prepare after everything has rendered, or just download — the cut path is geometrically valid either way, just slightly oversized.
- **No worker integration.** The merge is computed on the main thread when the user clicks the button. For 100+ band patterns this may take noticeable time; profile if it becomes an issue.
- **No SVG parser used.** The merge consumes `band.facets[0].path` (PathSegment[]) directly. We never parse SVG strings back to segments.
- **`labelTextDimensions` is cleared on invalidation.** PatternLabel re-measures and re-writes the dims on the next render cycle. The brief moment after invalidation when dims aren't yet rewritten is fine — the user is editing config, not preparing for download.
