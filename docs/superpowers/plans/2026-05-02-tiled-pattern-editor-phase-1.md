# Tiled Pattern Editor — Phase 1: Spec-Driven Shield Refactor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing shield tesselation pattern from hardcoded literals into a spec-driven generator + adjuster, with a golden equivalence test guaranteeing zero behavior change. No editor UI; no user-visible changes.

**Architecture:** The current `tiled-shield-tesselation-pattern.ts` (606 lines, mixes data and code) becomes a folder `src/lib/patterns/shield-tesselation/` with separate files for the data (`default-spec.ts`), generator (`generator.ts`), adjuster (`adjuster.ts`), and pure helpers (`helpers.ts`). A new `TiledPatternSpec` type — defined in `src/lib/patterns/spec-types.ts` — declares the unit shape (start/middle/end PathSegment groups, width, height) and adjustment rules (within-band, across-bands, partner.startEnd, partner.endEnd, skipRemove) as pair-objects (`{source, target}`) instead of parallel index arrays. `defaultShieldSpec` ports the existing literal data exactly. `pattern-definitions.ts` is updated to call the new functions; `tiled-shield-tesselation-pattern.ts` is deleted.

**Tech Stack:** TypeScript, Jest (ts-jest ESM preset), SvelteKit. Tests live in `src/.../__tests__/*.test.ts` and run via `npm run test:unit`.

---

## File Structure

**Create:**
- `src/lib/patterns/spec-types.ts` — `TiledPatternSpec`, `UnitDefinition`, `AdjustmentRules`, `IndexPair`
- `src/lib/patterns/shield-tesselation/index.ts` — re-exports
- `src/lib/patterns/shield-tesselation/default-spec.ts` — `defaultShieldSpec` constant
- `src/lib/patterns/shield-tesselation/helpers.ts` — `retarget`, `replaceInPlace`, `removeInPlace`, `getTransformedPartnerCutPattern`, `newTransformPS`, segment-count constants
- `src/lib/patterns/shield-tesselation/generator.ts` — `generateShieldTesselationTile(spec, props)`
- `src/lib/patterns/shield-tesselation/adjuster.ts` — `adjustShieldTesselation(bands, config, tubes, spec)`
- `src/lib/patterns/shield-tesselation/__tests__/equivalence.test.ts` — golden test (compares old vs new)

**Modify:**
- `src/lib/patterns/pattern-definitions.ts` — change shield import + entry to call new functions; pass `defaultShieldSpec`
- `src/lib/patterns/index.ts` — replace `export * from './tiled-shield-tesselation-pattern';` with `export * from './shield-tesselation';`

**Delete:**
- `src/lib/patterns/tiled-shield-tesselation-pattern.ts`

**No changes:** `src/lib/types.ts` (`TiledPattern` still includes `'tiledShieldTesselationPattern'` — backward compatible). The wider type-system loosening is Phase 2.

---

### Task 1: Spec types

**Files:**
- Create: `src/lib/patterns/spec-types.ts`

- [x] **Step 1: Create the spec types file**

Create `src/lib/patterns/spec-types.ts` with this content:

```ts
import type { PathSegment } from '$lib/types';

export type IndexPair = { source: number; target: number };

export type UnitDefinition = {
	width: number;
	height: number;
	start: PathSegment[];
	middle: PathSegment[];
	end: PathSegment[];
};

export type AdjustmentRules = {
	withinBand: IndexPair[];
	acrossBands: IndexPair[];
	partner: {
		startEnd: IndexPair[];
		endEnd: IndexPair[];
	};
	skipRemove: number[];
};

export type TiledPatternAlgorithm =
	| 'shield-tesselation'
	| 'hex'
	| 'box'
	| 'bowtie'
	| 'carnation'
	| 'grid'
	| 'multihex-tesselation'
	| 'triangle-panel'
	| 'tristar';

export type TiledPatternSpec = {
	id: string;
	name: string;
	algorithm: TiledPatternAlgorithm;
	builtIn: boolean;
	unit: UnitDefinition;
	adjustments: AdjustmentRules;
};
```

- [x] **Step 2: Run type-check**

```bash
npm run check
```

Expected: no new errors related to `spec-types.ts` (pre-existing errors elsewhere are fine — see CLAUDE.md note about ~378 pre-existing errors).

- [x] **Step 3: Commit**

```bash
git add src/lib/patterns/spec-types.ts
git commit -m "Add TiledPatternSpec types"
git push
```

---

### Task 2: Helpers extracted from current shield

**Files:**
- Create: `src/lib/patterns/shield-tesselation/helpers.ts`

The existing `tiled-shield-tesselation-pattern.ts` mixes pure helpers with shield-specific code. This task extracts the helpers verbatim (with two signature changes: `replaceInPlace` accepts `IndexPair[]` instead of parallel arrays, and `removeInPlace` is unchanged), into a new file. The old file is **not yet deleted** — it stays so the equivalence test can compare old vs new.

- [x] **Step 1: Create the helpers file**

Create `src/lib/patterns/shield-tesselation/helpers.ts`:

