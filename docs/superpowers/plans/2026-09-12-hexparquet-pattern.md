# Hexparquet Tiled Pattern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `tiledHexparquetPattern-0` cut pattern — three subunits cycled one-per-quad along a band — by generalizing the existing Asanoha and tesselation adjustment code rather than adding parallel mechanisms.

**Architecture:** `generateTiling` learns to cycle a list of unit patterns across quads (legacy patterns are a one-element list). Asanoha's adjacent-facet node snapping is extracted into a shared snapper (`prev`/`next`/`self` index-pair rules) that both Asanoha and hexparquet use. The tesselation adjuster's across-band frame transform is extracted into a shared helper; hexparquet uses it to snap its left apex onto the partner band, then drops segments with the existing `removeInPlace`, last.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Three.js `Vector3`/`Triangle`, Jest via ts-jest (type-checked).

**Spec:** `docs/superpowers/specs/2026-09-12-hexparquet-pattern-design.md`

## Global Constraints

- Work on branch `feature/hexparquet-pattern`. **Never** run `git stash`, `git checkout <file|branch>`, `git reset`, or `git rebase`. Only `git add <explicit paths>` and `git commit`.
- Existing patterns' output must not change. Asanoha is protected by snapshots written in Task 1; hex tesselation by `src/lib/patterns/tesselation/hex/__tests__/snapshot.test.ts`. Never update (`-u`) an existing snapshot.
- Generic pipeline code never hard-codes 3; it reads `subunitCount` from the registry entry.
- Pattern type key: `tiledHexparquetPattern-0`. Pattern file: `src/lib/patterns/tiled-hexparquet-pattern.ts`.
- Run a single test file: `npm run test:unit -- <path>`. ts-jest type-checks test files, so type errors fail tests.
- `npm run check` baseline is **~434 errors** (all pre-existing). Record the count before Task 1 and compare after each task that touches types; the count must not rise.
- Quad orientation (verified on real flattened bands): `quad[i+1].a === quad[i].d` and `quad[i+1].b === quad[i].c`, i.e. quad _i_+1 lies across quad _i_'s unit **y = 1** edge. Unit x = 0 is the quad's `a→d` edge (left), x = 1 is `b→c` (right).
- Subunit cycle in quad-index order: **index 0 = blue, 1 = green, 2 = red**. Green's `up` node reads the `next` facet (red); its `down` node reads the `prev` facet (blue).
- Commit messages: conventional style (`feat(pattern): …`, `refactor(pattern): …`, `test(pattern): …`), ending with:

  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01174St2n432uiXJKHre7vAn
  ```

## File Structure

| File                                              | Status | Responsibility                                                                                                                                                                                 |
| ------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/patterns/adjust/snap-adjacent-facets.ts` | Create | Shared index-pair node snapper across `prev`/`next`/`self` facets (extracted from Asanoha).                                                                                                    |
| `src/lib/patterns/adjust/align-prev-band.ts`      | Create | Shared transform: bring a neighbouring band's facet path into this band's frame (extracted from tesselation adjuster).                                                                         |
| `src/lib/patterns/tiled-asanoha-pattern.ts`       | Modify | Use the shared snapper; delete `straightenEndSegments`.                                                                                                                                        |
| `src/lib/patterns/tesselation/shared/adjuster.ts` | Modify | Use `alignPrevBandPath`.                                                                                                                                                                       |
| `src/lib/types.ts`                                | Modify | `UnitPatternGenerator` gains `subunitCount`, `getSubunitPatterns`, `adjustAfterTilingNeedsEndPartners`, `leftPartnerBand` in `bandContext`; `BandCutPattern` gains `error`, `leftPartnerBand`. |
| `src/lib/cut-pattern/generate-tiled-pattern.ts`   | Modify | Subunit cycle, divisibility guard, `getLeftPartnerBandIndex`, visible-index mapping.                                                                                                           |
| `src/lib/cut-pattern/generate-pattern.ts`         | Modify | Per-entry `adjustAfterTiling` gate.                                                                                                                                                            |
| `src/lib/patterns/tiled-hexparquet-pattern.ts`    | Create | Subunit definitions, preview, index tables, hexparquet adjusters.                                                                                                                              |
| `src/lib/patterns/pattern-definitions.ts`         | Modify | Register `tiledHexparquetPattern-0`.                                                                                                                                                           |
| `src/lib/shades-config.ts`                        | Modify | Default config for `tiledHexparquetPattern-0`.                                                                                                                                                 |
| `src/lib/cut-pattern/collect-band-errors.ts`      | Create | Pure helper: list band `error`s from a pattern generation result.                                                                                                                              |
| `src/components/cut-pattern/PatternViewer.svelte` | Modify | Error banner.                                                                                                                                                                                  |
| `src/components/modal/editor/PatternView.svelte`  | Modify | Hide the Rows control for hexparquet.                                                                                                                                                          |

---

### Task 1: Asanoha characterization snapshots

Asanoha's post-mapping adjustment has no direct tests. Lock its current output before refactoring it.

**Files:**

- Create: `src/lib/patterns/__tests__/tiled-asanoha-pattern.test.ts`

**Interfaces:**

- Consumes: `generateAsanohaPattern`, `adjustAsanohaPatternAfterMapping`, `getAsanohaSegments` (existing, `src/lib/patterns/tiled-asanoha-pattern.ts`); `transformPatternByQuad` (`src/lib/patterns/quadrilateral.ts`).
- Produces: `src/lib/patterns/__tests__/__snapshots__/tiled-asanoha-pattern.test.ts.snap` — the behaviour contract for Task 3.

- [ ] **Step 1: Record the type-check baseline**

Run: `npm run check 2>&1 | tail -3`
Write the error count down in your task notes (expected ≈ 434).

- [ ] **Step 2: Write the characterization test**

```ts
import { Vector3 } from 'three';
import type { PathSegment, Quadrilateral, TiledPatternConfig } from '$lib/types';
import { transformPatternByQuad } from '../quadrilateral';
import {
	adjustAsanohaPatternAfterMapping,
	generateAsanohaPattern,
	getAsanohaSegments
} from '../tiled-asanoha-pattern';

// Consecutive quads share an edge exactly like real flattened bands:
// quad[i+1].a === quad[i].d and quad[i+1].b === quad[i].c. A slight skew keeps
// the coordinates non-trivial.
const makeQuadBand = (count: number): Quadrilateral[] =>
	Array.from({ length: count }, (_, i) => ({
		a: new Vector3(i * 0.3, i * 10, 0),
		b: new Vector3(17 + i * 0.3, i * 10 + 0.5, 0),
		c: new Vector3(17 + (i + 1) * 0.3, (i + 1) * 10 + 0.5, 0),
		d: new Vector3((i + 1) * 0.3, (i + 1) * 10, 0)
	}));

const makeConfig = (overrides: Partial<TiledPatternConfig['config']>): TiledPatternConfig => ({
	type: 'tiledAsanohaPattern-1',
	tiling: 'quadrilateral',
	config: {
		rowCount: 1,
		columnCount: 1,
		dynamicStroke: 'quadWidth',
		dynamicStrokeEasing: 'linear',
		dynamicStrokeMin: 1,
		dynamicStrokeMax: 3,
		endsMatched: false,
		endsTrimmed: false,
		endLooped: 0,
		scaleConfig: { unit: 'px', unitPerSvgUnit: 1, quantity: 1 },
		...overrides
	}
});

// Round so the snapshot is insensitive to harmless floating-point reordering.
const round = (band: PathSegment[][]) =>
	band.map((facet) =>
		facet.map((seg) => seg.map((v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)))
	);

describe('asanoha adjustAfterMapping (characterization)', () => {
	for (const rows of [1, 2]) {
		for (const columns of [1, 2]) {
			for (const hasOuterMirror of [false, true]) {
				for (const endsMatched of [false, true]) {
					for (const endsTrimmed of [false, true]) {
						it(`rows=${rows} columns=${columns} mirror=${hasOuterMirror} matched=${endsMatched} trimmed=${endsTrimmed}`, () => {
							const quadBand = makeQuadBand(4);
							const unit = generateAsanohaPattern({
								size: 1,
								rows,
								columns,
								finishOuterEdge: hasOuterMirror
							});
							const mapped = quadBand.map((quad) => transformPatternByQuad(unit, quad));
							const result = adjustAsanohaPatternAfterMapping(
								mapped,
								quadBand,
								makeConfig({ rowCount: rows, columnCount: columns, endsMatched, endsTrimmed }),
								getAsanohaSegments,
								hasOuterMirror
							);
							expect(round(result)).toMatchSnapshot();
						});
					}
				}
			}
		}
	}

	it('snaps each facet start node onto the previous facet end node', () => {
		const quadBand = makeQuadBand(3);
		const unit = generateAsanohaPattern({ size: 1, rows: 1, columns: 1 });
		const mapped = quadBand.map((quad) => transformPatternByQuad(unit, quad));
		const result = adjustAsanohaPatternAfterMapping(
			mapped,
			quadBand,
			makeConfig({}),
			getAsanohaSegments,
			false
		);
		const [[startM]] = getAsanohaSegments('start', 1, 1, mapped[1].length);
		const [[endM]] = getAsanohaSegments('end', 1, 1, mapped[0].length);
		expect(result[1][startM][1]).toBeCloseTo(mapped[0][endM][1] as number);
		expect(result[1][startM][2]).toBeCloseTo(mapped[0][endM][2] as number);
	});
});
```

- [ ] **Step 3: Run it (writes the snapshots)**

