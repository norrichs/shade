# Tiled Pattern Editor Phase 6: Hex + Box Spec Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork `tiled-hex-pattern.ts` and `tiled-box-pattern.ts` into the spec-driven `tesselation/` structure used by shield, register both in `pattern-registry.ts`, then delete the originals.

**Architecture:** Each pattern gets a `src/lib/patterns/tesselation/{hex,box}/` directory with `default-spec.ts`, `generator.ts`, `adjuster.ts` (hex only — box has no adjustment logic), `helpers.ts` (hex only — box has no helpers), `index.ts`, and a snapshot test. The spec IDs match the existing dispatch keys (`tiledHexPattern-1`, `tiledBoxPattern-0`) so `pattern-definitions.ts` and `shades-config.ts` need no data changes — only the internal wiring of `pattern-definitions.ts` changes.

**Tech Stack:** TypeScript, Jest (unit/snapshot tests), SvelteKit — same as phases 1-5.

---

## Key findings from reading the existing files

**Hex (`src/lib/patterns/tiled-hex-pattern.ts`):**

- Exports `generateHexPattern(rows, columns, { variant?, size, adjustEnds? })` — builds segments from derived constants (`row`, `col`, `h`, `w`) with a per-column `unitPattern()` closure that knows whether it's the last column.
- Exports `adjustHexPatternAfterTiling(patternBand, quadBand, tiledPatternConfig)` — substantial adjustment logic: handles `endLooped`, `endsMatched`, `endsTrimmed`, and calls `straightenEndSegments` for every facet.
- Exports `straightenEndSegments` — used **only** by hex and a copy in `tiled-tristar-pattern.ts`; it is hex-specific enough to live in `helpers.ts`.
- `adjustAfterMapping` in `pattern-definitions.ts` (old-style, not `adjustAfterTiling`). The new registry uses `adjustAfterTiling`. **This migration must use `adjustAfterTiling`** (the `createPatternsEntry` closure that shield uses). The old `adjustAfterMapping` path (`generate-tiled-pattern.ts:206`) is called with signature `(patternBand, quadBand, tiledPatternConfig)` — the new `adjustAfterTiling` path is called with `(bands, tiledPatternConfig, tubes)`. The hex adjuster must be rewritten to the new signature — it currently does NOT need `tubes` (no partner matching), so this is a straightforward wrapping change.
- The `size` parameter is always passed as `1` from `pattern-definitions.ts`; `variant` is always `1` for the registered entry. Both stay hardcoded in `createPatternsEntry`.
- Unit dimensions for the spec: `width = col` and `height = row` vary per invocation — hex computes them _inside_ the generator dynamically from `size`, `rows`, and `columns`. The spec `unit.width` / `unit.height` fields are therefore nominal constants used only by the shield-style `buildUnit` scaler. Hex does not use that scaler — it keeps its own internal math. Set `width: 1` and `height: 1` as canonical placeholders; the generator ignores them.
- `unit.start`, `unit.middle`, `unit.end` in the hex spec are empty arrays — the hex generator builds segments procedurally from `size`/`rows`/`columns`, not from a static point list. The `UnitDefinition` is still required by the type but the content is unused by the generator.

**Box (`src/lib/patterns/tiled-box-pattern.ts`):**

- Exports only `generateBoxPattern({ size?, height?, width? })` — 50 lines, fully procedural, no adjustment logic whatsoever.
- No helpers, no adjuster.
- `pattern-definitions.ts` registers it with no `adjustAfterMapping` or `adjustAfterTiling` at all. The new registry entry also omits `adjustAfterTiling`.
- Same `unit.start/middle/end` situation as hex: empty arrays, generator is fully procedural.

**`pattern-definitions.ts` wiring:**

- After migration, the `tiledHexPattern-1` and `tiledBoxPattern-0` entries in the `patterns` object are **deleted** — the `builtInPatternsEntries` loop at the top (lines 28-32) will populate them automatically via the registry.
- The `adjustAfterMapping` in the hex entry (old-style) disappears; the new hook is `adjustAfterTiling` inside `createPatternsEntry`.

**Imports to update after deletion:**

- `src/lib/patterns/pattern-definitions.ts` — remove the two direct imports.
- `src/lib/patterns/index.ts` — remove the two `export *` lines.

---

## File map