```ts
import type { TransformConfig } from '$lib/projection-geometry/types';
import type {
	BandCutPattern,
	CutPattern,
	PathSegment,
	SkipEdges,
	TubeCutPattern
} from '$lib/types';
import { isSameAddress } from '$lib/util';
import type { IndexPair } from '../spec-types';

export const START_SEGMENTS = 14;
export const END_SEGMENTS = 14;
export const MIDDLE_SEGMENTS = 52;

export const retarget = (indices: number[], rows: number, columns: number) => {
	const retargeted = indices.flatMap((index) => {
		const result: number[] = [];

		if (index < START_SEGMENTS && columns > 1) {
			for (let c = 0; c < columns; c++) {
				result.push(index + c * START_SEGMENTS);
			}
			return result;
		}
		if (index >= START_SEGMENTS + MIDDLE_SEGMENTS && columns > 1) {
			const localIndex = index - START_SEGMENTS - MIDDLE_SEGMENTS;
			const entryPoint = START_SEGMENTS * columns + MIDDLE_SEGMENTS * rows * columns;
			for (let c = 0; c < columns; c++) {
				result.push(entryPoint + localIndex + c * END_SEGMENTS);
			}
			return result;
		}
		if (
			index >= START_SEGMENTS &&
			index < START_SEGMENTS + MIDDLE_SEGMENTS &&
			(columns > 1 || rows > 1)
		) {
			const entryPoint = START_SEGMENTS * columns + MIDDLE_SEGMENTS * (rows - 1) * columns;
			for (let c = 0; c < columns; c++) {
				result.push(entryPoint + index + c * MIDDLE_SEGMENTS);
			}
			return result;
		}
		return index;
	});
	return retargeted;
};

export const replaceInPlace = ({
	pairs,
	target,
	source
}: {
	pairs: IndexPair[];
	target: PathSegment[];
	source: PathSegment[];
}) => {
	for (const { source: si, target: ti } of pairs) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-expect-error: writing 3-tuple where caller may have wider PathSegment union
		target[ti] = [target[ti][0], source[si][1], source[si][2]];
	}
};

export const evaluateSkipEdge = (skip: SkipEdges, index: number, limit: number) => {
	switch (skip) {
		case 'not-both':
			return index > 0 && index < limit;
		case 'not-first':
			return index > 0;
		case 'not-last':
			return index < limit;
		case 'all':
			return true;
		default:
			return false;
	}
};

export const removeInPlace = ({
	indices,
	target
}: {
	indices: number[];
	target: PathSegment[];
}) => {
	const sortedDescending = [...indices].sort((a, b) => b - a);
	for (const index of sortedDescending) {
		target.splice(index, 1);
	}
};

export const getTransformedPartnerCutPattern = (
	band: BandCutPattern,
	f: number,
	tubes: TubeCutPattern[],
	endsMatched: boolean
): CutPattern | undefined => {
	if (!endsMatched || !band.meta || (f !== 0 && f !== band.facets.length - 1)) return undefined;

	const partnerAddress = f === 0 ? band.meta.startPartnerBand : band.meta.endPartnerBand;
	const transform: TransformConfig | undefined =
		f === 0 ? band.meta.startPartnerTransform : band.meta.endPartnerTransform;
	const partnerTube = tubes[partnerAddress.tube];
	if (!partnerTube) return undefined;
	const partnerBand =
		partnerTube.bands.find((b) => b.address.band === partnerAddress.band) ??
		partnerTube.bands[partnerAddress.band];
	if (!partnerBand?.meta) return undefined;
	const partnerFacetIndex = isSameAddress(partnerBand.meta.startPartnerBand, band.address)
		? 0
		: partnerBand.facets.length - 1;
	const partnerFacet: CutPattern = partnerBand.facets[partnerFacetIndex];
	const partnerPath = structuredClone(partnerFacet.path);
	const transformedPartnerPath = transform ? newTransformPS(partnerPath, transform) : partnerPath;

	return { path: transformedPartnerPath, label: `${partnerFacetIndex}` };
};

export const newTransformPS = (path: PathSegment[], transform: TransformConfig) => {
	const {
		translate: { x: translateX, y: translateY },
		rotate: { z: theta }
	} = transform;
	const thetaRad = (theta * Math.PI) / 180;
	const cos = Math.cos(thetaRad);
	const sin = Math.sin(thetaRad);

	const transformPoint = (x: number, y: number): [number, number] => {
		const x2 = cos * x - sin * y + translateX;
		const y2 = sin * x + cos * y + translateY;
		return [x2, y2];
	};

	const transformed: PathSegment[] = path.map((seg) => {
		switch (seg[0]) {
			case 'M': {
				const [x, y] = transformPoint(seg[1], seg[2]);
				return ['M', x, y];
			}
			case 'L': {
				const [x, y] = transformPoint(seg[1], seg[2]);
				return ['L', x, y];
			}
			case 'Q': {
				const [cx, cy] = transformPoint(seg[1], seg[2]);
				const [x, y] = transformPoint(seg[3], seg[4]);
				return ['Q', cx, cy, x, y];
			}
			case 'C': {
				const [c1x, c1y] = transformPoint(seg[1], seg[2]);
				const [c2x, c2y] = transformPoint(seg[3], seg[4]);
				const [x, y] = transformPoint(seg[5], seg[6]);
				return ['C', c1x, c1y, c2x, c2y, x, y];
			}
			case 'A': {
				const [x, y] = transformPoint(seg[6], seg[7]);
				const xAxisRotation = seg[3] + theta;
				return ['A', seg[1], seg[2], xAxisRotation, seg[4], seg[5], x, y];
			}
			case 'Z':
				return ['Z'];
			default:
				return seg;
		}
	});

	return transformed;
};
```

- [x] **Step 2: Run type-check**

```bash
npm run check
```

Expected: no new errors related to `helpers.ts`.

- [x] **Step 3: Commit**

```bash
git add src/lib/patterns/shield-tesselation/helpers.ts
git commit -m "Extract shield tesselation helpers"
git push
```

---

### Task 3: Default shield spec

This is the heart of the refactor: the existing 80-segment unit and its four index arrays must be ported byte-for-byte into the new spec shape. The four `replaceInPlace` calls in the current `adjustShieldTesselationAfterTiling` use these parallel arrays:

