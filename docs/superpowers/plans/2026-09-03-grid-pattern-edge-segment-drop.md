# Grid Pattern Edge Segment Dropping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `tiledGridPattern-0` drop a regular subset of its outer-edge vertical line segments on bands that have an adjacent partner band along their long outer edge, so the seam between two bands is not drawn as a solid double line.

**Architecture:** The grid unit pattern is generated once per band and mapped element-wise onto every quad, so per-quad variation cannot live in the generator. Instead the generator additionally reports *where* its outer-edge verticals sit in the emitted `PathSegment[]`, and the existing (currently no-op) `adjustAfterMapping` hook filters those indices out of the mapped band. Band adjacency is read from the 3D facet meta graph via the existing `bandHasFreeSide` helper and passed into the hook as new band context.

**Tech Stack:** TypeScript, SvelteKit (Svelte 5 runes), Jest (`ts-jest`, ESM preset), Three.js. Unit tests live in `**/__tests__/**/*.test.ts`.

**Spec:** `docs/superpowers/specs/2026-09-03-grid-pattern-edge-segment-drop-design.md`

## Global Constraints

- Branch: `feat/grid-pattern-edge-segment-drop`. Do not merge, rebase, stash, or reset. Do not `git checkout` another branch.
- Run unit tests with `npm run test:unit -- <path>`. Run type checking with `npm run check`.
- `npm run check` has a **pre-existing baseline of roughly 434 errors**. That is CLEAN. Never expect zero. The regression signal is the total-count *diff*, not the absence of errors.
- Default the new feature **off**: `dropEdgeSegments: false`. Existing saved configs and current visual output must be unchanged until the toggle is turned on.
- Only `tiledGridPattern-0` is in scope. Do not change asanoha, panel, carnation, bowtie, branched, or tesselation (shield/hex/box) behaviour.
- `src/components/controls/TilingControl.svelte` is dead code — it is imported nowhere. Do not modify it.
- Geometry generation runs in a Web Worker. Vite will not rebuild the worker on reload; if you edit worker paths, restart the dev server.

## Domain Glossary

Read this before Task 1; the terms are used without explanation below.

- **Facet** — one triangle. **Band** — a strip of facets. **Quad** — a pair of adjacent triangles; the unit a tiled pattern maps onto. A band of `2n` facets yields `n` quads.
- **Unit pattern** — the `PathSegment[]` for a single quad, authored in a unit square (`size = 1`), subdivided into `rows` × `columns` cells.
- In the unit square, **y (rows) runs along the band**, quad to quad. **x (columns) runs across the band's width.** Column `columns - 1` sits on the band's **outer** long edge (the same side `tiled-asanoha-pattern.ts` calls `w6`).
- **Edge segment** — the vertical `['M', w, 0] → ['L', w, h]` pair emitted by a *last-column* unit. One pair per row, per quad. These are the only segments this feature removes.
- **`PathSegment`** — a tuple whose first element is an SVG path command letter: `['M', x, y]`, `['L', x, y]`, `['C', x0, y0, x1, y1, x2, y2]`, etc.

## The Rule

Index edge segments globally along the band, 0-based:

```
k = quadIndex * rows + r        // r is the row index within the quad
total = quadCount * rows
```

Drop the edge segment when `k` is odd, **except** when `k === total - 1` (the final row of the final quad).

Worked cases, all with `quadCount = 6`:

| rows | total | dropped `k` | reading |
| --- | --- | --- | --- |
| 1 | 6 | 1, 3 (5 exempt) | every other quad loses its single segment; the last quad never does |
| 2 | 12 | 1, 3, 5, 7, 9 (11 exempt) | exactly one per quad, always the *second* row; never a quad's first row |
| 3 | 18 | 1, 3, 5, 7, 9, 11, 13, 15 (17 exempt) | q0 loses row 1; q1 loses rows 0 and 2; q2 loses row 1; … |