| Action | Path                                                          |
| ------ | ------------------------------------------------------------- |
| Create | `src/lib/patterns/tesselation/hex/default-spec.ts`            |
| Create | `src/lib/patterns/tesselation/hex/generator.ts`               |
| Create | `src/lib/patterns/tesselation/hex/adjuster.ts`                |
| Create | `src/lib/patterns/tesselation/hex/helpers.ts`                 |
| Create | `src/lib/patterns/tesselation/hex/index.ts`                   |
| Create | `src/lib/patterns/tesselation/hex/__tests__/snapshot.test.ts` |
| Create | `src/lib/patterns/tesselation/box/default-spec.ts`            |
| Create | `src/lib/patterns/tesselation/box/generator.ts`               |
| Create | `src/lib/patterns/tesselation/box/index.ts`                   |
| Create | `src/lib/patterns/tesselation/box/__tests__/snapshot.test.ts` |
| Modify | `src/lib/patterns/pattern-registry.ts`                        |
| Modify | `src/lib/patterns/pattern-definitions.ts`                     |
| Modify | `src/lib/patterns/index.ts`                                   |
| Delete | `src/lib/patterns/tiled-hex-pattern.ts`                       |
| Delete | `src/lib/patterns/tiled-box-pattern.ts`                       |

---

### Task 1: Capture hex pre-fork snapshot fixture

**Files:**

- Create: `src/lib/patterns/tesselation/hex/__tests__/snapshot.test.ts`

The snapshot test must be written against the **current** `generateHexPattern` and `adjustHexPatternAfterTiling` exports before any refactoring. Run it once to capture the `.snap` file. The post-fork test (Task 5) replaces the imports but keeps the same cases — Jest will assert byte-identical output.

- [ ] **Step 1: Create the test directory**

```bash
mkdir -p src/lib/patterns/tesselation/hex/__tests__
```

- [ ] **Step 2: Write the snapshot test against the current (pre-fork) exports**

Create `src/lib/patterns/tesselation/hex/__tests__/snapshot.test.ts`:

```typescript
import { generateHexPattern, adjustHexPatternAfterTiling } from '../../../tiled-hex-pattern';
import type { TiledPatternConfig } from '$lib/types';

describe('hex generator snapshot', () => {
	const sizes = [1, 100];
	const rowsList = [1, 2, 3];
	const columnsList = [1, 2, 3, 5];

	for (const size of sizes) {
		for (const rows of rowsList) {
			for (const columns of columnsList) {
				it(`generateHexPattern size=${size} rows=${rows} columns=${columns}`, () => {
					const result = generateHexPattern(rows, columns, { size });
					expect(result).toMatchSnapshot();
				});
			}
		}
	}
});

describe('hex adjuster snapshot', () => {
	const makeConfig = (overrides: Partial<TiledPatternConfig['config']>): TiledPatternConfig => ({
		type: 'tiledHexPattern-1',
		tiling: 'quadrilateral',
		config: {
			rowCount: 1,
			columnCount: 1,
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 3,
			endsMatched: false,
			endsTrimmed: true,
			endLooped: 0,
			scaleConfig: {
				scaleType: 'quadWidth',
				scaleMin: 1,
				scaleMax: 3
			},
			...overrides
		}
	});

	it('adjuster with endsTrimmed=true rows=1 columns=1', () => {
		const rows = 1;
		const columns = 1;
		const config = makeConfig({ rowCount: rows, columnCount: columns });
		const patternBand = [generateHexPattern(rows, columns, { size: 1 })];
		// quadBand: minimal quad shapes — real shapes don't matter for end-trim logic
		const quadBand = [
			{
				a: { x: 0, y: 0, z: 0 } as any,
				b: { x: 1, y: 0, z: 0 } as any,
				c: { x: 0, y: 1, z: 0 } as any,
				d: { x: 1, y: 1, z: 0 } as any
			}
		];
		const result = adjustHexPatternAfterTiling(patternBand, quadBand, config);
		expect(result).toMatchSnapshot();
	});

	it('adjuster with endsMatched=false endsTrimmed=false rows=1 columns=2', () => {
		const rows = 1;
		const columns = 2;
		const config = makeConfig({ rowCount: rows, columnCount: columns, endsTrimmed: false });
		const quad = {
			a: { x: 0, y: 0, z: 0 } as any,
			b: { x: 1, y: 0, z: 0 } as any,
			c: { x: 0, y: 1, z: 0 } as any,
			d: { x: 1, y: 1, z: 0 } as any
		};
		const patternBand = [
			generateHexPattern(rows, columns, { size: 1 }),
			generateHexPattern(rows, columns, { size: 1 })
		];
		const quadBand = [quad, quad];
		const result = adjustHexPatternAfterTiling(patternBand, quadBand, config);
		expect(result).toMatchSnapshot();
	});
});
```

- [ ] **Step 3: Run to capture the snapshot (expect PASS on first run — snapshot created)**

```bash
npx jest src/lib/patterns/tesselation/hex/__tests__/snapshot.test.ts --no-coverage
```

Expected: all tests PASS, snapshot file written to `src/lib/patterns/tesselation/hex/__tests__/__snapshots__/snapshot.test.ts.snap`.

- [ ] **Step 4: Commit the pre-fork snapshot**