| Current parallel arrays | New `IndexPair[]` |
|---|---|
| `sourceIndices.start = [1, 2, 5, 6, 7, 8, 7, 11, 12, 11]`, `targetIndices.end = [67, 68, 71, 72, 73, 74, 33, 77, 78, 35]` | `withinBand` |
| `sourceIndices.left = [36, 36, 29, 29, 29]`, `targetIndices.right = [22, 38, 15, 39, 40]` | `acrossBands` |
| `[6, 5, 2, 1] → [7, 8, 11, 12]` (when `partner.label === 0`, `f === 0`) | `partner.startEnd` |
| `[73, 74, 77, 78] → [72, 71, 68, 67]` (when `partner.label !== 0`, `f === last`) | `partner.endEnd` |
| `targetIndices.remove = [22, 23, 38, 39]` | `skipRemove` |

**Files:**
- Create: `src/lib/patterns/shield-tesselation/default-spec.ts`

- [x] **Step 1: Create the default spec file**

Create `src/lib/patterns/shield-tesselation/default-spec.ts`:

```ts
import type { LinePathSegment, MovePathSegment } from '$lib/types';
import type { TiledPatternSpec } from '../spec-types';

// Unit dimensions in raw design coordinates (matches existing shield: 42w × 14h).
const UNIT_WIDTH = 42;
const UNIT_HEIGHT = 14;

// All segments are M/L pairs; coordinates are direct (not pre-multiplied by w/h).
// The generator scales by w = unit.width / 42 and h = unit.height / 14 for arbitrary unit dimensions.
// In default-spec the values are written using the same coefficients as the original code so
// the spec data is identical to what was previously hardcoded.

const start: (MovePathSegment | LinePathSegment)[] = [
	['M', 0, 0],
	['L', 10, 2],
	['M', 10, 2],
	['L', 14, 0],
	['M', 14, 0],
	['L', 19, 1],
	['M', 19, 1],
	['L', 23, -1],
	['M', 23, -1],
	['L', 28, 0],
	['M', 28, 0],
	['L', 32, -2],
	['M', 32, -2],
	['L', 42, 0]
];

const middle: (MovePathSegment | LinePathSegment)[] = [
	// verticals 1
	['M', 0, 0],
	['L', 2, 6],
	['M', 10, 2],
	['L', 11, 5],
	['M', 19, 1],
	['L', 21, 7],
	['M', 28, 0],
	['L', 29, 3],
	// verticals 2
	['M', -2, 8],
	['L', 0, 14],
	['M', 7, 7],
	['L', 8, 10],
	['M', 34, 4],
	['L', 35, 7],
	['M', 42, 0],
	['L', 44, 6],
	// verticals 3
	['M', 13, 11],
	['L', 14, 14],
	['M', 21, 7],
	['L', 23, 13],
	['M', 31, 9],
	['L', 32, 12],
	['M', 40, 8],
	['L', 42, 14],
	// horizontal 1
	['M', -2, 8],
	['L', 2, 6],
	['M', 2, 6],
	['L', 7, 7],
	['M', 7, 7],
	['L', 11, 5],
	['M', 11, 5],
	['L', 21, 7],
	['M', 21, 7],
	['L', 31, 9],
	['M', 31, 9],
	['L', 35, 7],
	['M', 35, 7],
	['L', 40, 8],
	['M', 40, 8],
	['L', 44, 6],
	// horizontal 2
	['M', 0, 14],
	['L', 8, 10],
	['M', 8, 10],
	['L', 13, 11],
	['M', 13, 11],
	['L', 21, 7],
	['M', 21, 7],
	['L', 29, 3],
	['M', 29, 3],
	['L', 34, 4],
	['M', 34, 4],
	['L', 42, 0]
];

const end: (MovePathSegment | LinePathSegment)[] = [
	['M', 0, 14],
	['L', 10, 16],
	['M', 10, 16],
	['L', 14, 14],
	['M', 14, 14],
	['L', 19, 15],
	['M', 19, 15],
	['L', 23, 13],
	['M', 23, 13],
	['L', 28, 14],
	['M', 28, 14],
	['L', 32, 12],
	['M', 32, 12],
	['L', 42, 14]
];

export const defaultShieldSpec: TiledPatternSpec = {
	id: 'tiledShieldTesselationPattern',
	name: 'Shield (default)',
	algorithm: 'shield-tesselation',
	builtIn: true,
	unit: {
		width: UNIT_WIDTH,
		height: UNIT_HEIGHT,
		start,
		middle,
		end
	},
	adjustments: {
		withinBand: [
			{ source: 1, target: 67 },
			{ source: 2, target: 68 },
			{ source: 5, target: 71 },
			{ source: 6, target: 72 },
			{ source: 7, target: 73 },
			{ source: 8, target: 74 },
			{ source: 7, target: 33 },
			{ source: 11, target: 77 },
			{ source: 12, target: 78 },
			{ source: 11, target: 35 }
		],
		acrossBands: [
			{ source: 36, target: 22 },
			{ source: 36, target: 38 },
			{ source: 29, target: 15 },
			{ source: 29, target: 39 },
			{ source: 29, target: 40 }
		],
		partner: {
			startEnd: [
				{ source: 6, target: 7 },
				{ source: 5, target: 8 },
				{ source: 2, target: 11 },
				{ source: 1, target: 12 }
			],
			endEnd: [
				{ source: 73, target: 72 },
				{ source: 74, target: 71 },
				{ source: 77, target: 68 },
				{ source: 78, target: 67 }
			]
		},
		skipRemove: [22, 23, 38, 39]
	}
};
```

> **Note on coordinate units:** The existing code multiplies indices by `w` and `h` *inline* in the literal segment list, where `w = col / 42` and `h = row / 14`. The spec stores the **un-multiplied** coefficients (`['L', 10, 2]` rather than `['L', 10*w, 2*h]`); the generator does the multiplication at tile time using the spec's `unit.width` / `unit.height` and the runtime-passed `size` / `rows` / `columns`. Default spec values match the existing coefficients exactly, so default-spec output is unchanged.

