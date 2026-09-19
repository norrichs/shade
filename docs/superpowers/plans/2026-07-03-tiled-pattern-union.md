# Tiled Pattern Outline-Union Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For each tiled-pattern band, expand every widthed facet stroke into a filled outline and boolean-union them into a single hole-preserving path, rendered on-demand as a filled silhouette.

**Architecture:** Three decoupled units — a swappable `expandFacetStroke` (the only code touching `svg-path-outline`), an engine-agnostic hole-preserving `uniteMany` in `$lib/paper`, and a `buildBandUnionPath` orchestrator. These plug into the existing on-demand merge pipeline (`computeMergedBandPaths` → `mergedBandPaths` store → `renderAsSinglePath` render branch), which already serves the outlined pattern.

**Tech Stack:** SvelteKit, TypeScript, paper.js (`paper/dist/paper-core`, headless), `svg-path-outline` (already installed), Jest.

**Reference spec:** `docs/superpowers/specs/2026-07-03-tiled-pattern-union-design.md`

---

## File Structure

| File                                                                   | Responsibility                                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/lib/paper/path-operations.ts` (modify)                            | Add `uniteMany` — hole-preserving union over a list of outline paths. No `svg-path-outline` dependency. |
| `src/lib/paper/index.ts` (modify)                                      | Re-export `uniteMany`.                                                                                  |
| `src/lib/paper/__tests__/path-operations.test.ts` (modify)             | Tests for `uniteMany`, including hole preservation.                                                     |
| `src/lib/cut-pattern/expand-stroke.ts` (create)                        | `expandFacetStroke` — the swappable expander; wraps `svg-path-outline`, returns `PathSegment[]`.        |
| `src/lib/cut-pattern/__tests__/expand-stroke.test.ts` (create)         | Tests for `expandFacetStroke`.                                                                          |
| `src/lib/cut-pattern/build-band-union-path.ts` (create)                | `buildBandUnionPath` — maps facets through the expander, unites.                                        |
| `src/lib/cut-pattern/__tests__/build-band-union-path.test.ts` (create) | Tests for `buildBandUnionPath` (stubbed + real expander).                                               |
| `src/lib/cut-pattern/prepare-merge.ts` (modify)                        | Add `computeTiledUnionPaths`; dispatch from `computeMergedBandPaths`.                                   |
| `src/lib/cut-pattern/__tests__/prepare-merge.test.ts` (create)         | Test the tiled dispatch branch.                                                                         |
| `src/components/cut-pattern/BandCutPatternComponent.svelte` (modify)   | Render the tiled union path as a filled silhouette (evenodd) with a 1px stroke.                         |

**Test command (single file):** `npm run test:unit -- <path>`
**Type check:** `npm run check`

---

### Task 1: `uniteMany` — hole-preserving union

**Files:**

- Modify: `src/lib/paper/path-operations.ts`
- Modify: `src/lib/paper/index.ts`
- Test: `src/lib/paper/__tests__/path-operations.test.ts`

**Why a new function instead of reusing `unitePaths`:** the existing `apply()` calls `result.reorient(false, true)`, forcing every subpath to positive area. That is correct for the single-contour label merge but would _fill in_ the interior holes we must preserve. `uniteMany` unions without reorienting, so outer and hole contours keep their opposite winding and both survive.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/paper/__tests__/path-operations.test.ts`. Add `uniteMany` to the import on line 2, and add this block inside the top-level `describe` (the file already defines `rect`, `area`, and a `beforeAll` that calls `getPaperScope()`):

```ts
describe('uniteMany', () => {
	test('empty input returns empty array', () => {
		expect(uniteMany([])).toEqual([]);
	});

	test('single outline is returned as a single contour', () => {
		const united = uniteMany([rect(0, 0, 10, 10)]);
		expect(united.filter((s) => s[0] === 'M').length).toBe(1);
		expect(area(united)).toBeCloseTo(100, 1);
	});

	test('many overlapping outlines union to one contour', () => {
		const united = uniteMany([rect(0, 0, 10, 10), rect(5, 0, 10, 10), rect(10, 0, 10, 10)]);
		expect(united.filter((s) => s[0] === 'M').length).toBe(1);
		// 0..20 wide, 10 tall = 200.
		expect(area(united)).toBeCloseTo(200, 1);
	});

	test('a frame of outlines preserves the interior hole', () => {
		// Four bars forming a 30x30 frame with a 10x10 empty center (x/y 10..20).
		const top = rect(0, 0, 30, 10);
		const bottom = rect(0, 20, 30, 10);
		const left = rect(0, 0, 10, 30);
		const right = rect(20, 0, 10, 30);
		const united = uniteMany([top, bottom, left, right]);
		// Outer boundary + one hole = two M..Z runs.
		expect(united.filter((s) => s[0] === 'M').length).toBe(2);
		// Signed area = outer 900 - hole 100 = 800. If the hole were filled it would be 900.
		expect(area(united)).toBeCloseTo(800, 1);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/paper/__tests__/path-operations.test.ts`
