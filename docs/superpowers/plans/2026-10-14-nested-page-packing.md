# Nested Page Packing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `'nest'` page-layout algorithm that packs cut-pattern bands by their real shape (raster bottom-left fill, 15° rotation steps) so more bands fit per laser-cut sheet.

**Architecture:** Each band becomes a `NestShape` (convex polygons in band-local units + pivot) on the main thread. A Web Worker rasterises every shape at every allowed angle, dilates by half the gap, and greedily places pieces largest-first at the lowest-then-leftmost free spot on a page occupancy grid (coarse-to-fine search). The result is an ordinary `PageLayoutResult` (origins, rotations in degrees, pages) plus per-page utilisation, consumed by `CutPatternRenderer` exactly like skyline's.

**Tech Stack:** TypeScript, Svelte 5 runes, Jest (ts-jest), Vite module workers, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-nested-page-packing-design.md`

## Global Constraints

- Rotation is about the band pivot, convention `translate(origin) rotate(deg pivot)` — identical to `bandTransform` / `toPageSpace` (`src/lib/cut-pattern/page-post-process/place-bands.ts`). Rotated point = `{ x: dx·cos − dy·sin, y: dx·sin + dy·cos }` with `(dx, dy) = p − pivot`, y down.
- Default `rotationStep = 15` (degrees); `0` = no rotation; angles are `k·step` for `k·step < 360`.
- Grid cell = `NEST_CELL_MM (1) × pageScale` pattern units, enlarged so the pack grid never exceeds `NEST_MAX_CELLS = 250_000` cells.
- Real clearance between any two placed pieces must be ≥ `gap`; real geometry may exceed the content box by at most one cell.
- Never put Three.js objects in plain `$state` — use `$state.raw` (proxy loop, `effect_update_depth_exceeded`).
- Every store write from an `$effect` is value-key guarded (existing pattern in `CutPatternRenderer.svelte`).
- Files containing `import.meta` must never be imported by Jest-tested modules (see `band-merge-worker-factory.ts`).
- Skyline and flex-wrap behaviour must not change.
- Git: only `git add <specific files>` and `git commit`. Never `git stash`, `git checkout --`, `git restore`, `git reset`, `git clean`, `git add -A`.
- Run unit tests with `npm run test:unit -- <path>`; type-check with `npx tsc --noEmit -p .` is NOT reliable here — use `npm run check` (it is OK in this worktree; do not run it in the main checkout).

## Review Focus

1. A band whose facets have zero/degenerate paths (collapsed pole facet, NaN coordinates) — expect it to be skipped from the shape (no NaN in rasters), not to crash or poison the grid. Test in Task 2.
2. A single piece larger than the page at every angle — expect `overflow` with a `requiredScale` that, when applied, fits. Test in Task 3.
3. `rotationStep = 0` or a step not dividing 360 (e.g. 25) — expect only `[0]` or `k·25 < 360` angles, no crash. Test in Task 1.
4. Inputs change while a nest request is in flight (slider drag) — expect the stale reply to be dropped, latest wins, no flicker loop. Test in Task 5.
5. Zero bands (empty range slice) — expect one empty page, no worker error (same as skyline). Test in Task 3.

---

## File Structure

- Create `src/lib/cut-pattern/page-layout/nest/raster.ts` — geometry primitives: hull, inflate, rotate, scan-convert convex polygons to row spans, dilate, coarsen.
- Create `src/lib/cut-pattern/page-layout/nest/types.ts` — `NestShape`, `NestGeom`, `Raster`, `Span`.
- Create `src/lib/cut-pattern/page-layout/nest/nest.ts` — `nestPageLayout` (grid, search, placement, overflow, utilisation).
- Create `src/lib/cut-pattern/page-layout/nest/nest-shape.ts` — `buildNestShape(band, ctx, pivot)`.
- Create `src/lib/cut-pattern/page-layout/nest/nest-client.ts` — worker request/supersede client.
- Create `src/lib/workers/nest-layout-worker-core.ts`, `nest-layout.worker.ts`, `nest-layout-worker-factory.ts`.
- Modify `src/lib/cut-pattern/label-footprint.ts` — export `selfTagFootprintBox`.
- Modify `src/lib/cut-pattern/page-layout/types.ts` — `utilisation?` on `PageLayoutResult`.
- Modify `src/lib/cut-pattern/page-layout/registry.ts` — `buildNestGeom`.
- Modify `src/lib/types.ts`, `src/lib/shades-config.ts`, `src/lib/validators.ts` — config.
- Modify `src/lib/stores/pageLayoutInfoStore.ts` — `utilisation`, `nestPending`.
- Modify `src/components/cut-pattern/CutPatternRenderer.svelte` — wiring.
- Modify `src/components/modal/editor/PageLayout.svelte` — UI.
- Tests under each dir's `__tests__/`.

---

### Task 1: Raster primitives

**Files:**
- Create: `src/lib/cut-pattern/page-layout/nest/types.ts`
- Create: `src/lib/cut-pattern/page-layout/nest/raster.ts`
- Test: `src/lib/cut-pattern/page-layout/nest/__tests__/raster.test.ts`

**Interfaces:**
- Produces:
  - `type Pt = { x: number; y: number }`
  - `type Span = [number, number]` — half-open `[x0, x1)` in cells
  - `type Raster = { w: number; h: number; rows: Span[][]; ox: number; oy: number; area: number }` — row `i` covers pivot-relative y ∈ `[(i+oy)·cell, (i+oy+1)·cell)`; column `c` covers x ∈ `[(c+ox)·cell, …)`; `area` = set-cell count of the UNdilated raster.
  - `type NestShape = { polygons: Pt[][]; pivot: Pt }` — convex polygons, band-local pattern units
  - `convexHull(pts: Pt[]): Pt[]`
  - `inflateConvex(poly: Pt[], r: number): Pt[]`
  - `rotateAbout(pts: Pt[], deg: number, pivot: Pt): Pt[]` — returns pivot-RELATIVE rotated points
  - `rasterizeConvex(polys: Pt[][], cell: number): Raster`
  - `dilateRaster(r: Raster, k: number): Raster` (keeps `area`)
  - `coarsenRaster(r: Raster, c: number): Raster`
  - `nestAngles(step: number): number[]`

- [ ] **Step 1: Write types.ts**

```ts
export type Pt = { x: number; y: number };
/** Half-open run of set cells [x0, x1) within one raster row. */
export type Span = [number, number];
/**
 * A piece's cell coverage at one angle. Row i covers pivot-relative
 * y ∈ [(i + oy)·cell, (i + oy + 1)·cell); column c likewise with ox.
 * `area` is the UNdilated set-cell count (dilation keeps it).
 */
export type Raster = { w: number; h: number; rows: Span[][]; ox: number; oy: number; area: number };
/** A band's footprint: convex polygons in band-local pattern units, plus the rotation pivot. */
export type NestShape = { polygons: Pt[][]; pivot: Pt };
```

- [ ] **Step 2: Write failing tests**

```ts
import {
	convexHull,
	inflateConvex,
	rotateAbout,
	rasterizeConvex,
	dilateRaster,
	coarsenRaster,
	nestAngles
} from '../raster';

const square = (x: number, y: number, s: number) => [
	{ x, y },
	{ x: x + s, y },
	{ x: x + s, y: y + s },
	{ x, y: y + s }
];

describe('convexHull', () => {
	it('drops interior points', () => {
		const h = convexHull([...square(0, 0, 10), { x: 5, y: 5 }]);
		expect(h).toHaveLength(4);
	});
	it('handles collinear and single points', () => {
		expect(convexHull([{ x: 1, y: 1 }])).toHaveLength(1);
		expect(convexHull([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]).length).toBeLessThanOrEqual(2);
	});
});

describe('inflateConvex', () => {
	it('grows the bounding box by r on every side', () => {
		const p = inflateConvex(square(0, 0, 10), 2);
		expect(Math.min(...p.map((q) => q.x))).toBeCloseTo(-2);
		expect(Math.max(...p.map((q) => q.y))).toBeCloseTo(12);
	});
});

describe('rotateAbout', () => {
	it('matches the SVG rotate(deg pivot) convention, pivot-relative', () => {
		const [p] = rotateAbout([{ x: 11, y: 0 }], 90, { x: 1, y: 0 });
		expect(p.x).toBeCloseTo(0);
		expect(p.y).toBeCloseTo(10);
	});
});