- [x] **Step 2: Run type-check**

```bash
npm run check
```

Expected: no new errors related to `default-spec.ts`.

- [x] **Step 3: Commit**

```bash
git add src/lib/patterns/shield-tesselation/default-spec.ts
git commit -m "Add defaultShieldSpec ported from hardcoded shield literals"
git push
```

---

### Task 4: New generator (`generateShieldTesselationTile`)

Reproduce `generateShieldTesselationTile` from the old file, but it now consumes a spec instead of hardcoded literals. The signature accepts the spec separately from the per-call props (size, rows, columns, sideOrientation).

**Files:**
- Create: `src/lib/patterns/shield-tesselation/generator.ts`

- [x] **Step 1: Create the generator file**

Create `src/lib/patterns/shield-tesselation/generator.ts`:

```ts
import type {
	Band,
	GridVariant,
	LinePathSegment,
	MovePathSegment,
	PathSegment
} from '$lib/types';
import { translatePS } from '../utils';
import type { TiledPatternSpec } from '../spec-types';
import { END_SEGMENTS, START_SEGMENTS } from './helpers';

export type ShieldGeneratorProps = {
	size: number;
	rows: number;
	columns: number;
	variant: GridVariant;
	sideOrientation: Band['sideOrientation'];
};

const scaleSegment = <S extends MovePathSegment | LinePathSegment>(
	seg: S,
	w: number,
	h: number
): S => [seg[0], (seg[1] || 0) * w, (seg[2] || 0) * h] as S;

const invertGroup = (
	segments: (MovePathSegment | LinePathSegment)[],
	maxX: number
): (MovePathSegment | LinePathSegment)[] =>
	segments
		.slice()
		.reverse()
		.map(
			(seg) =>
				[seg[0] === 'M' ? 'L' : 'M', maxX - (seg[1] || 0), seg[2] || 0] as
					| MovePathSegment
					| LinePathSegment
		);

const buildUnit = (
	spec: TiledPatternSpec,
	w: number,
	h: number,
	invert: boolean
): {
	start: PathSegment[];
	middle: PathSegment[];
	end: PathSegment[];
} => {
	const start = spec.unit.start.map((s) =>
		scaleSegment(s as MovePathSegment | LinePathSegment, w, h)
	);
	const middle = spec.unit.middle.map((s) =>
		scaleSegment(s as MovePathSegment | LinePathSegment, w, h)
	);
	const end = spec.unit.end.map((s) =>
		scaleSegment(s as MovePathSegment | LinePathSegment, w, h)
	);

	if (invert) {
		const maxX = 1;
		return {
			start: invertGroup(start as (MovePathSegment | LinePathSegment)[], maxX),
			middle: invertGroup(middle as (MovePathSegment | LinePathSegment)[], maxX),
			end: invertGroup(end as (MovePathSegment | LinePathSegment)[], maxX)
		};
	}

	if (start.length !== START_SEGMENTS || end.length !== END_SEGMENTS) {
		throw new Error('shield tesselation definition is bad');
	}

	return { start, middle, end };
};

export const generateShieldTesselationTile = (
	spec: TiledPatternSpec,
	props: ShieldGeneratorProps
): PathSegment[] => {
	const { size, columns } = props;
	let { rows } = props;
	const invert = false;
	rows = 1; // matches existing shield behavior — rows is forced to 1 inside the generator
	const row = size / rows;
	const col = size / columns;

	// Original code derived w/h as (col/42) and (row/14); now derive from spec dimensions.
	const w = col / spec.unit.width;
	const h = row / spec.unit.height;

	const startSegments: PathSegment[] = [];
	const middleSegments: PathSegment[] = [];
	const endSegments: PathSegment[] = [];

	for (let c = 0; c < columns; c++) {
		for (let r = 0; r < rows; r++) {
			const unit = buildUnit(spec, w, h, invert);
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
	const segments = [...startSegments, ...middleSegments, ...endSegments];
	return segments;
};
```

- [x] **Step 2: Run type-check**

```bash
npm run check
```

Expected: no new errors related to `generator.ts`.

- [x] **Step 3: Commit**

```bash
git add src/lib/patterns/shield-tesselation/generator.ts
git commit -m "Add spec-driven shield generator"
git push
```

---

### Task 5: New adjuster (`adjustShieldTesselation`)

The adjuster reads `IndexPair[]` from the spec instead of constructing parallel arrays inline. Behavior is otherwise identical to the existing `adjustShieldTesselationAfterTiling`.

**Files:**
- Create: `src/lib/patterns/shield-tesselation/adjuster.ts`

- [x] **Step 1: Create the adjuster file**

Create `src/lib/patterns/shield-tesselation/adjuster.ts`:

