# Pattern Post-Processing (Hole Dropping) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user drop internal holes from merged tiled band paths — all of them, a random share of them, or a share that varies along the band — without ever re-running the merge.

**Architecture:** The prepare pipeline gains a stage. In the band-merge worker, `mergeBand` is followed by `buildHoleIndex`, which finds every internal contour and records where it sits along the parent band (stage 1b, config-independent). On the main thread, `dropHoles` takes that index plus the user's config and rebuilds the path without the dropped contours (stage 2, config-dependent, milliseconds). `mergedBandPaths` becomes a derived store over the raw merge, the indexes and the config, so a config change re-renders with no re-merge.

**Tech Stack:** TypeScript, SvelteKit (Svelte 5 runes in editor panels; NavHeader is still Svelte 4 `$:`), Jest (`testEnvironment: 'node'`, ESM via ts-jest), Playwright, paper-core (stage 1 only — nothing in this plan touches paper).

**Spec:** `docs/superpowers/specs/2026-09-19-pattern-post-processing-design.md`

**Feature source:** `docs/specs/pattern-post-processing.md`

## Global Constraints

- **This plan is provisional.** It is written against the worker-pool design and plan (`docs/superpowers/specs/2026-09-19-prepare-download-worker-pool-design.md`, `docs/superpowers/plans/2026-09-19-prepare-download-worker-pool.md`), which was in flight when this was written. **Task 1 reconciles it against the landed code before anything else runs.**
- **No `Math.random()`** anywhere in stage 1b or stage 2. Randomness comes only from the per-band `seed` in the payload, through the PRNG in Task 5.
- **Purity:** `path-contours.ts`, `hole-index.ts`, `drop-holes.ts` and `hole-drop-config.ts` import nothing from `$lib/stores`, nothing from paper, nothing from `bezier-js`, and no Three.js. They take plain data and return plain data.
- **Tiled only.** Hole dropping never applies when `patternTypeConfig.type === 'outlined'`.
- **No migration.** `postProcess` is optional in `PatternConfig`, exactly as `splits?` is: absent decodes to "no dropping".
- Tests live in `src/lib/cut-pattern/__tests__/` and `src/lib/stores/__tests__/`, named `*.test.ts`.
- Run a single suite with `npx jest <path>`; the whole suite with `npm run test:unit`.
- Format before every commit: `npx prettier --write <files>`.
- Baselines to hold (from the pool design): `npm run test:unit` 1405 passed / 101 snapshots / 161 suites — this plan only adds; `npm run check` 431 errors, 76 warnings — do not increase.
- Beads issue: `shades-k7z`. Mark it `in_progress` at Task 1 and close it at Task 11.

---

### Task 1: Confirm the reconciliation still holds

The reconciliation was **already performed**, against the branch with pool-plan Tasks 1-7 landed (Task 8 — end-to-end proof and measurement — was still in flight and touches no interface used here). Every name below was read from the landed code, not designed. This task is the short re-check before implementation starts.

**Landed facts this plan is written against:**

- `BandMergePayload` (`src/lib/cut-pattern/band-merge-payload.ts`) carries `id`, `facets: { path, strokeWidth? }[]`, `tagAnchorPoint?`, `tagAngle?`, `tagAnchorAutoAngle?`, `pieceStartFraction`, `pieceEndFraction`, `labelTextDims?`, `seed`. `seedForBand(runSeed, bandId)` is FNV-1a over `` `${runSeed}:${bandId}` ``.
- `toBandMergePayloads(tubes, labelTextDims, runSeed = 0)`. **NavHeader calls it with two arguments**, so every payload seed is the `runSeed = 0` base seed. See the rerolling correction below.
- The worker core is a factory, not a bare function: `createBandMergeCore(overrides?)` returns `{ handle(message, post) }`, posting a `MergeResponse` — `{ type: 'merge-result'; bandId; path }` or `{ type: 'merge-error'; bandId; error }`.
- `MergeCtx` (`src/lib/cut-pattern/merge-band.ts`) is `{ patternType: string; selfTag?; keepConnected: number }`. **`patternType` is the tiled config id** (e.g. `'tiledHexPattern-1'`), not the literal `'tiled'`; `mergeBand` branches on `!== 'outlined'`.
- `PoolRunResult` is `{ paths: Map<string, PathSegment[]>; errors: Map<string, string>; cancelled: boolean; generation: number }`. `createBandMergePool(options?)` returns `{ run, cancel }`.
- **The inline small-job path lives in NavHeader**, not in the pool: `runPrepare` merges directly when `payloads.length <= 2`. Task 7 therefore does not touch the pool's dispatch, and Task 9 covers the inline branch.
- The pool-plan Task 6 seam **did ship**: `mergedPathStore.ts` exports `mergedBandPathsRaw` and an identity `postProcessBandPaths`, and NavHeader's `publish(paths)` helper calls it. Task 8 deletes both the identity function and that call.
- Real-geometry test helpers live at `src/lib/cut-pattern/__tests__/helpers/real-geometry.ts`: `buildDefaultGeometry()`, `generateProjectionTubes(geometry, patternTypeConfig, splits?, tubes?)`, `splitAllTubesAt(geometry, quads)`, `partsOf(tube, band)`. Suites pair them with `tiledPatternConfigs['tiledHexPattern-1']` from `$lib/shades-config`. Tasks 7 and 11 use these; there is no JSON fixture to load.

**The rerolling correction this surfaced.** The design said the per-band seed comes from `runSeed + band.id`, and that bumping `runSeed` is the reroll. But payload seeds are baked at _extraction_ time, before stage 1 — so rerolling that way would demand a full re-prepare, which is precisely what stage 2 exists to avoid. Since NavHeader extracts with the default `runSeed = 0`, `payload.seed` is a stable per-band base, and **`runSeed` is mixed in at stage 2 instead** (`seedFor` in Task 5). Reroll stays a stage-2-only change. Tasks 4, 5 and 8 are written that way.

**Files:**

- Read: the files named above.

- [ ] **Step 1: Re-check the landed facts**

```bash
git log --oneline -1
grep -n "export type MergeResponse" -A 3 src/lib/workers/band-merge-worker-core.ts
grep -n "export type PoolRunResult" -A 5 src/lib/workers/band-merge-pool.ts
grep -n "postProcessBandPaths\|mergedBandPathsRaw" src/lib/stores/mergedPathStore.ts src/components/nav-header/NavHeader.svelte
```

Every fact above must still hold. If the pool's Task 8 work changed one — it should not, being tests and measurement — fix the affected task here before continuing.

- [ ] **Step 2: Record the baselines**

```bash
npm run test:unit 2>&1 | tail -5
npm run check 2>&1 | tail -3
```

These are what "no regressions" is measured against at Task 11.

- [ ] **Step 3: Claim the issue**

```bash
bd update shades-k7z --status=in_progress
```

---

### Task 2: Contour splitting and metrics

A merged band path is a flat `PathSegment[]` holding many `M … Z` runs — `paperToPathSegments` emits one run per paper child. This task turns that flat array into measurable contours. It knows nothing about holes.

**Files:**

- Create: `src/lib/cut-pattern/path-contours.ts`
- Test: `src/lib/cut-pattern/__tests__/path-contours.test.ts`

**Interfaces:**

- Consumes: `PathSegment` from `$lib/types`.
- Produces:
  - `type Pt = { x: number; y: number }`
  - `type Contour = { start: number; end: number; points: Pt[]; bbox: BBox; area: number; centroid: Pt }`
  - `type BBox = { minX: number; minY: number; maxX: number; maxY: number }`
  - `splitContours(path: PathSegment[]): Contour[]`
  - `pointInPolygon(p: Pt, polygon: Pt[]): boolean`
  - `bboxContains(outer: BBox, inner: BBox): boolean`

`start` is the index of the contour's `M`; `end` is exclusive. `area` is the signed shoelace area. `centroid` is the polygon centroid, falling back to the bbox centre when the area is degenerate.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/cut-pattern/__tests__/path-contours.test.ts
import { describe, it, expect } from '@jest/globals';
import { splitContours, pointInPolygon, bboxContains } from '../path-contours';
import type { PathSegment } from '$lib/types';

/** A closed axis-aligned square, counter-clockwise in SVG's y-down space. */
const square = (x: number, y: number, size: number): PathSegment[] => [
	['M', x, y],
	['L', x + size, y],
	['L', x + size, y + size],
	['L', x, y + size],
	['Z']
];

describe('splitContours', () => {
	it('splits a two-contour path at each M and records its index range', () => {
		const path: PathSegment[] = [...square(0, 0, 10), ...square(2, 2, 4)];
		const contours = splitContours(path);

		expect(contours).toHaveLength(2);
		expect(contours[0].start).toBe(0);
		expect(contours[0].end).toBe(5);
		expect(contours[1].start).toBe(5);
		expect(contours[1].end).toBe(10);
	});

	it('measures bbox, absolute area and centroid of a square', () => {
		const [contour] = splitContours(square(0, 0, 10));

		expect(contour.bbox).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
		expect(Math.abs(contour.area)).toBeCloseTo(100, 6);
		expect(contour.centroid.x).toBeCloseTo(5, 6);
		expect(contour.centroid.y).toBeCloseTo(5, 6);
	});

	it('samples cubic segments rather than treating them as lines', () => {
		// A half-circle-ish bulge to the right of the chord from (0,0) to (0,10).
		const path: PathSegment[] = [['M', 0, 0], ['C', 8, 0, 8, 10, 0, 10], ['Z']];
		const [contour] = splitContours(path);

		expect(contour.points.length).toBeGreaterThan(4);
		expect(contour.bbox.maxX).toBeGreaterThan(3);
		expect(Math.abs(contour.area)).toBeGreaterThan(20);
	});

	it('falls back to the bbox centre when the contour has no area', () => {
		const path: PathSegment[] = [['M', 0, 0], ['L', 10, 0], ['Z']];
		const [contour] = splitContours(path);

		expect(contour.area).toBeCloseTo(0, 9);
		expect(contour.centroid).toEqual({ x: 5, y: 0 });
	});

	it('ignores a trailing M with no geometry', () => {
		const path: PathSegment[] = [...square(0, 0, 10), ['M', 50, 50]];
		expect(splitContours(path)).toHaveLength(1);
	});
});

describe('pointInPolygon', () => {
	const poly = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 10 },
		{ x: 0, y: 10 }
	];

	it('is true inside and false outside', () => {
		expect(pointInPolygon({ x: 5, y: 5 }, poly)).toBe(true);
		expect(pointInPolygon({ x: 15, y: 5 }, poly)).toBe(false);
	});
});