```bash
git add src/lib/patterns/tesselation/hex/__tests__/
git commit -m "test(hex): capture pre-fork snapshot fixture"
```

---

### Task 2: Create hex `default-spec.ts`

**Files:**

- Create: `src/lib/patterns/tesselation/hex/default-spec.ts`

The hex generator is fully procedural — `unit.start`, `unit.middle`, `unit.end` are never read by it. They are empty arrays. `width` and `height` are nominal (the generator computes its own dimensions from `size`/`rows`/`columns`). Setting them to `1` satisfies the `UnitDefinition` type without implying anything.

- [ ] **Step 1: Create `default-spec.ts`**

```typescript
import type { TiledPatternSpec } from '../../spec-types';

export const defaultHexSpec: TiledPatternSpec = {
	id: 'tiledHexPattern-1',
	name: 'Hex (default)',
	algorithm: 'hex',
	builtIn: true,
	unit: {
		width: 1,
		height: 1,
		start: [],
		middle: [],
		end: []
	},
	adjustments: {
		withinBand: [],
		acrossBands: [],
		partner: {
			startEnd: [],
			endEnd: []
		},
		skipRemove: []
	}
};
```

- [ ] **Step 2: Verify file parses without TS errors**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "tesselation/hex" | head -20
```

Expected: no output (no errors referencing the new file).

---

### Task 3: Create hex `helpers.ts`

**Files:**

- Create: `src/lib/patterns/tesselation/hex/helpers.ts`

`straightenEndSegments` and its private dependency `hexSegments` currently live in `tiled-hex-pattern.ts`. They move here verbatim. `tiled-tristar-pattern.ts` has its own copy — do not touch it.

- [ ] **Step 1: Create `helpers.ts`**

```typescript
import type { PathSegment } from '$lib/types';

const hexSegments = (
	end: 'start' | 'end',
	rows: number,
	columns: number,
	facetLength: number
): [number, number][] => {
	if (rows < 1 || columns < 1) {
		console.error('rows and columns must be >=1');
		return [[0, 0]];
	}
	const indices: [number, number][] = [];
	for (let c = 0; c < columns; c++) {
		if (end === 'start') {
			indices.push([c * 2, c * 2 + 1]);
		} else {
			const startIndex = facetLength - columns * 2;
			indices.push([startIndex + c * 2, startIndex + c * 2 + 1]);
		}
	}
	return indices;
};

export type StraightenEndSegmentsProps = {
	prevFacet: PathSegment[] | undefined;
	thisFacet: PathSegment[];
	nextFacet: PathSegment[] | undefined;
	rows: number;
	columns: number;
};

export const straightenEndSegments = ({
	prevFacet,
	thisFacet,
	nextFacet,
	rows,
	columns
}: StraightenEndSegmentsProps): PathSegment[] => {
	const startSegmentIndices = hexSegments('start', rows, columns, thisFacet.length);
	const endSegmentIndices = hexSegments('end', rows, columns, thisFacet.length);

	const output = structuredClone(thisFacet);

	let firstStartIndex, secondStartIndex, firstEndIndex, secondEndIndex;
	for (let i = 0; i < startSegmentIndices.length; i++) {
		[firstStartIndex, secondStartIndex] = startSegmentIndices[i];
		[firstEndIndex, secondEndIndex] = endSegmentIndices[i];

		if (prevFacet) {
			output[firstStartIndex][1] = prevFacet[firstEndIndex][1];
			output[firstStartIndex][2] = prevFacet[firstEndIndex][2];
		}

		if (nextFacet) {
			output[secondEndIndex][1] = nextFacet[secondStartIndex][1];
			output[secondEndIndex][2] = nextFacet[secondStartIndex][2];
		}
	}

	return output;
};

export { hexSegments };
```

---

### Task 4: Create hex `generator.ts`

**Files:**

- Create: `src/lib/patterns/tesselation/hex/generator.ts`

The generator signature changes from `generateHexPattern(rows, columns, { variant?, size, adjustEnds? })` to `generateHexTile(spec, props)` where `props = { size, rows, columns, variant?, sideOrientation }`. The `spec` parameter is accepted but not read — hex geometry is fully computed from props. This matches the shield pattern's `generateShieldTesselationTile(spec, props)` contract.

- [ ] **Step 1: Create `generator.ts`**

```typescript
import type { Band, GridVariant, PathSegment } from '$lib/types';
import { translatePS } from '../../utils';
import type { TiledPatternSpec } from '../../spec-types';

export type HexGeneratorProps = {
	size: number;
	rows: number;
	columns: number;
	variant?: GridVariant;
	sideOrientation: Band['sideOrientation'];
};