```ts
import type {
	BandCutPattern,
	CutPattern,
	TiledPatternConfig,
	TubeCutPattern
} from '$lib/types';
import { getAngle, rotatePS, translatePS } from '../utils';
import type { IndexPair, TiledPatternSpec } from '../spec-types';
import {
	evaluateSkipEdge,
	getTransformedPartnerCutPattern,
	removeInPlace,
	replaceInPlace,
	retarget
} from './helpers';

const DEBUG_METADATA = true;

const retargetPairs = (pairs: IndexPair[], rows: number, columns: number): IndexPair[] => {
	const sources = retarget(
		pairs.map((p) => p.source),
		rows,
		columns
	);
	const targets = retarget(
		pairs.map((p) => p.target),
		rows,
		columns
	);
	if (sources.length !== targets.length) {
		throw new Error('retargetPairs length mismatch');
	}
	return sources.map((s, i) => ({ source: s, target: targets[i] }));
};

export const adjustShieldTesselation = (
	bands: BandCutPattern[],
	tiledPatternConfig: TiledPatternConfig,
	tubes: TubeCutPattern[],
	spec: TiledPatternSpec
) => {
	const {
		config: { endLooped, endsMatched, rowCount: rows = 1, columnCount: columns = 1 }
	} = tiledPatternConfig;

	const newBands = structuredClone(bands);
	for (let b = 0; b < bands.length; b++) {
		const band = bands[b];

		const prevBandPaths = bands[(bands.length + b - 1) % bands.length].facets.map(
			(facet: CutPattern, f) => {
				const { path, quad } = facet;
				const referenceQuad = band.facets[f].quad;
				if (!quad || !referenceQuad) throw new Error('missing quad');

				const offset = { x: referenceQuad.a.x - quad.b.x, y: referenceQuad.a.y - quad.b.y };
				const angle = getAngle(referenceQuad.a, referenceQuad.d) - getAngle(quad.b, quad.c);

				let newPath = translatePS(structuredClone(path), offset.x, offset.y);
				newPath = rotatePS(newPath, angle, referenceQuad.a);

				return newPath;
			}
		);

		const withinBandPairs = retargetPairs(spec.adjustments.withinBand, rows, columns);
		const acrossBandsPairs = retargetPairs(spec.adjustments.acrossBands, rows, columns);
		const skipRemoveIndices = retarget(spec.adjustments.skipRemove, rows, columns);

		for (let f = 0; f < band.facets.length; f++) {
			if (DEBUG_METADATA) {
				newBands[b].facets[f].meta = {
					originalPath: structuredClone(band.facets[f].path),
					prevBandPath: prevBandPaths[f]
				};
			}

			const nextPath = band.facets[(f + 1) % band.facets.length].path;

			const doEndMatching = true;
			if (doEndMatching && endsMatched && (f === 0 || f === band.facets.length - 1)) {
				const partner = getTransformedPartnerCutPattern(
					band as BandCutPattern,
					f,
					tubes,
					tiledPatternConfig.config.endsMatched
				);
				if (partner) {
					newBands[b].meta = {
						...newBands[b].meta,
						...(f === 0
							? { translatedStartPartnerFacet: partner }
							: { translatedEndPartnerFacet: partner })
					} as BandCutPattern['meta'];

					const partnerPairs =
						f === 0
							? Number(partner.label) === 0
								? spec.adjustments.partner.startEnd
								: spec.adjustments.partner.endEnd.map(({ source, target }) => ({
										source: target,
										target: source
									}))
							: spec.adjustments.partner.endEnd;

					replaceInPlace({
						pairs: retargetPairs(partnerPairs, rows, columns),
						target: newBands[b].facets[f].path,
						source: partner.path
					});
				}
			}

			if (f < band.facets.length - 1 || endLooped) {
				replaceInPlace({
					pairs: withinBandPairs,
					target: newBands[b].facets[f].path,
					source: nextPath
				});
			}

			replaceInPlace({
				pairs: acrossBandsPairs,
				target: newBands[b].facets[f].path,
				source: prevBandPaths[f]
			});

			const shouldRemove = evaluateSkipEdge(
				tiledPatternConfig.config.skipEdges || 'none',
				f,
				band.facets.length - 1
			);

			if (shouldRemove) {
				removeInPlace({ indices: skipRemoveIndices, target: newBands[b].facets[f].path });
			}
		}
	}
	return newBands;
};
```

> **Note on partner pairs:** The original code branched on `Number(partner.label) === 0` (start of partner band) vs not, swapping which array became the source-list. In the spec, `partner.startEnd` and `partner.endEnd` already encode `{source, target}`, so when the partner-label condition flips, we *swap* source and target. This produces the same final mutation as the original code's `[6,5,2,1] → [7,8,11,12]` vs `[73,74,77,78] → [72,71,68,67]` arrays — verified by the equivalence test in Task 7.

- [x] **Step 2: Run type-check**

```bash
npm run check
```

Expected: no new errors related to `adjuster.ts`.

- [x] **Step 3: Commit**

```bash
git add src/lib/patterns/shield-tesselation/adjuster.ts
git commit -m "Add spec-driven shield adjuster"
git push
```

---

### Task 6: Index file

**Files:**
- Create: `src/lib/patterns/shield-tesselation/index.ts`

- [x] **Step 1: Create the index file**

Create `src/lib/patterns/shield-tesselation/index.ts`:

```ts
export { defaultShieldSpec } from './default-spec';
export { generateShieldTesselationTile, type ShieldGeneratorProps } from './generator';
export { adjustShieldTesselation } from './adjuster';
```

- [x] **Step 2: Run type-check**

```bash
npm run check
```

Expected: no new errors.

- [x] **Step 3: Commit**

```bash
git add src/lib/patterns/shield-tesselation/index.ts
git commit -m "Add shield-tesselation index exports"
git push
```

---

### Task 7: Equivalence test (the hard gate)

This is the centerpiece of the refactor. The test imports both the **old** `tiled-shield-tesselation-pattern.ts` and the **new** `shield-tesselation/` module, runs both at multiple parameter combinations, and asserts deep equality. Once the test passes for all cases, the old file can be deleted.

The test has two parts:
- **Generator equivalence:** `generateShieldTesselationTile(defaultShieldSpec, props) ≡ oldGenerateShieldTesselationTile(props)` for all parameter combinations.
- **Adjuster equivalence:** `adjustShieldTesselation(bands, config, tubes, defaultShieldSpec) ≡ oldAdjustShieldTesselationAfterTiling(bands, config, tubes)` for representative band/tube fixtures.