`columns` never changes which `k` are dropped — it only changes *where* on the quad the dropped segment sits, because the edge segment is always in the last column.

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `src/lib/patterns/tiled-grid-pattern.ts` | Modify | Generator emits an index map alongside the path; hosts the pure selection rule and the band adjuster. All feature logic lives here. |
| `src/lib/patterns/__tests__/tiled-grid-pattern.test.ts` | Create | Unit tests for the index map, the selection rule, and the adjuster. |
| `src/lib/types.ts` | Modify | `dropEdgeSegments?: boolean` on `TiledPatternConfig['config']`; fifth `bandContext` parameter on `UnitPatternGenerator['adjustAfterMapping']`. |
| `src/lib/cut-pattern/generate-tiled-pattern.ts` | Modify | Compute band adjacency once and pass it into `adjustAfterMapping`. |
| `src/lib/patterns/pattern-definitions.ts` | Modify | Forward `bandContext` to the grid adjuster; follow the rename. |
| `src/lib/shades-config.ts` | Modify | Default `dropEdgeSegments: false` for `tiledGridPattern-0`. |
| `src/components/modal/editor/PatternView.svelte` | Modify | Checkbox, shown only for the grid pattern type. |

---

### Task 1: Generator emits an outer-edge index map

The generator assembles its path from three separately accumulated groups and concatenates at the end, so absolute indices are only knowable at concat time. Record offsets during the same loop that pushes the segments — a second function that re-derived the layout would silently drift from the generator.

**Files:**
- Modify: `src/lib/patterns/tiled-grid-pattern.ts:74-108` (`generateGridPattern`)
- Test: `src/lib/patterns/__tests__/tiled-grid-pattern.test.ts` (create)

**Interfaces:**
- Consumes: `generateUnit`, `translatePS`, `Props`, `GridVariant`, `PathSegment` — all already present in the file.
- Produces:
  - `generateGridPatternWithMeta(props: Props): { path: PathSegment[]; outerEdgeSegmentIndices: number[][] }` — `outerEdgeSegmentIndices[r]` is `[moveIndex, lineIndex]` into `path` for row `r`'s last-column outer vertical. Length always equals `rows`.
  - `getDroppedEdgeSegmentKeys(rows: number, quadCount: number): Set<number>` — the set of global `k` to drop.
  - `generateGridPattern` keeps its existing signature and behaviour, now a wrapper.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/patterns/__tests__/tiled-grid-pattern.test.ts`:

```ts
import type { GridVariant, PathSegment } from '$lib/types';
import {
	generateGridPattern,
	generateGridPatternWithMeta,
	getDroppedEdgeSegmentKeys
} from '../tiled-grid-pattern';

const VARIANTS: GridVariant[] = ['rect', 'triangle-0', 'triangle-1'];
const SIZE = 1;

describe('generateGridPatternWithMeta', () => {
	it('produces the same path as generateGridPattern', () => {
		for (const variant of VARIANTS) {
			for (const rows of [1, 2, 3]) {
				for (const columns of [1, 2, 3]) {
					const { path } = generateGridPatternWithMeta({ size: SIZE, rows, columns, variant });
					expect(path).toEqual(generateGridPattern({ size: SIZE, rows, columns, variant }));
				}
			}
		}
	});

	it('reports one [M, L] index pair per row', () => {
		for (const variant of VARIANTS) {
			for (const rows of [1, 2, 3]) {
				for (const columns of [1, 2, 3]) {
					const { outerEdgeSegmentIndices } = generateGridPatternWithMeta({
						size: SIZE,
						rows,
						columns,
						variant
					});
					expect(outerEdgeSegmentIndices).toHaveLength(rows);
					for (const pair of outerEdgeSegmentIndices) {
						expect(pair).toHaveLength(2);
					}
				}
			}
		}
	});

	it('indexes a vertical segment on the outer edge (x === size) at the row height', () => {
		for (const variant of VARIANTS) {
			for (const rows of [1, 2, 3]) {
				for (const columns of [1, 2, 3]) {
					const { path, outerEdgeSegmentIndices } = generateGridPatternWithMeta({
						size: SIZE,
						rows,
						columns,
						variant
					});
					const rowHeight = SIZE / rows;
					outerEdgeSegmentIndices.forEach(([moveIndex, lineIndex], r) => {
						const move = path[moveIndex] as PathSegment;
						const line = path[lineIndex] as PathSegment;
						expect(move[0]).toBe('M');
						expect(line[0]).toBe('L');
						// Both endpoints sit on the outer edge of the unit square.
						expect(move[1] as number).toBeCloseTo(SIZE);
						expect(line[1] as number).toBeCloseTo(SIZE);
						// The pair spans exactly row r.
						expect(move[2] as number).toBeCloseTo(rowHeight * r);
						expect(line[2] as number).toBeCloseTo(rowHeight * (r + 1));
					});
				}
			}
		}
	});

	it('reports distinct indices across rows', () => {
		const { outerEdgeSegmentIndices } = generateGridPatternWithMeta({
			size: SIZE,
			rows: 3,
			columns: 2,
			variant: 'rect'
		});
		const flat = outerEdgeSegmentIndices.flat();
		expect(new Set(flat).size).toBe(flat.length);
	});
});