export const generateHexTile = (
	_spec: TiledPatternSpec,
	props: HexGeneratorProps
): PathSegment[] => {
	const { size, rows, columns } = props;
	const row = size / rows;
	const col = size / columns;
	const h = row / 3;
	const w = col / 2;

	const edgeSegment: [PathSegment, PathSegment] = [
		['M', col, h],
		['L', col, 2 * h]
	];

	const unitPattern = (
		edge = false
	): { start: PathSegment[]; middle: PathSegment[]; end: PathSegment[] } => ({
		start: [
			['M', w, 0],
			['L', w, 0.5 * h]
		],
		middle: [
			['M', 0, h],
			['L', w, 0.5 * h],
			['L', col, h],

			['M', 0, h],
			['L', 0, 2 * h],

			...(edge ? edgeSegment : []),

			['M', 0, 2 * h],
			['L', w, 2.5 * h],
			['L', col, 2 * h]
		],
		end: [
			['M', w, 2.5 * h],
			['L', w, row]
		]
	});

	const startSegments: PathSegment[] = [];
	const middleSegments: PathSegment[] = [];
	const endSegments: PathSegment[] = [];

	for (let c = 0; c < columns; c++) {
		for (let r = 0; r < rows; r++) {
			const unit = unitPattern(c === columns - 1);
			if (r > 0 && r < rows - 1) {
				middleSegments.push(
					...translatePS(unit.start, col * c, row * r),
					...translatePS(unit.middle, col * c, row * r),
					...translatePS(unit.end, col * c, row * r)
				);
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
			middleSegments.push(...translatePS(unit.middle, col * c, row * r));
		}
	}

	return [...startSegments, ...middleSegments, ...endSegments];
};
```

---

### Task 5: Create hex `adjuster.ts`

**Files:**

- Create: `src/lib/patterns/tesselation/hex/adjuster.ts`

The existing `adjustHexPatternAfterTiling` has signature `(patternBand, quadBand, tiledPatternConfig)` — that is the old `adjustAfterMapping` interface. The new registry uses `adjustAfterTiling` with signature `(bands: BandCutPattern[], tiledPatternConfig, tubes)`. The hex adjuster does not use `tubes`, but must accept it.

The internal logic moves unchanged from `tiled-hex-pattern.ts`. The `straightenEndSegments` call now imports from `./helpers`.

The `translateQuad` and `rotateQuad` helpers inside the existing file are private to the adjuster; they stay in `adjuster.ts`.

- [ ] **Step 1: Create `adjuster.ts`**

```typescript
import type {
	BandCutPattern,
	PathSegment,
	Quadrilateral,
	TiledPatternConfig,
	TubeCutPattern
} from '$lib/types';
import type { Point } from '$lib/types';
import { getAngle, rotatePS, rotatePoint, translatePS } from '../../utils';
import { hexSegments, straightenEndSegments } from './helpers';

const translateQuad = (quad: Quadrilateral, x: number, y: number): Quadrilateral => ({
	a: quad.a.clone().add({ x, y, z: 0 } as any),
	b: quad.b.clone().add({ x, y, z: 0 } as any),
	c: quad.c.clone().add({ x, y, z: 0 } as any),
	d: quad.d.clone().add({ x, y, z: 0 } as any)
});

const rotateQuad = (quad: Quadrilateral, angle: number, anchor: Point): Quadrilateral => {
	const rp = (p: any) => rotatePoint(anchor, { x: p.x, y: p.y }, angle);
	return {
		a: { x: rp(quad.a).x, y: rp(quad.a).y, z: quad.a.z } as any,
		b: { x: rp(quad.b).x, y: rp(quad.b).y, z: quad.b.z } as any,
		c: { x: rp(quad.c).x, y: rp(quad.c).y, z: quad.c.z } as any,
		d: { x: rp(quad.d).x, y: rp(quad.d).y, z: quad.d.z } as any
	};
};

export const adjustHexTesselation = (
	bands: BandCutPattern[],
	tiledPatternConfig: TiledPatternConfig,
	_tubes: TubeCutPattern[]
): BandCutPattern[] => {
	return bands.map((band) => {
		let patternBand: PathSegment[][] = band.facets.map((f) => f.path);
		const quadBand: Quadrilateral[] = band.facets.map((f) => f.quad!);
		patternBand = adjustHexBand(patternBand, quadBand, tiledPatternConfig);
		return {
			...band,
			facets: band.facets.map((f, i) => ({ ...f, path: patternBand[i] }))
		};
	});
};

const adjustHexBand = (
	patternBand: PathSegment[][],
	quadBand: Quadrilateral[],
	tiledPatternConfig: TiledPatternConfig
): PathSegment[][] => {
	const { endsMatched, endsTrimmed, rowCount, columnCount, endLooped } = tiledPatternConfig.config;

	let prevFacet: PathSegment[] | undefined;
	let nextFacet: PathSegment[] | undefined;
	let thisFacet: PathSegment[];
	let thisQuad: Quadrilateral;
	const finalFacets: PathSegment[][] = [];
	const finalQuads: Quadrilateral[] = [];

	if (endLooped > 0) {
		const index = patternBand.length - 1;
		thisFacet = patternBand[index];
		thisQuad = quadBand[index];
		const nextQuad = quadBand[0];
		const tDiff = { x: thisQuad.d.x - nextQuad.a.x, y: thisQuad.d.y - nextQuad.a.y };
		const aDiff = getAngle(thisQuad.d, thisQuad.c) - getAngle(nextQuad.a, nextQuad.b);

		for (let k = 0; k < endLooped; k++) {
			const translatedQuad = translateQuad(structuredClone(quadBand[k]), tDiff.x, tDiff.y);
			finalQuads.push(rotateQuad(translatedQuad, aDiff, thisQuad.d));

			const translated = translatePS(structuredClone(patternBand[k]), tDiff.x, tDiff.y);
			finalFacets.push(rotatePS(translated, aDiff, thisQuad.d));
		}
		patternBand.push(...finalFacets);
		quadBand.push(...finalQuads);
	}

	patternBand = patternBand.map((facet, i, facets) => {
		thisFacet = facet;
		thisQuad = quadBand[i];
		if (i === 0) {
			const prevQuad = quadBand[facets.length - 1];
			const tDiff = { x: thisQuad.a.x - prevQuad.d.x, y: thisQuad.a.y - prevQuad.d.y };
			const rDiff = 0;
			prevFacet = endsMatched
				? rotatePS(translatePS(structuredClone(facets[facets.length - 1]), tDiff.x, tDiff.y), rDiff)
				: undefined;
			nextFacet = facets[i + 1];
		} else if (i === facets.length - 1) {
			const nextQuad = quadBand[0];
			const tDiff = { x: thisQuad.d.x - nextQuad.a.x, y: thisQuad.d.y - nextQuad.a.y };
			const aDiff = getAngle(thisQuad.d, thisQuad.c) - getAngle(nextQuad.a, nextQuad.b);
			prevFacet = facets[i - 1];
			nextFacet = endsMatched
				? rotatePS(translatePS(structuredClone(facets[0]), tDiff.x, tDiff.y), aDiff, thisQuad.d)
				: undefined;
		} else {
			prevFacet = facets[i - 1];
			nextFacet = facets[i + 1];
		}
		return straightenEndSegments({
			prevFacet,
			thisFacet,
			nextFacet,
			rows: (tiledPatternConfig.config.rowCount || 1) as number,
			columns: (tiledPatternConfig.config.columnCount || 1) as number
		});
	});

	if (endsTrimmed) {
		const startSegments = hexSegments(
			'start',
			rowCount || 1,
			columnCount || 1,
			patternBand[0].length
		).flat();
		const endSegments = hexSegments(
			'end',
			rowCount || 1,
			columnCount || 1,
			patternBand[patternBand.length - 1].length
		).flat();
		patternBand[0].splice(0, startSegments.length);
		patternBand[patternBand.length - 1].splice(Math.min(...endSegments), endSegments.length);
	}

	return patternBand;
};
```

---

### Task 6: Create hex `index.ts`

**Files:**

- Create: `src/lib/patterns/tesselation/hex/index.ts`

- [ ] **Step 1: Create `index.ts`**

```typescript
export { defaultHexSpec } from './default-spec';
export { generateHexTile, type HexGeneratorProps } from './generator';
export { adjustHexTesselation } from './adjuster';
export { straightenEndSegments, type StraightenEndSegmentsProps } from './helpers';
```

---

### Task 7: Register hex in `pattern-registry.ts` and update `pattern-definitions.ts`

**Files:**

- Modify: `src/lib/patterns/pattern-registry.ts`
- Modify: `src/lib/patterns/pattern-definitions.ts`
- Modify: `src/lib/patterns/index.ts`

- [ ] **Step 1: Add hex algorithm to `pattern-registry.ts`**

Open `src/lib/patterns/pattern-registry.ts`. Add one import line after the existing shield import:

```typescript
import { adjustHexTesselation, defaultHexSpec, generateHexTile } from './tesselation/hex';
```

Then add the algorithm object after the `shieldAlgorithm` block:

```typescript
const hexAlgorithm: PatternAlgorithm = {
	algorithmId: 'hex',
	displayName: 'Hex',
	defaultSpec: defaultHexSpec,
	supportsEditing: true,
	createPatternsEntry: (spec) => ({
		getPattern: (
			rows: number,
			columns: number,
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			_quadBand: Quadrilateral[] | undefined = undefined,
			variant: GridVariant | undefined = 'rect',
			sideOrientation: Band['sideOrientation']
		) =>
			generateHexTile(spec, {
				size: 1,
				rows,
				columns,
				variant,
				sideOrientation
			}),
		tagAnchor: { facetIndex: 0, segmentIndex: 0 },
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		adjustAfterTiling: (bands: any, tiledPatternConfig: any, tubes: any) =>
			adjustHexTesselation(bands, tiledPatternConfig, tubes)
	})
};
```

Update the `algorithms` export line:

```typescript
export const algorithms: PatternAlgorithm[] = [shieldAlgorithm, hexAlgorithm];
```

- [ ] **Step 2: Remove the hex entry from `pattern-definitions.ts`**

In `src/lib/patterns/pattern-definitions.ts`:

Remove this import line:

```typescript
import { adjustHexPatternAfterTiling, generateHexPattern } from './tiled-hex-pattern';
```

Remove this entry from the `patterns` object (lines 41-46):

```typescript
'tiledHexPattern-1': {
    getPattern: (rows: number, columns: number) =>
        generateHexPattern(rows, columns, { variant: 1, size: 1 }),
    tagAnchor: { facetIndex: 0, segmentIndex: 0 },
    adjustAfterMapping: adjustHexPatternAfterTiling
},
```

The `builtInPatternsEntries` loop already populates `tiledHexPattern-1` automatically via the registry.

- [ ] **Step 3: Remove the hex export from `src/lib/patterns/index.ts`**

Remove this line:

```typescript
export * from './tiled-hex-pattern';
```

- [ ] **Step 4: Delete the original file**

```bash
git rm src/lib/patterns/tiled-hex-pattern.ts
```

- [ ] **Step 5: Run the post-fork snapshot test (imports now point to new module)**

Update `src/lib/patterns/tesselation/hex/__tests__/snapshot.test.ts` — change the two import lines from:

```typescript
import { generateHexPattern, adjustHexPatternAfterTiling } from '../../../tiled-hex-pattern';
```

to:

```typescript
import { generateHexTile } from '../generator';
import { adjustHexTesselation } from '../adjuster';
import { defaultHexSpec } from '../default-spec';
```

And update each test call: replace `generateHexPattern(rows, columns, { size })` with `generateHexTile(defaultHexSpec, { size, rows, columns, sideOrientation: 'outside' })`, and replace `adjustHexPatternAfterTiling(patternBand, quadBand, config)` with a call that wraps the input to match the new `BandCutPattern[]` signature:

```typescript
// The new adjuster takes BandCutPattern[], not PathSegment[][]
// Wrap the raw patternBand into the BandCutPattern shape
const wrappedBands = patternBand.map((path, i) => ({
	address: { tube: 0, band: i },
	facets: [{ path, quad: quadBand[i], label: `${i}` }],
	meta: undefined
})) as any;
const result = adjustHexTesselation(wrappedBands, config, []);
// Unwrap for snapshot comparison (compare just the paths)
const paths = result.map((b: any) => b.facets.map((f: any) => f.path));
expect(paths).toMatchSnapshot();
```

> **Warning:** The adjuster snapshot cases in Task 1 were captured with the OLD signature returning `PathSegment[][]`. The new signature wraps/unwraps differently. When running with the updated imports, Jest will report snapshot mismatches for the adjuster cases. Run `--updateSnapshot` once to re-baseline:
>
> ```bash
> npx jest src/lib/patterns/tesselation/hex/__tests__/snapshot.test.ts --no-coverage -u
> ```
>
> Then commit the updated snapshots. This is expected — the adjuster output content is equivalent, but the wrapping layer changed.

- [ ] **Step 6: Run all generator snapshot cases and confirm PASS**

```bash
npx jest src/lib/patterns/tesselation/hex/__tests__/snapshot.test.ts --no-coverage
```

Expected: all tests PASS (snapshots matched or newly written).

- [ ] **Step 7: Commit**

```bash
git add src/lib/patterns/tesselation/hex/ src/lib/patterns/pattern-registry.ts src/lib/patterns/pattern-definitions.ts src/lib/patterns/index.ts
git commit -m "feat(hex): fork hex into spec-driven tesselation module"
```

---

### Task 8: Capture box pre-fork snapshot fixture

**Files:**

- Create: `src/lib/patterns/tesselation/box/__tests__/snapshot.test.ts`

Same approach as Task 1 — capture current output before touching anything.

- [ ] **Step 1: Create the test directory**

```bash
mkdir -p src/lib/patterns/tesselation/box/__tests__
```

- [ ] **Step 2: Write the snapshot test against the current (pre-fork) export**

Create `src/lib/patterns/tesselation/box/__tests__/snapshot.test.ts`:

```typescript
import { generateBoxPattern } from '../../../tiled-box-pattern';

describe('box generator snapshot', () => {
	const sizes = [1, 100];
	const heightList = [1, 2, 3];
	const widthList = [1, 2, 3, 5];

	for (const size of sizes) {
		for (const height of heightList) {
			for (const width of widthList) {
				it(`generateBoxPattern size=${size} height=${height} width=${width}`, () => {
					const result = generateBoxPattern({ size, height, width });
					expect(result).toMatchSnapshot();
				});
			}
		}
	}
});
```

- [ ] **Step 3: Run to capture the snapshot**

```bash
npx jest src/lib/patterns/tesselation/box/__tests__/snapshot.test.ts --no-coverage
```

Expected: all tests PASS, snapshot file written.

- [ ] **Step 4: Commit the pre-fork snapshot**

```bash
git add src/lib/patterns/tesselation/box/__tests__/
git commit -m "test(box): capture pre-fork snapshot fixture"
```

---

### Task 9: Create box `default-spec.ts`

**Files:**

- Create: `src/lib/patterns/tesselation/box/default-spec.ts`

Same rationale as hex: generator is fully procedural, `unit` arrays are empty placeholders.

- [ ] **Step 1: Create `default-spec.ts`**

```typescript
import type { TiledPatternSpec } from '../../spec-types';

export const defaultBoxSpec: TiledPatternSpec = {
	id: 'tiledBoxPattern-0',
	name: 'Box (default)',
	algorithm: 'box',
	builtIn: true,
	unit: {
		width: 1,
		height: 1,
		start: [],
		middle: [],
		end: []
	},
	adjustments: {
		withinBand: [],
		acrossBands: [],
		partner: {
			startEnd: [],
			endEnd: []
		},
		skipRemove: []
	}
};
```

---

### Task 10: Create box `generator.ts`

**Files:**

- Create: `src/lib/patterns/tesselation/box/generator.ts`

Box has no adjuster, no helpers. The generator is a direct port of `generateBoxPattern` with the spec-style signature.

- [ ] **Step 1: Create `generator.ts`**

```typescript
import type { Band, GridVariant, PathSegment } from '$lib/types';
import type { TiledPatternSpec } from '../../spec-types';

export type BoxGeneratorProps = {
	size: number;
	rows: number;
	columns: number;
	variant?: GridVariant;
	sideOrientation: Band['sideOrientation'];
};

export const generateBoxTile = (
	_spec: TiledPatternSpec,
	props: BoxGeneratorProps
): PathSegment[] => {
	const { size, rows: height, columns: width } = props;
	const rowHeight = size / height;
	const columnWidth = size / width;
	const v = rowHeight / 6;
	const h = columnWidth / 2;
	const segments: PathSegment[] = [];

	for (let row = 0; row < height; row++) {
		for (let col = 0; col < width; col++) {
			const r = rowHeight * row;
			const c = columnWidth * col;
			segments.push(
				...([
					['M', c + 0, r + v],
					['L', c + h, r + 0],
					['L', c + h, r + 2 * v],
					['L', c + 0, r + 3 * v],
					['Z'],
					['M', c + h, r + 0],
					['L', c + 2 * h, r + v],
					['L', c + 2 * h, r + 3 * v],
					['L', c + h, r + 2 * v],
					['Z'],
					['M', c + 0, r + 3 * v],
					['L', c + h, r + 2 * v],
					['L', c + 2 * h, r + 3 * v],
					['L', c + h, r + 4 * v],
					['Z'],
					['M', c + 0, r + 3 * v],
					['L', c + h, r + 4 * v],
					['L', c + h, r + 6 * v],
					['L', c + 0, r + 5 * v],
					['Z'],
					['M', c + h, r + 4 * v],
					['L', c + 2 * h, r + 3 * v],
					['L', c + 2 * h, r + 5 * v],
					['L', c + h, r + 6 * v],
					['Z']
				] as PathSegment[])
			);
		}
	}

	return segments;
};
```

---

### Task 11: Create box `index.ts`

**Files:**

- Create: `src/lib/patterns/tesselation/box/index.ts`

- [ ] **Step 1: Create `index.ts`**

```typescript
export { defaultBoxSpec } from './default-spec';
export { generateBoxTile, type BoxGeneratorProps } from './generator';
```

---

### Task 12: Register box in `pattern-registry.ts` and update `pattern-definitions.ts`

**Files:**

- Modify: `src/lib/patterns/pattern-registry.ts`
- Modify: `src/lib/patterns/pattern-definitions.ts`
- Modify: `src/lib/patterns/index.ts`

- [ ] **Step 1: Add box imports and algorithm to `pattern-registry.ts`**

Add one import line after the hex import:

```typescript
import { defaultBoxSpec, generateBoxTile } from './tesselation/box';
```

Add the algorithm object after `hexAlgorithm`:

```typescript
const boxAlgorithm: PatternAlgorithm = {
	algorithmId: 'box',
	displayName: 'Box',
	defaultSpec: defaultBoxSpec,
	supportsEditing: true,
	createPatternsEntry: (spec) => ({
		getPattern: (
			rows: number,
			columns: number,
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			_quadBand: Quadrilateral[] | undefined = undefined,
			variant: GridVariant | undefined = 'rect',
			sideOrientation: Band['sideOrientation']
		) =>
			generateBoxTile(spec, {
				size: 1,
				rows,
				columns,
				variant,
				sideOrientation
			}),
		tagAnchor: { facetIndex: 0, segmentIndex: 5, angle: 0 }
	})
};
```

Update the `algorithms` export:

```typescript
export const algorithms: PatternAlgorithm[] = [shieldAlgorithm, hexAlgorithm, boxAlgorithm];
```

- [ ] **Step 2: Remove the box entry from `pattern-definitions.ts`**

Remove this import:

```typescript
import { generateBoxPattern } from './tiled-box-pattern';
```

Remove this entry from the `patterns` object:

```typescript
'tiledBoxPattern-0': {
    getPattern: (rows: number, columns: number) =>
        generateBoxPattern({ size: 1, height: rows, width: columns }),
    // adjustAfterTiling: (facets: CutPattern) => facets,
    tagAnchor: { facetIndex: 0, segmentIndex: 5, angle: 0 }
},
```

- [ ] **Step 3: Remove the box export from `src/lib/patterns/index.ts`**

Remove this line:

```typescript
export * from './tiled-box-pattern';
```

- [ ] **Step 4: Delete the original file**

```bash
git rm src/lib/patterns/tiled-box-pattern.ts
```

- [ ] **Step 5: Update the box snapshot test imports and run**

Update `src/lib/patterns/tesselation/box/__tests__/snapshot.test.ts` — change the import from:

```typescript
import { generateBoxPattern } from '../../../tiled-box-pattern';
```

to:

```typescript
import { generateBoxTile } from '../generator';
import { defaultBoxSpec } from '../default-spec';
```

And update each call from `generateBoxPattern({ size, height, width })` to `generateBoxTile(defaultBoxSpec, { size, rows: height, columns: width, sideOrientation: 'outside' })`.

Run the test to confirm snapshot match (content is identical — only parameter names changed):

```bash
npx jest src/lib/patterns/tesselation/box/__tests__/snapshot.test.ts --no-coverage
```

Expected: all tests PASS (snapshots matched).

- [ ] **Step 6: Commit**

```bash
git add src/lib/patterns/tesselation/box/ src/lib/patterns/pattern-registry.ts src/lib/patterns/pattern-definitions.ts src/lib/patterns/index.ts
git commit -m "feat(box): fork box into spec-driven tesselation module"
```

---

### Task 13: Final integration check

**Files:** no changes — verification only.

- [ ] **Step 1: Run all pattern snapshot tests**

```bash
npx jest src/lib/patterns/tesselation/ --no-coverage
```

Expected: all pass.

- [ ] **Step 2: Run the full unit test suite**

```bash
npm run test:unit
```

Expected: no regressions. Note the pre-existing ~427 TS error baseline — check that new error count is not significantly higher.

- [ ] **Step 3: TypeScript check**

```bash
npm run check 2>&1 | grep -E "error TS" | wc -l
```

Expected: count at or below pre-existing baseline (~427).

- [ ] **Step 4: Verify pattern IDs survive round-trip through the registry**

Check that `findAlgorithm('hex')` and `findAlgorithm('box')` return non-undefined in a quick REPL check or by reading the registry file — the `algorithmId` values `'hex'` and `'box'` match the `algorithm` fields in `defaultHexSpec` and `defaultBoxSpec`, and the `id` fields (`tiledHexPattern-1`, `tiledBoxPattern-0`) match the keys in `tiledPatternConfigs` in `shades-config.ts`.

```bash
grep -n "tiledHexPattern-1\|tiledBoxPattern-0" src/lib/shades-config.ts
```

Expected: entries still present, no modifications needed.

- [ ] **Step 5: Manual smoke check — open the designer and confirm hex and box tiles appear grouped under their own algorithm in the TilingControl picker**

Start the dev server:

```bash
npm run dev
```

Navigate to `/designer2`, open the TilingControl picker, and confirm:

- "Hex" group contains the hex tile
- "Box" group contains the box tile
- "Shield" group still works
- Selecting hex or box and toggling `endsMatched` / `endsTrimmed` produces the same visual output as before the migration

- [ ] **Step 6: Final commit if any fixes were applied during smoke check**

```bash
git add -p
git commit -m "fix: integration fixes from phase 6 smoke check"
```