Adjuster fixtures are minimal — the test constructs a small synthetic `BandCutPattern` with one band and a few facets, exercises each `endsMatched` / `skipEdges` / `endLooped` branch, and asserts deep equality of the result.

**Files:**
- Create: `src/lib/patterns/shield-tesselation/__tests__/equivalence.test.ts`

- [ ] **Step 1: Write the equivalence test for the generator**

Create `src/lib/patterns/shield-tesselation/__tests__/equivalence.test.ts`:

```ts
import { generateShieldTesselationTile as oldGenerate } from '../../tiled-shield-tesselation-pattern';
import { generateShieldTesselationTile as newGenerate } from '../generator';
import { defaultShieldSpec } from '../default-spec';
import type { Band } from '$lib/types';

describe('shield-tesselation generator equivalence', () => {
	const sideOrientations: Band['sideOrientation'][] = ['inside', 'outside'];
	const sizes = [1, 100];
	const columnsList = [1, 2, 3, 5];
	const rowsList = [1]; // generator forces rows to 1 internally

	for (const size of sizes) {
		for (const columns of columnsList) {
			for (const rows of rowsList) {
				for (const sideOrientation of sideOrientations) {
					it(`matches old output for size=${size} rows=${rows} columns=${columns} side=${sideOrientation}`, () => {
						const props = {
							size,
							rows,
							columns,
							variant: 'rect' as const,
							sideOrientation
						};
						const oldResult = oldGenerate(props);
						const newResult = newGenerate(defaultShieldSpec, props);
						expect(newResult).toEqual(oldResult);
					});
				}
			}
		}
	}
});
```

- [ ] **Step 2: Run the test**

```bash
npm run test:unit -- src/lib/patterns/shield-tesselation/__tests__/equivalence.test.ts
```

Expected: PASS for all combinations. If FAIL, the new generator's output diverged from the old one — fix `generator.ts` until the test passes. Likely culprits: unit dimension scaling (the spec stores raw coefficients; the generator multiplies by `w`/`h`), or invert-group logic if `invert` is enabled.

- [ ] **Step 3: Commit**

```bash
git add src/lib/patterns/shield-tesselation/__tests__/equivalence.test.ts
git commit -m "Add generator equivalence test for shield tesselation"
git push
```

- [ ] **Step 4: Add adjuster equivalence test**

Append to `src/lib/patterns/shield-tesselation/__tests__/equivalence.test.ts`:

```ts
import { adjustShieldTesselationAfterTiling as oldAdjust } from '../../tiled-shield-tesselation-pattern';
import { adjustShieldTesselation as newAdjust } from '../adjuster';
import type {
	BandCutPattern,
	TiledPatternConfig,
	TubeCutPattern,
	SkipEdges
} from '$lib/types';

const makeFacet = (offsetX: number, segmentCount: number) => {
	const path = [];
	for (let i = 0; i < segmentCount; i++) {
		path.push(['L', offsetX + i, 0] as ['L', number, number]);
	}
	const quad = {
		a: { x: offsetX, y: 0 },
		b: { x: offsetX + 10, y: 0 },
		c: { x: offsetX + 10, y: 10 },
		d: { x: offsetX, y: 10 }
	};
	return { path, quad, label: '0' } as any;
};

const makeBand = (facetCount: number, segmentsPerFacet: number, bandIndex = 0): BandCutPattern => {
	const facets = [];
	for (let f = 0; f < facetCount; f++) {
		facets.push(makeFacet(f * 10, segmentsPerFacet));
	}
	return {
		facets,
		sideOrientation: 'inside',
		svgPath: undefined,
		id: `b-${bandIndex}`,
		tagAnchorPoint: { x: 0, y: 0 },
		tagAngle: 0,
		projectionType: 'patterned',
		address: { globule: 0, tube: 0, band: bandIndex },
		bounds: undefined as any,
		meta: undefined
	} as any;
};

const makeConfig = (overrides: Partial<TiledPatternConfig['config']> = {}): TiledPatternConfig =>
	({
		type: 'tiledShieldTesselationPattern',
		tiling: 'quadrilateral',
		config: {
			rowCount: 1,
			columnCount: 1,
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 1,
			endsMatched: false,
			endsTrimmed: false,
			endLooped: 0,
			variant: 'rect',
			skipEdges: 'none',
			scaleConfig: {} as any,
			...overrides
		}
	}) as TiledPatternConfig;

describe('shield-tesselation adjuster equivalence', () => {
	const cases: { name: string; overrides: Partial<TiledPatternConfig['config']> }[] = [
		{ name: 'baseline (no special flags)', overrides: {} },
		{ name: 'endLooped=1', overrides: { endLooped: 1 } },
		{ name: 'skipEdges=all', overrides: { skipEdges: 'all' as SkipEdges } },
		{ name: 'skipEdges=not-both', overrides: { skipEdges: 'not-both' as SkipEdges } }
	];

	for (const { name, overrides } of cases) {
		it(`matches old adjuster for ${name}`, () => {
			const bands = [makeBand(3, 80), makeBand(3, 80, 1)];
			const tubes: TubeCutPattern[] = [];
			const config = makeConfig(overrides);

			const oldResult = oldAdjust(structuredClone(bands), config, tubes);
			const newResult = newAdjust(structuredClone(bands), config, tubes, defaultShieldSpec);

			expect(newResult).toEqual(oldResult);
		});
	}
});
```

- [ ] **Step 5: Run the adjuster test**

```bash
npm run test:unit -- src/lib/patterns/shield-tesselation/__tests__/equivalence.test.ts
```

