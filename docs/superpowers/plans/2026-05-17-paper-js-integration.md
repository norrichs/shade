# Paper.js Integration & Outline+Label Path Combining

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `paper.js` as a path-operations library, build a translation layer between the project's `PathSegment[]` representation and `paper.PathItem`, and provide a function that merges a pattern outline path with a label outline path into a single continuous contour using paper's boolean union.

**Architecture:** Wrap `paper-core` (DOM-free build) behind a small module at `src/lib/paper/`. The module exposes (a) a lazy headless scope initializer, (b) `PathSegment[] ↔ paper.PathItem` converters that round-trip via SVG path data, and (c) high-level boolean wrappers (`unitePaths`, `subtractPaths`, `intersectPaths`, `excludePaths`) that take and return `PathSegment[]`. A consumer module at `src/lib/cut-pattern/merge-outline-with-label.ts` uses `unitePaths` to combine pattern + label outlines. Paper's segment representation collapses arcs and quadratics to cubic beziers, so the round-trip is geometry-preserving but normalizes curve segments to `C`.

**Tech Stack:** TypeScript, `paper@^0.12` (using `paper/dist/paper-core`), Jest (existing project test runner), existing `svgPathStringFromSegments` utility.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/paper/scope.ts` | Lazy headless `PaperScope` setup. Exposes `getPaperScope()` returning the initialized `paper` object. |
| `src/lib/paper/path-segment-to-paper.ts` | `pathSegmentsToPaper(segments): paper.PathItem`. Uses `svgPathStringFromSegments` + `paper.PathItem.create`. |
| `src/lib/paper/paper-to-path-segment.ts` | `paperToPathSegments(item): PathSegment[]`. Walks paper segments/children and emits `M`/`L`/`C`/`Z`. |
| `src/lib/paper/path-operations.ts` | `unitePaths`, `subtractPaths`, `intersectPaths`, `excludePaths` — `(a: PathSegment[], b: PathSegment[]) => PathSegment[]`. |
| `src/lib/paper/index.ts` | Public re-exports for everything above. |
| `src/lib/paper/__tests__/path-segment-to-paper.test.ts` | Round-trip and shape tests for the forward converter. |
| `src/lib/paper/__tests__/paper-to-path-segment.test.ts` | Tests for emitting `L`/`C`/`Z` and handling compound paths. |
| `src/lib/paper/__tests__/path-operations.test.ts` | Tests for `unitePaths` on overlapping rects, disjoint rects, identical shapes. |
| `src/lib/cut-pattern/merge-outline-with-label.ts` | `mergeOutlineWithLabel(outline: PathSegment[], label: PathSegment[]): PathSegment[]` — thin wrapper over `unitePaths` with input validation. |
| `src/lib/cut-pattern/__tests__/merge-outline-with-label.test.ts` | Two-rect "kissing" scenario producing one contour; label fully outside outline producing two contours (compound). |
| `package.json` | Add `paper` to `dependencies`. |

No existing files are modified except `package.json`. The merge function is created but not yet wired into `generate-outlined-pattern.ts` or `PatternLabel.svelte` — wiring is a follow-up plan once the positioning question (where on the band outline the label attaches) is resolved.

---

## Task 1: Install `paper` and add headless scope helper

**Files:**
- Modify: `package.json`
- Create: `src/lib/paper/scope.ts`

- [ ] **Step 1: Install paper**

Run:
```bash
npm install paper
```

Expected: `paper` appears under `dependencies` in `package.json`.

- [ ] **Step 2: Confirm paper-core is reachable**

Run:
```bash
node -e "const p = require('paper/dist/paper-core'); p.setup([1,1]); console.log('ok', typeof p.Path);"
```

Expected output: `ok function`. This confirms paper-core loads without a DOM and `paper.Path` is available.

- [ ] **Step 3: Create scope helper**

Create `src/lib/paper/scope.ts`:

```ts
// @ts-expect-error - paper-core has no bundled types; we treat the default export as `any`
import paper from 'paper/dist/paper-core';

let initialized = false;