describe('bboxContains', () => {
	it('is true only when the inner box is wholly inside', () => {
		const outer = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
		expect(bboxContains(outer, { minX: 2, minY: 2, maxX: 4, maxY: 4 })).toBe(true);
		expect(bboxContains(outer, { minX: 2, minY: 2, maxX: 14, maxY: 4 })).toBe(false);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/cut-pattern/__tests__/path-contours.test.ts`
Expected: FAIL — cannot find module `../path-contours`.

- [ ] **Step 3: Implement**

```ts
// src/lib/cut-pattern/path-contours.ts
import type { PathSegment } from '$lib/types';

export type Pt = { x: number; y: number };
export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * One `M … Z` run of a flat path, flattened to a polygon and measured.
 *
 * `start`/`end` index back into the ORIGINAL `PathSegment[]` (`end` exclusive),
 * which is what makes dropping a hole a slice deletion rather than a re-union.
 */
export type Contour = {
	start: number;
	end: number;
	points: Pt[];
	bbox: BBox;
	/** Signed shoelace area. Sign is winding, which we never trust; use |area|. */
	area: number;
	centroid: Pt;
};

/** Samples per cubic/quadratic segment. Enough for centroid and containment. */
const CURVE_SAMPLES = 8;

const cubicAt = (p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt => {
	const u = 1 - t;
	const a = u * u * u;
	const b = 3 * u * u * t;
	const c = 3 * u * t * t;
	const d = t * t * t;
	return {
		x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
		y: a * p0.y + b * c1.y + c * c2.y + d * p1.y
	};
};

const quadraticAt = (p0: Pt, c: Pt, p1: Pt, t: number): Pt => {
	const u = 1 - t;
	return {
		x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
		y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y
	};
};

const shoelaceArea = (points: Pt[]): number => {
	let sum = 0;
	for (let i = 0; i < points.length; i += 1) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		sum += a.x * b.y - b.x * a.y;
	}
	return sum / 2;
};

const boundsOf = (points: Pt[]): BBox => {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of points) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return { minX, minY, maxX, maxY };
};

const centroidOf = (points: Pt[], area: number, bbox: BBox): Pt => {
	// A sliver, a degenerate run, or a single edge has no usable polygon
	// centroid; the bbox centre is a stable stand-in and only ever feeds a
	// position fraction, never a cut line.
	if (Math.abs(area) < 1e-9) {
		return { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 };
	}
	let cx = 0;
	let cy = 0;
	for (let i = 0; i < points.length; i += 1) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		const cross = a.x * b.y - b.x * a.y;
		cx += (a.x + b.x) * cross;
		cy += (a.y + b.y) * cross;
	}
	return { x: cx / (6 * area), y: cy / (6 * area) };
};

const measure = (start: number, end: number, points: Pt[]): Contour => {
	const bbox = boundsOf(points);
	const area = shoelaceArea(points);
	return { start, end, points, bbox, area, centroid: centroidOf(points, area, bbox) };
};

/**
 * Split a flat path into its contours, flattening curves to polylines.
 *
 * `paperToPathSegments` normalises everything to M/L/C/Z, so `Q` and `A` are
 * handled defensively rather than expected. An `A` contributes only its
 * endpoint: it never reaches here from a merge, and approximating it as a line
 * is better than dropping the point.
 */
export const splitContours = (path: PathSegment[]): Contour[] => {
	const contours: Contour[] = [];
	let start = -1;
	let points: Pt[] = [];
	let cursor: Pt = { x: 0, y: 0 };

	const flush = (end: number) => {
		if (start >= 0 && points.length >= 2) contours.push(measure(start, end, points));
		start = -1;
		points = [];
	};

	for (let i = 0; i < path.length; i += 1) {
		const seg = path[i];
		const cmd = seg[0];
		if (cmd === 'M') {
			flush(i);
			start = i;
			cursor = { x: seg[1], y: seg[2] };
			points = [cursor];
		} else if (start < 0) {
			continue;
		} else if (cmd === 'L') {
			cursor = { x: seg[1], y: seg[2] };
			points.push(cursor);
		} else if (cmd === 'C') {
			const c1 = { x: seg[1], y: seg[2] };
			const c2 = { x: seg[3], y: seg[4] };
			const p1 = { x: seg[5], y: seg[6] };
			for (let s = 1; s <= CURVE_SAMPLES; s += 1) {
				points.push(cubicAt(cursor, c1, c2, p1, s / CURVE_SAMPLES));
			}
			cursor = p1;
		} else if (cmd === 'Q') {
			const c = { x: seg[1], y: seg[2] };
			const p1 = { x: seg[3], y: seg[4] };
			for (let s = 1; s <= CURVE_SAMPLES; s += 1) {
				points.push(quadraticAt(cursor, c, p1, s / CURVE_SAMPLES));
			}
			cursor = p1;
		} else if (cmd === 'A') {
			const p1 = { x: seg[6], y: seg[7] };
			points.push(p1);
			cursor = p1;
		} else if (cmd === 'Z') {
			flush(i + 1);
		}
	}
	flush(path.length);
	return contours;
};

/** Ray-casting containment. Boundary cases are not meaningful here. */
export const pointInPolygon = (p: Pt, polygon: Pt[]): boolean => {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
		const a = polygon[i];
		const b = polygon[j];
		const straddles = a.y > p.y !== b.y > p.y;
		if (straddles && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
			inside = !inside;
		}
	}
	return inside;
};

export const bboxContains = (outer: BBox, inner: BBox): boolean =>
	inner.minX >= outer.minX &&
	inner.minY >= outer.minY &&
	inner.maxX <= outer.maxX &&
	inner.maxY <= outer.maxY;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/cut-pattern/__tests__/path-contours.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/cut-pattern/path-contours.ts src/lib/cut-pattern/__tests__/path-contours.test.ts
git add src/lib/cut-pattern/path-contours.ts src/lib/cut-pattern/__tests__/path-contours.test.ts
git commit -m "feat(cut-pattern): split merged paths into measurable contours"
```

---

### Task 3: The hole index

Decide which contours are holes, and where each one sits along the **parent** band.

**Files:**

- Create: `src/lib/cut-pattern/hole-index.ts`
- Test: `src/lib/cut-pattern/__tests__/hole-index.test.ts`

**Interfaces:**

- Consumes: `splitContours`, `pointInPolygon`, `bboxContains`, `Contour`, `Pt` from `./path-contours`.
- Produces:
  - `type HoleRef = { start: number; end: number; bandFraction: number; area: number }`
  - `type BandHoleIndex = { seed: number; holes: HoleRef[] }`
  - `type HoleIndexInput = { facets: { path: PathSegment[] }[]; pieceStartFraction: number; pieceEndFraction: number; seed: number }`
  - `buildHoleIndex(path: PathSegment[], input: HoleIndexInput): BandHoleIndex`

`holes` is in contour order (ascending `start`), which is deterministic from the path — the PRNG in Task 5 depends on that ordering.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/cut-pattern/__tests__/hole-index.test.ts
import { describe, it, expect } from '@jest/globals';
import { buildHoleIndex } from '../hole-index';
import type { PathSegment } from '$lib/types';

const square = (x: number, y: number, w: number, h: number): PathSegment[] => [
	['M', x, y],
	['L', x + w, y],
	['L', x + w, y + h],
	['L', x, y + h],
	['Z']
];

/**
 * A straight band running down +y: `count` unit-square facets stacked, so the
 * centerline (facet centroids) runs from y=0.5 to y=count-0.5.
 */
const straightBand = (count: number) => ({
	facets: Array.from({ length: count }, (_, i) => ({ path: square(0, i, 1, 1) }))
});

describe('buildHoleIndex', () => {
	it('finds a contour nested inside another and ignores the outer one', () => {
		const path: PathSegment[] = [...square(0, 0, 10, 10), ...square(4, 4, 2, 2)];
		const index = buildHoleIndex(path, {
			...straightBand(10),
			pieceStartFraction: 0,
			pieceEndFraction: 1,
			seed: 7
		});

		expect(index.seed).toBe(7);
		expect(index.holes).toHaveLength(1);
		expect(index.holes[0].start).toBe(5);
		expect(index.holes[0].end).toBe(10);
		expect(index.holes[0].area).toBeCloseTo(4, 6);
	});

	it('treats an island inside a hole as solid, not as a hole', () => {
		const path: PathSegment[] = [
			...square(0, 0, 20, 20), // depth 0 — outer
			...square(4, 4, 10, 10), // depth 1 — hole
			...square(6, 6, 2, 2) // depth 2 — island inside the hole
		];
		const index = buildHoleIndex(path, {
			...straightBand(20),
			pieceStartFraction: 0,
			pieceEndFraction: 1,
			seed: 1
		});

		expect(index.holes.map((h) => h.start)).toEqual([5]);
	});

	it('handles several disconnected outer contours', () => {
		const path: PathSegment[] = [
			...square(0, 0, 4, 4),
			...square(1, 1, 1, 1), // hole in the first island
			...square(10, 0, 4, 4),
			...square(11, 1, 1, 1) // hole in the second island
		];
		const index = buildHoleIndex(path, {
			...straightBand(4),
			pieceStartFraction: 0,
			pieceEndFraction: 1,
			seed: 1
		});

		expect(index.holes.map((h) => h.start)).toEqual([5, 15]);
	});

	it('positions a hole by arc length along the centerline', () => {
		// 10 stacked unit facets; a hole centred at y≈7.5 sits ~0.78 along a
		// centerline that runs 0.5 → 9.5.
		const path: PathSegment[] = [...square(0, 0, 1, 10), ...square(0.4, 7.4, 0.2, 0.2)];
		const index = buildHoleIndex(path, {
			...straightBand(10),
			pieceStartFraction: 0,
			pieceEndFraction: 1,
			seed: 1
		});

		expect(index.holes[0].bandFraction).toBeCloseTo((7.5 - 0.5) / 9, 2);
	});

	it('maps a piece-local position onto the parent band (centre of piece 2 of 3)', () => {
		// Piece 2 of 3 spans [1/3, 2/3]; a hole at its local centre is 0.5 of the parent.
		const path: PathSegment[] = [...square(0, 0, 1, 10), ...square(0.4, 4.9, 0.2, 0.2)];
		const index = buildHoleIndex(path, {
			...straightBand(10),
			pieceStartFraction: 1 / 3,
			pieceEndFraction: 2 / 3,
			seed: 1
		});

		expect(index.holes[0].bandFraction).toBeCloseTo(0.5, 2);
	});

	it('maps a third of the way along piece 3 of 3 to 7/9', () => {
		// Piece 3 spans [2/3, 1]; local 1/3 → 2/3 + (1/3)(1/3) = 7/9.
		const localThird = 0.5 + (1 / 3) * 9; // centerline runs 0.5 → 9.5
		const path: PathSegment[] = [
			...square(0, 0, 1, 10),
			...square(0.4, localThird - 0.1, 0.2, 0.2)
		];
		const index = buildHoleIndex(path, {
			...straightBand(10),
			pieceStartFraction: 2 / 3,
			pieceEndFraction: 1,
			seed: 1
		});

		expect(index.holes[0].bandFraction).toBeCloseTo(7 / 9, 2);
	});

	it('returns no holes for a path with a single contour', () => {
		const index = buildHoleIndex(square(0, 0, 10, 10), {
			...straightBand(10),
			pieceStartFraction: 0,
			pieceEndFraction: 1,
			seed: 3
		});

		expect(index.holes).toEqual([]);
	});

	it('falls back to the piece midpoint when the band has no usable centerline', () => {
		const path: PathSegment[] = [...square(0, 0, 10, 10), ...square(4, 4, 2, 2)];
		const index = buildHoleIndex(path, {
			facets: [],
			pieceStartFraction: 0,
			pieceEndFraction: 1,
			seed: 1
		});

		expect(index.holes[0].bandFraction).toBeCloseTo(0.5, 6);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/cut-pattern/__tests__/hole-index.test.ts`
Expected: FAIL — cannot find module `../hole-index`.

- [ ] **Step 3: Implement**

```ts
// src/lib/cut-pattern/hole-index.ts
import type { PathSegment } from '$lib/types';
import {
	splitContours,
	pointInPolygon,
	bboxContains,
	type Contour,
	type Pt
} from './path-contours';

/**
 * One droppable internal contour.
 *
 * `start`/`end` index into the merged `PathSegment[]`; `bandFraction` is the
 * position of the hole's centroid along the PARENT band, 0 at the band's first
 * quad and 1 at its last.
 */
export type HoleRef = {
	start: number;
	end: number;
	bandFraction: number;
	/** |area| of the hole. Unused today; a future minimum-size filter needs it. */
	area: number;
};

export type BandHoleIndex = { seed: number; holes: HoleRef[] };

export type HoleIndexInput = {
	facets: { path: PathSegment[] }[];
	pieceStartFraction: number;
	pieceEndFraction: number;
	seed: number;
};

/**
 * Nesting depth of each contour, by containment rather than by winding.
 *
 * `uniteMany` deliberately does not normalise winding (see its doc comment), so
 * signed area is not a reliable hole signal on a merged path. A container must
 * have larger absolute area than what it contains, so each contour is tested
 * only against larger ones, bbox-prefiltered.
 */
const depthsOf = (contours: Contour[]): number[] => {
	const order = contours
		.map((contour, index) => ({ contour, index }))
		.sort((a, b) => Math.abs(b.contour.area) - Math.abs(a.contour.area));
	const depths = new Array<number>(contours.length).fill(0);

	for (let i = 0; i < order.length; i += 1) {
		const { contour, index } = order[i];
		let depth = 0;
		for (let j = 0; j < i; j += 1) {
			const candidate = order[j].contour;
			if (!bboxContains(candidate.bbox, contour.bbox)) continue;
			if (pointInPolygon(contour.points[0], candidate.points)) depth += 1;
		}
		depths[index] = depth;
	}
	return depths;
};

/** Mean of a facet path's on-curve points: its approximate centre. */
const facetCentroid = (path: PathSegment[]): Pt | undefined => {
	let sx = 0;
	let sy = 0;
	let n = 0;
	for (const seg of path) {
		if (seg[0] === 'Z') continue;
		const x = seg[seg.length - 2];
		const y = seg[seg.length - 1];
		if (typeof x !== 'number' || typeof y !== 'number') continue;
		sx += x;
		sy += y;
		n += 1;
	}
	return n === 0 ? undefined : { x: sx / n, y: sy / n };
};

type Centerline = { points: Pt[]; cumulative: number[]; total: number };

/**
 * The band's spine: one point per facet, in facet order.
 *
 * Tiled output is one facet per quad (`types.ts:464-470`), so this runs cleanly
 * along the band with no zigzag, and facet order settles which end is the start
 * without an orientation heuristic.
 */
const centerlineOf = (facets: { path: PathSegment[] }[]): Centerline => {
	const points: Pt[] = [];
	for (const facet of facets) {
		const c = facetCentroid(facet.path);
		if (c) points.push(c);
	}
	const cumulative: number[] = [0];
	let total = 0;
	for (let i = 1; i < points.length; i += 1) {
		const dx = points[i].x - points[i - 1].x;
		const dy = points[i].y - points[i - 1].y;
		total += Math.hypot(dx, dy);
		cumulative.push(total);
	}
	return { points, cumulative, total };
};

/**
 * Arc-length position of `p` along the centerline, as a fraction of its length.
 * 0.5 when the band has no usable centerline — a single facet, or none.
 */
const localFractionOf = (p: Pt, line: Centerline): number => {
	if (line.points.length < 2 || line.total <= 0) return 0.5;

	let best = Infinity;
	let bestArc = 0;
	for (let i = 1; i < line.points.length; i += 1) {
		const a = line.points[i - 1];
		const b = line.points[i];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const lengthSq = dx * dx + dy * dy;
		const t =
			lengthSq === 0
				? 0
				: Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
		const px = a.x + t * dx;
		const py = a.y + t * dy;
		const distanceSq = (p.x - px) ** 2 + (p.y - py) ** 2;
		if (distanceSq < best) {
			best = distanceSq;
			bestArc = line.cumulative[i - 1] + t * Math.sqrt(lengthSq);
		}
	}
	return bestArc / line.total;
};

/**
 * Index every internal hole of one merged band path.
 *
 * Pure and config-free: it decides WHERE holes are, never WHETHER to drop them.
 * Runs in the band-merge worker as stage 1b, where the facet geometry and the
 * piece span are already in hand.
 */
export const buildHoleIndex = (path: PathSegment[], input: HoleIndexInput): BandHoleIndex => {
	const contours = splitContours(path);
	if (contours.length < 2) return { seed: input.seed, holes: [] };

	const depths = depthsOf(contours);
	const line = centerlineOf(input.facets);
	const span = input.pieceEndFraction - input.pieceStartFraction;
	const holes: HoleRef[] = [];

	for (let i = 0; i < contours.length; i += 1) {
		if (depths[i] % 2 === 0) continue;
		const contour = contours[i];
		const local = localFractionOf(contour.centroid, line);
		holes.push({
			start: contour.start,
			end: contour.end,
			bandFraction: input.pieceStartFraction + local * span,
			area: Math.abs(contour.area)
		});
	}
	return { seed: input.seed, holes };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/cut-pattern/__tests__/hole-index.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/cut-pattern/hole-index.ts src/lib/cut-pattern/__tests__/hole-index.test.ts
git add src/lib/cut-pattern/hole-index.ts src/lib/cut-pattern/__tests__/hole-index.test.ts
git commit -m "feat(cut-pattern): index internal holes by position along the parent band"
```

---

### Task 4: Hole-drop config and curve sampling

The config types, their defaults, and the bezier → lookup-table conversion. No stores, no UI.

**Files:**

- Create: `src/lib/cut-pattern/hole-drop-config.ts`
- Test: `src/lib/cut-pattern/__tests__/hole-drop-config.test.ts`

**Interfaces:**

- Consumes: `BezierConfig`, `PointConfig2` from `$lib/types`.
- Produces:
  - `type HoleDropMode = 'none' | 'all' | 'random' | 'variable'`
  - `type HoleDropConfig = { mode: 'none' } | { mode: 'all' } | { mode: 'random'; chance: number } | { mode: 'variable'; curve: BezierConfig[] }`
  - `type PostProcessConfig = { dropHoles: HoleDropConfig; runSeed: number }`
  - `DEFAULT_POST_PROCESS: PostProcessConfig`
  - `defaultDropCurve(): BezierConfig[]`
  - `LUT_SAMPLES: 101`
  - `sampleDropCurve(curve: BezierConfig[], samples?: number): number[]`
  - `lookup(lut: number[], x: number): number`

The curve is read as **x = position along the band, y = drop chance**, clamped to the unit square.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/cut-pattern/__tests__/hole-drop-config.test.ts
import { describe, it, expect } from '@jest/globals';
import {
	DEFAULT_POST_PROCESS,
	defaultDropCurve,
	sampleDropCurve,
	lookup,
	LUT_SAMPLES
} from '../hole-drop-config';
import type { BezierConfig, PointConfig2 } from '$lib/types';

const pt = (x: number, y: number): PointConfig2 => ({ type: 'PointConfig2', x, y });
const curve = (
	p0: PointConfig2,
	c1: PointConfig2,
	c2: PointConfig2,
	p1: PointConfig2
): BezierConfig => ({ type: 'BezierConfig', points: [p0, c1, c2, p1] });

describe('DEFAULT_POST_PROCESS', () => {
	it('drops nothing', () => {
		expect(DEFAULT_POST_PROCESS).toEqual({ dropHoles: { mode: 'none' }, runSeed: 0 });
	});
});

describe('sampleDropCurve', () => {
	it('samples a flat curve to a constant table', () => {
		const lut = sampleDropCurve([curve(pt(0, 0.4), pt(0.33, 0.4), pt(0.66, 0.4), pt(1, 0.4))]);

		expect(lut).toHaveLength(LUT_SAMPLES);
		expect(lut[0]).toBeCloseTo(0.4, 6);
		expect(lut[50]).toBeCloseTo(0.4, 6);
		expect(lut[LUT_SAMPLES - 1]).toBeCloseTo(0.4, 6);
	});

	it('samples a rising diagonal so y tracks x', () => {
		const lut = sampleDropCurve([curve(pt(0, 0), pt(1 / 3, 1 / 3), pt(2 / 3, 2 / 3), pt(1, 1))]);

		expect(lut[0]).toBeCloseTo(0, 3);
		expect(lut[25]).toBeCloseTo(0.25, 2);
		expect(lut[50]).toBeCloseTo(0.5, 2);
		expect(lut[LUT_SAMPLES - 1]).toBeCloseTo(1, 3);
	});

	it('clamps values outside the unit square', () => {
		const lut = sampleDropCurve([curve(pt(0, -0.5), pt(0.33, -0.5), pt(0.66, 1.9), pt(1, 1.9))]);

		expect(Math.min(...lut)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...lut)).toBeLessThanOrEqual(1);
	});

	it('returns an all-zero table for an empty curve', () => {
		expect(sampleDropCurve([])).toEqual(new Array(LUT_SAMPLES).fill(0));
	});

	it('samples the default curve to a constant half', () => {
		const lut = sampleDropCurve(defaultDropCurve());
		expect(lut[0]).toBeCloseTo(0.5, 6);
		expect(lut[LUT_SAMPLES - 1]).toBeCloseTo(0.5, 6);
	});
});