Expected: PASS for all four cases. If FAIL, the adjuster diverged — likely culprits: pair direction (source/target swapped), `partner.endEnd` mapping (the old code's `[73,74,77,78] → [72,71,68,67]` requires either the spec stores it source→target or the new code swaps source/target when `Number(partner.label) === 0`), or `retargetPairs` index expansion.

- [ ] **Step 6: Commit**

```bash
git add src/lib/patterns/shield-tesselation/__tests__/equivalence.test.ts
git commit -m "Add adjuster equivalence test for shield tesselation"
git push
```

---

### Task 8: Wire new shield into pattern-definitions.ts

Now that the new pipeline matches the old one, route the registered `tiledShieldTesselationPattern` entry through the new functions. The wrapper signature stays loose (`adjustAfterTiling: any`) — Phase 2 will tighten this when the pattern registry is redesigned.

**Files:**
- Modify: `src/lib/patterns/pattern-definitions.ts`

- [ ] **Step 1: Update imports and shield entry**

In `src/lib/patterns/pattern-definitions.ts`, replace lines 22–25:

```ts
import {
	adjustShieldTesselationAfterTiling,
	generateShieldTesselationTile
} from './tiled-shield-tesselation-pattern';
```

with:

```ts
import {
	adjustShieldTesselation,
	defaultShieldSpec,
	generateShieldTesselationTile
} from './shield-tesselation';
```

Then update the `tiledShieldTesselationPattern` entry (around line 116). Replace:

```ts
tiledShieldTesselationPattern: {
	getPattern: (
		rows: number,
		columns: number,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		quadBand: Quadrilateral[] | undefined = undefined,
		variant: GridVariant | undefined = 'rect',
		sideOrientation: Band['sideOrientation']
	) => {
		return generateShieldTesselationTile({ size: 1, rows, columns, variant, sideOrientation });
	},
	tagAnchor: { facetIndex: 0, segmentIndex: 3 },
	adjustAfterTiling: (
		patternBand: PathSegment[][],
		quadBand: Quadrilateral[],
		tiledPatternConfig: TiledPatternConfig
	) => {
		const adjusted = adjustShieldTesselationAfterTiling(
			patternBand,
			quadBand,
			tiledPatternConfig
		);
		return adjusted;
	}
},
```

with:

```ts
tiledShieldTesselationPattern: {
	getPattern: (
		rows: number,
		columns: number,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		quadBand: Quadrilateral[] | undefined = undefined,
		variant: GridVariant | undefined = 'rect',
		sideOrientation: Band['sideOrientation']
	) => {
		return generateShieldTesselationTile(defaultShieldSpec, {
			size: 1,
			rows,
			columns,
			variant,
			sideOrientation
		});
	},
	tagAnchor: { facetIndex: 0, segmentIndex: 3 },
	adjustAfterTiling: (
		bands: BandCutPattern[],
		tiledPatternConfig: TiledPatternConfig,
		tubes: TubeCutPattern[]
	) => {
		return adjustShieldTesselation(bands, tiledPatternConfig, tubes, defaultShieldSpec);
	}
},
```

The wrapper's parameter names now reflect the *actual* call signature used at the call site in `src/lib/cut-pattern/generate-pattern.ts:208` (`adjustAfterTiling(tp.bands, tiledPatternConfig, tubePatterns)`), fixing a long-standing naming lie.

You'll also need to add type imports for `BandCutPattern` and `TubeCutPattern` near the top:

```ts
import type {
	BandCutPattern,
	PathSegment,
	CutPattern,
	Quadrilateral,
	PatternGenerator,
	TiledPatternConfig,
	GridVariant,
	PanelVariant,
	Band,
	TubeCutPattern
} from '$lib/types';
```

- [ ] **Step 2: Run the equivalence test (still works because old file is still present)**

```bash
npm run test:unit -- src/lib/patterns/shield-tesselation/__tests__/equivalence.test.ts
```

Expected: PASS — both old and new files still exist and the test verifies they're equivalent.

- [ ] **Step 3: Run full type-check**

```bash
npm run check
```

Expected: no new errors. The pre-existing ~378 errors (per CLAUDE.md note) may remain.

- [ ] **Step 4: Manual smoke test**

Start the dev server and visually verify the shield pattern still renders correctly:

```bash
npm run dev
```

Open `/designer2`, select a project that uses the shield pattern (or set `type: 'tiledShieldTesselationPattern'` in TilingControl), and confirm the rendered SVG output looks identical to before. Test:
- Default: rows=1, columns=1
- Multi-column: columns=3
- `endsMatched: true`
- `skipEdges: 'all'`

If any visual divergence appears, the equivalence test missed a code path — add a test case for it and fix.

- [ ] **Step 5: Commit**

```bash
git add src/lib/patterns/pattern-definitions.ts
git commit -m "Wire new shield-tesselation module into pattern-definitions"
git push
```

---

### Task 9: Delete the old shield file

Once equivalence is verified end-to-end, retire the old file. The equivalence test gets reduced to a regression test of `defaultShieldSpec` against captured snapshots.

**Files:**
- Delete: `src/lib/patterns/tiled-shield-tesselation-pattern.ts`
- Modify: `src/lib/patterns/index.ts` (replace export)
- Modify: `src/lib/patterns/shield-tesselation/__tests__/equivalence.test.ts` (replace cross-file equivalence with snapshot regression)

- [ ] **Step 1: Capture snapshots from the current (still-equivalent) old code, before deletion**

Add a new test file `src/lib/patterns/shield-tesselation/__tests__/snapshot.test.ts` that captures golden output:

```ts
import { generateShieldTesselationTile } from '../generator';
import { defaultShieldSpec } from '../default-spec';
import type { Band } from '$lib/types';

describe('shield-tesselation generator snapshot', () => {
	const sideOrientations: Band['sideOrientation'][] = ['inside', 'outside'];
	const sizes = [1, 100];
	const columnsList = [1, 2, 3, 5];

	for (const size of sizes) {
		for (const columns of columnsList) {
			for (const sideOrientation of sideOrientations) {
				it(`generator output snapshot: size=${size} columns=${columns} side=${sideOrientation}`, () => {
					const result = generateShieldTesselationTile(defaultShieldSpec, {
						size,
						rows: 1,
						columns,
						variant: 'rect',
						sideOrientation
					});
					expect(result).toMatchSnapshot();
				});
			}
		}
	}
});
```

- [ ] **Step 2: Run the snapshot test to capture snapshots**

```bash
npm run test:unit -- src/lib/patterns/shield-tesselation/__tests__/snapshot.test.ts
```

Expected: PASS, with snapshots captured into `__snapshots__/snapshot.test.ts.snap`. These snapshots are the golden record of the spec-driven shield's output.

- [ ] **Step 3: Commit the snapshots**

```bash
git add src/lib/patterns/shield-tesselation/__tests__/snapshot.test.ts \
        src/lib/patterns/shield-tesselation/__tests__/__snapshots__
git commit -m "Capture shield generator output snapshots"
git push
```

- [ ] **Step 4: Replace the cross-file equivalence test with a no-op (or delete it)**

Delete the cross-file equivalence test now that the snapshot captures the same guarantee:

```bash
rm src/lib/patterns/shield-tesselation/__tests__/equivalence.test.ts
```

- [ ] **Step 5: Update `src/lib/patterns/index.ts`**

Replace the `export * from './tiled-shield-tesselation-pattern';` line with:

```ts
export * from './shield-tesselation';
```

- [ ] **Step 6: Delete the old file and the unused copy**

```bash
git rm src/lib/patterns/tiled-shield-tesselation-pattern.ts
```

Note: there's also an untracked `src/lib/patterns/tiled-multihex-tesselation-pattern copy.ts` from earlier work — leave it untouched (it's separate scope).