describe('rasterizeConvex', () => {
	it('an aligned 10×10 square at cell 1 is 10 rows of [0,10)', () => {
		const r = rasterizeConvex([square(0, 0, 10)], 1);
		expect(r.h).toBe(10);
		expect(r.w).toBe(10);
		expect(r.ox).toBe(0);
		expect(r.oy).toBe(0);
		expect(r.rows.every((row) => row.length === 1 && row[0][0] === 0 && row[0][1] === 10)).toBe(true);
		expect(r.area).toBe(100);
	});
	it('is conservative: an unaligned square covers every cell it touches', () => {
		const r = rasterizeConvex([square(0.5, 0.5, 2)], 1);
		expect(r.h).toBe(3);
		expect(r.area).toBe(9);
	});
	it('negative coordinates give negative offsets', () => {
		const r = rasterizeConvex([square(-5, -5, 10)], 1);
		expect(r.ox).toBe(-5);
		expect(r.oy).toBe(-5);
	});
	it('a 45° square covers a diamond, area between the square area and its box', () => {
		const r = rasterizeConvex([rotateAbout(square(0, 0, 10), 45, { x: 5, y: 5 })], 1);
		expect(r.area).toBeGreaterThanOrEqual(100);
		expect(r.area).toBeLessThan(15 * 15);
	});
	it('merges overlapping polygons in a row', () => {
		const r = rasterizeConvex([square(0, 0, 4), square(3, 0, 4)], 1);
		expect(r.rows[0]).toEqual([[0, 7]]);
	});
});

describe('dilateRaster', () => {
	it('grows by k in every direction and keeps area', () => {
		const r = rasterizeConvex([square(0, 0, 10)], 1);
		const d = dilateRaster(r, 2);
		expect(d.w).toBe(14);
		expect(d.h).toBe(14);
		expect(d.ox).toBe(-2);
		expect(d.oy).toBe(-2);
		expect(d.area).toBe(100);
		// middle row widened by full k
		expect(d.rows[7]).toEqual([[0, 14]]);
		// extreme row widened by floor(sqrt(k²−k²)) = 0
		expect(d.rows[0]).toEqual([[2, 12]]);
	});
});

describe('coarsenRaster', () => {
	it('maps fine cells to coarse cells conservatively', () => {
		const r = rasterizeConvex([square(1, 1, 5)], 1); // cells 1..5
		const c = coarsenRaster(r, 4);
		expect(c.h).toBe(2);
		expect(c.rows[0]).toEqual([[0, 2]]);
	});
});

describe('nestAngles', () => {
	it('15 → 24 angles', () => expect(nestAngles(15)).toHaveLength(24));
	it('0 → [0]', () => expect(nestAngles(0)).toEqual([0]));
	it('25 → multiples of 25 below 360', () => {
		const a = nestAngles(25);
		expect(a[a.length - 1]).toBe(350);
		expect(a).toHaveLength(15);
	});
	it('negative / NaN → [0]', () => {
		expect(nestAngles(-5)).toEqual([0]);
		expect(nestAngles(NaN)).toEqual([0]);
	});
});
```

Note on the coarsen test: the fine raster of `square(1,1,5)` has `ox = oy = 1`, rows 0..4 each `[0,5)`. Coarsening is relative to the raster's own cell indices (raster placed at a fine x that is a multiple of `c`), so fine cols 0..4 → coarse `[floor(0/4), ceil(5/4)) = [0,2)`, rows 0..4 → coarse rows 0..1.

- [ ] **Step 3: Run to verify failure**

Run: `npm run test:unit -- src/lib/cut-pattern/page-layout/nest/__tests__/raster.test.ts`
Expected: FAIL — cannot find module `../raster`.

- [ ] **Step 4: Implement raster.ts**

```ts
import type { Pt, Raster, Span } from './types';

const EPS = 1e-9;

/** Andrew's monotone chain; returns CCW hull without repeated endpoint. */
export const convexHull = (pts: Pt[]): Pt[] => {
	const p = pts
		.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y))
		.slice()
		.sort((a, b) => a.x - b.x || a.y - b.y);
	if (p.length <= 2) return p;
	const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const lower: Pt[] = [];
	for (const q of p) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= EPS) lower.pop();
		lower.push(q);
	}
	const upper: Pt[] = [];
	for (let i = p.length - 1; i >= 0; i--) {
		const q = p[i];
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= EPS) upper.pop();
		upper.push(q);
	}
	return lower.slice(0, -1).concat(upper.slice(0, -1));
};

/** Conservative outward offset: hull of r-squares around every vertex (⊇ Minkowski sum with a disk). */
export const inflateConvex = (poly: Pt[], r: number): Pt[] => {
	if (!(r > 0)) return poly;
	return convexHull(
		poly.flatMap((q) => [
			{ x: q.x - r, y: q.y - r },
			{ x: q.x + r, y: q.y - r },
			{ x: q.x + r, y: q.y + r },
			{ x: q.x - r, y: q.y + r }
		])
	);
};

/** Rotate about `pivot` (SVG rotate convention, y down); result is pivot-RELATIVE. */
export const rotateAbout = (pts: Pt[], deg: number, pivot: Pt): Pt[] => {
	const t = (deg * Math.PI) / 180;
	const c = Math.cos(t);
	const s = Math.sin(t);
	return pts.map((p) => {
		const dx = p.x - pivot.x;
		const dy = p.y - pivot.y;
		return { x: dx * c - dy * s, y: dx * s + dy * c };
	});
};

/** x-extent of a convex polygon inside the horizontal slab [y0, y1], or null. */
const slabXRange = (poly: Pt[], y0: number, y1: number): [number, number] | null => {
	let lo = Infinity;
	let hi = -Infinity;
	const take = (x: number) => {
		if (x < lo) lo = x;
		if (x > hi) hi = x;
	};
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i];
		const b = poly[(i + 1) % poly.length];
		if (a.y >= y0 && a.y <= y1) take(a.x);
		for (const yy of [y0, y1]) {
			if ((a.y - yy) * (b.y - yy) < 0) take(a.x + ((yy - a.y) * (b.x - a.x)) / (b.y - a.y));
		}
	}
	return lo <= hi ? [lo, hi] : null;
};

export const mergeSpans = (spans: Span[]): Span[] => {
	if (spans.length <= 1) return spans.slice();
	const s = spans.slice().sort((a, b) => a[0] - b[0]);
	const out: Span[] = [[s[0][0], s[0][1]]];
	for (let i = 1; i < s.length; i++) {
		const last = out[out.length - 1];
		if (s[i][0] <= last[1]) last[1] = Math.max(last[1], s[i][1]);
		else out.push([s[i][0], s[i][1]]);
	}
	return out;
};

const areaOf = (rows: Span[][]) => rows.reduce((n, row) => n + row.reduce((m, [a, b]) => m + b - a, 0), 0);

/** Conservative scan conversion: a cell is set if any polygon touches it. */
export const rasterizeConvex = (polys: Pt[][], cell: number): Raster => {
	const valid = polys.filter((p) => p.length > 0 && p.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y)));
	if (valid.length === 0) return { w: 0, h: 0, rows: [], ox: 0, oy: 0, area: 0 };
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const p of valid) for (const q of p) {
		minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
		minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
	}
	const ox = Math.floor(minX / cell);
	const oy = Math.floor(minY / cell);
	const w = Math.max(1, Math.ceil(maxX / cell) - ox);
	const h = Math.max(1, Math.ceil(maxY / cell) - oy);
	const rows: Span[][] = Array.from({ length: h }, () => []);
	for (const p of valid) {
		let pMinY = Infinity, pMaxY = -Infinity;
		for (const q of p) { pMinY = Math.min(pMinY, q.y); pMaxY = Math.max(pMaxY, q.y); }
		const r0 = Math.max(0, Math.floor(pMinY / cell) - oy);
		const r1 = Math.min(h - 1, Math.max(r0, Math.ceil(pMaxY / cell) - oy - 1));
		for (let r = r0; r <= r1; r++) {
			const y0 = (r + oy) * cell;
			const xr = slabXRange(p, y0, y0 + cell);
			if (!xr) continue;
			const c0 = Math.max(0, Math.floor(xr[0] / cell) - ox);
			let c1 = Math.min(w, Math.ceil(xr[1] / cell) - ox);
			if (c1 <= c0) c1 = Math.min(w, c0 + 1);
			rows[r].push([c0, c1]);
		}
	}
	const merged = rows.map(mergeSpans);
	return { w, h, rows: merged, ox, oy, area: areaOf(merged) };
};