Expected: FAIL — `uniteMany is not a function` / `uniteMany is not exported`.

- [ ] **Step 3: Implement `uniteMany`**

Append to `src/lib/paper/path-operations.ts` (the file already imports `pathSegmentsToPaper`, `paperToPathSegments`, and `PathSegment`; add a `getPaperScope` import):

At the top, add to the imports:

```ts
import { getPaperScope } from './scope';
```

At the end of the file, add:

```ts
/**
 * Union a list of closed outline paths into a single path, PRESERVING interior
 * holes. Unlike `unitePaths`, this does not reorient sub-path winding, so holes
 * produced by the union (e.g. the negative space in a grid) survive as separate
 * opposite-winding contours in the result.
 *
 * Input contours must each begin with 'M'. Engine-agnostic: it knows nothing
 * about how the outlines were produced.
 */
export const uniteMany = (outlines: PathSegment[][]): PathSegment[] => {
	const valid = outlines.filter((o) => o.length > 0 && o[0][0] === 'M');
	if (valid.length === 0) return [];
	getPaperScope();
	let acc = pathSegmentsToPaper(valid[0]) as {
		unite: (other: unknown, options?: { insert?: boolean }) => typeof acc;
		remove: () => void;
	};
	for (let i = 1; i < valid.length; i++) {
		const next = pathSegmentsToPaper(valid[i]) as { remove: () => void };
		const united = acc.unite(next, { insert: false });
		acc.remove();
		next.remove();
		acc = united;
	}
	const out = paperToPathSegments(acc as Parameters<typeof paperToPathSegments>[0]);
	acc.remove();
	return out;
};
```

- [ ] **Step 4: Export it**

In `src/lib/paper/index.ts`, extend the path-operations re-export line:

```ts
export {
	unitePaths,
	subtractPaths,
	intersectPaths,
	excludePaths,
	uniteMany
} from './path-operations';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/paper/__tests__/path-operations.test.ts`
Expected: PASS (all `uniteMany` tests plus the pre-existing ones).

- [ ] **Step 6: Commit**

```bash
git add src/lib/paper/path-operations.ts src/lib/paper/index.ts src/lib/paper/__tests__/path-operations.test.ts
git commit -m "feat(paper): add hole-preserving uniteMany union"
```

---

### Task 2: `expandFacetStroke` — the swappable expander

**Files:**

- Create: `src/lib/cut-pattern/expand-stroke.ts`
- Test: `src/lib/cut-pattern/__tests__/expand-stroke.test.ts`

`svg-path-outline`'s `spo(svgData, distance, options)` returns a plain SVG path-data string. `distance` is the offset from the centerline, so for a stroke of width `W` we pass `W / 2`. `joints: 0` = round joints. We parse the returned string back into `PathSegment[]` via paper (`PathItem.create` + `paperToPathSegments`), reusing the same round-trip the rest of the paper layer uses.

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/__tests__/expand-stroke.test.ts`:

```ts
import type { PathSegment } from '$lib/types';
import { expandFacetStroke } from '../expand-stroke';
import { getPaperScope } from '$lib/paper/scope';
import { pathSegmentsToPaper } from '$lib/paper';

const area = (segments: PathSegment[]): number => {
	const item = pathSegmentsToPaper(segments);
	const a = Math.abs(item.area);
	item.remove();
	return a;
};