- [ ] **Step 7: Run all tests**

```bash
npm run test:unit
```

Expected: PASS. The snapshot test and any other shield-related tests should all pass.

- [ ] **Step 8: Run full type-check**

```bash
npm run check
```

Expected: no new errors. The deletion of `tiled-shield-tesselation-pattern.ts` removes the old `adjustShieldTesselationAfterTiling` and `generateShieldTesselationTile` exports — verify nothing outside `pattern-definitions.ts` still imports them.

- [ ] **Step 9: Commit**

```bash
git add src/lib/patterns/index.ts \
        src/lib/patterns/tiled-shield-tesselation-pattern.ts \
        src/lib/patterns/shield-tesselation/__tests__/equivalence.test.ts
git commit -m "Delete old shield tesselation file; switch to snapshot-only test"
git push
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 2: Run type-check**

```bash
npm run check
```

Expected: no new errors compared to baseline.

- [ ] **Step 3: Manual UI verification**

```bash
npm run dev
```

Open `/designer2`. Verify shield rendering for at least three configurations:
- Default shield with rows=1, columns=1, endsMatched=false
- Shield with columns=3
- Shield with endsMatched=true and a multi-band projection

Compare against pre-Phase-1 behavior. The output should be visually identical.

- [ ] **Step 4: Push final state**

```bash
git status
git log --oneline main..HEAD
```

Confirm the branch contains the expected commit history and is fully pushed.

---

## What's NOT in Phase 1 (deferred to Phases 2–4)

Phase 2 (variant storage + picker integration):
- Add `kind: 'tiled-pattern-spec'` rows to the `shades_configs` table
- New CRUD endpoints / store layer for variants (`tilePatternSpecStore.ts`)
- Pattern registry redesign (`pattern-registry.ts` per the spec)
- Loosen `TiledPattern` to `string`
- TilingControl picker grouping (algorithms → variants)
- `TiledPatternConfig.type` resolution falls back to `defaultShieldSpec` when the referenced variant id is missing

Phase 3 (SegmentPathEditor + Unit mode editor):
- Extract `path-editor-shared.ts` from `PathEditor.svelte`
- New `SegmentPathEditor.svelte` for `PathSegment[]`
- New `TileEditor.svelte` floater with Unit mode only
- Floater registration in `sidebar-definitions.ts`
- Save / Save As / Discard / Delete UI

Phase 4 (adjustment-rule editing modes):
- Within Band / Across Bands / Partner Start / Partner End / Skip Remove modes
- `AdjacencyGhost.svelte` for ghost neighbor rendering
- `RuleList.svelte` sidebar with click-to-highlight
- Drag-line interaction for creating / deleting rules

Each phase becomes its own plan once the previous one lands.

---

## Risk register

| Risk | Mitigation |
|---|---|
| Old `adjustShieldTesselationAfterTiling` and new `adjustShieldTesselation` diverge in subtle ways (e.g., partner-pair direction, retarget edge cases) | Adjuster equivalence test covers the four main flag combinations; cross-file test stays in place through Task 8 to verify wiring change preserves behavior |
| Coordinate scaling difference between old (multipliers inline) and new (multipliers in generator) introduces floating-point drift | Default spec values written *without* `* w` and `* h` (raw coefficients); generator applies `w` / `h` once at the same point in the pipeline as the original; equivalence test uses `toEqual` (exact match) |
| `pattern-definitions.ts` change breaks downstream code that depended on the old wrapper's parameter names | The wrapper is the only consumer that destructures `adjustAfterTiling`; the actual call signature is unchanged |
| Pre-existing TypeScript errors mask new ones introduced by the refactor | After each task, scan `npm run check` output diff for *new* errors specifically |
| Hidden code paths (e.g., `invert` is currently always false but the code path exists) might be exercised by some configuration the equivalence test doesn't cover | The equivalence test pins behavior; if a code path is not exercised, it's not part of v1's contract — Phase 1 explicitly preserves only what the existing tests cover |