/** Disk dilation by k cells; offsets shift by −k so the frame stays put. Keeps `area`. */
export const dilateRaster = (r: Raster, k: number): Raster => {
	if (k <= 0) return r;
	const h = r.h + 2 * k;
	const rows: Span[][] = Array.from({ length: h }, () => []);
	const half = Array.from({ length: 2 * k + 1 }, (_, i) => Math.floor(Math.sqrt(k * k - (i - k) * (i - k))));
	r.rows.forEach((row, y) => {
		for (const [a, b] of row) {
			for (let dy = -k; dy <= k; dy++) {
				const hw = half[dy + k];
				rows[y + dy + k].push([a - hw + k, b + hw + k]);
			}
		}
	});
	return { w: r.w + 2 * k, h, rows: rows.map(mergeSpans), ox: r.ox - k, oy: r.oy - k, area: r.area };
};

/** Coarse raster for placement at fine x/y that are multiples of c. */
export const coarsenRaster = (r: Raster, c: number): Raster => {
	const h = Math.ceil(r.h / c);
	const rows: Span[][] = Array.from({ length: h }, () => []);
	r.rows.forEach((row, y) => {
		for (const [a, b] of row) rows[Math.floor(y / c)].push([Math.floor(a / c), Math.ceil(b / c)]);
	});
	const merged = rows.map(mergeSpans);
	return { w: Math.ceil(r.w / c), h, rows: merged, ox: 0, oy: 0, area: areaOf(merged) };
};

export const nestAngles = (step: number): number[] => {
	if (!(step > 0) || step >= 360) return [0];
	const out: number[] = [];
	for (let k = 0; k * step < 360 - 1e-9; k++) out.push(k * step);
	return out;
};
```

(Prettier will reformat the compressed `let` lines; run `npx prettier --write` on the file.)

- [ ] **Step 5: Run tests — expect PASS.** Fix any expectation mismatch by checking the math, not by loosening the assertion (e.g. the dilation extreme-row width).

- [ ] **Step 6: Commit**

```bash
git add src/lib/cut-pattern/page-layout/nest/types.ts src/lib/cut-pattern/page-layout/nest/raster.ts src/lib/cut-pattern/page-layout/nest/__tests__/raster.test.ts
git commit -m "feat(page-layout): raster primitives for shape-aware nesting"
```

---

### Task 2: NestShape from a band

**Files:**
- Modify: `src/lib/cut-pattern/label-footprint.ts` (extract `selfTagFootprintBox`)
- Create: `src/lib/cut-pattern/page-layout/nest/nest-shape.ts`
- Test: `src/lib/cut-pattern/page-layout/nest/__tests__/nest-shape.test.ts`

**Interfaces:**
- Consumes: `convexHull`, `inflateConvex` (Task 1); `flattenPath` from `src/lib/cut-pattern/path-contours.ts`; `EffectiveBoundsContext` from `src/lib/cut-pattern/band-layout.ts`; `buildSelfTagLines`.
- Produces:
  - `selfTagFootprintBox(input: EffectiveBandBoundsInput): BoundingBox | undefined` in `label-footprint.ts` — the label box alone (undefined when the self-tag is off or the band has no anchor). `effectiveBandBounds` becomes `extent ∪ selfTagFootprintBox(...)` with unchanged results.
  - `buildNestShape(band: BandCutPattern, ctx: EffectiveBoundsContext, pivot: Point): NestShape`

- [ ] **Step 1: Refactor label-footprint.ts.** Move the body of `effectiveBandBounds` after the `extent` line into:

```ts
export const selfTagFootprintBox = (input: EffectiveBandBoundsInput): BoundingBox | undefined => {
	const { band, labels, selfTagLines, measuredDims } = input;
	const selfTag = labels?.selfTag;
	if (!selfTag?.enabled || !band.tagAnchorPoint) return undefined;
	const height = selfTag.height ?? 14;
	const dims = measuredDims.get(band.id) ?? estimateTextDims(selfTagLines, height);
	return computeLabelFootprintBox({
		anchor: band.tagAnchorPoint,
		autoAngle: band.tagAnchorAutoAngle,
		angle: band.tagAngle ?? selfTag.angle ?? 0,
		textWidth: dims.width,
		textHeight: dims.height,
		radius: height / 4,
		padding: selfTag.padding ?? 10,
		stemLength: selfTag.stemLength ?? 20,
		stemWidth: selfTag.stemWidth ?? 4
	});
};

export const effectiveBandBounds = (input: EffectiveBandBoundsInput): BoundingBox | undefined => {
	const extent = patternExtentBounds(input.band);
	if (!extent) return extent;
	const footprint = selfTagFootprintBox(input);
	return footprint ? unionBox(extent, footprint) : extent;
};
```

Run existing tests: `npm run test:unit -- src/lib/cut-pattern` — must stay green.

- [ ] **Step 2: Write failing test** (check `PathSegment` shape in `src/lib/types.ts` first — segments are tuples like `['M', x, y]`, `['L', x, y]`, `['Z']`; adjust the helper if different):

```ts
import { buildNestShape } from '../nest-shape';
import type { BandCutPattern } from '$lib/types';
import type { EffectiveBoundsContext } from '$lib/cut-pattern/band-layout';

const quadFacet = (x: number, y: number, s: number, strokeWidth = 0) => ({
	path: [['M', x, y], ['L', x + s, y], ['L', x + s, y + s], ['L', x, y + s], ['Z']],
	label: '',
	strokeWidth
});

const band = (facets: unknown[], extra: Partial<BandCutPattern> = {}) =>
	({ id: 'b', facets, address: { globule: 0, tube: 0, band: 0 }, projectionType: 'patterned', tagAnchorPoint: undefined, ...extra }) as unknown as BandCutPattern;

const ctx: EffectiveBoundsContext = {
	labels: undefined,
	externalTagEnabled: false,
	measuredDims: new Map(),
	groupCodeFor: () => undefined
};