describe('expandFacetStroke', () => {
	beforeAll(() => {
		getPaperScope();
	});

	test('empty path returns empty array', () => {
		expect(expandFacetStroke({ path: [], strokeWidth: 4, cap: 'round' })).toEqual([]);
	});

	test('a straight line expands into a closed filled outline of its stroke width', () => {
		const path: PathSegment[] = [
			['M', 0, 0],
			['L', 10, 0]
		];
		const outline = expandFacetStroke({ path, strokeWidth: 4, cap: 'round' });

		// Closed contour.
		expect(outline[0][0]).toBe('M');
		expect(outline.some((s) => s[0] === 'Z')).toBe(true);

		// Area traces the width: at least the butt-cap rectangle (length 10 * width 4 = 40),
		// at most the square-cap bounding box (length 14 * width 4 = 56). Exact cap area
		// depends on the engine; this range holds for round/butt/square caps.
		const a = area(outline);
		expect(a).toBeGreaterThan(39);
		expect(a).toBeLessThan(57);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/expand-stroke.test.ts`
Expected: FAIL — cannot find module `../expand-stroke`.

- [ ] **Step 3: Implement `expandFacetStroke`**

Create `src/lib/cut-pattern/expand-stroke.ts`:

```ts
import type { PathSegment } from '$lib/types';
import { svgPathStringFromSegments } from '$lib/patterns/utils';
import { getPaperScope } from '$lib/paper/scope';
import { paperToPathSegments } from '$lib/paper';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - svg-path-outline ships no types
import outline from 'svg-path-outline';

export type StrokeInput = {
	path: PathSegment[];
	strokeWidth: number;
	cap: 'round';
};

/**
 * Expand one widthed facet stroke into a filled outline that traces the outer
 * visual edge of its stroke width. For a single round-cap segment this is a
 * rounded rectangle. Returns `PathSegment[]` (may contain multiple contours,
 * e.g. outer + inner for a closed input).
 *
 * This is the ONLY unit that depends on `svg-path-outline`. Swapping the
 * expansion engine (Clipper, hand-rolled offsetting) means providing a
 * different function with the same `(StrokeInput) => PathSegment[]` signature.
 */
export const expandFacetStroke = (stroke: StrokeInput): PathSegment[] => {
	const { path, strokeWidth } = stroke;
	if (!path || path.length === 0) return [];

	const d = svgPathStringFromSegments(path);
	// distance is the offset from centerline = half the stroke width.
	const outlineString: string = outline(d, (strokeWidth || 1) / 2, {
		joints: 0, // round joints
		bezierAccuracy: 3,
		inside: true,
		outside: true
	});
	if (!outlineString) return [];

	const paper = getPaperScope();
	const item = paper.PathItem.create(outlineString);
	const segments = paperToPathSegments(item);
	item.remove();
	return segments;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/expand-stroke.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cut-pattern/expand-stroke.ts src/lib/cut-pattern/__tests__/expand-stroke.test.ts
git commit -m "feat(cut-pattern): add expandFacetStroke stroke-to-outline expander"
```

---

### Task 3: `buildBandUnionPath` — orchestrator

**Files:**

- Create: `src/lib/cut-pattern/build-band-union-path.ts`
- Test: `src/lib/cut-pattern/__tests__/build-band-union-path.test.ts`

Maps every facet in a band through the expander, then unions the outlines. The expander is injectable (default `expandFacetStroke`) so tests can stub it deterministically and future engines can be swapped in.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/cut-pattern/__tests__/build-band-union-path.test.ts`:

```ts
import type { BandCutPattern, PathSegment } from '$lib/types';
import { buildBandUnionPath } from '../build-band-union-path';
import { getPaperScope } from '$lib/paper/scope';
import { pathSegmentsToPaper } from '$lib/paper';

const rect = (x: number, y: number, w: number, h: number): PathSegment[] => [
	['M', x, y],
	['L', x + w, y],
	['L', x + w, y + h],
	['L', x, y + h],
	['Z']
];

const area = (segments: PathSegment[]): number => {
	const item = pathSegmentsToPaper(segments);
	const a = Math.abs(item.area);
	item.remove();
	return a;
};

const bandWithFacets = (count: number): BandCutPattern =>
	({
		id: 'band-test',
		facets: Array.from({ length: count }, () => ({
			path: [['M', 0, 0] as PathSegment],
			strokeWidth: 4
		}))
	}) as unknown as BandCutPattern;

describe('buildBandUnionPath', () => {
	beforeAll(() => {
		getPaperScope();
	});

	test('unions each facet outline via the injected expander', () => {
		const band = bandWithFacets(2);
		let call = 0;
		// Two overlapping 10x10 rects -> union spans 0..15 wide = 150 area.
		const stub = () => (call++ === 0 ? rect(0, 0, 10, 10) : rect(5, 0, 10, 10));

		const union = buildBandUnionPath(band, stub);

		expect(union.filter((s) => s[0] === 'M').length).toBe(1);
		expect(area(union)).toBeCloseTo(150, 1);
	});

	test('empty band yields empty path', () => {
		const band = bandWithFacets(0);
		expect(buildBandUnionPath(band, () => [])).toEqual([]);
	});

	test('end-to-end with the real expander produces a closed union', () => {
		const band = {
			id: 'band-real',
			facets: [
				{
					path: [
						['M', 0, 0],
						['L', 10, 0]
					] as PathSegment[],
					strokeWidth: 4
				},
				{
					path: [
						['M', 0, 0],
						['L', 0, 10]
					] as PathSegment[],
					strokeWidth: 4
				}
			]
		} as unknown as BandCutPattern;

		const union = buildBandUnionPath(band);
		expect(union.length).toBeGreaterThan(0);
		expect(union[0][0]).toBe('M');
		expect(union.some((s) => s[0] === 'Z')).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/build-band-union-path.test.ts`
Expected: FAIL — cannot find module `../build-band-union-path`.

- [ ] **Step 3: Implement `buildBandUnionPath`**

Create `src/lib/cut-pattern/build-band-union-path.ts`:

```ts
import type { BandCutPattern, PathSegment } from '$lib/types';
import { expandFacetStroke, type StrokeInput } from './expand-stroke';
import { uniteMany } from '$lib/paper';

/**
 * Build one hole-preserving union path for a tiled-pattern band: expand every
 * widthed facet stroke into a filled outline, then boolean-union all outlines.
 *
 * `expander` defaults to `expandFacetStroke` and is injectable for tests and
 * future engine swaps.
 */
export const buildBandUnionPath = (
	band: BandCutPattern,
	expander: (stroke: StrokeInput) => PathSegment[] = expandFacetStroke
): PathSegment[] => {
	const outlines = band.facets
		.map((facet) =>
			expander({ path: facet.path, strokeWidth: facet.strokeWidth ?? 1, cap: 'round' })
		)
		.filter((outline) => outline.length > 0);

	if (outlines.length === 0) return [];
	return uniteMany(outlines);
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/build-band-union-path.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cut-pattern/build-band-union-path.ts src/lib/cut-pattern/__tests__/build-band-union-path.test.ts
git commit -m "feat(cut-pattern): add buildBandUnionPath orchestrator"
```

---

### Task 4: Dispatch tiled unions from the merge pipeline

**Files:**

- Modify: `src/lib/cut-pattern/prepare-merge.ts`
- Test: `src/lib/cut-pattern/__tests__/prepare-merge.test.ts`

`computeMergedBandPaths` currently returns an empty map for any non-`outlined` pattern (line ~42: `if (patternType !== 'outlined') return result;`). Replace that early-return with a dispatch to a new `computeTiledUnionPaths`, which builds a union path per band into the same `Map<bandId, PathSegment[]>` the store and render branch already consume.

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/__tests__/prepare-merge.test.ts`:

```ts
import type { PathSegment, TubeCutPattern } from '$lib/types';
import { computeTiledUnionPaths, computeMergedBandPaths } from '../prepare-merge';
import { getPaperScope } from '$lib/paper/scope';

const line = (x1: number, y1: number, x2: number, y2: number): PathSegment[] => [
	['M', x1, y1],
	['L', x2, y2]
];

const tubeWithBand = (id: string): TubeCutPattern =>
	({
		bands: [
			{
				id,
				facets: [
					{ path: line(0, 0, 10, 0), strokeWidth: 4 },
					{ path: line(0, 0, 0, 10), strokeWidth: 4 }
				]
			}
		]
	}) as unknown as TubeCutPattern;

describe('computeTiledUnionPaths', () => {
	beforeAll(() => {
		getPaperScope();
	});

	test('produces one union path per band, keyed by band id', () => {
		const result = computeTiledUnionPaths([tubeWithBand('t0b0')]);
		expect(result.has('t0b0')).toBe(true);
		const path = result.get('t0b0')!;
		expect(path[0][0]).toBe('M');
		expect(path.some((s) => s[0] === 'Z')).toBe(true);
	});

	test('dispatcher routes non-outlined pattern types to tiled union', () => {
		const result = computeMergedBandPaths([tubeWithBand('t0b0')], undefined, 'grid', new Map(), 0);
		expect(result.has('t0b0')).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/prepare-merge.test.ts`
Expected: FAIL — `computeTiledUnionPaths` is not exported.

- [ ] **Step 3: Implement the dispatch**

In `src/lib/cut-pattern/prepare-merge.ts`, add an import near the other imports (after line 10):

```ts
import { buildBandUnionPath } from './build-band-union-path';
```

Add this exported function above `computeMergedBandPaths`:

```ts
/**
 * Build one hole-preserving union path per band for tiled (non-outlined)
 * patterns. Same output shape and key (`band.id`) as the outlined merge, so it
 * feeds the same `mergedBandPaths` store and render branch.
 */
export const computeTiledUnionPaths = (tubes: TubeCutPattern[]): Map<string, PathSegment[]> => {
	const result = new Map<string, PathSegment[]>();
	for (const tube of tubes) {
		for (const band of tube.bands) {
			if (!band.facets || band.facets.length === 0) continue;
			const union = buildBandUnionPath(band);
			if (union.length > 0) result.set(band.id, union);
		}
	}
	return result;
};
```

Then replace the existing early-return in `computeMergedBandPaths`:

```ts
if (patternType !== 'outlined') return result;
```

with:

```ts
if (patternType !== 'outlined') return computeTiledUnionPaths(tubes);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/prepare-merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cut-pattern/prepare-merge.ts src/lib/cut-pattern/__tests__/prepare-merge.test.ts
git commit -m "feat(cut-pattern): dispatch tiled band unions from merge pipeline"
```

---

### Task 5: Render the tiled union as a filled silhouette

**Files:**

- Modify: `src/components/cut-pattern/BandCutPatternComponent.svelte`

The `renderAsSinglePath` branch currently strokes the merged path with the _thick_ `facets[0].strokeWidth` — correct for an outlined centerline, wrong for a union outline (already the outer boundary). For tiled patterns, render a filled silhouette with `fill-rule="evenodd"` (so holes show) plus a 1px black stroke. Branch on `patternTypeConfig.type` (`'outlined'` vs a tiled type); `patternConfigStore` is already imported in this component.

This is a Svelte render change with no unit-test harness in this repo — verified by type check and manual inspection.

- [ ] **Step 1: Replace the `renderAsSinglePath` branch**

In `src/components/cut-pattern/BandCutPatternComponent.svelte`, replace this block (currently ~lines 74–83):

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

with:

```svelte
{#if renderAsSinglePath}
	{@const mergedPath = $mergedBandPaths.has(band.id)
		? svgPathStringFromSegments($mergedBandPaths.get(band.id)!)
		: band.svgPath}
	{#if $patternConfigStore.patternTypeConfig.type !== 'outlined'}
		<!-- Tiled outline-union: filled silhouette with holes + 1px cut outline -->
		<path
			d={mergedPath}
			fill="rgba(200,200,200,0.1)"
			fill-rule="evenodd"
			stroke="black"
			stroke-width={1}
		/>
	{:else}
		<path
			d={mergedPath}
			fill="none"
			stroke-width={band.facets[0].strokeWidth}
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	{/if}
{:else}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors in `BandCutPatternComponent.svelte`.

- [ ] **Step 3: Manual verification**

1. Run: `npm run dev`
2. Open the designer, select a tiled pattern (e.g. `grid` or `carnation`) so the cut-pattern view shows the many overlapping widthed strokes.
3. Trigger the merge via the **Prepare** action in the nav header (`runPrepare()`), which populates `mergedBandPaths`.
4. Confirm each band now renders as a single translucent-gray silhouette with a 1px black outline, and that interior negative space (grid holes) is visibly open (not filled solid).
5. Confirm the outlined pattern still renders as before (thin centerline) — regression check.

- [ ] **Step 4: Commit**

```bash
git add src/components/cut-pattern/BandCutPatternComponent.svelte
git commit -m "feat(cut-pattern): render tiled union as filled silhouette"
```

---

### Task 6: Full suite + type check

- [ ] **Step 1: Run the whole unit suite**

Run: `npm run test:unit`
Expected: PASS, including the four new/updated test files.

- [ ] **Step 2: Type check the project**

Run: `npm run check`
Expected: no new errors introduced by these changes.

- [ ] **Step 3: Final commit if anything changed**

```bash
git add -A
git commit -m "chore: tiled pattern union — suite green" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** expander (Task 2) ✓, engine-agnostic hole-preserving union (Task 1) ✓, orchestrator (Task 3) ✓, on-demand dispatch via existing `runPrepare`/`mergedBandPaths` (Task 4) ✓, filled-silhouette render (Task 5) ✓, round cap via `joints:0` ✓, hole preservation asserted (Task 1 frame test) ✓. Gaps/Clipper/worker are explicitly out of scope.
- **Type consistency:** `StrokeInput` defined in Task 2 and consumed in Task 3; `expandFacetStroke`, `uniteMany`, `buildBandUnionPath`, `computeTiledUnionPaths` names used consistently across tasks. Union outputs are always `PathSegment[]`.
- **Known approximation:** exact end-cap fidelity is whatever `svg-path-outline` emits; the design accepts this for the first pass, and the expander boundary makes a later swap a one-function change.