describe('getDroppedEdgeSegmentKeys', () => {
	it('drops every other quad, never the last, for 1 row', () => {
		expect([...getDroppedEdgeSegmentKeys(1, 6)].sort((a, b) => a - b)).toEqual([1, 3]);
	});

	it('drops exactly one per quad, always the second row, for 2 rows', () => {
		expect([...getDroppedEdgeSegmentKeys(2, 6)].sort((a, b) => a - b)).toEqual([
			1, 3, 5, 7, 9
		]);
	});

	it('alternates 1 / 2 drops per quad for 3 rows', () => {
		expect([...getDroppedEdgeSegmentKeys(3, 6)].sort((a, b) => a - b)).toEqual([
			1, 3, 5, 7, 9, 11, 13, 15
		]);
	});

	it('exempts the final row of the final quad', () => {
		expect(getDroppedEdgeSegmentKeys(1, 6).has(5)).toBe(false);
		expect(getDroppedEdgeSegmentKeys(2, 6).has(11)).toBe(false);
		expect(getDroppedEdgeSegmentKeys(3, 6).has(17)).toBe(false);
	});

	it('never drops the first row of a quad when rows === 2', () => {
		for (const k of getDroppedEdgeSegmentKeys(2, 6)) {
			expect(k % 2).toBe(1); // r = k % rows = 1, i.e. the second row
		}
	});

	it('returns an empty set for a single-quad band', () => {
		expect(getDroppedEdgeSegmentKeys(1, 1).size).toBe(0);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- src/lib/patterns/__tests__/tiled-grid-pattern.test.ts`
Expected: FAIL — `generateGridPatternWithMeta` and `getDroppedEdgeSegmentKeys` are not exported from `../tiled-grid-pattern`.

- [ ] **Step 3: Refactor the generator and add the selection rule**

In `src/lib/patterns/tiled-grid-pattern.ts`, replace the whole `generateGridPattern` function with the following. Note the middle-row branch is split from one `push` into three so the offset can be captured immediately before the `middle` group goes in — the emitted order (start, middle, end) is unchanged.

```ts
export type GridPatternMeta = {
	path: PathSegment[];
	/**
	 * One `[moveIndex, lineIndex]` pair per row, in row order, addressing the
	 * LAST column's outer-edge vertical within `path`. Length always equals `rows`.
	 */
	outerEdgeSegmentIndices: number[][];
};

/**
 * Offset of the outer vertical's [M, L] pair within a unit's `middle` group.
 * `rect` middle is [M 0,0][L 0,h][M w,0][L w,h]; the triangle variants insert
 * the diagonal's two segments before the outer pair.
 */
const outerPairOffsetInMiddle = (variant: GridVariant): number => (variant === 'rect' ? 2 : 4);

export const generateGridPatternWithMeta = ({
	size,
	rows,
	columns,
	variant
}: Props): GridPatternMeta => {
	const row = size / rows;
	const col = size / columns;
	const h = row;
	const w = col;

	const startSegments: PathSegment[] = [];
	const middleSegments: PathSegment[] = [];
	const endSegments: PathSegment[] = [];

	// Offsets into `middleSegments`, resolved to absolute path indices after concat.
	const outerOffsets: number[][] = [];
	const outerOffset = outerPairOffsetInMiddle(variant);

	for (let c = 0; c < columns; c++) {
		const isLastColumn = c === columns - 1;
		for (let r = 0; r < rows; r++) {
			const unit = generateUnit(isLastColumn, w, h, variant);
			if (r > 0 && r < rows - 1) {
				middleSegments.push(...translatePS(unit.start, col * c, row * r));
				const base = middleSegments.length;
				middleSegments.push(...translatePS(unit.middle, col * c, row * r));
				if (isLastColumn) outerOffsets[r] = [base + outerOffset, base + outerOffset + 1];
				middleSegments.push(...translatePS(unit.end, col * c, row * r));
				continue;
			}
			if (rows === 1) {
				startSegments.push(...translatePS(unit.start, col * c, row * r));
				endSegments.push(...translatePS(unit.end, col * c, row * r));
			} else if (r === 0) {
				middleSegments.push(...translatePS(unit.end, col * c, row * r));
				startSegments.push(...translatePS(unit.start, col * c, row * r));
			} else if (r === rows - 1) {
				middleSegments.push(...translatePS(unit.start, col * c, row * r));
				endSegments.push(...translatePS(unit.end, col * c, row * r));
			}
			const base = middleSegments.length;
			middleSegments.push(...translatePS(unit.middle, col * c, row * r));
			if (isLastColumn) outerOffsets[r] = [base + outerOffset, base + outerOffset + 1];
		}
	}

	const shift = startSegments.length;
	return {
		path: [...startSegments, ...middleSegments, ...endSegments],
		outerEdgeSegmentIndices: outerOffsets.map(([m, l]) => [m + shift, l + shift])
	};
};

export const generateGridPattern = (props: Props): PathSegment[] =>
	generateGridPatternWithMeta(props).path;

/**
 * Which outer-edge segments a band drops, keyed by global row index
 * `k = quadIndex * rows + r`. Odd `k` are dropped, except the final row of the
 * final quad, which always stays so the band's far end reads as closed.
 */
export const getDroppedEdgeSegmentKeys = (rows: number, quadCount: number): Set<number> => {
	const total = rows * quadCount;
	const dropped = new Set<number>();
	for (let k = 1; k < total; k += 2) {
		if (k === total - 1) continue;
		dropped.add(k);
	}
	return dropped;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- src/lib/patterns/__tests__/tiled-grid-pattern.test.ts`
Expected: PASS, all cases in both `describe` blocks.

- [ ] **Step 5: Format and commit**

```bash
npm run format
git add src/lib/patterns/tiled-grid-pattern.ts src/lib/patterns/__tests__/tiled-grid-pattern.test.ts
git commit -m "feat(grid-pattern): report outer-edge segment indices and drop selection"
```

---

### Task 2: The band adjuster

`adjustRectPatternAfterTiling` is a no-op passthrough today. It becomes the place the drop actually happens. This is index-safe because `transformPatternByQuad` maps segments element-wise (a unit index is still valid on the mapped path) and because `adjustAfterMapping` runs immediately after mapping, before `endsTrimmed` handling, `adjustAfterTiling`, stroke width, or SVG string generation.

**Files:**
- Modify: `src/lib/patterns/tiled-grid-pattern.ts:110-116` (`adjustRectPatternAfterTiling`)
- Test: `src/lib/patterns/__tests__/tiled-grid-pattern.test.ts` (append)

**Interfaces:**
- Consumes: `generateGridPatternWithMeta`, `getDroppedEdgeSegmentKeys` from Task 1.
- Produces: `adjustGridPatternAfterMapping(patternBand: PathSegment[][], quadBand: Quadrilateral[], tiledPatternConfig: TiledPatternConfig, bandContext?: { hasOuterPartner: boolean; bandIndex: number }): PathSegment[][]`. The old name `adjustRectPatternAfterTiling` is removed; Task 3 updates its only caller.
- Note: `tiledPatternConfig.config.dropEdgeSegments` does not exist on the type yet. Task 3 adds it. Until then read it through a local widening cast, exactly as written below, so this task compiles on its own.

- [ ] **Step 1: Write the failing tests**

Extend the **existing** import statements at the top of `src/lib/patterns/__tests__/tiled-grid-pattern.test.ts` — do not add a second import block lower down:

```ts
import type { GridVariant, PathSegment, Quadrilateral, TiledPatternConfig } from '$lib/types';
import {
	adjustGridPatternAfterMapping,
	generateGridPattern,
	generateGridPatternWithMeta,
	getDroppedEdgeSegmentKeys
} from '../tiled-grid-pattern';
```

Then append to the same file:

```ts
const makeConfig = (
	rows: number,
	columns: number,
	variant: GridVariant,
	dropEdgeSegments: boolean
): TiledPatternConfig =>
	({
		type: 'tiledGridPattern-0',
		tiling: 'quadrilateral',
		config: {
			rowCount: rows,
			columnCount: columns,
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 3,
			endsMatched: false,
			endsTrimmed: true,
			endLooped: 0,
			variant,
			dropEdgeSegments,
			scaleConfig: { value: 1 }
		}
	}) as unknown as TiledPatternConfig;

/**
 * Stand-in for a mapped band: `transformPatternByQuad` maps element-wise, so an
 * untransformed copy of the unit path per quad has identical index structure.
 */
const makeBand = (quadCount: number, rows: number, columns: number, variant: GridVariant) =>
	Array.from(
		{ length: quadCount },
		() => generateGridPatternWithMeta({ size: 1, rows, columns, variant }).path
	);

const NO_QUADS: Quadrilateral[] = [];
const PARTNERED = { hasOuterPartner: true, bandIndex: 0 };

describe('adjustGridPatternAfterMapping', () => {
	it('is an identity when the flag is off', () => {
		const band = makeBand(6, 1, 1, 'rect');
		const result = adjustGridPatternAfterMapping(
			band,
			NO_QUADS,
			makeConfig(1, 1, 'rect', false),
			PARTNERED
		);
		expect(result).toEqual(band);
	});

	it('is an identity when the band has no outer partner', () => {
		const band = makeBand(6, 1, 1, 'rect');
		const result = adjustGridPatternAfterMapping(band, NO_QUADS, makeConfig(1, 1, 'rect', true), {
			hasOuterPartner: false,
			bandIndex: 3
		});
		expect(result).toEqual(band);
	});

	it('is an identity when no band context is supplied', () => {
		const band = makeBand(6, 1, 1, 'rect');
		expect(
			adjustGridPatternAfterMapping(band, NO_QUADS, makeConfig(1, 1, 'rect', true))
		).toEqual(band);
	});

	it('removes two segments from exactly the dropped quads at 1 row, 1 column', () => {
		const band = makeBand(6, 1, 1, 'rect');
		const before = band.map((facet) => facet.length);
		const result = adjustGridPatternAfterMapping(
			band,
			NO_QUADS,
			makeConfig(1, 1, 'rect', true),
			PARTNERED
		);
		const removed = result.map((facet, i) => before[i] - facet.length);
		// k = 1 and 3 are dropped; k = 5 (final quad) is exempt.
		expect(removed).toEqual([0, 2, 0, 2, 0, 0]);
	});

	it('removes one pair from every quad but the last at 2 rows, 2 columns', () => {
		const band = makeBand(6, 2, 2, 'rect');
		const before = band.map((facet) => facet.length);
		const result = adjustGridPatternAfterMapping(
			band,
			NO_QUADS,
			makeConfig(2, 2, 'rect', true),
			PARTNERED
		);
		expect(result.map((facet, i) => before[i] - facet.length)).toEqual([2, 2, 2, 2, 2, 0]);
	});

	it('alternates one and two pairs per quad at 3 rows, 2 columns', () => {
		const band = makeBand(6, 3, 2, 'rect');
		const before = band.map((facet) => facet.length);
		const result = adjustGridPatternAfterMapping(
			band,
			NO_QUADS,
			makeConfig(3, 2, 'rect', true),
			PARTNERED
		);
		// q0: k=1        -> 1 pair;  q1: k=3,5 -> 2 pairs;  q2: k=7 -> 1 pair;
		// q3: k=9,11     -> 2 pairs; q4: k=13  -> 1 pair;   q5: k=15 -> 1 pair (17 exempt).
		expect(result.map((facet, i) => before[i] - facet.length)).toEqual([2, 4, 2, 4, 2, 2]);
	});

	// Guards against collateral damage: the count assertions above pin down HOW MANY
	// segments go, this pins down that the survivors are the original path with
	// exactly the outer-edge indices removed, in their original order.
	it('removes exactly the expected indices and nothing else, for every variant', () => {
		for (const variant of VARIANTS) {
			const rows = 3;
			const columns = 2;
			const quadCount = 6;
			const { path, outerEdgeSegmentIndices } = generateGridPatternWithMeta({
				size: 1,
				rows,
				columns,
				variant
			});
			const dropped = getDroppedEdgeSegmentKeys(rows, quadCount);
			const result = adjustGridPatternAfterMapping(
				makeBand(quadCount, rows, columns, variant),
				NO_QUADS,
				makeConfig(rows, columns, variant, true),
				PARTNERED
			);
			result.forEach((facet, quadIndex) => {
				const remove = new Set<number>();
				for (let r = 0; r < rows; r++) {
					if (!dropped.has(quadIndex * rows + r)) continue;
					remove.add(outerEdgeSegmentIndices[r][0]);
					remove.add(outerEdgeSegmentIndices[r][1]);
				}
				expect(facet).toEqual(path.filter((_, index) => !remove.has(index)));
			});
		}
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- src/lib/patterns/__tests__/tiled-grid-pattern.test.ts`
Expected: FAIL — `adjustGridPatternAfterMapping` is not exported.

- [ ] **Step 3: Replace the no-op adjuster**

In `src/lib/patterns/tiled-grid-pattern.ts`, delete `adjustRectPatternAfterTiling` entirely and add:

```ts
export type GridBandContext = {
	/** True when this band's outer long edge borders another band. */
	hasOuterPartner: boolean;
	bandIndex: number;
};

/**
 * Band-level modification: where two bands meet along their long edges, the band
 * on the inner side of the seam drops a regular subset of its outer-edge
 * verticals so the seam does not read as a solid double line.
 *
 * A band only ever drops on its OWN outer side, which faces the higher-index
 * neighbour — so "the lower-index band drops" falls out without a comparison.
 * Bands whose outer side borders open space (the last band of a surface
 * projection or surface voronoi tube) are left alone. Start and end partners are
 * never consulted.
 */
export const adjustGridPatternAfterMapping = (
	patternBand: PathSegment[][],
	quadBand: Quadrilateral[],
	tiledPatternConfig: TiledPatternConfig,
	bandContext?: GridBandContext
): PathSegment[][] => {
	const config = tiledPatternConfig.config as typeof tiledPatternConfig.config & {
		dropEdgeSegments?: boolean;
	};
	if (!config.dropEdgeSegments || !bandContext?.hasOuterPartner) return patternBand;

	const rows = config.rowCount || 1;
	const columns = config.columnCount || 1;
	const { outerEdgeSegmentIndices } = generateGridPatternWithMeta({
		size: 1,
		rows,
		columns,
		variant: config.variant ?? 'rect'
	});
	const dropped = getDroppedEdgeSegmentKeys(rows, patternBand.length);

	return patternBand.map((facetPath, quadIndex) => {
		const remove = new Set<number>();
		for (let r = 0; r < rows; r++) {
			if (!dropped.has(quadIndex * rows + r)) continue;
			const pair = outerEdgeSegmentIndices[r];
			if (!pair) continue;
			remove.add(pair[0]);
			remove.add(pair[1]);
		}
		if (remove.size === 0) return facetPath;
		return facetPath.filter((_, index) => !remove.has(index));
	});
};
```

The file already imports `PathSegment`, `Quadrilateral`, `TiledPatternConfig` and `GridVariant` from `$lib/types` — no import changes are needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- src/lib/patterns/__tests__/tiled-grid-pattern.test.ts`
Expected: PASS. Task 1's tests must still pass too.

- [ ] **Step 5: Format and commit**

```bash
npm run format
git add src/lib/patterns/tiled-grid-pattern.ts src/lib/patterns/__tests__/tiled-grid-pattern.test.ts
git commit -m "feat(grid-pattern): drop outer-edge segments on bands with an outer partner"
```

---

### Task 3: Wire up config, band context, and the pattern entry

Nothing calls the new adjuster yet, and `adjustAfterMapping` has no way to learn about band adjacency. This task connects them.

**Files:**
- Modify: `src/lib/types.ts:147-152` (`UnitPatternGenerator.adjustAfterMapping`) and `src/lib/types.ts:664-687` (`TiledPatternConfig`)
- Modify: `src/lib/cut-pattern/generate-tiled-pattern.ts:220-275` (inside `generateTiling`)
- Modify: `src/lib/patterns/pattern-definitions.ts:91-107` (the `tiledGridPattern-0` entry)
- Modify: `src/lib/shades-config.ts:316-332` (the `tiledGridPattern-0` default config)

**Interfaces:**
- Consumes: `adjustGridPatternAfterMapping`, `GridBandContext` from Task 2; `bandHasFreeSide` (already private in `generate-tiled-pattern.ts:44-50`).
- Produces: `tiledPatternConfig.config.dropEdgeSegments?: boolean` is now a real typed field, so the widening cast added in Task 2 becomes redundant but harmless — leave it, it keeps the adjuster independently testable.

- [ ] **Step 1: Add the config field and widen the hook signature**

In `src/lib/types.ts`, inside `TiledPatternConfig['config']`, add after `variant?: GridVariant;`:

```ts
		/**
		 * Grid pattern only. When true, bands whose outer long edge borders another
		 * band drop a regular subset of their outer-edge verticals, so the seam
		 * between adjacent bands is not drawn twice. See
		 * `adjustGridPatternAfterMapping`.
		 */
		dropEdgeSegments?: boolean;
```

In the same file, replace the `adjustAfterMapping` member of `UnitPatternGenerator` with:

```ts
	adjustAfterMapping?: (
		patternBand: PathSegment[][],
		quadBand: Quadrilateral[],
		tiledPatternConfig: TiledPatternConfig,
		finishOuterEdge?: boolean,
		bandContext?: { hasOuterPartner: boolean; bandIndex: number }
	) => PathSegment[][];
```

- [ ] **Step 2: Pass band context from `generateTiling`**

In `src/lib/cut-pattern/generate-tiled-pattern.ts`, inside the `quadBands.map((quadBand, bandIndex) => {...})` callback, replace the single `const finishOuterEdge = ...` statement with:

```ts
		// `bands` is absent on the `generateTiledBandPattern` call path; treat a
		// missing band as having a free side (no outer partner) rather than throwing.
		const sourceBand = bands?.[bandIndex];
		const hasFreeSide = sourceBand ? bandHasFreeSide(sourceBand) : true;
		const finishOuterEdge = bandIndex + bandIndexOffset === bandCount - 1 && hasFreeSide;
		const bandContext = {
			hasOuterPartner: !hasFreeSide,
			bandIndex: bandIndex + bandIndexOffset
		};
```

Keep the existing explanatory comment block above it. Do **not** rename the later `const band = bands[bandIndex];` inside the same callback — `sourceBand` is deliberately a distinct name to avoid colliding with it.

Then extend the adjuster call a few lines below:

```ts
		if (adjustAfterMapping) {
			adjustedPatternBand = adjustAfterMapping(
				mappedPatternBand,
				quadBand,
				tiledPatternConfig,
				finishOuterEdge,
				bandContext
			);
		} else {
```

- [ ] **Step 3: Point the grid pattern entry at the new adjuster**

In `src/lib/patterns/pattern-definitions.ts`, change the import:

```ts
import { generateGridPattern, adjustGridPatternAfterMapping } from './tiled-grid-pattern';
```

and replace the `adjustAfterMapping` member of the `'tiledGridPattern-0'` entry with:

```ts
		adjustAfterMapping: (
			patternBand: PathSegment[][],
			quadBand: Quadrilateral[],
			tiledPatternConfig: TiledPatternConfig,
			_finishOuterEdge?: boolean,
			bandContext?: { hasOuterPartner: boolean; bandIndex: number }
		) => adjustGridPatternAfterMapping(patternBand, quadBand, tiledPatternConfig, bandContext)
```

- [ ] **Step 4: Add the default**

In `src/lib/shades-config.ts`, in the `'tiledGridPattern-0'` entry's `config` object, add after `variant: 'rect',`:

```ts
			dropEdgeSegments: false,
```

- [ ] **Step 5: Verify tests and type checking**

```bash
npm run test:unit -- src/lib/patterns/__tests__/tiled-grid-pattern.test.ts
npm run check 2>&1 | tail -5
```

Expected: unit tests PASS. `npm run check` reports **roughly 434 errors — that is the clean baseline, not a failure**. Compare the total against a baseline captured on the previous commit:

```bash
git stash list  # must be empty; do not stash
npm run check 2>&1 | tail -3
```

If the count rose, the new errors are yours — fix them. If it is unchanged or lower, proceed.

- [ ] **Step 6: Run the full unit suite for regressions**

Run: `npm run test:unit`
Expected: no test that passed before this branch now fails. Widening a function signature with an optional parameter and adding an optional config field are both non-breaking; any failure here is a real regression.

- [ ] **Step 7: Format and commit**

```bash
npm run format
git add src/lib/types.ts src/lib/cut-pattern/generate-tiled-pattern.ts src/lib/patterns/pattern-definitions.ts src/lib/shades-config.ts
git commit -m "feat(grid-pattern): plumb band adjacency and the dropEdgeSegments config"
```

---

### Task 4: UI toggle and visual verification

The feature is now reachable in code but not from the app. `src/components/controls/TilingControl.svelte` is dead — the Pattern View floater absorbed it — so `PatternView.svelte` is the only UI surface.

**Files:**
- Modify: `src/components/modal/editor/PatternView.svelte` (the tiled-config `Container`, immediately after the "Trim Ends" control)

**Interfaces:**
- Consumes: `patternTypeConfig` (`$derived($patternConfigStore.patternTypeConfig)`, line 22), `inner` (`$derived(patternTypeConfig.config)`, line 31), and `setInner(patch: Record<string, unknown>)` (line 40) — all already in scope in this component.
- Produces: nothing consumed by later tasks. This is the final task.

- [ ] **Step 1: Add the checkbox**

In `src/components/modal/editor/PatternView.svelte`, directly after the `<LabeledControl label="Trim Ends">` block and before `<LabeledControl label="Loop Ends">`, insert:

```svelte
					{#if patternTypeConfig.type === 'tiledGridPattern-0'}
						<LabeledControl label="Drop Edge Segments">
							<input
								type="checkbox"
								checked={!!inner.dropEdgeSegments}
								onchange={(event) =>
									setInner({
										dropEdgeSegments: (event.currentTarget as HTMLInputElement).checked
									})}
							/>
						</LabeledControl>
					{/if}
```

Match the surrounding indentation exactly — the sibling controls sit at five tabs.

- [ ] **Step 2: Type-check**

Run: `npm run check 2>&1 | tail -5`
Expected: total error count unchanged from Task 3 (still around the 434 baseline).

- [ ] **Step 3: Verify visually in the running app**

The Chrome extension is unavailable in this environment. Use the headless Playwright recipe:

```bash
npm run dev   # serves on http://localhost:9775
```

Write a throwaway script **at the repo root** (so it can resolve `@playwright/test`), e.g. `verify-grid-drop.mjs`:

```js
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
await page.goto('http://localhost:9775/designer2', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.screenshot({ path: 'grid-drop-before.png', fullPage: false });
await browser.close();
```

Run it with `node verify-grid-drop.mjs`. Note: the HoverSidebar rail renders its titles as split letters (`"C rossS ection"`), so target floaters by index into `nav .hover-button-container button` — index 0 is the showMode toggle — **not** by visible text.

Capture the pattern view with `dropEdgeSegments` off, then toggle it on and capture again.

- [ ] **Step 4: Confirm the drops land on the correct side**

Compare the two screenshots. What to look for:

- Segments disappear along **one** long edge of each band, alternating down the band, with the very last one at the band's far end still present.
- The last band of a surface projection or surface voronoi tube is untouched.
- Nothing changes on horizontal (cross-band) lines, interior column verticals, or the triangle-variant diagonals.

**If the drops land on the wrong long edge**, the fix is a side flip in `outerPairOffsetInMiddle` / the recording branch in `generateGridPatternWithMeta` — record column `0`'s verticals (offsets 0 and 1 within `middle`) instead of the last column's, possibly conditioned on the band's `sideOrientation`. That is a localised change; do **not** redesign. Report the finding before changing it.

- [ ] **Step 5: Clean up and commit**

```bash
rm -f verify-grid-drop.mjs grid-drop-before.png grid-drop-after.png
npm run format
git add src/components/modal/editor/PatternView.svelte
git commit -m "feat(grid-pattern): add the Drop Edge Segments toggle to Pattern View"
```

- [ ] **Step 6: Push the branch**

```bash
git push -u origin feat/grid-pattern-edge-segment-drop
```