describe('buildNestShape', () => {
	it('one convex polygon per facet, carrying the pivot', () => {
		const s = buildNestShape(band([quadFacet(0, 0, 10), quadFacet(10, 0, 10)]), ctx, { x: 10, y: 5 });
		expect(s.polygons).toHaveLength(2);
		expect(s.pivot).toEqual({ x: 10, y: 5 });
	});
	it('inflates by half the stroke width', () => {
		const s = buildNestShape(band([quadFacet(0, 0, 10, 4)]), ctx, { x: 0, y: 0 });
		expect(Math.min(...s.polygons[0].map((p) => p.x))).toBeCloseTo(-2);
	});
	it('skips facets with empty or non-finite paths', () => {
		const s = buildNestShape(
			band([quadFacet(0, 0, 10), { path: [], label: '' }, { path: [['M', NaN, NaN], ['L', NaN, 0]], label: '' }]),
			ctx,
			{ x: 0, y: 0 }
		);
		expect(s.polygons).toHaveLength(1);
		expect(s.polygons.flat().every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
	});
	it('adds the self-tag footprint as a polygon when the tag is shown', () => {
		const labelled = { ...ctx, labels: { selfTag: { enabled: true } } as never };
		const s = buildNestShape(band([quadFacet(0, 0, 10)], { tagAnchorPoint: { x: 5, y: 10 } }), labelled, { x: 0, y: 0 });
		expect(s.polygons).toHaveLength(2);
	});
});
```

- [ ] **Step 3: Run — expect FAIL (module missing).**

- [ ] **Step 4: Implement nest-shape.ts**

```ts
import type { BandCutPattern, Point } from '$lib/types';
import type { EffectiveBoundsContext } from '$lib/cut-pattern/band-layout';
import { flattenPath } from '$lib/cut-pattern/path-contours';
import { selfTagFootprintBox } from '$lib/cut-pattern/label-footprint';
import { buildSelfTagLines } from '$lib/cut-pattern/build-self-tag-lines';
import { concatAddress } from '$lib/util';
import { convexHull, inflateConvex } from './raster';
import type { NestShape, Pt } from './types';

/**
 * A band's packing footprint: one convex hull per facet (from the drawn facet
 * path, the same source `patternExtentBounds` measures), inflated by half the
 * stroke, plus the external self-tag box when it is shown. Convex parts keep
 * rasterisation simple and are close to exact for quad facets.
 */
export const buildNestShape = (band: BandCutPattern, ctx: EffectiveBoundsContext, pivot: Point): NestShape => {
	const polygons: Pt[][] = [];
	for (const facet of band.facets ?? []) {
		if (!facet.path?.length) continue;
		const pts = flattenPath(facet.path)
			.flat()
			.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
		if (pts.length === 0) continue;
		polygons.push(inflateConvex(convexHull(pts), (facet.strokeWidth ?? 1) / 2));
	}
	const tag = selfTagFootprintBox({
		band,
		labels: ctx.labels,
		selfTagLines: buildSelfTagLines(
			concatAddress(band.address, 'tb-slash'),
			ctx.groupCodeFor(band.address as never),
			ctx.externalTagEnabled
		),
		measuredDims: ctx.measuredDims
	});
	if (tag) {
		const { left: l, top: t, width: w, height: h } = tag;
		polygons.push([{ x: l, y: t }, { x: l + w, y: t }, { x: l + w, y: t + h }, { x: l, y: t + h }]);
	}
	return { polygons, pivot: { x: pivot.x, y: pivot.y } };
};
```

Match the exact `buildSelfTagLines` / `groupCodeFor` call used by `effectiveBoundsForBand` in `band-layout.ts` (copy its argument expressions verbatim, including any cast).

- [ ] **Step 5: Run tests — PASS.** Also re-run `npm run test:unit -- src/lib/cut-pattern`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cut-pattern/label-footprint.ts src/lib/cut-pattern/page-layout/nest/nest-shape.ts src/lib/cut-pattern/page-layout/nest/__tests__/nest-shape.test.ts
git commit -m "feat(page-layout): build per-band nest shapes from facet hulls and tag footprint"
```

---

### Task 3: `nestPageLayout` placement

**Files:**
- Modify: `src/lib/cut-pattern/page-layout/types.ts` (add `utilisation?: number[]` to `PageLayoutResult`)
- Create: `src/lib/cut-pattern/page-layout/nest/nest.ts`
- Test: `src/lib/cut-pattern/page-layout/nest/__tests__/nest.test.ts`
- Test fixture helper: `src/lib/cut-pattern/page-layout/nest/__tests__/fixtures.ts`

**Interfaces:**
- Consumes: Task 1 primitives, `NestShape`; `PageGeom`, `PageLayoutResult`, `PageRect` from `../types`; `skylinePageLayout` (tests only).
- Produces:
  - `type NestGeom = PageGeom & { rotationStep: number; cellMm: number }`
  - `NEST_CELL_MM = 1`, `NEST_MAX_CELLS = 250_000`, `NEST_COARSE = 4`
  - `nestCellSize(geom: NestGeom): number`
  - `nestPageLayout(shapes: NestShape[], geom: NestGeom): PageLayoutResult` — origins are `Vector3`; `rotations` in degrees from `nestAngles(geom.rotationStep)`; `utilisation[p]` ∈ [0,1].

Placement math (implement exactly):

- `cell = nestCellSize(geom)`; `k = ceil((gap/2)/cell) + 1`; `CW = ceil(contentWidth/cell)`, `CH = ceil(contentHeight/cell)`; pack grid `W = CW + 2k`, `H = CH + 2k`.
- Pack grid cell (0,0) top-left is page point `X0 = marginPx − k·cell`, `Y0 = pageY + marginPx − k·cell` where `pageY = page·(pageHeight + pageGap)`.
- Per shape per angle θ: `fine = dilateRaster(rasterizeConvex(shape.polygons.map(p => rotateAbout(p, θ, shape.pivot)), cell), k)`; `coarse = coarsenRaster(fine, NEST_COARSE)`. Cache both.
- Placing raster `r` at grid `(gx, gy)`: `origin = { x: X0 + (gx − r.ox)·cell − pivot.x, y: Y0 + (gy − r.oy)·cell − pivot.y }`, `rotation = θ`.
- Search per angle: scan coarse rows `GY = 0..` then `GX = 0..`; first coarse fit → start `(GX·C, GY·C)`, then compact at fine resolution (slide up while fits, slide left while fits, repeat until neither moves). Score `(gy + r.h, gx)` lexicographic, lower better; ties keep the earlier angle.
- If no angle fits on the current page: new page, empty grid, search again; if coarse finds nothing on the empty page, do a full fine scan (rows then columns). If still nothing (cannot happen after the overflow pre-check except by rounding), place at `(0,0)` with angle of best overflow fit and continue — never throw.
- Coarse grid: rebuilt from the fine grid after each placement; a coarse cell is occupied if any covered fine cell is occupied or the block extends past `W`/`H`.
- Order: shapes sorted by `area` at θ=0 descending, ties by index.
- Overflow pre-check: for each shape and angle, the rotated undilated polygon bbox `(bw, bh)`; fits if `bw ≤ contentWidth + 1e-6 && bh ≤ contentHeight + 1e-6` at some angle. Else `f = min over angles max(bw/contentWidth, bh/contentHeight)`; worst `f` wins → `{ origins: [], rotations: [], pages: [], overflow: { itemIndex, requiredScale: pageScale·f } }`. Shapes with no polygons are always placeable (origin at content origin, rotation 0, no grid cells).
- `utilisation[p] = Σ area of pieces on p / (CW·CH)`.
- Zero shapes → one empty page, `utilisation: [0]`.

- [ ] **Step 1: fixtures.ts**

```ts
import type { NestShape, Pt } from '../types';

/** Strip of quads along a polyline, half-width hw. Pivot = bbox centre. */
export const stripShape = (spine: Pt[], hw: number): NestShape => {
	const polygons: Pt[][] = [];
	for (let i = 0; i + 1 < spine.length; i++) {
		const a = spine[i];
		const b = spine[i + 1];
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		const nx = (-(b.y - a.y) / len) * hw;
		const ny = ((b.x - a.x) / len) * hw;
		polygons.push([
			{ x: a.x + nx, y: a.y + ny },
			{ x: b.x + nx, y: b.y + ny },
			{ x: b.x - nx, y: b.y - ny },
			{ x: a.x - nx, y: a.y - ny }
		]);
	}
	const xs = polygons.flat().map((p) => p.x);
	const ys = polygons.flat().map((p) => p.y);
	return {
		polygons,
		pivot: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
	};
};

/** Chevron like the reference screenshot: two 100-long arms, 100° apart, opening right. */
export const chevron = (hw = 8): NestShape => {
	const arm = 100;
	const half = (50 * Math.PI) / 180;
	const apex = { x: 0, y: arm * Math.sin(half) };
	const spine: Pt[] = [];
	for (let t = 0; t <= 1.0001; t += 0.1) spine.push({ x: apex.x + t * arm * Math.cos(half), y: apex.y - t * arm * Math.sin(half) });
	spine.reverse();
	for (let t = 0.1; t <= 1.0001; t += 0.1) spine.push({ x: apex.x + t * arm * Math.cos(half), y: apex.y + t * arm * Math.sin(half) });
	return stripShape(spine, hw);
};

export const rect = (w: number, h: number): NestShape => ({
	polygons: [[{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]],
	pivot: { x: w / 2, y: h / 2 }
});
```

- [ ] **Step 2: Write failing tests (nest.test.ts)**

```ts
import { nestPageLayout, type NestGeom } from '../nest';
import { skylinePageLayout } from '../../skyline';
import { chevron, rect } from './fixtures';
import type { NestShape, Pt } from '../types';
import type { PageLayoutResult } from '../../types';

const geom = (over: Partial<NestGeom> = {}): NestGeom => ({
	pageScale: 1,
	pageWidth: 300,
	pageHeight: 300,
	contentWidth: 300,
	contentHeight: 300,
	marginPx: 0,
	pageGap: 50,
	gap: 4,
	reorderWindow: 8,
	allowRotation: false,
	rotationStep: 15,
	cellMm: 1,
	...over
});

const placed = (s: NestShape, r: PageLayoutResult, i: number): Pt[][] => {
	const t = (r.rotations[i] * Math.PI) / 180;
	const o = r.origins[i];
	return s.polygons.map((poly) =>
		poly.map((p) => {
			const dx = p.x - s.pivot.x;
			const dy = p.y - s.pivot.y;
			return {
				x: o.x + s.pivot.x + dx * Math.cos(t) - dy * Math.sin(t),
				y: o.y + s.pivot.y + dx * Math.sin(t) + dy * Math.cos(t)
			};
		})
	);
};

// Exact distance between convex polygons (0 if they intersect).
const segDist = (p: Pt, a: Pt, b: Pt) => {
	const vx = b.x - a.x, vy = b.y - a.y;
	const L = vx * vx + vy * vy;
	const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L)) : 0;
	return Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy);
};
const overlaps = (A: Pt[], B: Pt[]) => {
	for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
		const a = P[i], b = P[(i + 1) % P.length];
		const nx = -(b.y - a.y), ny = b.x - a.x;
		const pa = A.map((q) => q.x * nx + q.y * ny), pb = B.map((q) => q.x * nx + q.y * ny);
		if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
	}
	return true;
};
const polyDist = (A: Pt[], B: Pt[]) => {
	if (overlaps(A, B)) return 0;
	let d = Infinity;
	for (const [P, Q] of [[A, B], [B, A]]) for (const p of P) for (let i = 0; i < Q.length; i++) d = Math.min(d, segDist(p, Q[i], Q[(i + 1) % Q.length]));
	return d;
};

const assertValid = (shapes: NestShape[], r: PageLayoutResult, g: NestGeom) => {
	const all = shapes.map((s, i) => placed(s, r, i));
	const cell = 1;
	shapes.forEach((_, i) => {
		const page = r.pages.findIndex((pg) => all[i].flat().every((p) => p.y >= pg.y - cell && p.y <= pg.y + pg.height + cell));
		expect(page).toBeGreaterThanOrEqual(0);
		const pg = r.pages[page];
		for (const p of all[i].flat()) {
			expect(p.x).toBeGreaterThanOrEqual(pg.x + g.marginPx - cell - 1e-6);
			expect(p.x).toBeLessThanOrEqual(pg.x + g.marginPx + g.contentWidth + cell + 1e-6);
			expect(p.y).toBeGreaterThanOrEqual(pg.y + g.marginPx - cell - 1e-6);
			expect(p.y).toBeLessThanOrEqual(pg.y + g.marginPx + g.contentHeight + cell + 1e-6);
		}
	});
	for (let i = 0; i < all.length; i++)
		for (let j = i + 1; j < all.length; j++)
			for (const A of all[i]) for (const B of all[j]) expect(polyDist(A, B)).toBeGreaterThanOrEqual(g.gap - 1e-6);
};

const perPage = (r: PageLayoutResult) => r.origins.filter((o) => o.y < r.pages[0].y + r.pages[0].height).length;

describe('nestPageLayout', () => {
	it('zero shapes → one empty page', () => {
		const r = nestPageLayout([], geom());
		expect(r.pages).toHaveLength(1);
		expect(r.utilisation).toEqual([0]);
	});

	it('places one rect at the content origin', () => {
		const r = nestPageLayout([rect(50, 20)], geom({ rotationStep: 0, gap: 0 }));
		expect(r.rotations[0]).toBe(0);
		// rect pivot (25,10) lands so the rect's top-left is within one cell of (0,0)
		expect(Math.abs(r.origins[0].x)).toBeLessThanOrEqual(1.0001);
		expect(Math.abs(r.origins[0].y)).toBeLessThanOrEqual(1.0001);
	});

	it('never overlaps and keeps gap clearance (chevrons, 15° steps)', () => {
		const shapes = Array.from({ length: 12 }, () => chevron());
		const g = geom();
		const r = nestPageLayout(shapes, g);
		assertValid(shapes, r, g);
	});

	it('respects margins', () => {
		const shapes = Array.from({ length: 6 }, () => rect(60, 30));
		const g = geom({ pageWidth: 320, pageHeight: 320, marginPx: 10 });
		assertValid(shapes, nestPageLayout(shapes, g), g);
	});

	it('only uses multiples of the rotation step', () => {
		const r = nestPageLayout(Array.from({ length: 8 }, () => chevron()), geom({ rotationStep: 25 }));
		for (const a of r.rotations) expect(a % 25).toBe(0);
		const r0 = nestPageLayout(Array.from({ length: 4 }, () => chevron()), geom({ rotationStep: 0 }));
		expect(r0.rotations.every((a) => a === 0)).toBe(true);
	});

	it('packs chevrons at least 1.5× denser than skyline with rotation', () => {
		const n = 30;
		const shapes = Array.from({ length: n }, () => chevron());
		const g = geom();
		const nest = nestPageLayout(shapes, g);
		const xs = shapes[0].polygons.flat().map((p) => p.x);
		const ys = shapes[0].polygons.flat().map((p) => p.y);
		const box = { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), left: Math.min(...xs), top: Math.min(...ys), alignedYOffset: 0 };
		const sky = skylinePageLayout(Array.from({ length: n }, () => box), { ...g, allowRotation: true });
		expect(perPage(nest)).toBeGreaterThanOrEqual(Math.ceil(1.5 * perPage(sky)));
	});

	it('overflow: an item larger than the page at every angle', () => {
		const g = geom({ rotationStep: 90 });
		const r = nestPageLayout([rect(50, 50), rect(600, 400)], g);
		expect(r.overflow?.itemIndex).toBe(1);
		const f = (r.overflow?.requiredScale ?? 0) / g.pageScale;
		expect(f).toBeCloseTo(2, 5); // 600/300 at 0°, min over 0/90
	});

	it('is deterministic', () => {
		const shapes = Array.from({ length: 10 }, (_, i) => (i % 2 ? chevron() : rect(40, 15)));
		const a = nestPageLayout(shapes, geom());
		const b = nestPageLayout(shapes, geom());
		expect(a.origins.map((o) => [o.x, o.y])).toEqual(b.origins.map((o) => [o.x, o.y]));
		expect(a.rotations).toEqual(b.rotations);
	});

	it('spills to a second page when the first is full', () => {
		const r = nestPageLayout(Array.from({ length: 6 }, () => rect(140, 140)), geom({ rotationStep: 0 }));
		expect(r.pages.length).toBeGreaterThanOrEqual(2);
		expect(r.utilisation!.length).toBe(r.pages.length);
	});

	it('handles shapes with no polygons', () => {
		const r = nestPageLayout([{ polygons: [], pivot: { x: 0, y: 0 } }, rect(10, 10)], geom());
		expect(r.origins).toHaveLength(2);
	});

	it('30 chevrons at 15° finish in under 2 s', () => {
		const t0 = Date.now();
		nestPageLayout(Array.from({ length: 30 }, () => chevron()), geom());
		expect(Date.now() - t0).toBeLessThan(2000);
	});
});
```

If the 1.5× density test fails, first look at the actual counts (`console.log`) — investigate the search (e.g. compaction not running, wrong score) before touching the threshold. Do not lower the threshold below 1.5 without recording the measured numbers in the commit message.

- [ ] **Step 3: Run — expect FAIL.**

- [ ] **Step 4: Implement nest.ts** following the "Placement math" bullets above. Structure:

```ts
import { Vector3 } from 'three';
import type { PageGeom, PageLayoutResult, PageRect } from '../types';
import type { NestShape, Raster } from './types';
import { coarsenRaster, dilateRaster, nestAngles, rasterizeConvex, rotateAbout } from './raster';

export type NestGeom = PageGeom & { rotationStep: number; cellMm: number };
export const NEST_CELL_MM = 1;
export const NEST_MAX_CELLS = 250_000;
export const NEST_COARSE = 4;

export const nestCellSize = (g: NestGeom): number =>
	Math.max(g.cellMm * g.pageScale, Math.sqrt((g.contentWidth * g.contentHeight) / NEST_MAX_CELLS));

/** Occupancy grid with per-row prefix sums for O(1) span-free tests. */
class Grid {
	occ: Uint8Array;
	pre: Int32Array;
	constructor(readonly W: number, readonly H: number) {
		this.occ = new Uint8Array(W * H);
		this.pre = new Int32Array(H * (W + 1));
	}
	fits(r: Raster, gx: number, gy: number): boolean {
		if (gy < 0 || gx < 0 || gy + r.h > this.H || gx + r.w > this.W) return false;
		const S = this.W + 1;
		for (let i = 0; i < r.h; i++) {
			const row = r.rows[i];
			if (row.length === 0) continue;
			const base = (gy + i) * S;
			for (const [a, b] of row) if (this.pre[base + gx + b] - this.pre[base + gx + a] !== 0) return false;
		}
		return true;
	}
	place(r: Raster, gx: number, gy: number) {
		for (let i = 0; i < r.h; i++) {
			const row = r.rows[i];
			if (row.length === 0) continue;
			const y = gy + i;
			for (const [a, b] of row) this.occ.fill(1, y * this.W + gx + a, y * this.W + gx + b);
			this.rebuildRow(y);
		}
	}
	rebuildRow(y: number) {
		const S = this.W + 1;
		let acc = 0;
		this.pre[y * S] = 0;
		for (let x = 0; x < this.W; x++) {
			acc += this.occ[y * this.W + x];
			this.pre[y * S + x + 1] = acc;
		}
	}
	coarsen(c: number): Grid {
		const cw = Math.ceil(this.W / c);
		const ch = Math.ceil(this.H / c);
		const g = new Grid(cw, ch);
		for (let Y = 0; Y < ch; Y++) {
			for (let X = 0; X < cw; X++) {
				let busy = (X + 1) * c > this.W || (Y + 1) * c > this.H;
				for (let y = Y * c; !busy && y < (Y + 1) * c; y++)
					for (let x = X * c; !busy && x < (X + 1) * c; x++) busy = this.occ[y * this.W + x] === 1;
				if (busy) g.occ[Y * cw + X] = 1;
			}
			g.rebuildRow(Y);
		}
		return g;
	}
}
```

Then: per-shape precompute `{ fine: Raster[], coarse: Raster[], bbox: {w,h}[] }` (bbox from rotated undilated polygons, for overflow); `searchCoarse(fineGrid, coarseGrid, fine, coarse)` → `{gx, gy} | null` with compaction; `searchFine(fineGrid, fine)` full scan; main loop as described; build `origins` as `new Vector3(x, y, 0)` indexed by ORIGINAL shape index; `pages` exactly as skyline (`{ x: 0, y: idx·(pageHeight+pageGap), width: pageWidth, height: pageHeight }`).

Note `coarsen` treats a coarse block that runs past `W`/`H` as busy — that is what makes coarse feasibility imply fine feasibility. A coarse raster must also be bounded: `GX + coarse.w ≤ cw` is enforced by `fits`.

Keep the file under ~250 lines; if it grows, move `Grid` to `nest/grid.ts`.

- [ ] **Step 5: Run tests — PASS** (all, including perf). Then run `npm run test:unit -- src/lib/cut-pattern/page-layout` to confirm skyline/flex-wrap untouched.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cut-pattern/page-layout/types.ts src/lib/cut-pattern/page-layout/nest/nest.ts src/lib/cut-pattern/page-layout/nest/__tests__/nest.test.ts src/lib/cut-pattern/page-layout/nest/__tests__/fixtures.ts
git commit -m "feat(page-layout): raster bottom-left-fill nest layout with rotation steps"
```

---

### Task 4: Config, validator, geom builder

**Files:**
- Modify: `src/lib/types.ts:239-249` (`PageLayoutConfig`)
- Modify: `src/lib/shades-config.ts:590-600`
- Modify: `src/lib/validators.ts:83-102`
- Modify: `src/lib/cut-pattern/page-layout/registry.ts`
- Test: `src/lib/cut-pattern/page-layout/__tests__/registry.test.ts` (create), and the existing validators test file if there is one (`grep -rl "reorderWindow" src/lib/__tests__ src/lib/**/__tests__`)

**Interfaces:**
- Consumes: `NestGeom`, `NEST_CELL_MM` (Task 3).
- Produces:
  - `PageLayoutConfig.algorithm: 'flex-wrap' | 'skyline' | 'nest'`, `PageLayoutConfig.rotationStep: number`
  - `buildNestGeom(cfg: PageLayoutConfig): NestGeom` in `registry.ts`
  - `PAGE_LAYOUT_ALGORITHMS` stays typed over the SYNC algorithms: change its type to `Record<Exclude<PageLayoutConfig['algorithm'], 'nest'>, PageLayoutFn>`.

- [ ] **Step 1: Failing test**

```ts
import { buildNestGeom, buildPageGeom } from '../registry';
import { NEST_CELL_MM } from '../nest/nest';
import { defaultPatternConfig } from '$lib/shades-config';

describe('buildNestGeom', () => {
	it('extends the page geom with rotationStep and cellMm', () => {
		const cfg = { ...defaultPatternConfig().pageLayout, algorithm: 'nest' as const, rotationStep: 30 };
		const g = buildNestGeom(cfg);
		expect(g).toMatchObject(buildPageGeom(cfg));
		expect(g.rotationStep).toBe(30);
		expect(g.cellMm).toBe(NEST_CELL_MM);
	});
	it('default config has rotationStep 15', () => {
		expect(defaultPatternConfig().pageLayout.rotationStep).toBe(15);
	});
});
```

Add a validator test (in the existing validators test file, following its style) that a saved config whose `pageLayout` lacks `rotationStep` gets `15`.

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.**
  - types: `algorithm: 'flex-wrap' | 'skyline' | 'nest';` and `rotationStep: number; // nest only: rotation step in degrees (0 = none)`.
  - defaults: `rotationStep: 15`.
  - validators: add `rotationStep: 15` to the fresh-default object, and `if (pl.rotationStep === undefined) pl.rotationStep = 15;` in the backfill branch.
  - registry:

```ts
export const buildNestGeom = (cfg: PageLayoutConfig): NestGeom => ({
	...buildPageGeom(cfg),
	rotationStep: cfg.rotationStep ?? 15,
	cellMm: NEST_CELL_MM
});
```

  - Fix every TypeScript error from the widened union: `npm run check` and grep `pageLayoutCfg.algorithm` / `PAGE_LAYOUT_ALGORITHMS[`. In `CutPatternRenderer.svelte`, the existing `PAGE_LAYOUT_ALGORITHMS[pageLayoutCfg.algorithm]` call must not receive `'nest'` — temporarily route `'nest'` to `skylinePageLayout` with `allowRotation: true` (Task 6 replaces this with the worker). Also update any other `PageLayoutConfig` literal (tests, fixtures, `sandbox-*` routes) that now lacks `rotationStep`.
- [ ] **Step 4: `npm run test:unit` (whole suite) and `npm run check` — both pass (check may have pre-existing warnings; no new errors).**
- [ ] **Step 5: Commit**

```bash
git add <each modified file by name>
git commit -m "feat(page-layout): nest algorithm config, rotationStep default and backfill"
```

---

### Task 5: Worker and client

**Files:**
- Create: `src/lib/workers/nest-layout-worker-core.ts`
- Create: `src/lib/workers/nest-layout.worker.ts`
- Create: `src/lib/workers/nest-layout-worker-factory.ts`
- Create: `src/lib/cut-pattern/page-layout/nest/nest-client.ts`
- Test: `src/lib/workers/__tests__/nest-layout-worker-core.test.ts`, `src/lib/cut-pattern/page-layout/nest/__tests__/nest-client.test.ts`

**Interfaces:**
- Consumes: `nestPageLayout`, `NestGeom`, `NestShape`.
- Produces:
  - `type NestRequest = { requestId: number; shapes: NestShape[]; geom: NestGeom }`
  - `type NestWireResult = { origins: { x: number; y: number }[]; rotations: number[]; pages: PageRect[]; overflow?: { itemIndex: number; requiredScale: number }; utilisation?: number[] }`
  - `type NestResponse = { requestId: number; result?: NestWireResult; error?: string }`
  - `runNestRequest(req: NestRequest): NestResponse` (core; catches errors into `error`)
  - `type NestWorkerLike = { postMessage(m: NestRequest): void; onmessage: ((e: { data: NestResponse }) => void) | null; terminate(): void }`
  - `createNestClient(createWorker: () => Promise<NestWorkerLike>): { request(shapes: NestShape[], geom: NestGeom): Promise<PageLayoutResult | null>; dispose(): void }` — each `request` supersedes earlier ones: when a newer request has been issued, older promises resolve `null` (immediately on supersede). Worker errors resolve `null` and `console.error` the message. Origins are rehydrated to `Vector3`.
  - `nestClient` — default instance using `() => import('$lib/workers/nest-layout-worker-factory').then(m => m.createNestLayoutWorker())`.

- [ ] **Step 1: Failing tests**

```ts
// nest-layout-worker-core.test.ts
import { runNestRequest } from '../nest-layout-worker-core';
const geom = { pageScale: 1, pageWidth: 100, pageHeight: 100, contentWidth: 100, contentHeight: 100, marginPx: 0, pageGap: 10, gap: 0, reorderWindow: 1, allowRotation: false, rotationStep: 0, cellMm: 1 };
const sq = { polygons: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]], pivot: { x: 5, y: 5 } };
it('echoes requestId and returns plain-object origins', () => {
	const r = runNestRequest({ requestId: 7, shapes: [sq], geom });
	expect(r.requestId).toBe(7);
	expect(r.result?.origins[0]).toEqual({ x: expect.any(Number), y: expect.any(Number) });
	expect(Object.getPrototypeOf(r.result!.origins[0])).toBe(Object.prototype);
});
it('reports errors instead of throwing', () => {
	const r = runNestRequest({ requestId: 1, shapes: null as never, geom });
	expect(r.error).toBeTruthy();
});
```

```ts
// nest-client.test.ts
import { createNestClient, type NestWorkerLike } from '../nest-client';
import { runNestRequest } from '$lib/workers/nest-layout-worker-core';

// A fake worker that answers asynchronously, in order, via the real core.
const fakeWorker = (): NestWorkerLike => {
	const w: NestWorkerLike = {
		onmessage: null,
		postMessage: (m) => setTimeout(() => w.onmessage?.({ data: runNestRequest(m) }), 0),
		terminate: () => {}
	};
	return w;
};
const geom = { pageScale: 1, pageWidth: 100, pageHeight: 100, contentWidth: 100, contentHeight: 100, marginPx: 0, pageGap: 10, gap: 0, reorderWindow: 1, allowRotation: false, rotationStep: 0, cellMm: 1 };
const sq = { polygons: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]], pivot: { x: 5, y: 5 } };

it('resolves with Vector3 origins', async () => {
	const c = createNestClient(async () => fakeWorker());
	const r = await c.request([sq], geom);
	expect(r?.origins[0].isVector3).toBe(true);
});
it('a newer request supersedes an older one', async () => {
	const c = createNestClient(async () => fakeWorker());
	const first = c.request([sq], geom);
	const second = c.request([sq, sq], geom);
	expect(await first).toBeNull();
	expect((await second)?.origins).toHaveLength(2);
});
it('creates the worker once', async () => {
	const factory = jest.fn(async () => fakeWorker());
	const c = createNestClient(factory);
	await c.request([sq], geom);
	await c.request([sq], geom);
	expect(factory).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.**

`nest-layout-worker-core.ts`:

```ts
import { nestPageLayout, type NestGeom } from '$lib/cut-pattern/page-layout/nest/nest';
import type { NestShape } from '$lib/cut-pattern/page-layout/nest/types';
import type { PageRect } from '$lib/cut-pattern/page-layout/types';

export type NestRequest = { requestId: number; shapes: NestShape[]; geom: NestGeom };
export type NestWireResult = {
	origins: { x: number; y: number }[];
	rotations: number[];
	pages: PageRect[];
	overflow?: { itemIndex: number; requiredScale: number };
	utilisation?: number[];
};
export type NestResponse = { requestId: number; result?: NestWireResult; error?: string };

export const runNestRequest = (req: NestRequest): NestResponse => {
	try {
		const r = nestPageLayout(req.shapes, req.geom);
		return {
			requestId: req.requestId,
			result: { ...r, origins: r.origins.map((o) => ({ x: o.x, y: o.y })) }
		};
	} catch (e) {
		return { requestId: req.requestId, error: e instanceof Error ? e.message : String(e) };
	}
};
```

`nest-layout.worker.ts`:

```ts
import { runNestRequest, type NestRequest } from './nest-layout-worker-core';
self.onmessage = (e: MessageEvent<NestRequest>) => {
	self.postMessage(runNestRequest(e.data));
};
```

`nest-layout-worker-factory.ts` (mirror `band-merge-worker-factory.ts`, including its comment about Jest and `import.meta`):

```ts
import type { NestWorkerLike } from '$lib/cut-pattern/page-layout/nest/nest-client';
export const createNestLayoutWorker = (): NestWorkerLike =>
	new Worker(new URL('./nest-layout.worker.ts', import.meta.url), { type: 'module' }) as unknown as NestWorkerLike;
```

`nest-client.ts`:

```ts
import { Vector3 } from 'three';
import type { PageLayoutResult } from '../types';
import type { NestGeom } from './nest';
import type { NestShape } from './types';
import type { NestRequest, NestResponse } from '$lib/workers/nest-layout-worker-core';

export type NestWorkerLike = {
	postMessage(m: NestRequest): void;
	onmessage: ((e: { data: NestResponse }) => void) | null;
	terminate(): void;
};

export const createNestClient = (createWorker: () => Promise<NestWorkerLike>) => {
	let worker: Promise<NestWorkerLike> | undefined;
	let nextId = 0;
	const waiting = new Map<number, (r: PageLayoutResult | null) => void>();

	const onMessage = (e: { data: NestResponse }) => {
		const { requestId, result, error } = e.data;
		const resolve = waiting.get(requestId);
		if (!resolve) return; // superseded
		waiting.delete(requestId);
		if (error || !result) {
			console.error('nest layout worker:', error);
			resolve(null);
			return;
		}
		resolve({ ...result, origins: result.origins.map((o) => new Vector3(o.x, o.y, 0)) });
	};

	const getWorker = () => {
		if (!worker) {
			worker = createWorker().then((w) => {
				w.onmessage = onMessage;
				return w;
			});
		}
		return worker;
	};

	return {
		request(shapes: NestShape[], geom: NestGeom): Promise<PageLayoutResult | null> {
			const requestId = ++nextId;
			for (const [id, resolve] of waiting) {
				waiting.delete(id);
				resolve(null);
			}
			return new Promise((resolve) => {
				waiting.set(requestId, resolve);
				getWorker().then((w) => w.postMessage({ requestId, shapes, geom }));
			});
		},
		dispose() {
			for (const resolve of waiting.values()) resolve(null);
			waiting.clear();
			worker?.then((w) => w.terminate());
			worker = undefined;
		}
	};
};

export const nestClient = createNestClient(() =>
	import('$lib/workers/nest-layout-worker-factory').then((m) => m.createNestLayoutWorker())
);
```

Note: superseded requests still run to completion in the worker (one worker, FIFO); only the latest reply is used. That is acceptable for phase 1.

- [ ] **Step 4: Run both test files — PASS.** Confirm Jest never transformed the factory (no `import.meta` SyntaxError).
- [ ] **Step 5: Commit**

```bash
git add src/lib/workers/nest-layout-worker-core.ts src/lib/workers/nest-layout.worker.ts src/lib/workers/nest-layout-worker-factory.ts src/lib/cut-pattern/page-layout/nest/nest-client.ts src/lib/workers/__tests__/nest-layout-worker-core.test.ts src/lib/cut-pattern/page-layout/nest/__tests__/nest-client.test.ts
git commit -m "feat(page-layout): nest layout worker and superseding client"
```

---

### Task 6: Renderer wiring and editor UI

**Files:**
- Modify: `src/lib/stores/pageLayoutInfoStore.ts`
- Modify: `src/components/cut-pattern/CutPatternRenderer.svelte`
- Modify: `src/components/modal/editor/PageLayout.svelte` (algorithm select ~line 320; skyline-only block ~326-345)
- Test: `src/lib/cut-pattern/page-layout/nest/__tests__/nest-shape.test.ts` (no new unit test for the Svelte wiring; verified in Task 7)

**Interfaces:**
- Consumes: `buildNestShape` (Task 2), `buildNestGeom` (Task 4), `nestClient` (Task 5), `skylinePageLayout`.
- Produces: `pageLayoutInfoStore` value `{ pageCount: number; overflow: boolean; utilisation?: number[]; nestPending?: boolean }`.

- [ ] **Step 1: Store.** Extend the store type and initial value with `utilisation: undefined, nestPending: false`. Check all `pageLayoutInfoStore.set(` callers compile.

- [ ] **Step 2: Renderer.** In `CutPatternRenderer.svelte`, near `pageResult`:

```ts
import { buildNestShape } from '$lib/cut-pattern/page-layout/nest/nest-shape';
import { nestClient } from '$lib/cut-pattern/page-layout/nest/nest-client';
import { skylinePageLayout } from '$lib/cut-pattern/page-layout/skyline';
import { buildNestGeom, buildPageGeom, PAGE_LAYOUT_ALGORITHMS } from '$lib/cut-pattern/page-layout/registry';

let isNest = $derived(layoutMode === 'page' && pageLayoutCfg?.algorithm === 'nest');

// Shapes for the nest worker, one per page band, keyed by band identity via the
// same bounds/pivot indexes the renderer already builds.
let nestShapes = $derived.by(() => {
	if (!isNest) return undefined;
	const ctx = boundsContext();
	return pageBands.map(({ band }) => buildNestShape(band, ctx, pivots.get(band) ?? { x: 0, y: 0 }));
});
let nestGeom = $derived(isNest && pageLayoutCfg ? { ...buildNestGeom(pageLayoutCfg), gap } : undefined);

// $state.raw: the result holds Vector3s; a deep proxy loops (see memory note).
let nestResult = $state.raw<{ shapes: unknown; geom: unknown; result: PageLayoutResult } | undefined>();
let nestPending = $state(false);

$effect(() => {
	const shapes = nestShapes;
	const g = nestGeom;
	if (!shapes || !g) return;
	nestPending = true;
	nestClient.request(shapes, g).then((result) => {
		if (!result) return; // superseded or failed; a newer request owns `pending`
		nestResult = { shapes, geom: g, result };
		nestPending = false;
	});
});
```

Change `pageResult`:

```ts
let pageResult = $derived.by((): PageLayoutResult | undefined => {
	if (layoutMode !== 'page' || !pageLayoutCfg) return undefined;
	const items = toLayoutItems(pageBands);
	const geom = { ...buildPageGeom(pageLayoutCfg), gap };
	if (pageLayoutCfg.algorithm === 'nest') {
		// Latest worker result for the CURRENT inputs; until it lands, skyline
		// with rotation so the page never blanks.
		if (nestResult && nestResult.shapes === nestShapes && nestResult.geom === nestGeom) return nestResult.result;
		return skylinePageLayout(items, { ...geom, allowRotation: true });
	}
	return PAGE_LAYOUT_ALGORITHMS[pageLayoutCfg.algorithm](items, geom);
});
```

Remove the temporary Task-4 routing. Extend the `pageLayoutInfoStore` publish effect's key and value:

```ts
const utilisation = pageResult?.utilisation;
const key = `${pageCount}:${overflow}:${nestPending}:${utilisation?.map((u) => u.toFixed(3)).join(',') ?? ''}`;
...
pageLayoutInfoStore.set({ pageCount, overflow, utilisation, nestPending });
```

Read `nestPending` inside that effect so it is tracked. In `splitBudget`, replace the `allowRotation` expression:

```ts
allowRotation:
	(pageLayoutCfg.algorithm === 'skyline' && !!pageLayoutCfg.allowRotation) ||
	(pageLayoutCfg.algorithm === 'nest' && pageLayoutCfg.rotationStep > 0 && 90 % pageLayoutCfg.rotationStep === 0)
```

and update the comment above it.

Make sure `pageResult.rotations[i]` (any angle) already flows to `BandComponent` and `placeBand` — it does (`rotation={pageResult.rotations[i] ?? 0}`); no change needed there.

- [ ] **Step 3: Editor UI.** In `PageLayout.svelte`, add `<option value="nest">Nest (shape-aware)</option>` to the algorithm `<select>`. After the skyline-only block, add (matching that block's markup/classes):

```svelte
{#if $patternConfigStore.patternConfig.pageLayout.algorithm === 'nest'}
	<label>
		Rotation step (°)
		<input
			type="number"
			min="0"
			max="180"
			step="5"
			bind:value={$patternConfigStore.patternConfig.pageLayout.rotationStep}
		/>
	</label>
	<div class="nest-status">
		{#if $pageLayoutInfoStore.nestPending}
			Nesting…
		{:else if $pageLayoutInfoStore.utilisation?.length}
			Material used: {$pageLayoutInfoStore.utilisation.map((u) => `${Math.round(u * 100)}%`).join(' · ')}
		{/if}
	</div>
{/if}
```

Import `pageLayoutInfoStore` if the component does not already. Copy the surrounding label/input styling exactly.

- [ ] **Step 4: Verify.** `npm run check` (no new errors), `npm run test:unit` (all green), `npm run lint` on the changed files (`npx eslint <files>`).
- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/pageLayoutInfoStore.ts src/components/cut-pattern/CutPatternRenderer.svelte src/components/modal/editor/PageLayout.svelte
git commit -m "feat(page-layout): wire nest algorithm through worker into renderer and editor"
```

---

### Task 7: Arbitrary-angle downstream check and in-app verification

**Files:**
- Test: `src/lib/cut-pattern/page-post-process/__tests__/place-bands.test.ts` (create, or extend the existing test file for `placeBand` — `ls src/lib/cut-pattern/page-post-process/__tests__`)
- Temporary: `.verify-nest.mjs` at the worktree root (deleted before commit)

**Interfaces:**
- Consumes: `toPageSpace`, `placeBand`, `rotateDirection` from `place-bands.ts`.

- [ ] **Step 1: Failing/confirming test at 45°**

```ts
import { toPageSpace, rotateDirection } from '../place-bands';

describe('toPageSpace at non-right angles', () => {
	it('rotates about the pivot then translates, at 45°', () => {
		const pl = { origin: { x: 100, y: 50 }, rotation: 45, pivot: { x: 10, y: 0 } };
		const p = toPageSpace({ x: 20, y: 0 }, pl as never);
		expect(p.x).toBeCloseTo(100 + 10 + 10 * Math.SQRT1_2);
		expect(p.y).toBeCloseTo(50 + 10 * Math.SQRT1_2);
	});
	it('rotateDirection keeps unit length at 15° steps', () => {
		for (let a = 0; a < 360; a += 15) {
			const v = rotateDirection({ x: 1, y: 0 }, a);
			expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
		}
	});
});
```

If the existing test file has a `placeBand` fixture, add one case with `rotation: 45` asserting the band is assigned to the page that contains its rotated outline centre. Run; if anything fails, fix the 90°-only assumption in source and note it in the commit.

- [ ] **Step 2: Grep for 90°-only assumptions** in consumers of `rotations`/`rotation`: `grep -rn "rotation" src/lib/lightburn src/lib/cut-pattern/page-post-process src/components/cut-pattern | grep -E "90|180|% ?90"`. Fix any that assume right angles; add a test for each fix.

- [ ] **Step 3: In-app check (Playwright, headless).** Start the dev server from the worktree (`npm run dev -- --port 9790` in the background; read the actual port from its log). Write `.verify-nest.mjs` at the worktree root that:
  1. opens `/designer2`, switches Geometry to Voronoi (see the project memory: the pattern pane is empty until then) and waits for pattern paths;
  2. opens the Pattern layout panel (`locator('button', { hasText: /atternl/i })`), sets layout mode to page and algorithm to `skyline` with rotation on; records the number of pages from the panel;
  3. switches algorithm to `nest`, waits until "Nesting…" disappears and "Material used" appears; records page count and the utilisation text;
  4. asserts nest pages ≤ skyline pages, and that no console errors mentioning `nest` or `effect_update_depth_exceeded` occurred;
  5. screenshots the first page region (copy the pattern SVG's children into a small standalone SVG with a tight viewBox, as the memory note describes) to `$CLAUDE_JOB_DIR/tmp/nest-page1.png` (or `/tmp` in a subagent) for the final report.
  Run it with `node .verify-nest.mjs`. Report both page counts and utilisation. Delete the script; stop the dev server.

- [ ] **Step 4: Commit** (tests and any fixes only — not the verify script)

```bash
git add <test file(s) and any fixed source files>
git commit -m "test(page-layout): arbitrary-angle placement downstream of nest layout"
```