/**
 * Lazily initializes a headless paper scope and returns the paper module.
 * Safe to call repeatedly; only sets up once per process.
 */
export const getPaperScope = (): typeof paper => {
	if (!initialized) {
		// Size is irrelevant for headless geometry ops; paper just needs a Project.
		paper.setup([1, 1]);
		initialized = true;
	}
	return paper;
};
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json yarn.lock src/lib/paper/scope.ts 2>/dev/null
git commit -m "chore(paper): install paper-core and add headless scope helper"
```

(Only one of `package-lock.json` / `yarn.lock` will exist; the `2>/dev/null` swallows the missing one.)

---

## Task 2: `pathSegmentsToPaper` — forward converter

**Files:**
- Create: `src/lib/paper/path-segment-to-paper.ts`
- Create: `src/lib/paper/__tests__/path-segment-to-paper.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/paper/__tests__/path-segment-to-paper.test.ts`:

```ts
import type { PathSegment } from '$lib/types';
import { pathSegmentsToPaper } from '../path-segment-to-paper';
import { getPaperScope } from '../scope';

describe('pathSegmentsToPaper', () => {
	beforeAll(() => {
		getPaperScope();
	});

	test('converts a closed unit square to a paper.Path with 4 segments', () => {
		const square: PathSegment[] = [
			['M', 0, 0],
			['L', 10, 0],
			['L', 10, 10],
			['L', 0, 10],
			['Z']
		];
		const item = pathSegmentsToPaper(square);
		expect(item.closed).toBe(true);
		expect(item.segments.length).toBe(4);
		// Bounds: a 10x10 square at the origin.
		expect(item.bounds.width).toBeCloseTo(10);
		expect(item.bounds.height).toBeCloseTo(10);
		item.remove();
	});

	test('throws on segments that do not begin with M', () => {
		const bad: PathSegment[] = [['L', 1, 1], ['Z']];
		expect(() => pathSegmentsToPaper(bad)).toThrow(/must begin with 'M'/);
	});

	test('converts a path containing C and Q segments', () => {
		const curved: PathSegment[] = [
			['M', 0, 0],
			['C', 5, 0, 10, 5, 10, 10],
			['Q', 5, 15, 0, 10],
			['Z']
		];
		const item = pathSegmentsToPaper(curved);
		expect(item.closed).toBe(true);
		// Bezier handles produced from the C/Q segments imply non-zero curvature.
		expect(item.segments.some((s: { hasHandles: () => boolean }) => s.hasHandles())).toBe(true);
		item.remove();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/paper/__tests__/path-segment-to-paper.test.ts`

Expected: FAIL — module `../path-segment-to-paper` not found.

- [ ] **Step 3: Implement the converter**

Create `src/lib/paper/path-segment-to-paper.ts`:

```ts
import type { PathSegment } from '$lib/types';
import { svgPathStringFromSegments } from '$lib/patterns/utils';
import { getPaperScope } from './scope';

/**
 * Build a paper.PathItem (Path or CompoundPath) from this project's PathSegment[]
 * representation. Goes via the SVG path-data string so paper handles all the
 * curve math (Q → C normalization, A → C decomposition).
 *
 * Throws if the segment list does not begin with an 'M' (paper would silently
 * produce an empty path otherwise).
 */
export const pathSegmentsToPaper = (
	segments: PathSegment[]
): InstanceType<ReturnType<typeof getPaperScope>['PathItem']> => {
	if (segments.length === 0 || segments[0][0] !== 'M') {
		throw new Error("PathSegment[] must begin with 'M'");
	}
	const paper = getPaperScope();
	const svg = svgPathStringFromSegments(segments);
	return paper.PathItem.create(svg);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/paper/__tests__/path-segment-to-paper.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paper/path-segment-to-paper.ts src/lib/paper/__tests__/path-segment-to-paper.test.ts
git commit -m "feat(paper): add PathSegment[] → paper.PathItem converter"
```

---

## Task 3: `paperToPathSegments` — reverse converter

**Files:**
- Create: `src/lib/paper/paper-to-path-segment.ts`
- Create: `src/lib/paper/__tests__/paper-to-path-segment.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/paper/__tests__/paper-to-path-segment.test.ts`:

```ts
import type { PathSegment } from '$lib/types';
import { pathSegmentsToPaper } from '../path-segment-to-paper';
import { paperToPathSegments } from '../paper-to-path-segment';
import { getPaperScope } from '../scope';

describe('paperToPathSegments', () => {
	beforeAll(() => {
		getPaperScope();
	});

	test('round-trips a closed unit square as M + 3×L + Z', () => {
		const square: PathSegment[] = [
			['M', 0, 0],
			['L', 10, 0],
			['L', 10, 10],
			['L', 0, 10],
			['Z']
		];
		const item = pathSegmentsToPaper(square);
		const out = paperToPathSegments(item);
		item.remove();

		expect(out[0]).toEqual(['M', 0, 0]);
		expect(out[out.length - 1]).toEqual(['Z']);
		// Three line segments back to the start (paper omits the closing L since Z handles it).
		const lineCount = out.filter((s) => s[0] === 'L').length;
		expect(lineCount).toBe(3);
		// No curve segments expected for a pure-line square.
		expect(out.some((s) => s[0] === 'C')).toBe(false);
	});

	test('emits C segments when paper has bezier handles', () => {
		const curved: PathSegment[] = [
			['M', 0, 0],
			['C', 5, 0, 10, 5, 10, 10],
			['L', 0, 10],
			['Z']
		];
		const item = pathSegmentsToPaper(curved);
		const out = paperToPathSegments(item);
		item.remove();

		expect(out.some((s) => s[0] === 'C')).toBe(true);
	});

	test('handles a CompoundPath as multiple M..Z runs', () => {
		const paper = getPaperScope();
		const a = pathSegmentsToPaper([
			['M', 0, 0],
			['L', 10, 0],
			['L', 10, 10],
			['L', 0, 10],
			['Z']
		]);
		const b = pathSegmentsToPaper([
			['M', 20, 0],
			['L', 30, 0],
			['L', 30, 10],
			['L', 20, 10],
			['Z']
		]);
		const compound = new paper.CompoundPath({ children: [a, b] });
		const out = paperToPathSegments(compound);
		compound.remove();

		const mCount = out.filter((s) => s[0] === 'M').length;
		const zCount = out.filter((s) => s[0] === 'Z').length;
		expect(mCount).toBe(2);
		expect(zCount).toBe(2);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/paper/__tests__/paper-to-path-segment.test.ts`

Expected: FAIL — module `../paper-to-path-segment` not found.

- [ ] **Step 3: Implement the converter**

Create `src/lib/paper/paper-to-path-segment.ts`:

```ts
import type { PathSegment } from '$lib/types';

/**
 * Convert a paper.PathItem (Path or CompoundPath) back to PathSegment[].
 *
 * Walks paper's segments and emits:
 *   - ['M', x, y] at the start of each contour
 *   - ['L', x, y] for straight segments (no bezier handles)
 *   - ['C', cx1, cy1, cx2, cy2, x, y] for any segment with handles
 *   - ['Z'] at the end of each closed contour
 *
 * Paper internally normalizes Q and A from SVG import into C, so we never
 * emit Q or A here — the result is a geometry-preserving normalization,
 * not a representation-preserving round-trip.
 *
 * Compound paths emit one M..Z run per child.
 */
type PaperPointLike = { x: number; y: number };
type PaperSegmentLike = {
	point: PaperPointLike;
	handleIn: PaperPointLike;
	handleOut: PaperPointLike;
	hasHandles: () => boolean;
};
type PaperPathLike = {
	segments: PaperSegmentLike[];
	closed: boolean;
	children?: PaperPathLike[];
};

const emitContour = (path: PaperPathLike, out: PathSegment[]): void => {
	if (path.segments.length === 0) return;
	const first = path.segments[0];
	out.push(['M', first.point.x, first.point.y]);
	for (let i = 1; i < path.segments.length; i++) {
		const prev = path.segments[i - 1];
		const curr = path.segments[i];
		if (prev.handleOut.x === 0 && prev.handleOut.y === 0 && curr.handleIn.x === 0 && curr.handleIn.y === 0) {
			out.push(['L', curr.point.x, curr.point.y]);
		} else {
			out.push([
				'C',
				prev.point.x + prev.handleOut.x,
				prev.point.y + prev.handleOut.y,
				curr.point.x + curr.handleIn.x,
				curr.point.y + curr.handleIn.y,
				curr.point.x,
				curr.point.y
			]);
		}
	}
	if (path.closed) {
		// Emit the closing curve from the last point back to the first, if curved.
		const last = path.segments[path.segments.length - 1];
		const first2 = path.segments[0];
		const lastCurved =
			last.handleOut.x !== 0 ||
			last.handleOut.y !== 0 ||
			first2.handleIn.x !== 0 ||
			first2.handleIn.y !== 0;
		if (lastCurved) {
			out.push([
				'C',
				last.point.x + last.handleOut.x,
				last.point.y + last.handleOut.y,
				first2.point.x + first2.handleIn.x,
				first2.point.y + first2.handleIn.y,
				first2.point.x,
				first2.point.y
			]);
		}
		out.push(['Z']);
	}
};

export const paperToPathSegments = (item: PaperPathLike): PathSegment[] => {
	const out: PathSegment[] = [];
	if (item.children && item.children.length > 0) {
		for (const child of item.children) {
			emitContour(child, out);
		}
	} else {
		emitContour(item, out);
	}
	return out;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/paper/__tests__/paper-to-path-segment.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paper/paper-to-path-segment.ts src/lib/paper/__tests__/paper-to-path-segment.test.ts
git commit -m "feat(paper): add paper.PathItem → PathSegment[] converter"
```

---

## Task 4: Boolean operation wrappers

**Files:**
- Create: `src/lib/paper/path-operations.ts`
- Create: `src/lib/paper/__tests__/path-operations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/paper/__tests__/path-operations.test.ts`:

```ts
import type { PathSegment } from '$lib/types';
import {
	unitePaths,
	subtractPaths,
	intersectPaths,
	excludePaths
} from '../path-operations';
import { getPaperScope } from '../scope';
import { pathSegmentsToPaper } from '../path-segment-to-paper';

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

describe('path-operations', () => {
	beforeAll(() => {
		getPaperScope();
	});

	test('unitePaths of two overlapping squares yields a single contour with combined area', () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(5, 0, 10, 10);
		const united = unitePaths(a, b);

		// Single contour: exactly one M, exactly one Z.
		expect(united.filter((s) => s[0] === 'M').length).toBe(1);
		expect(united.filter((s) => s[0] === 'Z').length).toBe(1);
		// Combined area = 10*10 + 10*10 - 5*10 overlap = 150.
		expect(area(united)).toBeCloseTo(150, 1);
	});

	test('unitePaths of two disjoint squares yields a compound path (two M..Z runs)', () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(20, 0, 10, 10);
		const united = unitePaths(a, b);

		expect(united.filter((s) => s[0] === 'M').length).toBe(2);
		expect(united.filter((s) => s[0] === 'Z').length).toBe(2);
		expect(area(united)).toBeCloseTo(200, 1);
	});

	test('subtractPaths removes the overlap', () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(5, 0, 10, 10);
		const diff = subtractPaths(a, b);
		// a (100) minus overlap (50) = 50.
		expect(area(diff)).toBeCloseTo(50, 1);
	});

	test('intersectPaths returns just the overlap', () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(5, 0, 10, 10);
		const inter = intersectPaths(a, b);
		expect(area(inter)).toBeCloseTo(50, 1);
	});

	test('excludePaths returns symmetric difference', () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(5, 0, 10, 10);
		const xor = excludePaths(a, b);
		// Combined (150) minus overlap (50) = 100.
		expect(area(xor)).toBeCloseTo(100, 1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/paper/__tests__/path-operations.test.ts`

Expected: FAIL — module `../path-operations` not found.

- [ ] **Step 3: Implement the wrappers**

Create `src/lib/paper/path-operations.ts`:

```ts
import type { PathSegment } from '$lib/types';
import { pathSegmentsToPaper } from './path-segment-to-paper';
import { paperToPathSegments } from './paper-to-path-segment';
import { getPaperScope } from './scope';

type Op = 'unite' | 'subtract' | 'intersect' | 'exclude';

const apply = (a: PathSegment[], b: PathSegment[], op: Op): PathSegment[] => {
	getPaperScope();
	const pa = pathSegmentsToPaper(a) as unknown as {
		unite: (other: unknown, options?: { insert?: boolean }) => unknown;
		subtract: (other: unknown, options?: { insert?: boolean }) => unknown;
		intersect: (other: unknown, options?: { insert?: boolean }) => unknown;
		exclude: (other: unknown, options?: { insert?: boolean }) => unknown;
		remove: () => void;
	};
	const pb = pathSegmentsToPaper(b);
	const result = pa[op](pb, { insert: false }) as Parameters<typeof paperToPathSegments>[0] & {
		remove: () => void;
	};
	const out = paperToPathSegments(result);
	pa.remove();
	(pb as unknown as { remove: () => void }).remove();
	result.remove();
	return out;
};

export const unitePaths = (a: PathSegment[], b: PathSegment[]): PathSegment[] =>
	apply(a, b, 'unite');
export const subtractPaths = (a: PathSegment[], b: PathSegment[]): PathSegment[] =>
	apply(a, b, 'subtract');
export const intersectPaths = (a: PathSegment[], b: PathSegment[]): PathSegment[] =>
	apply(a, b, 'intersect');
export const excludePaths = (a: PathSegment[], b: PathSegment[]): PathSegment[] =>
	apply(a, b, 'exclude');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/paper/__tests__/path-operations.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paper/path-operations.ts src/lib/paper/__tests__/path-operations.test.ts
git commit -m "feat(paper): add boolean operation wrappers (unite/subtract/intersect/exclude)"
```

---

## Task 5: Public barrel & sanity check

**Files:**
- Create: `src/lib/paper/index.ts`

- [ ] **Step 1: Create the barrel**

Create `src/lib/paper/index.ts`:

```ts
export { getPaperScope } from './scope';
export { pathSegmentsToPaper } from './path-segment-to-paper';
export { paperToPathSegments } from './paper-to-path-segment';
export {
	unitePaths,
	subtractPaths,
	intersectPaths,
	excludePaths
} from './path-operations';
```

- [ ] **Step 2: Verify type-check passes for the new module**

Run: `npm run check 2>&1 | grep "src/lib/paper" | head -50`

Expected: no errors from `src/lib/paper/**`. (Pre-existing errors elsewhere are unrelated — see MEMORY.md re: ~378 pre-existing errors post-Svelte-5.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/paper/index.ts
git commit -m "feat(paper): public barrel re-exporting paper utilities"
```

---

## Task 6: `mergeOutlineWithLabel` — pattern + label combiner

**Files:**
- Create: `src/lib/cut-pattern/merge-outline-with-label.ts`
- Create: `src/lib/cut-pattern/__tests__/merge-outline-with-label.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/__tests__/merge-outline-with-label.test.ts`:

```ts
import type { PathSegment } from '$lib/types';
import { mergeOutlineWithLabel } from '../merge-outline-with-label';

const rect = (x: number, y: number, w: number, h: number): PathSegment[] => [
	['M', x, y],
	['L', x + w, y],
	['L', x + w, y + h],
	['L', x, y + h],
	['Z']
];

describe('mergeOutlineWithLabel', () => {
	test('two overlapping rectangles produce a single closed contour', () => {
		// Pattern outline 0..10 × 0..10; label outline 8..18 × 2..8 (overlaps on the right edge).
		const outline = rect(0, 0, 10, 10);
		const label = rect(8, 2, 10, 6);
		const merged = mergeOutlineWithLabel(outline, label);

		expect(merged.filter((s) => s[0] === 'M').length).toBe(1);
		expect(merged.filter((s) => s[0] === 'Z').length).toBe(1);
		expect(merged[0][0]).toBe('M');
		expect(merged[merged.length - 1][0]).toBe('Z');
	});

	test('disjoint outline and label produce a compound path (two contours)', () => {
		const outline = rect(0, 0, 10, 10);
		const label = rect(20, 0, 10, 10);
		const merged = mergeOutlineWithLabel(outline, label);

		expect(merged.filter((s) => s[0] === 'M').length).toBe(2);
		expect(merged.filter((s) => s[0] === 'Z').length).toBe(2);
	});

	test("throws when either input doesn't start with 'M'", () => {
		const outline = rect(0, 0, 10, 10);
		const bad: PathSegment[] = [['L', 1, 1], ['Z']];
		expect(() => mergeOutlineWithLabel(outline, bad)).toThrow();
		expect(() => mergeOutlineWithLabel(bad, outline)).toThrow();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/merge-outline-with-label.test.ts`

Expected: FAIL — module `../merge-outline-with-label` not found.

- [ ] **Step 3: Implement the function**

Create `src/lib/cut-pattern/merge-outline-with-label.ts`:

```ts
import type { PathSegment } from '$lib/types';
import { unitePaths } from '$lib/paper';

/**
 * Combine a pattern outline path with a label outline path into a single
 * continuous contour using paper.js boolean union.
 *
 * Both inputs must be closed contours (begin with 'M', end with 'Z') in the
 * same coordinate space. The label is expected to be positioned so it shares
 * geometry with the outline (e.g. the label stem's base lies on the outline);
 * if the two are disjoint, the result is a compound path with two contours
 * and a console warning is emitted — that almost certainly indicates a
 * positioning bug in the caller.
 */
export const mergeOutlineWithLabel = (
	outline: PathSegment[],
	label: PathSegment[]
): PathSegment[] => {
	const merged = unitePaths(outline, label);
	const contourCount = merged.filter((s) => s[0] === 'M').length;
	if (contourCount > 1) {
		console.warn(
			`mergeOutlineWithLabel: union produced ${contourCount} contours; ` +
				'expected one. Label is likely not touching the outline.'
		);
	}
	return merged;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/merge-outline-with-label.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cut-pattern/merge-outline-with-label.ts src/lib/cut-pattern/__tests__/merge-outline-with-label.test.ts
git commit -m "feat(cut-pattern): add mergeOutlineWithLabel using paper boolean union"
```

---

## Task 7: Full-suite verification

- [ ] **Step 1: Run the entire unit-test suite**

Run: `npm run test:unit`

Expected: all previously-passing tests still pass; 14 new tests (3 + 3 + 5 + 3) are green.

- [ ] **Step 2: Push**

```bash
git push
```

Expected: branch updated on remote.

---

## Notes / Out of scope

- **Where the label gets positioned** — the consumer is responsible for translating/rotating the label `PathSegment[]` into the outline's coordinate space so the stem base intersects the outline. That positioning work is the subject of the original handoff (`specs/handoff-outlined-label-path-merge.md`) and is *not* covered here; this plan only delivers the path-combining primitive.
- **Worker compatibility** — paper-core is DOM-free and runs in Web Workers, but this plan does not wire the merge into the worker pipeline. The follow-up plan can decide whether merging happens at generation time (worker) or render time (component); both are viable. The utilities here work in either context.
- **Curve representation loss** — paper normalizes `Q` and `A` segments to `C` on import. Output of `unitePaths`/`mergeOutlineWithLabel` will only contain `M`/`L`/`C`/`Z`. This is geometry-preserving but not representation-preserving. If a downstream consumer requires arcs to remain arcs, that consumer needs an arc-recognition pass on the output — out of scope here.
- **CompoundPath inputs** — the converters handle CompoundPath outputs from boolean ops, but `pathSegmentsToPaper` only validates a single leading `M`. If a future need arises for multi-contour inputs, extend the validator.