Run: `npm run test:unit -- src/lib/patterns/__tests__/tiled-asanoha-pattern.test.ts`
Expected: PASS, `33 passed`, `32 snapshots written`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/patterns/__tests__/tiled-asanoha-pattern.test.ts src/lib/patterns/__tests__/__snapshots__/tiled-asanoha-pattern.test.ts.snap
git commit -m "test(pattern): characterize asanoha post-mapping adjustment"
```

---

### Task 2: Shared adjacent-facet snapper

Extract Asanoha's snapping behaviour (copy a node's coordinates from the previous/next facet by index, with the `endsMatched` wrap) into a reusable function with explicit index-pair rules.

**Files:**

- Create: `src/lib/patterns/adjust/snap-adjacent-facets.ts`
- Test: `src/lib/patterns/adjust/__tests__/snap-adjacent-facets.test.ts`

**Interfaces:**

- Consumes: `replaceInPlace` (`src/lib/patterns/tesselation/shared/helpers.ts`, writes `[target[ti][0], source[si][1], source[si][2]]`), `IndexPair` (`src/lib/patterns/spec-types.ts`, `{ source: number; target: number }`), `translatePS`, `rotatePS` (`src/lib/patterns/utils.ts`).
- Produces:
  ```ts
  export type FacetSnapRule = { from: 'prev' | 'next' | 'self'; pairs: IndexPair[] };
  export const snapAdjacentFacets: (
  	patternBand: PathSegment[][],
  	quadBand: Quadrilateral[],
  	getRules: (facetIndex: number) => FacetSnapRule[],
  	options: { endsMatched: boolean }
  ) => PathSegment[][];
  ```

Semantics (must match Asanoha exactly):

- Sources are always read from the **input** band (never from already-snapped output).
- `prev` of facet 0 and `next` of the last facet exist only when `endsMatched`; they are clones of the far-end facet translated by `quad[0].a − quad[last].d` (prev) and `quad[last].d − quad[0].a` (next), then `rotatePS(…, 0)`.
- A single-facet band never gets a `next` wrap (Asanoha's `i === 0` branch wins).
- The input is not mutated.

- [ ] **Step 1: Write the failing tests**

```ts
import { Vector3 } from 'three';
import type { PathSegment, Quadrilateral } from '$lib/types';
import { snapAdjacentFacets, type FacetSnapRule } from '../snap-adjacent-facets';

const quads = (count: number): Quadrilateral[] =>
	Array.from({ length: count }, (_, i) => ({
		a: new Vector3(0, i, 0),
		b: new Vector3(1, i, 0),
		c: new Vector3(1, i + 1, 0),
		d: new Vector3(0, i + 1, 0)
	}));

// Facet i is a two-node path at x = 10i.
const band = (count: number): PathSegment[][] =>
	Array.from({ length: count }, (_, i) => [
		['M', 10 * i, 0],
		['L', 10 * i + 1, 0]
	]);

const always = (rules: FacetSnapRule[]) => () => rules;