describe('lookup', () => {
	const lut = [0, 0.5, 1];

	it('interpolates between samples and clamps out-of-range x', () => {
		expect(lookup(lut, 0)).toBeCloseTo(0, 6);
		expect(lookup(lut, 0.25)).toBeCloseTo(0.25, 6);
		expect(lookup(lut, 1)).toBeCloseTo(1, 6);
		expect(lookup(lut, -3)).toBeCloseTo(0, 6);
		expect(lookup(lut, 9)).toBeCloseTo(1, 6);
	});

	it('returns 0 for an empty table', () => {
		expect(lookup([], 0.5)).toBe(0);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/cut-pattern/__tests__/hole-drop-config.test.ts`
Expected: FAIL — cannot find module `../hole-drop-config`.

- [ ] **Step 3: Implement**

```ts
// src/lib/cut-pattern/hole-drop-config.ts
import type { BezierConfig, PointConfig2 } from '$lib/types';

export type HoleDropMode = 'none' | 'all' | 'random' | 'variable';

/**
 * How internal holes are dropped from a merged tiled band.
 *
 * `random` drops each hole independently with probability `chance`.
 * `variable` reads the curve as x = position along the band, y = drop chance.
 */
export type HoleDropConfig =
	| { mode: 'none' }
	| { mode: 'all' }
	| { mode: 'random'; chance: number }
	| { mode: 'variable'; curve: BezierConfig[] };

/**
 * `runSeed` is persisted with the config so a reopened design re-cuts
 * identically; the Reroll button bumps it.
 */
export type PostProcessConfig = { dropHoles: HoleDropConfig; runSeed: number };

export const DEFAULT_POST_PROCESS: PostProcessConfig = {
	dropHoles: { mode: 'none' },
	runSeed: 0
};

const pt = (x: number, y: number): PointConfig2 => ({ type: 'PointConfig2', x, y });

/** A flat 50%-everywhere curve: a neutral starting point in the editor. */
export const defaultDropCurve = (): BezierConfig[] => [
	{ type: 'BezierConfig', points: [pt(0, 0.5), pt(1 / 3, 0.5), pt(2 / 3, 0.5), pt(1, 0.5)] }
];

export const LUT_SAMPLES = 101;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const cubic = (a: number, b: number, c: number, d: number, t: number): number => {
	const u = 1 - t;
	return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

/** y of the curve run at parameter x, by bisection on t. Assumes x is monotone. */
const yAtX = (curve: BezierConfig[], x: number): number => {
	// Pick the sub-curve whose x-range covers x; fall back to the last one.
	let chosen = curve[curve.length - 1];
	for (const c of curve) {
		const x0 = c.points[0].x;
		const x3 = c.points[3].x;
		if (x >= Math.min(x0, x3) && x <= Math.max(x0, x3)) {
			chosen = c;
			break;
		}
	}
	const [p0, c1, c2, p1] = chosen.points;
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 24; i += 1) {
		const mid = (lo + hi) / 2;
		if (cubic(p0.x, c1.x, c2.x, p1.x, mid) < x) lo = mid;
		else hi = mid;
	}
	const t = (lo + hi) / 2;
	return clamp01(cubic(p0.y, c1.y, c2.y, p1.y, t));
};

/**
 * Sample a drop curve into a plain-number lookup table.
 *
 * The table, not the curve, is what stage 2 reads: it keeps the hot path free
 * of curve maths and keeps everything downstream trivially cloneable.
 */
export const sampleDropCurve = (curve: BezierConfig[], samples = LUT_SAMPLES): number[] => {
	if (!curve || curve.length === 0) return new Array(samples).fill(0);
	const lut = new Array<number>(samples);
	for (let i = 0; i < samples; i += 1) {
		lut[i] = yAtX(curve, i / (samples - 1));
	}
	return lut;
};

/** Linear interpolation into a sampled table, with x clamped to [0, 1]. */
export const lookup = (lut: number[], x: number): number => {
	if (lut.length === 0) return 0;
	if (lut.length === 1) return lut[0];
	const pos = clamp01(x) * (lut.length - 1);
	const i = Math.floor(pos);
	if (i >= lut.length - 1) return lut[lut.length - 1];
	const t = pos - i;
	return lut[i] * (1 - t) + lut[i + 1] * t;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/cut-pattern/__tests__/hole-drop-config.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/cut-pattern/hole-drop-config.ts src/lib/cut-pattern/__tests__/hole-drop-config.test.ts
git add src/lib/cut-pattern/hole-drop-config.ts src/lib/cut-pattern/__tests__/hole-drop-config.test.ts
git commit -m "feat(cut-pattern): add hole-drop config types and curve sampling"
```

---

### Task 5: Stage 2 — dropping holes

The only place holes disappear. Pure, seeded, millisecond-cheap.

**Files:**

- Create: `src/lib/cut-pattern/drop-holes.ts`
- Test: `src/lib/cut-pattern/__tests__/drop-holes.test.ts`

**Interfaces:**

- Consumes: `BandHoleIndex` from `./hole-index`; `PostProcessConfig`, `sampleDropCurve`, `lookup` from `./hole-drop-config`.
- Produces:
  - `mulberry32(seed: number): () => number`
  - `seedFor(baseSeed: number, runSeed: number): number`
  - `dropHoles(path: PathSegment[], index: BandHoleIndex, config: PostProcessConfig): PathSegment[]`

`dropHoles` takes the whole `PostProcessConfig`, not just its `dropHoles` field, because `runSeed` is mixed in here. `index.seed` is the payload's base seed, fixed when the band was merged; mixing at this point is what keeps Reroll a stage-2-only change (see Task 1).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/cut-pattern/__tests__/drop-holes.test.ts
import { describe, it, expect } from '@jest/globals';
import { dropHoles, mulberry32, seedFor } from '../drop-holes';
import { defaultDropCurve, type PostProcessConfig } from '../hole-drop-config';
import type { BandHoleIndex } from '../hole-index';
import type { BezierConfig, PathSegment, PointConfig2 } from '$lib/types';

const pt = (x: number, y: number): PointConfig2 => ({ type: 'PointConfig2', x, y });

/** A path of `n + 1` five-segment contours: contour 0 is the outer shell. */
const pathWith = (n: number): PathSegment[] => {
	const out: PathSegment[] = [];
	for (let i = 0; i <= n; i += 1) {
		out.push(['M', i, 0], ['L', i + 1, 0], ['L', i + 1, 1], ['L', i, 1], ['Z']);
	}
	return out;
};

const indexFor = (n: number, seed = 1): BandHoleIndex => ({
	seed,
	holes: Array.from({ length: n }, (_, i) => ({
		start: (i + 1) * 5,
		end: (i + 2) * 5,
		bandFraction: n === 1 ? 0.5 : i / (n - 1),
		area: 1
	}))
});

const cfg = (dropHoles: PostProcessConfig['dropHoles'], runSeed = 0): PostProcessConfig => ({
	dropHoles,
	runSeed
});

describe('mulberry32', () => {
	it('is deterministic for a seed and produces values in [0, 1)', () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		const runA = [a(), a(), a()];
		const runB = [b(), b(), b()];

		expect(runA).toEqual(runB);
		for (const v of runA) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it('produces different sequences for different seeds', () => {
		expect(mulberry32(1)()).not.toBeCloseTo(mulberry32(2)(), 9);
	});
});

describe('seedFor', () => {
	it('returns a stable 32-bit value that changes with either input', () => {
		expect(seedFor(123, 0)).toBe(seedFor(123, 0));
		expect(seedFor(123, 1)).not.toBe(seedFor(123, 0));
		expect(seedFor(124, 0)).not.toBe(seedFor(123, 0));
		expect(seedFor(123, 5)).toBeGreaterThanOrEqual(0);
		expect(seedFor(123, 5)).toBeLessThan(2 ** 32);
	});
});

describe('dropHoles', () => {
	it('returns the input untouched in none mode', () => {
		const path = pathWith(3);
		expect(dropHoles(path, indexFor(3), cfg({ mode: 'none' }))).toBe(path);
	});

	it('drops every hole in all mode, keeping the outer contour', () => {
		const result = dropHoles(pathWith(3), indexFor(3), cfg({ mode: 'all' }));

		expect(result).toHaveLength(5);
		expect(result[0]).toEqual(['M', 0, 0]);
	});

	it('is a no-op when the index has no holes', () => {
		const path = pathWith(0);
		expect(dropHoles(path, { seed: 1, holes: [] }, cfg({ mode: 'all' }))).toBe(path);
	});

	it('drops nothing at chance 0 and everything at chance 1', () => {
		expect(dropHoles(pathWith(4), indexFor(4), cfg({ mode: 'random', chance: 0 }))).toHaveLength(
			25
		);
		expect(dropHoles(pathWith(4), indexFor(4), cfg({ mode: 'random', chance: 1 }))).toHaveLength(5);
	});

	it('is reproducible: same seeds and config give the same result', () => {
		const a = dropHoles(pathWith(20), indexFor(20, 99), cfg({ mode: 'random', chance: 0.5 }, 3));
		const b = dropHoles(pathWith(20), indexFor(20, 99), cfg({ mode: 'random', chance: 0.5 }, 3));

		expect(a).toEqual(b);
	});

	it('varies with the band seed', () => {
		const a = dropHoles(pathWith(20), indexFor(20, 1), cfg({ mode: 'random', chance: 0.5 }));
		const b = dropHoles(pathWith(20), indexFor(20, 2), cfg({ mode: 'random', chance: 0.5 }));

		expect(a).not.toEqual(b);
	});

	it('rerolls with runSeed, without touching the index', () => {
		const index = indexFor(20, 7);
		const a = dropHoles(pathWith(20), index, cfg({ mode: 'random', chance: 0.5 }, 0));
		const b = dropHoles(pathWith(20), index, cfg({ mode: 'random', chance: 0.5 }, 1));

		expect(a).not.toEqual(b);
		expect(index.seed).toBe(7);
	});

	it('drops roughly the configured share over many holes', () => {
		const n = 400;
		const kept = dropHoles(pathWith(n), indexFor(n, 7), cfg({ mode: 'random', chance: 0.25 }));
		const keptHoles = kept.length / 5 - 1;

		expect(keptHoles / n).toBeGreaterThan(0.65);
		expect(keptHoles / n).toBeLessThan(0.85);
	});

	it('follows the curve in variable mode: never at y=0, always at y=1', () => {
		const ramp: BezierConfig[] = [
			{ type: 'BezierConfig', points: [pt(0, 0), pt(1 / 3, 0), pt(2 / 3, 1), pt(1, 1)] }
		];
		const n = 200;
		const result = dropHoles(pathWith(n), indexFor(n, 5), cfg({ mode: 'variable', curve: ramp }));
		const survivors = new Set<number>();
		for (const seg of result) if (seg[0] === 'M') survivors.add(seg[1] as number);

		// Holes are laid out with bandFraction rising with index, and contour i+1
		// starts at x = i + 1. The first few (chance ~0) all survive; the last few
		// (chance ~1) are all gone.
		expect(survivors.has(1)).toBe(true);
		expect(survivors.has(2)).toBe(true);
		expect(survivors.has(n)).toBe(false);
		expect(survivors.has(n - 1)).toBe(false);
	});

	it('drops about half with the flat default curve', () => {
		const n = 400;
		const result = dropHoles(
			pathWith(n),
			indexFor(n, 11),
			cfg({ mode: 'variable', curve: defaultDropCurve() })
		);
		const keptHoles = result.length / 5 - 1;

		expect(keptHoles / n).toBeGreaterThan(0.4);
		expect(keptHoles / n).toBeLessThan(0.6);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/cut-pattern/__tests__/drop-holes.test.ts`
Expected: FAIL — cannot find module `../drop-holes`.

- [ ] **Step 3: Implement**

```ts
// src/lib/cut-pattern/drop-holes.ts
import type { PathSegment } from '$lib/types';
import type { BandHoleIndex } from './hole-index';
import { lookup, sampleDropCurve, type PostProcessConfig } from './hole-drop-config';

/**
 * Mulberry32: a small, fast, well-distributed 32-bit PRNG.
 *
 * Stage 2 must never call `Math.random()`. Bands are merged by a pool, so which
 * worker handled which band varies with scheduling; unseeded randomness would
 * give a different cut file on every prepare, for output that gets cut on a
 * machine. Seeding per band makes the result depend only on the band and the
 * run seed.
 */
export const mulberry32 = (seed: number) => {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

/**
 * Combine a band's base seed with the run seed.
 *
 * The base seed is baked into the payload at extraction time, BEFORE the merge,
 * so it cannot carry `runSeed` — rerolling would then mean re-merging, which is
 * the seconds this whole split exists to avoid. Mixing here keeps Reroll a
 * stage-2 change: same merge, new arrangement.
 */
export const seedFor = (baseSeed: number, runSeed: number): number =>
	(Math.imul(baseSeed ^ runSeed, 0x9e3779b1) ^ (runSeed >>> 0)) >>> 0;

/**
 * Rebuild `path` without the contours at the given index ranges.
 *
 * Ranges are `[start, end)` into `path` and never overlap, so one ordered walk
 * does it. Removing an inner contour fills its space, because the renderer
 * fills `evenodd`; nothing is re-unioned.
 */
const withoutRanges = (path: PathSegment[], ranges: { start: number; end: number }[]) => {
	const ordered = [...ranges].sort((a, b) => a.start - b.start);
	const out: PathSegment[] = [];
	let cursor = 0;
	for (const range of ordered) {
		for (let i = cursor; i < range.start; i += 1) out.push(path[i]);
		cursor = range.end;
	}
	for (let i = cursor; i < path.length; i += 1) out.push(path[i]);
	return out;
};

/**
 * Stage 2: drop internal holes from one merged band path.
 *
 * Pure. Rolls the PRNG once per hole in index order — which is contour order,
 * deterministic from the path — so the result is identical run to run whatever
 * the pool did.
 */
export const dropHoles = (
	path: PathSegment[],
	index: BandHoleIndex,
	config: PostProcessConfig
): PathSegment[] => {
	const mode = config.dropHoles;
	if (mode.mode === 'none') return path;
	if (index.holes.length === 0) return path;
	if (mode.mode === 'all') return withoutRanges(path, index.holes);

	const random = mulberry32(seedFor(index.seed, config.runSeed));
	const lut = mode.mode === 'variable' ? sampleDropCurve(mode.curve) : undefined;
	const dropped: { start: number; end: number }[] = [];

	for (const hole of index.holes) {
		const chance = lut ? lookup(lut, hole.bandFraction) : mode.chance;
		// Roll for EVERY hole, whatever the chance, so the sequence a hole sees
		// does not shift when the curve or chance changes.
		if (random() < chance) dropped.push({ start: hole.start, end: hole.end });
	}
	return dropped.length === 0 ? path : withoutRanges(path, dropped);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/cut-pattern/__tests__/drop-holes.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/cut-pattern/drop-holes.ts src/lib/cut-pattern/__tests__/drop-holes.test.ts
git add src/lib/cut-pattern/drop-holes.ts src/lib/cut-pattern/__tests__/drop-holes.test.ts
git commit -m "feat(cut-pattern): drop internal holes with a seeded, config-driven pass"
```

---

### Task 6: Config plumbing — types, defaults, migration

Put `postProcess` into `PatternConfig` so it saves and loads with the design.

**Files:**

- Modify: `src/lib/types.ts` (the `PatternConfig` type, around `:276-302`)
- Modify: `src/lib/shades-config.ts` (`defaultPatternConfig`, around `:581-600`)
- Modify: `src/lib/validators.ts` (`migrateGlobulePatternConfig`, around `:60-99`)
- Test: `src/lib/__tests__/post-process-config.test.ts`

**Interfaces:**

- Consumes: `PostProcessConfig`, `DEFAULT_POST_PROCESS` from `$lib/cut-pattern/hole-drop-config`.
- Produces: `PatternConfig['postProcess']?: PostProcessConfig`, defaulted by `defaultPatternConfig()` and backfilled by `migrateGlobulePatternConfig`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/post-process-config.test.ts
import { describe, it, expect } from '@jest/globals';
import { defaultPatternConfig } from '$lib/shades-config';
import { migrateGlobulePatternConfig } from '$lib/validators';
import { DEFAULT_POST_PROCESS } from '$lib/cut-pattern/hole-drop-config';
import type { GlobulePatternConfig } from '$lib/types';

describe('postProcess config', () => {
	it('defaults to dropping nothing', () => {
		expect(defaultPatternConfig().postProcess).toEqual(DEFAULT_POST_PROCESS);
	});

	it('backfills the block on a config that predates it', () => {
		const config = {
			patternConfig: { pageLayout: { keepConnected: 0 } }
		} as unknown as GlobulePatternConfig;
		const migrated = migrateGlobulePatternConfig(config);

		expect(migrated.patternConfig?.postProcess).toEqual(DEFAULT_POST_PROCESS);
	});

	it('leaves an existing block alone', () => {
		const config = {
			patternConfig: {
				pageLayout: { keepConnected: 0 },
				postProcess: { dropHoles: { mode: 'random', chance: 0.3 }, runSeed: 4 }
			}
		} as unknown as GlobulePatternConfig;

		expect(migrateGlobulePatternConfig(config).patternConfig?.postProcess).toEqual({
			dropHoles: { mode: 'random', chance: 0.3 },
			runSeed: 4
		});
	});

	it('clamps an out-of-range drop chance', () => {
		const config = {
			patternConfig: {
				pageLayout: { keepConnected: 0 },
				postProcess: { dropHoles: { mode: 'random', chance: 7 }, runSeed: 0 }
			}
		} as unknown as GlobulePatternConfig;
		const dropHoles = migrateGlobulePatternConfig(config).patternConfig?.postProcess?.dropHoles;

		expect(dropHoles).toEqual({ mode: 'random', chance: 1 });
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/__tests__/post-process-config.test.ts`
Expected: FAIL — `postProcess` is undefined.

- [ ] **Step 3: Add the type**

In `src/lib/types.ts`, import the config type near the other cut-pattern imports and add the field to `PatternConfig`, directly after `splits?`:

```ts
import type { PostProcessConfig } from '$lib/cut-pattern/hole-drop-config';
```

It must be `import type`. `hole-drop-config.ts` imports `BezierConfig` from `types.ts`, so a value import here would close a runtime cycle; type-only imports are erased and cannot.

```ts
	// Optional for the same reason `splits?` is: absent means "drop nothing",
	// which is what every saved config predating this field decodes to, so no
	// migration is required for correctness — the backfill in validators.ts is
	// a convenience for the editor panel, not a fix.
	postProcess?: PostProcessConfig;
```

Also widen the index signature at the head of `PatternConfig` to include `PostProcessConfig` in its union, alongside `PageLayoutConfig` and `SplitConfig`.

- [ ] **Step 4: Add the default**

In `src/lib/shades-config.ts`, inside `defaultPatternConfig()`, after `splits: { tubeSplits: [] },`:

```ts
	postProcess: { dropHoles: { mode: 'none' }, runSeed: 0 },
```

Import nothing: the literal matches `DEFAULT_POST_PROCESS` and keeps this file dependency-free, as its neighbours are.

- [ ] **Step 5: Add the migration**

In `src/lib/validators.ts`, inside `migrateGlobulePatternConfig`, after the `pageLayout` block and before `return config;`:

```ts
const ppHost = config.patternConfig as { postProcess?: Record<string, unknown> } | undefined;
if (ppHost && ppHost.postProcess === undefined) {
	ppHost.postProcess = { dropHoles: { mode: 'none' }, runSeed: 0 };
} else if (ppHost && ppHost.postProcess) {
	const pp = ppHost.postProcess;
	if (typeof pp.runSeed !== 'number') pp.runSeed = 0;
	const drop = pp.dropHoles as { mode?: string; chance?: number } | undefined;
	if (!drop || typeof drop.mode !== 'string') pp.dropHoles = { mode: 'none' };
	else if (drop.mode === 'random') {
		const chance = typeof drop.chance === 'number' ? drop.chance : 0;
		drop.chance = chance < 0 ? 0 : chance > 1 ? 1 : chance;
	}
}
```

Widen the `pc` declaration's type at `:79` to include `postProcess?: Record<string, unknown>` rather than introducing a second cast, if that reads more cleanly against the landed file.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest src/lib/__tests__/post-process-config.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Check types and the full suite**

Run: `npm run check` — the error count must not exceed the 431 baseline.
Run: `npm run test:unit` — no regressions.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/lib/types.ts src/lib/shades-config.ts src/lib/validators.ts src/lib/__tests__/post-process-config.test.ts
git add src/lib/types.ts src/lib/shades-config.ts src/lib/validators.ts src/lib/__tests__/post-process-config.test.ts
git commit -m "feat(config): persist hole-drop post-processing with the pattern config"
```

---

### Task 7: Stage 1b in the band-merge worker

Make the worker return a hole index alongside each merged path.

**Files:**

- Modify: `src/lib/workers/band-merge-worker-core.ts`
- Modify: `src/lib/workers/band-merge-pool.ts`
- Test: `src/lib/workers/__tests__/band-merge-worker-core.test.ts`

**Interfaces:**

- Consumes: `buildHoleIndex`, `BandHoleIndex` from `$lib/cut-pattern/hole-index`; `createBandMergeCore` and `MergeResponse` as they stand.
- Produces: `merge-result` carries `holes: BandHoleIndex`; `PoolRunResult` gains `holes: Map<string, BandHoleIndex>`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/workers/__tests__/band-merge-worker-core.test.ts`, which already imports `buildDefaultGeometry`, `generateProjectionTubes`, `tiledPatternConfigs['tiledHexPattern-1']` and `toBandMergePayloads`:

```ts
describe('stage 1b: hole index', () => {
	it('returns a hole index alongside the merged path', () => {
		const geometry = buildDefaultGeometry();
		const tubes = generateProjectionTubes(geometry, tiledConfig, undefined, 1);
		const payloads = toBandMergePayloads(tubes, new Map());
		const core = createBandMergeCore();
		const posted: MergeResponse[] = [];

		for (const payload of payloads) {
			core.handle(
				{
					type: 'merge',
					bandId: payload.id,
					payload,
					ctx: { patternType: tiledConfig.type, keepConnected: 0 }
				},
				(r) => posted.push(r)
			);
		}

		const results = posted.filter((r) => r.type === 'merge-result');
		expect(results.length).toBeGreaterThan(0);

		let totalHoles = 0;
		for (const result of results) {
			if (result.type !== 'merge-result') continue;
			const payload = payloads.find((p) => p.id === result.bandId)!;
			expect(result.holes.seed).toBe(payload.seed);
			totalHoles += result.holes.holes.length;
			for (const hole of result.holes.holes) {
				expect(result.path[hole.start][0]).toBe('M');
				expect(hole.bandFraction).toBeGreaterThanOrEqual(payload.pieceStartFraction - 1e-9);
				expect(hole.bandFraction).toBeLessThanOrEqual(payload.pieceEndFraction + 1e-9);
			}
		}
		// A real tiled band is a tessellation; it must have interior cells.
		expect(totalHoles).toBeGreaterThan(0);
	});

	it('returns an empty index for an outlined band', () => {
		const core = createBandMergeCore();
		const posted: MergeResponse[] = [];
		core.handle(
			{
				type: 'merge',
				bandId: 'b',
				payload: {
					id: 'b',
					facets: [
						{
							path: [['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['Z']]
						}
					],
					tagAnchorPoint: { x: 5, y: 5 },
					tagAnchorAutoAngle: 0,
					pieceStartFraction: 0,
					pieceEndFraction: 1,
					seed: 42
				},
				ctx: { patternType: 'outlined', selfTag: labels.selfTag, keepConnected: 0 }
			},
			(r) => posted.push(r)
		);

		const [result] = posted;
		expect(result.type).toBe('merge-result');
		if (result.type !== 'merge-result') return;
		expect(result.holes).toEqual({ seed: 42, holes: [] });
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/workers/__tests__/band-merge-worker-core.test.ts`
Expected: FAIL — `holes` does not exist on the merge result.

- [ ] **Step 3: Add stage 1b to the worker core**

In `band-merge-worker-core.ts`, widen the success arm of `MergeResponse`:

```ts
export type MergeResponse =
	| { type: 'merge-result'; bandId: string; path: PathSegment[]; holes: BandHoleIndex }
	| { type: 'merge-error'; bandId: string; error: string };
```

and, inside `handle`'s `try`, between the merge and the post:

```ts
const path = deps.mergeBand(message.payload, message.ctx);
// Stage 1b. Config-independent, so it runs here, where the facets, the
// piece span and the seed are already in hand — the main thread then
// needs none of them. An outlined merge is an outline plus a label, whose
// only interior contours are label counters; those must never be dropped.
const holes =
	message.ctx.patternType === 'outlined'
		? { seed: message.payload.seed, holes: [] }
		: buildHoleIndex(path, message.payload);
post({ type: 'merge-result', bandId: message.bandId, path, holes });
```

`BandMergePayload` structurally satisfies `HoleIndexInput`, so it passes straight through.

- [ ] **Step 4: Carry the index through the pool**

In `band-merge-pool.ts`, add to `PoolRunResult`, beside `paths`:

```ts
/**
 * Stage 1b output per band, by id. Produced and consumed with `paths`, so a
 * caller cannot publish one without the other and leave a band holding a path
 * with no index.
 */
holes: Map<string, BandHoleIndex>;
```

Create `const holes = new Map<string, BandHoleIndex>();` beside `const paths = ...`, fill it wherever a `merge-result` is recorded (`holes.set(response.bandId, response.holes)`), and include it in **every** `return`/`resolve` of a `PoolRunResult` — including the empty-payload early return at `run`'s top, the default-factory failure path and the spawn-failure path. `npm run check` will name any you miss.

The small-job inline path is in NavHeader, not here; Task 9 covers it.

- [ ] **Step 5: Run the worker tests**

Run: `npx jest src/lib/workers/__tests__/`
Expected: PASS, including the pool's existing tests — stage 1b must not change `path`.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/lib/workers/band-merge-worker-core.ts src/lib/workers/band-merge-pool.ts src/lib/workers/__tests__/band-merge-worker-core.test.ts
git add src/lib/workers/band-merge-worker-core.ts src/lib/workers/band-merge-pool.ts src/lib/workers/__tests__/band-merge-worker-core.test.ts
git commit -m "feat(workers): index band holes as stage 1b of the merge task"
```

---

### Task 8: The store seam

Make `mergedBandPaths` derived, so a config change re-renders without re-merging.

**Files:**

- Modify: `src/lib/stores/mergedPathStore.ts`
- Test: `src/lib/stores/__tests__/merged-path-store.test.ts` (extend the pool work's suite)

**Interfaces:**

- Consumes: `dropHoles` from `$lib/cut-pattern/drop-holes`; `BandHoleIndex` from `$lib/cut-pattern/hole-index`; `PostProcessConfig`, `DEFAULT_POST_PROCESS` from `$lib/cut-pattern/hole-drop-config`; `patternConfigStore` from `./globulePatternStores`.
- Deletes: the identity `postProcessBandPaths` that the pool work shipped, and its call in NavHeader's `publish` helper (Task 9).
- Produces:
  - `bandHoleIndexes: Writable<Map<string, BandHoleIndex>>`
  - `postProcessConfig: Readable<PostProcessConfig>`
  - `applyPostProcess(raw, indexes, config): Map<string, PathSegment[]>`
  - `mergedBandPaths: Readable<Map<string, PathSegment[]>>` (no longer writable)
- Removes: `postProcessBandPaths` (the pool work's identity seam), if it shipped.

- [ ] **Step 1: Write the failing test**

```ts
// append to src/lib/stores/__tests__/merged-path-store.test.ts
import { get } from 'svelte/store';
import {
	mergedBandPaths,
	mergedBandPathsRaw,
	bandHoleIndexes,
	applyPostProcess
} from '../mergedPathStore';
import { patternConfigStore } from '../globulePatternStores';
import type { PathSegment } from '$lib/types';

const donut = (): PathSegment[] => [
	['M', 0, 0],
	['L', 10, 0],
	['L', 10, 10],
	['L', 0, 10],
	['Z'],
	['M', 4, 4],
	['L', 6, 4],
	['L', 6, 6],
	['L', 4, 6],
	['Z']
];

describe('post-processed merged paths', () => {
	afterEach(() => {
		mergedBandPathsRaw.set(new Map());
		bandHoleIndexes.set(new Map());
		patternConfigStore.update((c) => {
			c.patternConfig.postProcess = { dropHoles: { mode: 'none' }, runSeed: 0 };
			return c;
		});
	});

	it('passes paths through untouched when dropping is off', () => {
		const raw = new Map([['b', donut()]]);
		const indexes = new Map([
			['b', { seed: 1, holes: [{ start: 5, end: 10, bandFraction: 0.5, area: 4 }] }]
		]);

		expect(applyPostProcess(raw, indexes, { dropHoles: { mode: 'none' }, runSeed: 0 })).toEqual(
			raw
		);
	});

	it('drops the hole in all mode', () => {
		const raw = new Map([['b', donut()]]);
		const indexes = new Map([
			['b', { seed: 1, holes: [{ start: 5, end: 10, bandFraction: 0.5, area: 4 }] }]
		]);
		const out = applyPostProcess(raw, indexes, { dropHoles: { mode: 'all' }, runSeed: 0 });

		expect(out.get('b')).toHaveLength(5);
	});

	it('leaves a band with no index untouched', () => {
		const raw = new Map([['b', donut()]]);
		const out = applyPostProcess(raw, new Map(), { dropHoles: { mode: 'all' }, runSeed: 0 });

		expect(out.get('b')).toEqual(donut());
	});

	it('re-derives the render-facing store when the config changes, without touching raw', () => {
		mergedBandPathsRaw.set(new Map([['b', donut()]]));
		bandHoleIndexes.set(
			new Map([['b', { seed: 1, holes: [{ start: 5, end: 10, bandFraction: 0.5, area: 4 }] }]])
		);
		expect(get(mergedBandPaths).get('b')).toHaveLength(10);

		patternConfigStore.update((c) => {
			c.patternConfig.postProcess = { dropHoles: { mode: 'all' }, runSeed: 0 };
			return c;
		});

		expect(get(mergedBandPaths).get('b')).toHaveLength(5);
		expect(get(mergedBandPathsRaw).get('b')).toHaveLength(10);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/stores/__tests__/merged-path-store.test.ts`
Expected: FAIL — `bandHoleIndexes` / `applyPostProcess` are not exported.

- [ ] **Step 3: Implement**

Replace the `mergedBandPaths` declaration (and delete `postProcessBandPaths`, updating its callers) in `src/lib/stores/mergedPathStore.ts`:

```ts
/**
 * Stage 1b output: where each band's internal holes are, keyed by band.id.
 * Written by the same prepare run that writes `mergedBandPathsRaw`, and cleared
 * with it — a band must never hold a path without its index.
 */
export const bandHoleIndexes: Writable<Map<string, BandHoleIndex>> = writable(new Map());

/**
 * The post-process block of the pattern config.
 *
 * A `derived` over the whole config store would emit on every unrelated config
 * edit, and each emission rebuilds every band's path. The JSON compare narrows
 * it to real changes, mirroring what `patternGenerationConfig` does to avoid
 * re-triggering the geometry worker.
 */
let lastPostProcessJson = '';
export const postProcessConfig = derived<typeof patternConfigStore, PostProcessConfig>(
	patternConfigStore,
	($config, set) => {
		const next = $config.patternConfig.postProcess ?? DEFAULT_POST_PROCESS;
		const json = JSON.stringify(next);
		if (json === lastPostProcessJson) return;
		lastPostProcessJson = json;
		set(next);
	},
	DEFAULT_POST_PROCESS
);

/** Stage 2 over every band. A band with no index is passed through unchanged. */
export const applyPostProcess = (
	raw: Map<string, PathSegment[]>,
	indexes: Map<string, BandHoleIndex>,
	config: PostProcessConfig
): Map<string, PathSegment[]> => {
	if (config.dropHoles.mode === 'none') return raw;
	const out = new Map<string, PathSegment[]>();
	for (const [bandId, path] of raw) {
		const index = indexes.get(bandId);
		out.set(bandId, index ? dropHoles(path, index, config) : path);
	}
	return out;
};

/**
 * Per-band merged outline+label path, keyed by band.id, as it should RENDER.
 *
 * Derived rather than written: stage 1 (seconds, in the pool) lands in
 * `mergedBandPathsRaw`, and stage 2 (milliseconds, here) re-runs on its own
 * whenever the drop config changes. That is the whole point of the split — a
 * nudged drop chance must never pay for the union again.
 *
 * `runSeed` participates because rerolling must change the result.
 */
export const mergedBandPaths = derived(
	[mergedBandPathsRaw, bandHoleIndexes, postProcessConfig],
	([$raw, $indexes, $config]) => applyPostProcess($raw, $indexes, $config)
);
```

Delete the identity `postProcessBandPaths` at the same time; Task 9 removes its one caller. Keep `isPrepared` as-is: it still derives from `mergedBandPaths`, and clearing `mergedBandPathsRaw` still empties it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/stores/__tests__/merged-path-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Check the whole suite and types**

Run: `npm run test:unit` and `npm run check`. `mergedBandPaths` is no longer writable, so any `.set()` outside NavHeader now fails to compile — there should be none, but fix what surfaces (Task 9 handles NavHeader).

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/lib/stores/mergedPathStore.ts src/lib/stores/__tests__/merged-path-store.test.ts
git add src/lib/stores/mergedPathStore.ts src/lib/stores/__tests__/merged-path-store.test.ts
git commit -m "feat(stores): derive rendered band paths from the raw merge and hole config"
```

---

### Task 9: NavHeader — write both stores, and stop over-invalidating

Three changes, one file. The invalidation fix is a prerequisite: without it, every drag of a drop-chance input clears the prepared merge and forces a full re-prepare — the exact freeze this feature is built to avoid.

**Files:**

- Modify: `src/components/nav-header/NavHeader.svelte`

**Interfaces:**

- Consumes: `mergedBandPathsRaw`, `bandHoleIndexes` from `$lib/stores`; `PoolRunResult.holes` from Task 7; `buildHoleIndex` from `$lib/cut-pattern/hole-index` (for the inline branch).

- [ ] **Step 1: Replace the invalidation block**

The landed block sets `mergedBandPaths` and `mergedBandPathsRaw`, cancels the run and drops `wantedGeneration`. It also re-runs on **every** emission of `patternConfigStore`, whatever field changed — `$patternConfigStore` is a whole-store subscription, and the nested `void …` lines document intent without narrowing it. Keep everything it does; gate it on a key:

```ts
// Clear prepared state only when something the MERGE depends on changes.
//
// `$patternConfigStore` is a whole-store subscription: it re-fires for any
// field, including the post-process block, whose whole purpose is to change
// WITHOUT re-merging. Comparing an explicit key is what keeps a drop-chance
// nudge cheap. `postProcess` is deliberately absent from the key.
let lastInvalidationKey: string | undefined = undefined;
let lastPatternRef: unknown = undefined;
$: {
	const cfg = $patternConfigStore;
	const key = JSON.stringify([
		cfg.patternTypeConfig.type,
		cfg.patternTypeConfig.labels?.selfTag,
		cfg.patternViewConfig.bandSortMode,
		cfg.patternConfig.pageLayout.keepConnected,
		cfg.patternConfig.splits
	]);
	const patternRef = $superGlobulePatternStore;
	if (key !== lastInvalidationKey || patternRef !== lastPatternRef) {
		lastInvalidationKey = key;
		lastPatternRef = patternRef;
		mergedBandPathsRaw.set(new Map());
		bandHoleIndexes.set(new Map());
		csvState = 'idle';
		csvText = '';
		// A geometry/config change makes any prepared union stale — including
		// one still being computed. Cancelling is best-effort (it can lose a
		// race with the run's last response), so also drop the generation we
		// are waiting on: whatever that run resolves with must never publish.
		pool.cancel();
		wantedGeneration = 0;
		prepareState = 'idle';
	}
}
```

`mergedBandPaths.set(new Map())` goes away with the rest: it is derived now, and clearing the raw store empties it.

- [ ] **Step 2: Publish both stores**

Replace the `publish` helper:

```ts
const publish = (paths: Map<string, PathSegment[]>, holes: Map<string, BandHoleIndex>) => {
	// Written together, always: a band holding a path with no index would be
	// silently un-droppable.
	mergedBandPathsRaw.set(paths);
	bandHoleIndexes.set(holes);
};
```

At the pool call site, `publish(result.paths, result.holes)`.

- [ ] **Step 3: Index the inline branch too**

`runPrepare` merges inline when `payloads.length <= 2`, never reaching a worker, so it must build its own index:

```ts
if (payloads.length <= 2) {
	const paths = new Map<string, PathSegment[]>();
	const holes = new Map<string, BandHoleIndex>();
	for (const payload of payloads) {
		const path = mergeBand(payload, ctx);
		if (path.length === 0) continue;
		paths.set(payload.id, path);
		holes.set(
			payload.id,
			ctx.patternType === 'outlined'
				? { seed: payload.seed, holes: [] }
				: buildHoleIndex(path, payload)
		);
	}
	prepareDone = payloads.length;
	publish(paths, holes);
	return true;
}
```

- [ ] **Step 4: Verify by hand in the running app**

Run `npm run dev`, open `/designer2`, switch Geometry to Voronoi so the pattern pane has content, and press Prepare Download. Then:

- change a label setting → prepared state clears (the readout returns to idle);
- open a floater and close it, changing nothing → prepared state SURVIVES.

Restart the dev server after any worker-path edit; Vite will not rebuild the worker on reload.

- [ ] **Step 5: Check types and suite**

Run: `npm run check` (no increase over the Task 1 baseline) and `npm run test:unit`.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/components/nav-header/NavHeader.svelte
git add src/components/nav-header/NavHeader.svelte
git commit -m "fix(prepare): invalidate the prepared merge on a key change, not every config emission"
```

---

### Task 10: The Post-Process panel

**Files:**

- Create: `src/components/modal/editor/PostProcess.svelte`
- Modify: `src/components/modal/sidebar-definitions.ts` (`patternConfigs`, around `:78-105`)
- Modify: `src/components/modal/editor/path-editor.ts` (add `allPointsInUnitSquare`)
- Test: `src/components/modal/editor/__tests__/unit-square-limit.test.ts`

**Interfaces:**

- Consumes: `patternConfigStore`; `defaultDropCurve`, `DEFAULT_POST_PROCESS` from `$lib/cut-pattern/hole-drop-config`; `PathEditor` and `applyLimits`-style `LimitFunction` from `./path-editor`.
- Produces: `allPointsInUnitSquare: LimitFunction`; a `patternConfigs` floater entry titled `Post Process` with shortTitle `PP`.

- [ ] **Step 1: Write the failing test for the limit function**

```ts
// src/components/modal/editor/__tests__/unit-square-limit.test.ts
import { describe, it, expect } from '@jest/globals';
import { allPointsInUnitSquare } from '../path-editor';
import type { BezierConfig, PointConfig2 } from '$lib/types';

const pt = (x: number, y: number): PointConfig2 => ({ type: 'PointConfig2', x, y });

describe('allPointsInUnitSquare', () => {
	const curveDef: BezierConfig[] = [
		{ type: 'BezierConfig', points: [pt(0, 0), pt(0.3, 0.3), pt(0.6, 0.6), pt(1, 1)] }
	];

	it('clamps a dragged point into the unit square', () => {
		const result = allPointsInUnitSquare({
			curveIndex: 0,
			pointIndex: 1,
			curveDef,
			newPoint: pt(1.8, -0.4),
			oldPoint: pt(0.3, 0.3)
		});

		expect(result[0].points[1]).toEqual(pt(1, 0));
	});

	it('leaves an in-range point alone', () => {
		const result = allPointsInUnitSquare({
			curveIndex: 0,
			pointIndex: 2,
			curveDef,
			newPoint: pt(0.5, 0.5),
			oldPoint: pt(0.6, 0.6)
		});

		expect(result[0].points[2]).toEqual(pt(0.5, 0.5));
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/components/modal/editor/__tests__/unit-square-limit.test.ts`
Expected: FAIL — `allPointsInUnitSquare` is not exported.

- [ ] **Step 3: Add the limit function**

In `src/components/modal/editor/path-editor.ts`, beside `endPointsInRange`:

```ts
/**
 * Clamp EVERY dragged point to the unit square.
 *
 * `endPointsInRange` constrains only the terminal anchors; a drop curve is read
 * as x = position along the band, y = drop chance, so a control handle outside
 * [0,1] would bow the sampled curve past a probability.
 */
export const allPointsInUnitSquare: LimitFunction = ({
	curveIndex,
	pointIndex,
	curveDef,
	newPoint
}) => {
	const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
	curveDef[curveIndex].points[pointIndex] = {
		...newPoint,
		x: clamp(newPoint.x),
		y: clamp(newPoint.y)
	};
	return curveDef;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/components/modal/editor/__tests__/unit-square-limit.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the panel**

```svelte
<!-- src/components/modal/editor/PostProcess.svelte -->
<script lang="ts">
	import { patternConfigStore } from '$lib/stores';
	import {
		DEFAULT_POST_PROCESS,
		defaultDropCurve,
		type HoleDropConfig,
		type HoleDropMode
	} from '$lib/cut-pattern/hole-drop-config';
	import type { BezierConfig } from '$lib/types';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import PathEditor from './PathEditor.svelte';
	import { allPointsInUnitSquare } from './path-editor';

	// Shallow copy, as PageLayout.svelte does: binding through to the stored
	// object would hand `$derived` the same reference every run, and the readouts
	// below would freeze at their mount-time values.
	let postProcess = $derived({
		...($patternConfigStore.patternConfig.postProcess ?? DEFAULT_POST_PROCESS)
	});
	let dropHoles = $derived(postProcess.dropHoles);
	let isOutlined = $derived($patternConfigStore.patternTypeConfig.type === 'outlined');

	const MODE_LABELS: Record<HoleDropMode, string> = {
		none: 'none',
		all: 'drop all',
		random: 'randomly drop',
		variable: 'variably drop'
	};

	const write = (dropHoles: HoleDropConfig, runSeed = postProcess.runSeed) => {
		$patternConfigStore.patternConfig.postProcess = { dropHoles, runSeed };
	};

	const setMode = (mode: HoleDropMode) => {
		if (mode === dropHoles.mode) return;
		if (mode === 'random') write({ mode, chance: 0.5 });
		else if (mode === 'variable') write({ mode, curve: defaultDropCurve() });
		else write({ mode });
	};

	const setChance = (chance: number) => write({ mode: 'random', chance });
	const setCurve = (curve: BezierConfig[]) => write({ mode: 'variable', curve });
	const reroll = () => write(dropHoles, postProcess.runSeed + 1);

	// A unit-square canvas. `flipY` puts y=1 at the top, so a curve that rises to
	// the right reads as "drop more towards the end of the band".
	const editorConfig = {
		gutter: 0.1,
		padding: 0.1,
		contentBounds: { top: 0, left: 0, width: 1, height: 1 },
		size: { width: 300, height: 300 }
	};
</script>

<Editor>
	<Container direction="column">
		{#if isOutlined}
			<p>Hole dropping applies to tiled patterns only.</p>
		{:else}
			<LabeledControl label="Drop internal holes">
				<select
					value={dropHoles.mode}
					onchange={(e) => setMode(e.currentTarget.value as HoleDropMode)}
				>
					{#each Object.entries(MODE_LABELS) as [mode, label]}
						<option value={mode}>{label}</option>
					{/each}
				</select>
			</LabeledControl>

			{#if dropHoles.mode === 'random'}
				<LabeledControl label="Drop chance">
					<NumberInput value={dropHoles.chance} min={0} max={1} step={0.01} onChange={setChance} />
				</LabeledControl>
			{/if}

			{#if dropHoles.mode === 'variable'}
				<PathEditor
					flipY
					curveDef={dropHoles.curve}
					onChangeCurveDef={setCurve}
					config={editorConfig}
					limits={[allPointsInUnitSquare]}
					coupling="anchorDragsHandles"
					showCurveTools
					editorId="hole-drop-curve"
				/>
				<p>x: position along the band · y: chance the hole is dropped</p>
			{/if}

			{#if dropHoles.mode === 'random' || dropHoles.mode === 'variable'}
				<LabeledControl label="Seed {postProcess.runSeed}">
					<button onclick={reroll}>Reroll</button>
				</LabeledControl>
			{/if}
		{/if}
	</Container>
</Editor>
```

Check `NumberInput`'s actual prop names against a neighbouring panel (`GlobuleCrossSection.svelte` uses it) and match them; the same goes for `Editor`, `Container` and `LabeledControl`.

- [ ] **Step 6: Register the panel**

In `src/components/modal/sidebar-definitions.ts`, import it and append to `patternConfigs`:

```ts
import PostProcess from './editor/PostProcess.svelte';
```

```ts
[
	'Post Process',
	{
		shortTitle: 'PP',
		title: 'Post Process',
		content: PostProcess
	}
];
```

- [ ] **Step 7: Verify by hand**

Run `npm run dev`, open `/designer2`, switch Geometry to Voronoi, Prepare Download, then open the Post Process floater and:

- switch to "drop all" → holes vanish from the rendered pattern, with **no** re-prepare;
- switch to "randomly drop", drag the chance → the pattern thins out live;
- press Reroll → the pattern changes, the prepared state stays;
- switch to "variably drop" and drag the curve up at one end → holes thin towards that end of each band;
- close and reopen the floater → every setting is still there.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/components/modal/editor/PostProcess.svelte src/components/modal/sidebar-definitions.ts src/components/modal/editor/path-editor.ts src/components/modal/editor/__tests__/unit-square-limit.test.ts
git add src/components/modal/editor/PostProcess.svelte src/components/modal/sidebar-definitions.ts src/components/modal/editor/path-editor.ts src/components/modal/editor/__tests__/unit-square-limit.test.ts
git commit -m "feat(ui): add a Post Process panel for dropping internal holes"
```

---

### Task 11: End-to-end proof

Prove the two claims that matter: `none` changes nothing about today's output, and a config change re-renders without re-merging.

**Files:**

- Create: `src/lib/cut-pattern/__tests__/hole-drop-integration.test.ts`
- Create: `tests/hole-drop.test.ts` (Playwright)

- [ ] **Step 1: Write the integration test**

```ts
// src/lib/cut-pattern/__tests__/hole-drop-integration.test.ts
import { describe, it, expect } from '@jest/globals';
import { toBandMergePayloads } from '../band-merge-payload';
import { buildHoleIndex } from '../hole-index';
import { dropHoles } from '../drop-holes';
import { computeMergedBandPaths } from '../prepare-merge';
import {
	buildDefaultGeometry,
	generateProjectionTubes,
	splitAllTubesAt
} from './helpers/real-geometry';
import { tiledPatternConfigs } from '$lib/shades-config';

const tiledConfig = tiledPatternConfigs['tiledHexPattern-1'];

describe('hole dropping over real geometry', () => {
	const geometry = buildDefaultGeometry();
	// Split so the parent-span arithmetic is exercised on real bands too.
	const tubes = generateProjectionTubes(geometry, tiledConfig, splitAllTubesAt(geometry, [2]), 1);
	const merged = computeMergedBandPaths(tubes, undefined, tiledConfig.type, new Map(), 0);
	const payloads = toBandMergePayloads(tubes, new Map());

	it('leaves the merged output identical in none mode', () => {
		for (const payload of payloads) {
			const path = merged.get(payload.id);
			if (!path) continue;
			const index = buildHoleIndex(path, payload);
			expect(dropHoles(path, index, { dropHoles: { mode: 'none' }, runSeed: 0 })).toBe(path);
		}
	});

	it('finds holes in a real tiled band and keeps their fractions in range', () => {
		let totalHoles = 0;
		for (const payload of payloads) {
			const path = merged.get(payload.id);
			if (!path) continue;
			const index = buildHoleIndex(path, payload);
			totalHoles += index.holes.length;
			for (const hole of index.holes) {
				expect(hole.bandFraction).toBeGreaterThanOrEqual(-1e-9);
				expect(hole.bandFraction).toBeLessThanOrEqual(1 + 1e-9);
				expect(path[hole.start][0]).toBe('M');
			}
		}
		expect(totalHoles).toBeGreaterThan(0);
	});

	it('produces a strictly shorter path in all mode, and only by whole contours', () => {
		for (const payload of payloads) {
			const path = merged.get(payload.id);
			if (!path) continue;
			const index = buildHoleIndex(path, payload);
			if (index.holes.length === 0) continue;
			const dropped = dropHoles(path, index, { dropHoles: { mode: 'all' }, runSeed: 0 });
			const removed = path.length - dropped.length;

			expect(removed).toBe(index.holes.reduce((sum, h) => sum + (h.end - h.start), 0));
			expect(dropped[0]).toEqual(path[0]);
		}
	});

	it('runs stage 2 over every band in well under a second', () => {
		const indexes = payloads.map((p) => ({ payload: p, path: merged.get(p.id) }));
		const start = performance.now();
		for (const { payload, path } of indexes) {
			if (!path) continue;
			dropHoles(path, buildHoleIndex(path, payload), {
				dropHoles: { mode: 'random', chance: 0.5 },
				runSeed: 0
			});
		}
		expect(performance.now() - start).toBeLessThan(1000);
	});
});
```

These helpers are the ones the pool work's own suites use (`band-merge-payload.test.ts`, `merge-band.test.ts`); do not invent a second fixture mechanism.

- [ ] **Step 2: Run it**

Run: `npx jest src/lib/cut-pattern/__tests__/hole-drop-integration.test.ts`
Expected: PASS, 4 tests. A failure here is a real defect, not a fixture problem — investigate before adjusting the test.

- [ ] **Step 3: Write the Playwright test**

Model it on the existing paper-in-worker spec from the pool work (`tests/`), which runs against the dev server. It should: load `/designer2`, select the Voronoi geometry so the pattern pane has content, press Prepare Download, wait for the prepared readout, record the rendered path count, open the Post Process floater, select "drop all", and assert the rendered path data shrank **without** the prepared readout returning to idle.

- [ ] **Step 4: Run it**

Run: `npm test -- hole-drop`
Expected: PASS.

- [ ] **Step 5: Measure**

Time a prepare on the "long tri hexparquet shade" config with the browser profiler, and record two numbers in the beads issue: the prepare wall-clock (stage 1 + 1b, to confirm stage 1b did not meaningfully add to it) and the time from a drop-chance change to the re-render (stage 2 alone).

- [ ] **Step 6: Full verification**

Run: `npm run test:unit` — 1405+ passing, no regressions.
Run: `npm run check` — at or below 431 errors, 76 warnings.
Run: `npm run lint`.

- [ ] **Step 7: Commit and close**

```bash
npx prettier --write src/lib/cut-pattern/__tests__/hole-drop-integration.test.ts tests/hole-drop.test.ts
git add src/lib/cut-pattern/__tests__/hole-drop-integration.test.ts tests/hole-drop.test.ts
git commit -m "test(cut-pattern): prove hole dropping over real geometry and in the browser"
bd close shades-k7z
```