describe('snapAdjacentFacets', () => {
	it('copies a node from the previous facet, keeping the target command', () => {
		const result = snapAdjacentFacets(
			band(3),
			quads(3),
			always([{ from: 'prev', pairs: [{ target: 0, source: 1 }] }]),
			{ endsMatched: false }
		);
		expect(result[1][0]).toEqual(['M', 1, 0]);
		expect(result[2][0]).toEqual(['M', 11, 0]);
	});

	it('copies a node from the next facet', () => {
		const result = snapAdjacentFacets(
			band(3),
			quads(3),
			always([{ from: 'next', pairs: [{ target: 1, source: 0 }] }]),
			{ endsMatched: false }
		);
		expect(result[0][1]).toEqual(['L', 10, 0]);
		expect(result[1][1]).toEqual(['L', 20, 0]);
	});

	it('copies a node from the same facet', () => {
		const result = snapAdjacentFacets(
			band(2),
			quads(2),
			always([{ from: 'self', pairs: [{ target: 0, source: 1 }] }]),
			{ endsMatched: false }
		);
		expect(result[0][0]).toEqual(['M', 1, 0]);
		expect(result[1][0]).toEqual(['M', 11, 0]);
	});

	it('reads sources from the unmodified input', () => {
		// Facet 2 reads facet 1 node 1, which is never a target, and facet 1 node 0,
		// which IS a target. The snapped value must not leak into facet 2.
		const result = snapAdjacentFacets(
			band(3),
			quads(3),
			always([{ from: 'prev', pairs: [{ target: 0, source: 0 }] }]),
			{ endsMatched: false }
		);
		expect(result[2][0]).toEqual(['M', 10, 0]);
	});

	it('leaves the band ends alone when ends are not matched', () => {
		const input = band(3);
		const result = snapAdjacentFacets(
			input,
			quads(3),
			always([
				{ from: 'prev', pairs: [{ target: 0, source: 1 }] },
				{ from: 'next', pairs: [{ target: 1, source: 0 }] }
			]),
			{ endsMatched: false }
		);
		expect(result[0][0]).toEqual(['M', 0, 0]);
		expect(result[2][1]).toEqual(['L', 21, 0]);
	});

	it('wraps the ends through a translated clone when ends are matched', () => {
		const result = snapAdjacentFacets(
			band(3),
			quads(3),
			always([
				{ from: 'prev', pairs: [{ target: 0, source: 1 }] },
				{ from: 'next', pairs: [{ target: 1, source: 0 }] }
			]),
			{ endsMatched: true }
		);
		// prev of facet 0 = facet 2 translated by quad0.a − quad2.d = (0, −3)
		expect(result[0][0][1]).toBeCloseTo(21);
		expect(result[0][0][2]).toBeCloseTo(-3);
		// next of facet 2 = facet 0 translated by quad2.d − quad0.a = (0, 3)
		expect(result[2][1][1]).toBeCloseTo(0);
		expect(result[2][1][2]).toBeCloseTo(3);
	});

	it('never wraps next on a single-facet band', () => {
		const result = snapAdjacentFacets(
			band(1),
			quads(1),
			always([{ from: 'next', pairs: [{ target: 1, source: 0 }] }]),
			{ endsMatched: true }
		);
		expect(result[0][1]).toEqual(['L', 1, 0]);
	});

	it('supplies rules per facet index', () => {
		const result = snapAdjacentFacets(
			band(3),
			quads(3),
			(i) => (i === 1 ? [{ from: 'self', pairs: [{ target: 0, source: 1 }] }] : []),
			{ endsMatched: false }
		);
		expect(result[0][0]).toEqual(['M', 0, 0]);
		expect(result[1][0]).toEqual(['M', 11, 0]);
		expect(result[2][0]).toEqual(['M', 20, 0]);
	});

	it('does not mutate its input', () => {
		const input = band(3);
		const copy = structuredClone(input);
		snapAdjacentFacets(
			input,
			quads(3),
			always([{ from: 'self', pairs: [{ target: 0, source: 1 }] }]),
			{
				endsMatched: true
			}
		);
		expect(input).toEqual(copy);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit -- src/lib/patterns/adjust/__tests__/snap-adjacent-facets.test.ts`
Expected: FAIL — `Cannot find module '../snap-adjacent-facets'`.

- [ ] **Step 3: Implement**

```ts
import type { PathSegment, Quadrilateral } from '$lib/types';
import type { IndexPair } from '../spec-types';
import { replaceInPlace } from '../tesselation/shared/helpers';
import { rotatePS, translatePS } from '../utils';

/**
 * Snap nodes of a facet onto nodes of a neighbouring facet (or of itself), by
 * path index. `from` names where the source node lives:
 * - `prev` / `next`: the previous / next facet along the band
 * - `self`: the same facet (e.g. adjacent columns inside one quad)
 */
export type FacetSnapRule = { from: 'prev' | 'next' | 'self'; pairs: IndexPair[] };

/**
 * Apply per-facet snap rules to a mapped band. Sources are always read from the
 * unmodified input, so rule order never matters. With `endsMatched`, the first
 * facet's `prev` and the last facet's `next` are the far-end facet translated so
 * the two ends meet (Asanoha's end matching).
 */
export const snapAdjacentFacets = (
	patternBand: PathSegment[][],
	quadBand: Quadrilateral[],
	getRules: (facetIndex: number) => FacetSnapRule[],
	{ endsMatched }: { endsMatched: boolean }
): PathSegment[][] => {
	const last = patternBand.length - 1;

	const getSource = (i: number, from: FacetSnapRule['from']): PathSegment[] | undefined => {
		if (from === 'self') return patternBand[i];
		if (from === 'prev') {
			if (i > 0) return patternBand[i - 1];
			if (!endsMatched) return undefined;
			const thisQuad = quadBand[i];
			const prevQuad = quadBand[last];
			return rotatePS(
				translatePS(
					structuredClone(patternBand[last]),
					thisQuad.a.x - prevQuad.d.x,
					thisQuad.a.y - prevQuad.d.y
				),
				0
			);
		}
		if (i < last) return patternBand[i + 1];
		// A single-facet band never wraps `next` (matches Asanoha's original branching).
		if (!endsMatched || i === 0) return undefined;
		const thisQuad = quadBand[i];
		const nextQuad = quadBand[0];
		return rotatePS(
			translatePS(
				structuredClone(patternBand[0]),
				thisQuad.d.x - nextQuad.a.x,
				thisQuad.d.y - nextQuad.a.y
			),
			0
		);
	};

	return patternBand.map((facet, i) => {
		const output = structuredClone(facet);
		for (const rule of getRules(i)) {
			const source = getSource(i, rule.from);
			if (source) replaceInPlace({ pairs: rule.pairs, target: output, source });
		}
		return output;
	});
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit -- src/lib/patterns/adjust/__tests__/snap-adjacent-facets.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/patterns/adjust/snap-adjacent-facets.ts src/lib/patterns/adjust/__tests__/snap-adjacent-facets.test.ts
git commit -m "feat(pattern): extract a shared adjacent-facet node snapper"
```

---

### Task 3: Move Asanoha onto the shared snapper

**Files:**

- Modify: `src/lib/patterns/tiled-asanoha-pattern.ts:1-2` (imports), `:183-312` (adjustment functions)

**Interfaces:**

- Consumes: `snapAdjacentFacets`, `FacetSnapRule` (Task 2).
- Produces: `export const getAsanohaSnapRules: (getSegments: GetSegmentFunction, rows: number, columns: number, facetLength: number, hasOuterMirror: boolean) => FacetSnapRule[]`; `export type GetSegmentFunction` (now exported). `adjustAsanohaPatternAfterMapping` keeps its exact signature, so `pattern-definitions.ts` is untouched.

- [ ] **Step 1: Replace the adjustment section**

Replace everything from the `// Adjustment functions.` banner (line 183) through the end of `straightenEndSegments` and the `GetSegmentFunction` type (through line 312) with the code below. Keep `getAsanohaSegments` (lines 314–342) exactly as it is.

```ts
/////////////////////////////////////////////////
// Adjustment functions — built on the shared adjacent-facet snapper.

export type GetSegmentFunction = (
	end: 'start' | 'end',
	rows: number,
	columns: number,
	facetLength: number,
	hasOuterMirror?: boolean
) => [number, number][];

/**
 * Asanoha's snap rules for one facet: each start pair's first node snaps onto the
 * previous facet's matching end pair's first node, and each end pair's second node
 * snaps onto the next facet's matching start pair's second node. This chains the
 * x = 0 (and mirrored w6) verticals across quads.
 */
export const getAsanohaSnapRules = (
	getSegments: GetSegmentFunction,
	rows: number,
	columns: number,
	facetLength: number,
	hasOuterMirror: boolean
): FacetSnapRule[] => {
	if (rows < 1 || columns < 1) {
		console.error(`bad row or column count, rows: ${rows}, columns: ${columns}`);
		return [];
	}
	const start = getSegments('start', rows, columns, facetLength, hasOuterMirror);
	const end = getSegments('end', rows, columns, facetLength, hasOuterMirror);
	return [
		{ from: 'prev', pairs: start.map(([first], k) => ({ target: first, source: end[k][0] })) },
		{ from: 'next', pairs: end.map(([, second], k) => ({ target: second, source: start[k][1] })) }
	];
};

export const adjustAsanohaPatternAfterMapping = (
	patternBand: PathSegment[][],
	quadBand: Quadrilateral[],
	tiledPatternConfig: TiledPatternConfig,
	getSegments: GetSegmentFunction,
	// True for the outermost band, whose facets carry the mirrored w6 finishing line in
	// their start/end regions — the segment-index lookups must account for it.
	hasOuterMirror = false
): PathSegment[][] => {
	const { endsMatched, endsTrimmed, rowCount, columnCount } = tiledPatternConfig.config;
	const rows = rowCount || 1;
	const columns = columnCount || 1;
	const mapped = patternBand;
	patternBand = snapAdjacentFacets(
		mapped,
		quadBand,
		(i) => getAsanohaSnapRules(getSegments, rows, columns, mapped[i].length, hasOuterMirror),
		{ endsMatched: !!endsMatched }
	);

	if (endsTrimmed) {
		const startSegments = getSegments(
			'start',
			rows,
			columns,
			patternBand[0].length,
			hasOuterMirror
		).flat();
		const endSegments = getSegments(
			'end',
			rows,
			columns,
			patternBand[patternBand.length - 1].length,
			hasOuterMirror
		).flat();
		patternBand[0].splice(0, startSegments.length);
		patternBand[patternBand.length - 1].splice(Math.min(...endSegments), endSegments.length);
	}
	return patternBand;
};
```

Update the imports at the top of the file:

```ts
import type { PathSegment, Quadrilateral, TiledPatternConfig } from '$lib/types';
import { translatePS } from './utils';
import { snapAdjacentFacets, type FacetSnapRule } from './adjust/snap-adjacent-facets';
```

(`rotatePS` is no longer used in this file; `straightenEndSegments` and `StraightenEndSegmentsProps` are deleted.)

- [ ] **Step 2: Run the characterization snapshots**

Run: `npm run test:unit -- src/lib/patterns/__tests__/tiled-asanoha-pattern.test.ts`
Expected: PASS, 33 passed, **0 snapshots written, 0 updated, 0 failed**. If any snapshot differs, the refactor changed behaviour — fix the code, never the snapshot.

- [ ] **Step 3: Run the other Asanoha consumer test**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/build-band-union-path.holes.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/patterns/tiled-asanoha-pattern.ts
git commit -m "refactor(pattern): build asanoha adjustment on the shared facet snapper"
```

---

### Task 4: Shared across-band frame transform

**Files:**

- Create: `src/lib/patterns/adjust/align-prev-band.ts`
- Test: `src/lib/patterns/adjust/__tests__/align-prev-band.test.ts`
- Modify: `src/lib/patterns/tesselation/shared/adjuster.ts:1-2` (imports), `:61-75` (`prevBandPaths`)

**Interfaces:**

- Consumes: `getAngle`, `rotatePS`, `translatePS` (`src/lib/patterns/utils.ts`).
- Produces: `export const alignPrevBandPath: (path: PathSegment[], prevQuad: Quadrilateral, referenceQuad: Quadrilateral) => PathSegment[]` — translates/rotates `path` (which lives in `prevQuad`'s frame) so `prevQuad`'s right edge `b→c` lies on `referenceQuad`'s left edge `a→d`. Reads only `.x`/`.y`, so structured-cloned quads work.

- [ ] **Step 1: Write the failing tests**

```ts
import { Vector3 } from 'three';
import type { PathSegment, Quadrilateral } from '$lib/types';
import { alignPrevBandPath } from '../align-prev-band';

const quad = (
	a: [number, number],
	b: [number, number],
	c: [number, number],
	d: [number, number]
): Quadrilateral => ({
	a: new Vector3(...a, 0),
	b: new Vector3(...b, 0),
	c: new Vector3(...c, 0),
	d: new Vector3(...d, 0)
});

describe('alignPrevBandPath', () => {
	it("translates the previous band's right edge onto this band's left edge", () => {
		const prev = quad([100, 0], [110, 0], [110, 10], [100, 10]);
		const reference = quad([0, 0], [10, 0], [10, 10], [0, 10]);
		const path: PathSegment[] = [
			['M', 110, 0],
			['L', 110, 10]
		];
		const aligned = alignPrevBandPath(path, prev, reference);
		expect(aligned[0][1]).toBeCloseTo(0);
		expect(aligned[0][2]).toBeCloseTo(0);
		expect(aligned[1][1]).toBeCloseTo(0);
		expect(aligned[1][2]).toBeCloseTo(10);
	});

	it('rotates when the two edges are not parallel', () => {
		// prev right edge b→c is vertical; reference left edge a→d is horizontal.
		const prev = quad([0, 5], [5, 5], [5, 15], [0, 15]);
		const reference = quad([0, 0], [0, -10], [10, -10], [10, 0]);
		const path: PathSegment[] = [
			['M', 5, 5],
			['L', 5, 15]
		];
		const aligned = alignPrevBandPath(path, prev, reference);
		// prev.b → reference.a, prev.c → reference.d
		expect(aligned[0][1]).toBeCloseTo(0);
		expect(aligned[0][2]).toBeCloseTo(0);
		expect(aligned[1][1]).toBeCloseTo(10);
		expect(aligned[1][2]).toBeCloseTo(0);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit -- src/lib/patterns/adjust/__tests__/align-prev-band.test.ts`
Expected: FAIL — `Cannot find module '../align-prev-band'`.

- [ ] **Step 3: Implement (moved verbatim from `adjuster.ts:61-75`)**

```ts
import type { PathSegment, Quadrilateral } from '$lib/types';
import { getAngle, rotatePS, translatePS } from '../utils';

/**
 * Bring a facet path from the previous (left-hand) band into this band's frame:
 * the previous quad's right edge (b→c, unit x = 1) is laid onto the reference
 * quad's left edge (a→d, unit x = 0) by a translation followed by a rotation.
 */
export const alignPrevBandPath = (
	path: PathSegment[],
	prevQuad: Quadrilateral,
	referenceQuad: Quadrilateral
): PathSegment[] => {
	const offset = { x: referenceQuad.a.x - prevQuad.b.x, y: referenceQuad.a.y - prevQuad.b.y };
	const angle = getAngle(referenceQuad.a, referenceQuad.d) - getAngle(prevQuad.b, prevQuad.c);
	const translated = translatePS(structuredClone(path), offset.x, offset.y);
	return rotatePS(translated, angle, referenceQuad.a);
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit -- src/lib/patterns/adjust/__tests__/align-prev-band.test.ts`
Expected: PASS. **If the rotation test fails but the translation test passes**, the existing transform's angle convention differs from "b→c onto a→d". Do not change the transform (tesselation output must stay identical): stop and report the observed output.

- [ ] **Step 5: Use it in the tesselation adjuster**

In `src/lib/patterns/tesselation/shared/adjuster.ts`, replace lines 61–75 with:

```ts
const prevBandPaths = bands[(bands.length + b - 1) % bands.length].facets.map(
	(facet: CutPattern, f) => {
		const { path, quad } = facet;
		const referenceQuad = band.facets[f].quad;
		if (!quad || !referenceQuad) throw new Error('missing quad');
		return alignPrevBandPath(path, quad, referenceQuad);
	}
);
```

Add `import { alignPrevBandPath } from '../../adjust/align-prev-band';`. Remove any of `getAngle`, `rotatePS`, `translatePS` from the `'../../utils'` import that are no longer used in `adjuster.ts` (check with `npm run lint -- src/lib/patterns/tesselation/shared/adjuster.ts`).

- [ ] **Step 6: Run the tesselation snapshots**

Run: `npm run test:unit -- src/lib/patterns/tesselation`
Expected: PASS, 0 snapshots updated or failed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/patterns/adjust/align-prev-band.ts src/lib/patterns/adjust/__tests__/align-prev-band.test.ts src/lib/patterns/tesselation/shared/adjuster.ts
git commit -m "refactor(pattern): extract the across-band frame transform"
```

---

### Task 5: Subunit cycle, divisibility guard and left-partner band in `generateTiling`

**Files:**

- Modify: `src/lib/types.ts` (`UnitPatternGenerator` ~line 137, `BandCutPattern` ~line 403)
- Modify: `src/lib/cut-pattern/generate-tiled-pattern.ts` (`generateTubeCutPattern` :63-107, `GenerateTilingProps` :199-207, `generateTiling` :209-397)
- Test: `src/lib/cut-pattern/__tests__/generate-tiling-subunits.test.ts`

**Interfaces:**

- Produces (types):

  ```ts
  // UnitPatternGenerator additions
  /** Number of unit patterns cycled along a band, one per quad. Defaults to 1. */
  subunitCount?: number;
  /** One unit pattern per subunit, in quad-index order. Required when subunitCount > 1. */
  getSubunitPatterns?: (columns: number) => PathSegment[][];
  /** When false, adjustAfterTiling runs even if the tube has no tube-end partners. Defaults to true. */
  adjustAfterTilingNeedsEndPartners?: boolean;
  // adjustAfterMapping's bandContext gains: leftPartnerBand?: number

  // BandCutPattern additions
  /** Set when the band could not be patterned (e.g. quad count not divisible by subunitCount). */
  error?: string;
  /** Band index (same space as address.band) of the band on this band's left (unit x = 0) side. */
  leftPartnerBand?: number;
  ```

- Produces (functions): `export const getLeftPartnerBandIndex: (band: Band) => number | undefined` (real tube band index, from facet meta). `GenerateTilingProps` gains `toVisibleBandIndex?: (realBandIndex: number) => number | undefined`.

- [ ] **Step 1: Add the types**

In `src/lib/types.ts`, inside `UnitPatternGenerator` (after `adjustAfterTiling?: any;`) add the three members above, and change `adjustAfterMapping`'s `bandContext` parameter type to:

```ts
		bandContext?: { hasOuterPartner: boolean; bandIndex: number; leftPartnerBand?: number }
```

Inside `BandCutPattern` (after `tagAnchorAutoAngle?: number;`) add `error?: string;` and `leftPartnerBand?: number;` with the doc comments above.

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';
import type { Band, PathSegment, Quadrilateral, TiledPatternConfig } from '$lib/types';
import { patterns } from '$lib/patterns/pattern-definitions';
import { generateTiling, getLeftPartnerBandIndex } from '../generate-tiled-pattern';

// Rectangular quads stacked along +y: quad[i+1].a === quad[i].d (real band convention).
const makeQuads = (count: number): Quadrilateral[] =>
	Array.from({ length: count }, (_, i) => ({
		a: new Vector3(0, i, 0),
		b: new Vector3(1, i, 0),
		c: new Vector3(1, i + 1, 0),
		d: new Vector3(0, i + 1, 0)
	}));

type PartnerRef = { tube: number; band: number };

// Two facets per quad; `partners` puts a partner on each facet's `ac` edge.
const makeBand = (quadCount: number, bandIndex: number, partners: PartnerRef[] = []): Band =>
	({
		orientation: 'axial-right',
		visible: true,
		facets: makeQuads(quadCount).flatMap((q, i) =>
			[0, 1].map((k) => ({
				triangle: k === 0 ? new Triangle(q.a, q.b, q.c) : new Triangle(q.c, q.d, q.a),
				orientation: 'axial-right',
				address: { globule: 0, tube: 0, band: bandIndex, facet: 2 * i + k },
				meta: partners.length
					? {
							ac: {
								partner: {
									globule: 0,
									...partners[(2 * i + k) % partners.length],
									facet: 0,
									edge: 'ac'
								}
							}
						}
					: undefined
			}))
		)
	}) as unknown as Band;

const config = (type: string): TiledPatternConfig => ({
	type,
	tiling: 'quadrilateral',
	config: {
		rowCount: 1,
		columnCount: 1,
		dynamicStroke: 'quadWidth',
		dynamicStrokeEasing: 'linear',
		dynamicStrokeMin: 1,
		dynamicStrokeMax: 3,
		endsMatched: false,
		endsTrimmed: false,
		endLooped: 0,
		scaleConfig: { unit: 'px', unitPerSvgUnit: 1, quantity: 1 }
	}
});

const LOW: PathSegment[] = [
	['M', 0, 0],
	['L', 1, 0]
];
const HIGH: PathSegment[] = [
	['M', 0, 1],
	['L', 1, 1]
];

patterns['test-subunits'] = {
	subunitCount: 2,
	getPattern: () => LOW,
	getSubunitPatterns: () => [LOW, HIGH]
};
patterns['test-legacy'] = { getPattern: () => HIGH };

const tile = (type: string, quadCount: number, band = makeBand(quadCount, 0)) =>
	generateTiling({
		quadBands: [makeQuads(quadCount)],
		bands: [band],
		tiledPatternConfig: config(type),
		address: { globule: 0, tube: 0 }
	})[0];

describe('generateTiling subunits', () => {
	it('cycles subunit patterns across quads by index', () => {
		const band = tile('test-subunits', 4);
		expect(band.error).toBeUndefined();
		expect(band.facets.map((f) => f.path[0])).toEqual([
			['M', 0, 0], // quad 0, LOW
			['M', 0, 2], // quad 1, HIGH (unit y = 1 → quad1.d)
			['M', 0, 2], // quad 2, LOW (unit y = 0 → quad2.a)
			['M', 0, 4] //  quad 3, HIGH
		]);
	});

	it('refuses a band whose quad count is not divisible by subunitCount', () => {
		const band = tile('test-subunits', 3);
		expect(band.facets).toEqual([]);
		expect(band.error).toBe('test-subunits needs a quad count divisible by 2 (got 3)');
		expect(band.address.band).toBe(0);
	});

	it('maps legacy single-pattern entries onto every quad', () => {
		const band = tile('test-legacy', 3);
		expect(band.facets.map((f) => f.path[0])).toEqual([
			['M', 0, 1],
			['M', 0, 2],
			['M', 0, 3]
		]);
	});

	it('records the left partner band', () => {
		const band = tile(
			'test-legacy',
			2,
			makeBand(2, 3, [
				{ tube: 0, band: 2 },
				{ tube: 0, band: 4 }
			])
		);
		expect(band.leftPartnerBand).toBe(2);
	});
});

describe('getLeftPartnerBandIndex', () => {
	it('is the band one index lower', () => {
		expect(
			getLeftPartnerBandIndex(
				makeBand(1, 3, [
					{ tube: 0, band: 2 },
					{ tube: 0, band: 4 }
				])
			)
		).toBe(2);
	});

	it('is undefined for band 0 of an open tube', () => {
		expect(getLeftPartnerBandIndex(makeBand(1, 0, [{ tube: 0, band: 1 }]))).toBeUndefined();
	});

	it("is the tube's last band for band 0 of a wrapping tube", () => {
		expect(
			getLeftPartnerBandIndex(
				makeBand(1, 0, [
					{ tube: 0, band: 1 },
					{ tube: 0, band: 5 }
				])
			)
		).toBe(5);
	});

	it('ignores partners in other tubes and within the band', () => {
		expect(
			getLeftPartnerBandIndex(
				makeBand(1, 3, [
					{ tube: 1, band: 2 },
					{ tube: 0, band: 3 }
				])
			)
		).toBeUndefined();
	});

	it('is undefined when facets carry no address', () => {
		const band = makeBand(1, 3, [{ tube: 0, band: 2 }]);
		band.facets.forEach((f) => delete f.address);
		expect(getLeftPartnerBandIndex(band)).toBeUndefined();
	});
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/generate-tiling-subunits.test.ts`
Expected: FAIL — `getLeftPartnerBandIndex` is not exported (and the subunit/guard assertions fail).

- [ ] **Step 4: Add `getLeftPartnerBandIndex`**

In `src/lib/cut-pattern/generate-tiled-pattern.ts`, directly after `bandHasFreeSide` (line 61):

```ts
/**
 * Real tube band index of the band on this band's LEFT side (unit x = 0 — the
 * neighbour the tesselation adjuster treats as `prev`), read from facet partner
 * meta. That is band b − 1, or — for band 0 of a wrapping tube — the tube's last
 * band. Undefined when the left side is free (band 0 of an open tube) or the
 * facets carry no address.
 *
 * Known limit: in a wrapping tube of exactly two bands, band 0's two neighbours
 * are the same band, so its left partner is not detected.
 */
export const getLeftPartnerBandIndex = (band: Band): number | undefined => {
	const own = band.facets.find((facet) => facet.address)?.address;
	if (!own) return undefined;
	const neighbours = new Set<number>();
	for (const facet of band.facets) {
		for (const edge of ['ab', 'bc', 'ac'] as const) {
			const partner = facet.meta?.[edge]?.partner;
			if (partner && partner.tube === own.tube && partner.band !== own.band) {
				neighbours.add(partner.band);
			}
		}
	}
	if (neighbours.has(own.band - 1)) return own.band - 1;
	return [...neighbours].find((n) => n > own.band + 1);
};
```

- [ ] **Step 5: Map real → visible band indices in `generateTubeCutPattern`**

In `generateTubeCutPattern`, after `const visibleBands = bands.filter((b) => b.visible);` add:

```ts
// Partner meta uses real tube band indices; BandCutPattern.address.band uses the
// index among visible bands. Translate so leftPartnerBand matches address.band.
const visibleIndexByReal = new Map(
	visibleBands.map((band, k) => [band.facets.find((f) => f.address)?.address?.band ?? k, k])
);
```

and pass `toVisibleBandIndex: (real: number) => visibleIndexByReal.get(real)` in the `generateTiling({ … })` call.

- [ ] **Step 6: Extend `GenerateTilingProps` and `generateTiling`**

Add to `GenerateTilingProps`:

```ts
	/** Translate a real tube band index (facet meta) to this tiling's band index space. */
	toVisibleBandIndex?: (realBandIndex: number) => number | undefined;
```

Destructure it in `generateTiling` with default `toVisibleBandIndex = (real: number) => real`.

Inside the `quadBands.map((quadBand, bandIndex) => { … })` callback:

1. Replace the entry destructuring with:

```ts
const entry = resolvePatternEntry(tiledPatternConfig.type) as UnitPatternGenerator;
const { getPattern, tagAnchor, adjustAfterMapping, getSubunitPatterns } = entry;
const subunitCount = entry.subunitCount ?? 1;
const globalBandIndex = bandIndex + bandIndexOffset;
```

(import `UnitPatternGenerator` as a type from `$lib/types`) and delete the later `const globalBandIndex = bandIndex + bandIndexOffset;` near the end of the callback.

2. After `const sourceBand = bands?.[bandIndex];` compute the left partner and add it to `bandContext`:

```ts
const realLeftPartner = sourceBand ? getLeftPartnerBandIndex(sourceBand) : undefined;
const leftPartnerBand =
	realLeftPartner === undefined ? undefined : toVisibleBandIndex(realLeftPartner);
const bandContext = {
	hasOuterPartner: !hasFreeSide,
	bandIndex: bandIndex + bandIndexOffset,
	leftPartnerBand
};
```

3. Immediately after `bandContext`, add the guard:

```ts
if (quadBand.length % subunitCount !== 0) {
	return {
		facets: [],
		sideOrientation: bands[bandIndex].sideOrientation,
		svgPath: undefined,
		id: `${tiledPatternConfig.type}-band-${address.globule}-${address.tube}-${globalBandIndex}`,
		tagAnchorPoint: { x: 0, y: 0 },
		projectionType: 'patterned',
		address: { ...address, band: globalBandIndex },
		bounds: bands[bandIndex].bounds,
		error: `${tiledPatternConfig.type} needs a quad count divisible by ${subunitCount} (got ${quadBand.length})`
	} as BandCutPattern;
}
```

4. Replace the body of `if (Array.isArray(unitPattern)) { … }` with:

```ts
const unitPatterns = getSubunitPatterns ? getSubunitPatterns(columnCount || 1) : [unitPattern];
if (unitPatterns.length !== subunitCount) {
	throw new Error(
		`${tiledPatternConfig.type}: expected ${subunitCount} subunit patterns, got ${unitPatterns.length}`
	);
}
mappedPatternBand = quadBand.map((quad, i) =>
	transformPatternByQuad(unitPatterns[i % subunitCount], quad)
) as PathSegment[][];
```

5. In the returned `result`, add `leftPartnerBand,` after `meta: …`.

6. In `generateTubeCutPattern`, after `const tiling = generateTiling({ … });` log refusals once per tube:

```ts
const refused = tiling.filter((band) => band.error);
if (refused.length) {
	console.error(
		`${tiledPatternConfig.type}: ${refused.length} band(s) in tube ${address.tube} not patterned — ${refused[0].error}`
	);
}
```

- [ ] **Step 7: Run the new tests and the existing cut-pattern suite**

Run: `npm run test:unit -- src/lib/cut-pattern src/lib/patterns`
Expected: PASS, including all Asanoha and tesselation snapshots unchanged.

- [ ] **Step 8: Type-check**

Run: `npm run check 2>&1 | tail -3`
Expected: error count ≤ the Task 1 baseline.

- [ ] **Step 9: Commit**

```bash
git add src/lib/types.ts src/lib/cut-pattern/generate-tiled-pattern.ts src/lib/cut-pattern/__tests__/generate-tiling-subunits.test.ts
git commit -m "feat(pattern): cycle subunit patterns across quads and record left partner bands"
```

---

### Task 6: Per-entry `adjustAfterTiling` gate

Today `adjustAfterTiling` only runs when the tube's first band has a tube-end partner (`generate-pattern.ts:216-218`). Make that an entry option (default unchanged) so hexparquet can run on open tubes.

**Files:**

- Modify: `src/lib/cut-pattern/generate-pattern.ts:153-155`, `:216-218`
- Test: `src/lib/cut-pattern/__tests__/adjust-after-tiling-gate.test.ts`

**Interfaces:**

- Consumes: `UnitPatternGenerator.adjustAfterTilingNeedsEndPartners` (Task 5).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, jest } from '@jest/globals';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import { generateProjectionPattern } from '../generate-pattern';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig,
	tiledPatternConfigs
} from '$lib/shades-config';
import { patterns } from '$lib/patterns/pattern-definitions';
import type { BandCutPattern, PathSegment } from '$lib/types';

describe('adjustAfterTiling gate', () => {
	const superGlobule = generateSuperGlobule(generateDefaultSuperGlobuleConfig(), {
		globule: false,
		globuleTube: true,
		projection: false,
		voronoi: false
	});

	const run = (type: string) => {
		const patternConfig = generateDefaultGlobulePatternConfig();
		patternConfig.patternTypeConfig = { ...tiledPatternConfigs['tiledAsanohaPattern-1'], type };
		return generateProjectionPattern(
			superGlobule.globuleTubes,
			'super-1',
			patternConfig,
			patternConfig.patternViewConfig.range
		);
	};

	it('runs an opted-out entry even without tube-end partners', () => {
		const adjust = jest.fn((bands: BandCutPattern[]) => bands);
		patterns['test-gate-optout'] = {
			getPattern: () =>
				[
					['M', 0, 0],
					['L', 1, 1]
				] as PathSegment[],
			adjustAfterTiling: adjust,
			adjustAfterTilingNeedsEndPartners: false
		};
		run('test-gate-optout');
		expect(adjust).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/adjust-after-tiling-gate.test.ts`
Expected: FAIL — `expect(adjust).toHaveBeenCalled()` (globule tubes have no tube-end partner on band 0, so the gate blocks it). If it unexpectedly PASSES, globule tubes do carry end partners: change the test to use a fresh tube array where every band's `meta` is removed (`superGlobule.globuleTubes.map((t) => ({ ...t, bands: t.bands.map((b) => ({ ...b, facets: b.facets.map((f) => ({ ...f, meta: undefined })) })) }))`) and re-run to see it fail.

- [ ] **Step 3: Implement**

At lines 153–155 replace:

```ts
const { adjustAfterTiling } = resolvePatternEntry(tiledPatternConfig.type);
const hasAdjustAfterTiling = !!adjustAfterTiling;
```

with:

```ts
const entry = resolvePatternEntry(tiledPatternConfig.type) as UnitPatternGenerator;
const { adjustAfterTiling } = entry;
const hasAdjustAfterTiling = !!adjustAfterTiling;
// Most adjusters need tube-end partner transforms; entries can opt out.
const needsEndPartners = entry.adjustAfterTilingNeedsEndPartners ?? true;
```

At lines 216–218 replace the `doAdjustAfterTiling` expression with:

```ts
const doAdjustAfterTiling =
	hasAdjustAfterTiling && (!needsEndPartners || !!firstInRange?.bands[0]?.meta?.startPartnerBand);
```

Import `UnitPatternGenerator` as a type from `$lib/types` if it is not already imported.

- [ ] **Step 4: Run to verify pass, plus the pipeline tests**

Run: `npm run test:unit -- src/lib/cut-pattern`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cut-pattern/generate-pattern.ts src/lib/cut-pattern/__tests__/adjust-after-tiling-gate.test.ts
git commit -m "refactor(pattern): let pattern entries opt out of the end-partner adjust gate"
```

---

### Task 7: Hexparquet pattern definition

Pure definitions: subunit segments, generated paths, preview, and the index tables for snaps and drops. No pipeline wiring yet.

**Files:**

- Create: `src/lib/patterns/tiled-hexparquet-pattern.ts`
- Test: `src/lib/patterns/__tests__/tiled-hexparquet-pattern.test.ts`

**Interfaces:**

- Consumes: `FacetSnapRule` (Task 2), `IndexPair` (`spec-types.ts`).
- Produces:
  ```ts
  export const HEXPARQUET_SUBUNIT_COUNT = 3;
  export const generateHexparquetSubunits: (columns: number) => PathSegment[][]; // [blue, green, red]
  export const generateHexparquetPreview: (columns: number) => PathSegment[]; // subunits stacked in thirds of one unit
  export const getHexparquetSnapRules: (columns: number) => (facetIndex: number) => FacetSnapRule[];
  export const getHexparquetAcrossBandPairs: (facetIndex: number, columns: number) => IndexPair[];
  export const getHexparquetDropIndices: (
  	facetIndex: number,
  	columns: number,
  	ctx: { hasLeftPartner: boolean }
  ) => number[];
  ```

Path layout: each segment is emitted as its own `M`,`L` pair. Segment `s` of column `c` in a subunit with `S` segments has its `M` at index `2 * (c * S + s)` and its `L` at that index + 1. Column `c` maps unit x to `(c + x) / columns`.

- [ ] **Step 1: Write the failing tests**

```ts
import type { PathSegment } from '$lib/types';
import {
	HEXPARQUET_SUBUNIT_COUNT,
	generateHexparquetPreview,
	generateHexparquetSubunits,
	getHexparquetAcrossBandPairs,
	getHexparquetDropIndices,
	getHexparquetSnapRules
} from '../tiled-hexparquet-pattern';

const BLUE = 0;
const GREEN = 1;
const RED = 2;
const node = (seg: PathSegment) => [seg[1] as number, seg[2] as number];

describe('generateHexparquetSubunits', () => {
	it('emits blue, green, red with 10, 9, 10 segments per column', () => {
		for (const columns of [1, 2, 3]) {
			const [blue, green, red] = generateHexparquetSubunits(columns);
			expect(blue).toHaveLength(20 * columns);
			expect(green).toHaveLength(18 * columns);
			expect(red).toHaveLength(20 * columns);
		}
		expect(HEXPARQUET_SUBUNIT_COUNT).toBe(3);
	});

	it('emits every segment as an M/L pair', () => {
		for (const path of generateHexparquetSubunits(2)) {
			path.forEach((seg, i) => expect(seg[0]).toBe(i % 2 === 0 ? 'M' : 'L'));
		}
	});

	it('places the left apex at x = -1/6 of a column', () => {
		const [, green] = generateHexparquetSubunits(1);
		expect(node(green[1])).toEqual([-1 / 6, 0.5]); // segment 0 end: 0,1 → ◀½
	});

	it('scales and offsets columns', () => {
		const [, green] = generateHexparquetSubunits(2);
		// column 1, segment 0 starts at unit (0, 1) → x = (1 + 0) / 2
		expect(node(green[18])).toEqual([0.5, 1]);
	});
});

describe('generateHexparquetPreview', () => {
	it('stacks the three subunits into thirds of one unit', () => {
		const preview = generateHexparquetPreview(1);
		expect(preview).toHaveLength(20 + 18 + 20);
		const ys = preview.map((seg) => seg[2] as number);
		expect(Math.min(...ys)).toBeCloseTo(0);
		expect(Math.max(...ys)).toBeCloseTo(1);
	});
});

describe('getHexparquetSnapRules', () => {
	const columns = 2;
	const [blue, green, red] = generateHexparquetSubunits(columns);
	const rules = getHexparquetSnapRules(columns);

	it("snaps green's up node onto the next (red) facet's right apex in each column", () => {
		const next = rules(GREEN).find((r) => r.from === 'next');
		expect(next?.pairs).toHaveLength(columns);
		next!.pairs.forEach(({ target, source }, c) => {
			expect(node(green[target])).toEqual([(c + 4 / 6) / columns, 1]);
			expect(node(red[source])).toEqual([(c + 5 / 6) / columns, 0.5]);
		});
	});

	it("snaps green's down node onto the previous (blue) facet's right apex in each column", () => {
		const prev = rules(GREEN).find((r) => r.from === 'prev');
		expect(prev?.pairs).toHaveLength(columns);
		prev!.pairs.forEach(({ target, source }, c) => {
			expect(node(green[target])).toEqual([(c + 4 / 6) / columns, 0]);
			expect(node(blue[source])).toEqual([(c + 5 / 6) / columns, 0.5]);
		});
	});

	it('snaps every left apex in column c > 0 onto column c-1 right apex of the same facet', () => {
		for (const [facetIndex, path] of [
			[BLUE, blue],
			[GREEN, green],
			[RED, red]
		] as const) {
			const self = rules(facetIndex).find((r) => r.from === 'self');
			expect(self?.pairs.length).toBeGreaterThan(0);
			for (const { target, source } of self!.pairs) {
				expect(node(path[target])[0]).toBeCloseTo((1 - 1 / 6) / columns);
				expect(node(path[source])).toEqual([(0 + 5 / 6) / columns, 0.5]);
			}
		}
	});

	it('has no prev/next rules on blue and red facets and no self rules with one column', () => {
		expect(rules(BLUE).filter((r) => r.from !== 'self')).toEqual([]);
		expect(rules(RED + 3).filter((r) => r.from !== 'self')).toEqual([]);
		expect(getHexparquetSnapRules(1)(BLUE)).toEqual([]);
	});
});

describe('getHexparquetAcrossBandPairs', () => {
	it("targets column 0's left apexes and sources the last column's right apex", () => {
		const columns = 2;
		const [, green] = generateHexparquetSubunits(columns);
		const pairs = getHexparquetAcrossBandPairs(GREEN, columns);
		expect(pairs).toHaveLength(3); // green has three ◀ nodes in column 0
		for (const { target, source } of pairs) {
			expect(node(green[target])[0]).toBeCloseTo(-1 / 6 / columns);
			expect(node(green[source])).toEqual([(1 + 5 / 6) / columns, 0.5]);
		}
	});
});

describe('getHexparquetDropIndices', () => {
	it('keeps everything on the first blue facet with one column and no partner', () => {
		expect(getHexparquetDropIndices(BLUE, 1, { hasLeftPartner: false })).toEqual([]);
	});

	it("drops blue's unit-bottom line on every blue facet after the first", () => {
		expect(getHexparquetDropIndices(BLUE + 3, 1, { hasLeftPartner: false })).toEqual([8, 9]);
	});

	it("drops green's lower-left segment in column 0 only when there is a left partner", () => {
		expect(getHexparquetDropIndices(GREEN, 1, { hasLeftPartner: false })).toEqual([]);
		expect(getHexparquetDropIndices(GREEN, 1, { hasLeftPartner: true })).toEqual([2, 3]);
	});

	it('drops the left-edge segments of columns after the first', () => {
		// green column 1: segments 0 and 1 → indices 2*(9+0)..2*(9+1)+1
		expect(getHexparquetDropIndices(GREEN, 2, { hasLeftPartner: false })).toEqual([18, 19, 20, 21]);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit -- src/lib/patterns/__tests__/tiled-hexparquet-pattern.test.ts`
Expected: FAIL — `Cannot find module '../tiled-hexparquet-pattern'`.

- [ ] **Step 3: Implement**

```ts
import type { PathSegment } from '$lib/types';
import type { IndexPair } from './spec-types';
import type { FacetSnapRule } from './adjust/snap-adjacent-facets';

/**
 * Hexparquet: three subunits cycled along a band, one per quad. Quad i+1 lies
 * across quad i's unit y = 1 edge, so in quad-index order a unit is
 * blue (bottom), green (middle), red (top).
 *
 * Unit frame: x across the band in sixths, y along the band. `◀` is the left
 * apex, defined at (-1/6, y): the quad mapping extrapolates it into place when
 * there is no neighbour, and snaps overwrite it when there is one.
 */

type P = [number, number];
type Tag = 'leftEdge' | 'partnerDrop' | 'unitBottom';
type Seg = { from: P; to: P; tags?: Tag[] };

export const HEXPARQUET_SUBUNIT_COUNT = 3;

const APEX = (y: number): P => [-1 / 6, y];
const RIGHT_APEX: P = [5 / 6, 0.5];

const BLUE: Seg[] = [
	{ from: [0, 1], to: [2 / 6, 1] },
	{ from: [2 / 6, 1], to: [0, 0] },
	{ from: [0, 1], to: APEX(0.5), tags: ['leftEdge'] },
	{ from: APEX(0.5), to: [0, 0], tags: ['leftEdge'] },
	{ from: [0, 0], to: [1, 0], tags: ['unitBottom'] },
	{ from: [1, 0], to: RIGHT_APEX },
	{ from: RIGHT_APEX, to: [1, 1] },
	{ from: [2 / 6, 1], to: [3 / 6, 0.5] },
	{ from: [3 / 6, 0.5], to: [2 / 6, 0] },
	{ from: [3 / 6, 0.5], to: RIGHT_APEX }
];

const GREEN: Seg[] = [
	{ from: [0, 1], to: APEX(0.5), tags: ['leftEdge'] },
	{ from: APEX(0.5), to: [0, 0], tags: ['leftEdge', 'partnerDrop'] },
	{ from: APEX(0.5), to: RIGHT_APEX },
	{ from: [2 / 6, 1], to: [3 / 6, 0.5] },
	{ from: [3 / 6, 0.5], to: [4 / 6, 0] }, // `to` snaps down onto blue
	{ from: [4 / 6, 1], to: [3 / 6, 0.5] }, // `from` snaps up onto red
	{ from: [3 / 6, 0.5], to: [2 / 6, 0] },
	{ from: [1, 1], to: RIGHT_APEX },
	{ from: RIGHT_APEX, to: [1, 0] }
];

const RED: Seg[] = [
	{ from: APEX(0.5), to: [0, 0], tags: ['leftEdge'] },
	{ from: APEX(0.5), to: [0, 1], tags: ['leftEdge'] },
	{ from: [0, 1], to: [1, 1] },
	{ from: [1, 1], to: RIGHT_APEX },
	{ from: RIGHT_APEX, to: [1, 0] },
	{ from: [0, 0], to: [2 / 6, 0] },
	{ from: [2 / 6, 0], to: [0, 1] },
	{ from: [2 / 6, 1], to: [3 / 6, 0.5] },
	{ from: [3 / 6, 0.5], to: [2 / 6, 0] },
	{ from: [3 / 6, 0.5], to: RIGHT_APEX }
];

const SUBUNITS = [BLUE, GREEN, RED];
const subunitOf = (facetIndex: number) => SUBUNITS[facetIndex % HEXPARQUET_SUBUNIT_COUNT];

const EPS = 1e-9;
const at =
	(x: number, y: number) =>
	([px, py]: P) =>
		Math.abs(px - x) < EPS && Math.abs(py - y) < EPS;
const isLeftApex = ([px]: P) => Math.abs(px + 1 / 6) < EPS;
const isRightApex = at(...RIGHT_APEX);

/** Path indices, within column `c`, of every segment endpoint matching `match`. */
const nodeIndices = (segs: Seg[], c: number, match: (p: P) => boolean): number[] => {
	const out: number[] = [];
	segs.forEach((seg, s) => {
		const base = 2 * (c * segs.length + s);
		if (match(seg.from)) out.push(base);
		if (match(seg.to)) out.push(base + 1);
	});
	return out;
};

export const generateHexparquetSubunits = (columns: number): PathSegment[][] =>
	SUBUNITS.map((segs) => {
		const path: PathSegment[] = [];
		for (let c = 0; c < columns; c++) {
			const x = (v: number) => (c + v) / columns;
			for (const { from, to } of segs) {
				path.push(['M', x(from[0]), from[1]], ['L', x(to[0]), to[1]]);
			}
		}
		return path;
	});

/** All three subunits stacked into one unit square (blue bottom third, red top). */
export const generateHexparquetPreview = (columns: number): PathSegment[] =>
	generateHexparquetSubunits(columns).flatMap((path, s) =>
		path.map((seg) => {
			const [command, x, y] = seg as ['M' | 'L', number, number];
			return [command, x, (s + y) / HEXPARQUET_SUBUNIT_COUNT] as PathSegment;
		})
	);

/** Within-band snaps for one facet (see spec: Snap rules). */
export const getHexparquetSnapRules =
	(columns: number) =>
	(facetIndex: number): FacetSnapRule[] => {
		const segs = subunitOf(facetIndex);
		const rules: FacetSnapRule[] = [];

		const self: IndexPair[] = [];
		for (let c = 1; c < columns; c++) {
			const source = nodeIndices(segs, c - 1, isRightApex)[0];
			for (const target of nodeIndices(segs, c, isLeftApex)) self.push({ target, source });
		}
		if (self.length) rules.push({ from: 'self', pairs: self });

		if (segs === GREEN) {
			const up: IndexPair[] = [];
			const down: IndexPair[] = [];
			for (let c = 0; c < columns; c++) {
				up.push({
					target: nodeIndices(GREEN, c, at(4 / 6, 1))[0],
					source: nodeIndices(RED, c, isRightApex)[0]
				});
				down.push({
					target: nodeIndices(GREEN, c, at(4 / 6, 0))[0],
					source: nodeIndices(BLUE, c, isRightApex)[0]
				});
			}
			rules.push({ from: 'next', pairs: up }, { from: 'prev', pairs: down });
		}
		return rules;
	};

/** Column-0 left apexes ← the left partner band's last-column right apex (same facet index). */
export const getHexparquetAcrossBandPairs = (facetIndex: number, columns: number): IndexPair[] => {
	const segs = subunitOf(facetIndex);
	const source = nodeIndices(segs, columns - 1, isRightApex)[0];
	return nodeIndices(segs, 0, isLeftApex).map((target) => ({ target, source }));
};

/** Path indices to remove from one facet, applied after every snap. */
export const getHexparquetDropIndices = (
	facetIndex: number,
	columns: number,
	{ hasLeftPartner }: { hasLeftPartner: boolean }
): number[] => {
	const segs = subunitOf(facetIndex);
	const out: number[] = [];
	for (let c = 0; c < columns; c++) {
		segs.forEach(({ tags = [] }, s) => {
			const drop =
				(c > 0 && tags.includes('leftEdge')) ||
				(c === 0 && hasLeftPartner && tags.includes('partnerDrop')) ||
				// Blue's bottom line coincides with the previous unit's red top; only the
				// band's first unit (facet 0) keeps it as the band's end.
				(facetIndex > 0 && tags.includes('unitBottom'));
			if (drop) {
				const base = 2 * (c * segs.length + s);
				out.push(base, base + 1);
			}
		});
	}
	return out;
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit -- src/lib/patterns/__tests__/tiled-hexparquet-pattern.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/patterns/tiled-hexparquet-pattern.ts src/lib/patterns/__tests__/tiled-hexparquet-pattern.test.ts
git commit -m "feat(pattern): define hexparquet subunits and their index tables"
```

---

### Task 8: Hexparquet adjusters

**Files:**

- Modify: `src/lib/patterns/tiled-hexparquet-pattern.ts` (append)
- Test: `src/lib/patterns/__tests__/tiled-hexparquet-adjust.test.ts`

**Interfaces:**

- Consumes: `snapAdjacentFacets` (Task 2), `alignPrevBandPath` (Task 4), `replaceInPlace` / `removeInPlace` (`tesselation/shared/helpers.ts`), `BandCutPattern.leftPartnerBand` / `.error` (Task 5), Task 7 tables.
- Produces:
  ```ts
  export const adjustHexparquetAfterMapping: (
  	patternBand: PathSegment[][],
  	quadBand: Quadrilateral[],
  	tiledPatternConfig: TiledPatternConfig
  ) => PathSegment[][];
  export const adjustHexparquetAfterTiling: (
  	bands: BandCutPattern[],
  	tiledPatternConfig: TiledPatternConfig
  ) => BandCutPattern[];
  ```

Order inside `adjustHexparquetAfterTiling`: (1) across-band snap for every band, reading partner paths before anything is removed; (2) drops for every band. Bands with `error`, or whose partner is missing from `bands` (e.g. outside a band range), skip the snap; drops still apply.

- [ ] **Step 1: Write the failing tests**

```ts
import { Vector3 } from 'three';
import type { BandCutPattern, PathSegment, Quadrilateral, TiledPatternConfig } from '$lib/types';
import { transformPatternByQuad } from '../quadrilateral';
import {
	adjustHexparquetAfterMapping,
	adjustHexparquetAfterTiling,
	generateHexparquetSubunits
} from '../tiled-hexparquet-pattern';

const config = (columnCount = 1): TiledPatternConfig => ({
	type: 'tiledHexparquetPattern-0',
	tiling: 'quadrilateral',
	config: {
		rowCount: 1,
		columnCount,
		dynamicStroke: 'quadWidth',
		dynamicStrokeEasing: 'linear',
		dynamicStrokeMin: 1,
		dynamicStrokeMax: 3,
		endsMatched: false,
		endsTrimmed: false,
		endLooped: 0,
		scaleConfig: { unit: 'px', unitPerSvgUnit: 1, quantity: 1 }
	}
});

// Rectangular quads of the given width, stacked along +y, starting at x = x0.
const quads = (count: number, x0: number, width: number): Quadrilateral[] =>
	Array.from({ length: count }, (_, i) => ({
		a: new Vector3(x0, i, 0),
		b: new Vector3(x0 + width, i, 0),
		c: new Vector3(x0 + width, i + 1, 0),
		d: new Vector3(x0, i + 1, 0)
	}));

const mapBand = (qs: Quadrilateral[], columns = 1): PathSegment[][] => {
	const subunits = generateHexparquetSubunits(columns);
	return qs.map((q, i) => transformPatternByQuad(subunits[i % 3], q));
};

const cutBand = (band: number, qs: Quadrilateral[], leftPartnerBand?: number): BandCutPattern =>
	({
		id: `b${band}`,
		projectionType: 'patterned',
		tagAnchorPoint: { x: 0, y: 0 },
		address: { globule: 0, tube: 0, band },
		leftPartnerBand,
		facets: mapBand(qs).map((path, i) => ({ path, quad: qs[i], label: `${i}` }))
	}) as BandCutPattern;

describe('adjustHexparquetAfterMapping', () => {
	it("moves green's up node onto the next red facet's right apex", () => {
		const qs = quads(3, 0, 1);
		const mapped = mapBand(qs);
		const adjusted = adjustHexparquetAfterMapping(mapped, qs, config());
		// green segment 5 `from` (index 10) ← red right apex: red quad (0..1, 2..3) → (5/6, 2.5)
		expect(adjusted[1][10][1]).toBeCloseTo(5 / 6);
		expect(adjusted[1][10][2]).toBeCloseTo(2.5);
		// green segment 4 `to` (index 9) ← blue right apex (5/6, 0.5)
		expect(adjusted[1][9][1]).toBeCloseTo(5 / 6);
		expect(adjusted[1][9][2]).toBeCloseTo(0.5);
	});
});

describe('adjustHexparquetAfterTiling', () => {
	it("snaps the left apex onto the partner band's right apex, in this band's frame", () => {
		// Partner band 0 is twice as wide, so its right apex (5/3) lands 1/3 left of
		// band 1's left edge — distinguishable from band 1's own extrapolation (-1/6).
		const band0 = cutBand(0, quads(3, 0, 2));
		const band1 = cutBand(1, quads(3, 10, 1), 0);
		const [, adjusted] = adjustHexparquetAfterTiling([band0, band1], config());
		// green facet 1, segment 2 `from` (◀, index 4), after the partner drop removed
		// indices 2 and 3 → now index 2
		const apex = adjusted.facets[1].path[2];
		expect(apex[0]).toBe('M');
		expect(apex[1]).toBeCloseTo(10 - 1 / 3);
		expect(apex[2]).toBeCloseTo(1.5);
	});

	it('drops the partner segment only on bands with a left partner', () => {
		const band0 = cutBand(0, quads(3, 0, 1));
		const band1 = cutBand(1, quads(3, 0, 1), 0);
		const [a, b] = adjustHexparquetAfterTiling([band0, band1], config());
		expect(a.facets[1].path).toHaveLength(18);
		expect(b.facets[1].path).toHaveLength(16);
	});

	it("drops blue's bottom line on every blue facet but the first", () => {
		const band = cutBand(0, quads(6, 0, 1));
		const [adjusted] = adjustHexparquetAfterTiling([band], config());
		expect(adjusted.facets[0].path).toHaveLength(20);
		expect(adjusted.facets[3].path).toHaveLength(18);
	});

	it('keeps the extrapolated apex when the partner band is not in range', () => {
		const band1 = cutBand(1, quads(3, 10, 1), 0);
		const [adjusted] = adjustHexparquetAfterTiling([band1], config());
		expect(adjusted.facets[1].path[2][1]).toBeCloseTo(10 - 1 / 6);
	});

	it('leaves refused bands untouched', () => {
		const refused = { ...cutBand(0, []), error: 'nope' } as BandCutPattern;
		expect(adjustHexparquetAfterTiling([refused], config())[0]).toEqual(refused);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit -- src/lib/patterns/__tests__/tiled-hexparquet-adjust.test.ts`
Expected: FAIL — `adjustHexparquetAfterMapping` is not exported.

- [ ] **Step 3: Implement (append to `tiled-hexparquet-pattern.ts`)**

Add to the imports:

```ts
import type { BandCutPattern, Quadrilateral, TiledPatternConfig } from '$lib/types';
import { snapAdjacentFacets } from './adjust/snap-adjacent-facets';
import { alignPrevBandPath } from './adjust/align-prev-band';
import { removeInPlace, replaceInPlace } from './tesselation/shared/helpers';
```

(merge the `$lib/types` import with the existing `PathSegment` import), then append:

```ts
/** Within-band snaps: green up/down nodes and column-to-column apexes. */
export const adjustHexparquetAfterMapping = (
	patternBand: PathSegment[][],
	quadBand: Quadrilateral[],
	tiledPatternConfig: TiledPatternConfig
): PathSegment[][] =>
	snapAdjacentFacets(
		patternBand,
		quadBand,
		getHexparquetSnapRules(tiledPatternConfig.config.columnCount || 1),
		{ endsMatched: false }
	);

/**
 * Tube-level adjustment: snap each band's column-0 left apexes onto its left
 * partner band's right apex (brought into this band's frame), then drop segments.
 * All snaps read complete paths, so drops happen last.
 */
export const adjustHexparquetAfterTiling = (
	bands: BandCutPattern[],
	tiledPatternConfig: TiledPatternConfig
): BandCutPattern[] => {
	const columns = tiledPatternConfig.config.columnCount || 1;
	const byIndex = new Map(bands.map((band) => [band.address.band, band]));

	const snapped = bands.map((band) => {
		const partner =
			band.leftPartnerBand === undefined ? undefined : byIndex.get(band.leftPartnerBand);
		if (band.error || !partner || partner.error || partner.facets.length !== band.facets.length) {
			return band;
		}
		return {
			...band,
			facets: band.facets.map((facet, f) => {
				const partnerFacet = partner.facets[f];
				if (!facet.quad || !partnerFacet.quad) return facet;
				const source = alignPrevBandPath(partnerFacet.path, partnerFacet.quad, facet.quad);
				const path = structuredClone(facet.path);
				replaceInPlace({ pairs: getHexparquetAcrossBandPairs(f, columns), target: path, source });
				return { ...facet, path };
			})
		};
	});

	return snapped.map((band) => {
		if (band.error) return band;
		const hasLeftPartner = band.leftPartnerBand !== undefined;
		return {
			...band,
			facets: band.facets.map((facet, f) => {
				const path = structuredClone(facet.path);
				removeInPlace({
					indices: getHexparquetDropIndices(f, columns, { hasLeftPartner }),
					target: path
				});
				return { ...facet, path };
			})
		};
	});
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit -- src/lib/patterns/__tests__/tiled-hexparquet-adjust.test.ts src/lib/patterns/__tests__/tiled-hexparquet-pattern.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/patterns/tiled-hexparquet-pattern.ts src/lib/patterns/__tests__/tiled-hexparquet-adjust.test.ts
git commit -m "feat(pattern): add hexparquet within-band and across-band adjusters"
```

---

### Task 9: Register hexparquet, default config, UI, end-to-end

**Files:**

- Modify: `src/lib/patterns/pattern-definitions.ts` (imports; entry after `'tiledAsanohaPattern-1'`)
- Modify: `src/lib/shades-config.ts` (entry after `'tiledAsanohaPattern-1'` in `tiledPatternConfigs`, ~line 395)
- Create: `src/lib/cut-pattern/collect-band-errors.ts`
- Modify: `src/components/cut-pattern/PatternViewer.svelte`
- Modify: `src/components/modal/editor/PatternView.svelte:331-341` (Rows control)
- Test: `src/lib/cut-pattern/__tests__/collect-band-errors.test.ts`, `src/lib/cut-pattern/__tests__/hexparquet-pattern.e2e.test.ts`

**Interfaces:**

- Consumes: everything from Tasks 5–8; `formatBandAddress` (`src/lib/cut-pattern/band-partner-info.ts`, returns e.g. `t2/b0`).
- Produces: `export const collectBandErrors: (patterns: unknown[]) => string[]`.

- [ ] **Step 1: Write the failing tests**

`src/lib/cut-pattern/__tests__/collect-band-errors.test.ts`:

```ts
import { collectBandErrors } from '../collect-band-errors';

const pattern = (bands: { band: number; error?: string }[]) => ({
	type: 'SuperGlobuleProjectionCutPattern',
	projectionCutPattern: {
		tubes: [
			{ bands: bands.map(({ band, error }) => ({ address: { globule: 0, tube: 2, band }, error })) }
		]
	}
});

describe('collectBandErrors', () => {
	it('lists every errored band with its address', () => {
		expect(
			collectBandErrors([pattern([{ band: 0, error: 'bad' }, { band: 1 }]), undefined])
		).toEqual(['t2/b0: bad']);
	});

	it('ignores results that are not projection cut patterns', () => {
		expect(collectBandErrors([{ type: 'SuperGlobuleProjectionPanelPattern' }, undefined])).toEqual(
			[]
		);
	});
});
```

`src/lib/cut-pattern/__tests__/hexparquet-pattern.e2e.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import { generateProjectionPattern } from '../generate-pattern';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig,
	tiledPatternConfigs
} from '$lib/shades-config';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';

describe('hexparquet end to end (globule tubes)', () => {
	it('patterns every band or refuses it with an error', () => {
		const superGlobule = generateSuperGlobule(generateDefaultSuperGlobuleConfig(), {
			globule: false,
			globuleTube: true,
			projection: false,
			voronoi: false
		});
		const patternConfig = generateDefaultGlobulePatternConfig();
		patternConfig.patternTypeConfig = { ...tiledPatternConfigs['tiledHexparquetPattern-0'] };
		const pattern = generateProjectionPattern(
			superGlobule.globuleTubes,
			'super-1',
			patternConfig,
			patternConfig.patternViewConfig.range
		) as SuperGlobuleProjectionCutPattern;

		const bands = pattern.projectionCutPattern.tubes.flatMap((t) => t.bands);
		expect(bands.length).toBeGreaterThan(0);
		for (const band of bands) {
			if (band.error) {
				expect(band.facets).toEqual([]);
				expect(band.error).toMatch(/divisible by 3/);
			} else {
				expect(band.facets.length % 3).toBe(0);
				expect(band.svgPath).toEqual(expect.any(String));
			}
		}
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/collect-band-errors.test.ts src/lib/cut-pattern/__tests__/hexparquet-pattern.e2e.test.ts`
Expected: FAIL — missing module `../collect-band-errors`; `tiledPatternConfigs['tiledHexparquetPattern-0']` undefined.

- [ ] **Step 3: Implement `collect-band-errors.ts`**

```ts
import type { BandCutPattern } from '$lib/types';
import { formatBandAddress } from './band-partner-info';

type MaybeProjectionCutPattern = {
	projectionCutPattern?: { tubes?: { bands?: BandCutPattern[] }[] };
};

/** Human-readable list of bands that could not be patterned, across all results. */
export const collectBandErrors = (patterns: unknown[]): string[] =>
	patterns.flatMap((pattern) =>
		((pattern as MaybeProjectionCutPattern | undefined)?.projectionCutPattern?.tubes ?? []).flatMap(
			(tube) =>
				(tube.bands ?? [])
					.filter((band) => band.error)
					.map((band) => `${formatBandAddress(band.address)}: ${band.error}`)
		)
	);
```

- [ ] **Step 4: Register the pattern**

In `src/lib/patterns/pattern-definitions.ts` add the import:

```ts
import {
	HEXPARQUET_SUBUNIT_COUNT,
	adjustHexparquetAfterMapping,
	adjustHexparquetAfterTiling,
	generateHexparquetPreview,
	generateHexparquetSubunits
} from './tiled-hexparquet-pattern';
```

and add after the `'tiledAsanohaPattern-1'` entry:

```ts
	'tiledHexparquetPattern-0': {
		subunitCount: HEXPARQUET_SUBUNIT_COUNT,
		// The single-unit form is the preview (all subunits stacked into one quad).
		getPattern: (_rows: number, columns: number) => generateHexparquetPreview(columns),
		getSubunitPatterns: (columns: number) => generateHexparquetSubunits(columns),
		tagAnchor: { facetIndex: 0, quadEdge: { edge: 'ab', position: 'midPoint' } },
		adjustAfterMapping: (
			patternBand: PathSegment[][],
			quadBand: Quadrilateral[],
			tiledPatternConfig: TiledPatternConfig
		) => adjustHexparquetAfterMapping(patternBand, quadBand, tiledPatternConfig),
		adjustAfterTiling: (bands: BandCutPattern[], tiledPatternConfig: TiledPatternConfig) =>
			adjustHexparquetAfterTiling(bands, tiledPatternConfig),
		adjustAfterTilingNeedsEndPartners: false
	},
```

(add `BandCutPattern` to the `$lib/types` type import).

- [ ] **Step 5: Default config**

In `src/lib/shades-config.ts`, after the `'tiledAsanohaPattern-1'` entry of `tiledPatternConfigs`:

```ts
	'tiledHexparquetPattern-0': {
		type: 'tiledHexparquetPattern-0',
		tiling: 'quadrilateral',
		config: {
			rowCount: 1,
			columnCount: 1,
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 3,
			endsMatched: false,
			endsTrimmed: false,
			endLooped: 0,
			scaleConfig: defaultScaleConfig
		}
	},
```

- [ ] **Step 6: Run the tests**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/collect-band-errors.test.ts src/lib/cut-pattern/__tests__/hexparquet-pattern.e2e.test.ts`
Expected: PASS.

- [ ] **Step 7: Hide the Rows control for hexparquet**

In `src/components/modal/editor/PatternView.svelte`, wrap the Rows `LabeledControl` (lines 332–341) — not the Columns one — in:

```svelte
{#if patternTypeConfig.type !== 'tiledHexparquetPattern-0'}
	<!-- existing Rows LabeledControl, unchanged -->
{/if}
```

- [ ] **Step 8: Error banner in `PatternViewer.svelte`**

Read `src/components/cut-pattern/PatternViewer.svelte` first. It reads `$superGlobulePatternStore.globuleTubePattern`, `.projectionPattern`, `.surfaceProjectionPattern`, `.voronoiPattern`, `.voronoiSurfacePattern` (lines 35–39). In the `<script>`:

```ts
import { collectBandErrors } from '$lib/cut-pattern/collect-band-errors';

const bandErrors = $derived(
	collectBandErrors([
		$superGlobulePatternStore.globuleTubePattern,
		$superGlobulePatternStore.projectionPattern,
		$superGlobulePatternStore.surfaceProjectionPattern,
		$superGlobulePatternStore.voronoiPattern,
		$superGlobulePatternStore.voronoiSurfacePattern
	])
);
```

(If the component does not use runes — no `$props`/`$derived` anywhere — use `$: bandErrors = collectBandErrors([...])` instead.)

At the top of the component's markup (before the first `{#if $superGlobulePatternStore.projectionPattern …}` at ~line 62):

```svelte
{#if bandErrors.length}
	<div class="band-errors" role="alert">
		<strong>{bandErrors.length} band{bandErrors.length === 1 ? '' : 's'} not patterned</strong>
		<ul>
			{#each bandErrors as message}
				<li>{message}</li>
			{/each}
		</ul>
	</div>
{/if}
```

and in its `<style>` block (create one if absent):

```css
.band-errors {
	padding: 0.5rem 0.75rem;
	margin-bottom: 0.5rem;
	border: 1px solid #c77;
	background: #fdf1f1;
	color: #822;
	font-size: 0.85rem;
}
.band-errors ul {
	margin: 0.25rem 0 0;
	padding-left: 1.25rem;
}
```

- [ ] **Step 9: Full verification**

Run: `npm run test:unit`
Expected: PASS (all suites; no snapshot updated or failed).

Run: `npm run check 2>&1 | tail -3`
Expected: error count ≤ the Task 1 baseline.

Run: `npm run lint`
Expected: no new errors in files touched by this plan.

- [ ] **Step 10: Commit**

```bash
git add src/lib/patterns/pattern-definitions.ts src/lib/shades-config.ts src/lib/cut-pattern/collect-band-errors.ts src/lib/cut-pattern/__tests__/collect-band-errors.test.ts src/lib/cut-pattern/__tests__/hexparquet-pattern.e2e.test.ts src/components/cut-pattern/PatternViewer.svelte src/components/modal/editor/PatternView.svelte
git commit -m "feat(pattern): register the hexparquet tiled pattern"
```

---

### Task 10: Visual verification

Ben judges the pattern visually; this task produces the images, it does not gate on metrics.

- [ ] **Step 1: Export an SVG of real output**

Create a throwaway test at `src/lib/cut-pattern/__tests__/zz-hexparquet-export.test.ts` that builds the pattern exactly like the Task 9 e2e test (for `columnCount` 1 and 2), then writes one SVG per column count to the session scratchpad: `<svg xmlns="http://www.w3.org/2000/svg">` containing, for each of the first 3 non-errored bands, a `<g transform="translate(X,0)">` (X = 120 px per band) with each facet's `quad` as a light-grey polygon and the band's `svgPath` as `stroke="black" stroke-width="1" fill="none"`. Run it, open the files with `open -a "Affinity Designer 2" <file>`, then delete the throwaway test (`rm`, not git).

- [ ] **Step 2: Check in designer2**

The geometry is generated in a Web Worker and Vite does not rebuild it on reload: **restart** `npm run dev` before checking. Using the headless Playwright recipe (dev server on port 9776; script at repo root; target floaters by index in `nav .hover-button-container button`), select the hexparquet pattern on (a) a globule tube source and (b) a surface-projection source, and screenshot the pattern pane. Confirm: band 0 of an open surface projection keeps green's lower-left segment; other bands drop it; the error banner appears for bands whose quad count is not a multiple of 3.

- [ ] **Step 3: Report**

Hand the SVGs and screenshots to Ben. Do not change code based on your own visual judgement without his call.
