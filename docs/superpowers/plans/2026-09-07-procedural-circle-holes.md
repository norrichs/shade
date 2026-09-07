# Procedural Circle-Hole Fills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pluggable procedural `fill` to the outlined-pattern pipeline whose first implementation punches randomized, evenly-gapped circular holes into every band.

**Architecture:** Three pure modules under `src/lib/patterns/procedural/` (2D polygon math, a circle packer, and a `kind`-keyed fill registry) plus a shared deterministic RNG. `generate-outlined-pattern.ts` builds a polygon from the band outline edges it already computes, calls the registry, and appends the returned `CutPattern` to `band.facets`. Nothing in the renderer or the SVG exporter changes: they already iterate `band.facets`.

**Tech Stack:** TypeScript, SvelteKit, Jest (ts-jest ESM preset), Svelte 4-style syntax in `TilingControl.svelte`, Svelte 5 runes in `super-control/NumberInput.svelte`.

**Spec:** `docs/specs/2026-09-07-procedural-circle-holes-design.md`

## Global Constraints

- All lengths in the fill config are raw SVG user units (px). No unit conversion.
- `margin` and `spacing` are **targets**, not floors: phase 2 drives gaps onto them.
- The fill must be deterministic: same `seed` + same band index + same params => byte-identical output. Pattern generation is a main-thread derived store that re-runs on every config change.
- One `CutPattern` per band holding all circles as subpaths. Never one facet per circle — the largest config has 1,440 bands and the DOM cost is the known bottleneck.
- `fill` is optional on `OutlinedPatternConfig`. No persistence migration; saved configs must keep loading.
- Tabs are excluded from the pack region by construction (the polygon comes from `edges[].start`, tabs live only in `outlinePath`).
- Circles never cross a band seam. Each band packs independently.
- Run `npx prettier --write` on every file touched before committing; the repo lints with `prettier --check`.
- `npm run check` baseline is ~434 pre-existing errors. Judge regressions by the total-count diff, never by absence of errors.
- Tests are colocated under `__tests__/` and run with `npm run test:unit -- <path>`.

---

### Task 1: Shared deterministic RNG

Extract `mulberry32` from the voronoi seeder so the packer and the seeder share one implementation.

**Files:**
- Create: `src/lib/rng.ts`
- Create: `src/lib/__tests__/rng.test.ts`
- Modify: `src/lib/voronoi/generate-seeds.ts:38-47` (delete the local copy, import instead)

**Interfaces:**
- Consumes: nothing.
- Produces: `mulberry32(seed: number): () => number` — returns a function yielding numbers in `[0, 1)`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/rng.test.ts`:

```ts
import { mulberry32 } from '../rng';

describe('mulberry32', () => {
	it('yields numbers in [0, 1)', () => {
		const rand = mulberry32(42);
		for (let i = 0; i < 100; i++) {
			const v = rand();
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it('is deterministic for a given seed', () => {
		const a = mulberry32(7);
		const b = mulberry32(7);
		const seqA = Array.from({ length: 20 }, () => a());
		const seqB = Array.from({ length: 20 }, () => b());
		expect(seqA).toEqual(seqB);
	});

	it('differs between seeds', () => {
		const a = mulberry32(7);
		const b = mulberry32(8);
		expect(a()).not.toBe(b());
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/__tests__/rng.test.ts`
Expected: FAIL — cannot find module `../rng`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/rng.ts`:

```ts
/**
 * Mulberry32 — a small, fast, seedable PRNG.
 *
 * Used wherever generated geometry must be stable across re-derivation: the
 * 2D pattern pipeline runs in a main-thread derived store and re-runs on every
 * config change, so an unseeded `Math.random` would reshuffle the pattern on
 * each keystroke.
 *
 * Returns a closure yielding numbers in [0, 1).
 */
export const mulberry32 = (seed: number): (() => number) => {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/__tests__/rng.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Re-point the voronoi seeder at the shared RNG**

In `src/lib/voronoi/generate-seeds.ts`, delete the local `function mulberry32(...)` block (lines 38-47) and add to the imports at the top of the file:

```ts
import { mulberry32 } from '$lib/rng';
```

- [ ] **Step 6: Verify the voronoi tests still pass**

Run: `npm run test:unit -- src/lib/voronoi`
Expected: PASS, no new failures.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/lib/rng.ts src/lib/__tests__/rng.test.ts src/lib/voronoi/generate-seeds.ts
git add src/lib/rng.ts src/lib/__tests__/rng.test.ts src/lib/voronoi/generate-seeds.ts
git commit -m "refactor(rng): extract mulberry32 into a shared module"
```

---

### Task 2: 2D polygon helpers

Pure geometry the packer needs. No Three.js — plain `{ x, y }` points, so the module is trivially testable.

**Files:**
- Create: `src/lib/patterns/procedural/polygon-2d.ts`
- Create: `src/lib/patterns/procedural/__tests__/polygon-2d.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Point2 = { x: number; y: number }`
  - `type Polygon = Point2[]` — an implicitly closed ring; the last point connects to the first.
  - `dedupePolygon(polygon: Polygon, epsilon?: number): Polygon`
  - `polygonArea(polygon: Polygon): number` — always non-negative.
  - `polygonBounds(polygon: Polygon): { minX: number; minY: number; maxX: number; maxY: number }`
  - `pointInPolygon(p: Point2, polygon: Polygon): boolean`
  - `distanceToPolygonEdge(p: Point2, polygon: Polygon): number` — unsigned distance to the nearest edge.

- [ ] **Step 1: Write the failing test**

Create `src/lib/patterns/procedural/__tests__/polygon-2d.test.ts`:

```ts
import {
	dedupePolygon,
	distanceToPolygonEdge,
	pointInPolygon,
	polygonArea,
	polygonBounds,
	type Polygon
} from '../polygon-2d';

const square: Polygon = [
	{ x: 0, y: 0 },
	{ x: 10, y: 0 },
	{ x: 10, y: 10 },
	{ x: 0, y: 10 }
];

// Concave "L": the notch is the square [5,5]..[10,10].
const ell: Polygon = [
	{ x: 0, y: 0 },
	{ x: 10, y: 0 },
	{ x: 10, y: 5 },
	{ x: 5, y: 5 },
	{ x: 5, y: 10 },
	{ x: 0, y: 10 }
];

describe('polygonArea', () => {
	it('measures a square', () => {
		expect(polygonArea(square)).toBeCloseTo(100);
	});

	it('is orientation independent', () => {
		expect(polygonArea([...square].reverse())).toBeCloseTo(100);
	});

	it('measures a concave polygon', () => {
		expect(polygonArea(ell)).toBeCloseTo(75);
	});
});

describe('polygonBounds', () => {
	it('bounds a square', () => {
		expect(polygonBounds(square)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
	});
});

describe('pointInPolygon', () => {
	it('accepts an interior point', () => {
		expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
	});

	it('rejects an exterior point', () => {
		expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
	});

	it('rejects a point in the notch of a concave polygon', () => {
		expect(pointInPolygon({ x: 8, y: 8 }, ell)).toBe(false);
	});

	it('accepts a point in the arm of a concave polygon', () => {
		expect(pointInPolygon({ x: 2, y: 8 }, ell)).toBe(true);
	});
});

describe('distanceToPolygonEdge', () => {
	it('measures to the nearest side', () => {
		expect(distanceToPolygonEdge({ x: 2, y: 5 }, square)).toBeCloseTo(2);
	});

	it('measures to the closing edge', () => {
		expect(distanceToPolygonEdge({ x: 5, y: 9 }, square)).toBeCloseTo(1);
	});

	it('measures to a reflex vertex', () => {
		expect(distanceToPolygonEdge({ x: 2, y: 2 }, ell)).toBeCloseTo(2);
	});
});

describe('dedupePolygon', () => {
	it('drops coincident consecutive points', () => {
		const withDupes: Polygon = [
			{ x: 0, y: 0 },
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 }
		];
		expect(dedupePolygon(withDupes)).toEqual(square);
	});

	it('drops a duplicate that wraps from last to first', () => {
		const wrapped: Polygon = [...square, { x: 0, y: 0 }];
		expect(dedupePolygon(wrapped)).toEqual(square);
	});

	it('leaves a clean polygon untouched', () => {
		expect(dedupePolygon(square)).toEqual(square);
	});

	it('keeps a degenerate polygon usable', () => {
		expect(dedupePolygon([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/patterns/procedural/__tests__/polygon-2d.test.ts`
Expected: FAIL — cannot find module `../polygon-2d`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/patterns/procedural/polygon-2d.ts`:

```ts
/**
 * Minimal 2D polygon math for procedural pattern fills.
 *
 * Deliberately Three.js-free: the fill algorithms work on plain `{ x, y }`
 * points so they stay pure and cheap to test. Callers convert at the boundary.
 */

export type Point2 = { x: number; y: number };

/** An implicitly closed ring: the last point connects back to the first. */
export type Polygon = Point2[];

const DEFAULT_EPSILON = 1e-9;

/**
 * Drop consecutive coincident points, including the wrap from last to first.
 *
 * Load-bearing, not cosmetic. `buildOutlinePath` already skips zero-length
 * edges, and globule bands begin at a collapsed pole facet, so a band's edge
 * list genuinely contains coincident points. A zero-length edge makes
 * `distanceToPolygonEdge` divide by zero and poisons the packer with NaN.
 */
export const dedupePolygon = (polygon: Polygon, epsilon = DEFAULT_EPSILON): Polygon => {
	if (polygon.length === 0) return [];
	const epsSq = epsilon * epsilon;
	const out: Polygon = [polygon[0]];
	for (let i = 1; i < polygon.length; i++) {
		const prev = out[out.length - 1];
		const p = polygon[i];
		const dx = p.x - prev.x;
		const dy = p.y - prev.y;
		if (dx * dx + dy * dy > epsSq) out.push(p);
	}
	// The ring closes implicitly, so a final point coincident with the first is
	// also a duplicate.
	while (out.length > 1) {
		const first = out[0];
		const last = out[out.length - 1];
		const dx = last.x - first.x;
		const dy = last.y - first.y;
		if (dx * dx + dy * dy > epsSq) break;
		out.pop();
	}
	return out;
};

/** Unsigned area via the shoelace formula. Orientation independent. */
export const polygonArea = (polygon: Polygon): number => {
	if (polygon.length < 3) return 0;
	let twice = 0;
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i];
		const b = polygon[(i + 1) % polygon.length];
		twice += a.x * b.y - b.x * a.y;
	}
	return Math.abs(twice) / 2;
};

export const polygonBounds = (
	polygon: Polygon
): { minX: number; minY: number; maxX: number; maxY: number } => {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of polygon) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return { minX, minY, maxX, maxY };
};

/**
 * Crossing-number test. Handles concave rings, which band outlines are: a
 * curved band's two long sides both bow the same way.
 */
export const pointInPolygon = (p: Point2, polygon: Polygon): boolean => {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const a = polygon[i];
		const b = polygon[j];
		const straddles = a.y > p.y !== b.y > p.y;
		if (!straddles) continue;
		const t = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
		if (p.x < t) inside = !inside;
	}
	return inside;
};

const distanceToSegment = (p: Point2, a: Point2, b: Point2): number => {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
	let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Unsigned distance from `p` to the nearest edge of the closed ring. */
export const distanceToPolygonEdge = (p: Point2, polygon: Polygon): number => {
	let min = Infinity;
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i];
		const b = polygon[(i + 1) % polygon.length];
		const d = distanceToSegment(p, a, b);
		if (d < min) min = d;
	}
	return min;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/patterns/procedural/__tests__/polygon-2d.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/patterns/procedural/polygon-2d.ts src/lib/patterns/procedural/__tests__/polygon-2d.test.ts
git add src/lib/patterns/procedural/
git commit -m "feat(procedural): add 2D polygon helpers for pattern fills"
```

---

### Task 3: Circle packer — phase 1 (seeding)

Dart-thrown seeds with random radii, all constraints satisfied on placement. Phase 2 arrives in Task 4; this task must already produce a valid (if loose) packing.

**Files:**
- Create: `src/lib/patterns/procedural/circle-packing.ts`
- Create: `src/lib/patterns/procedural/__tests__/circle-packing.test.ts`

**Interfaces:**
- Consumes: `Polygon`, `polygonArea`, `polygonBounds`, `pointInPolygon`, `distanceToPolygonEdge` from `./polygon-2d`; `mulberry32` from `$lib/rng`.
- Produces:
  - `type Circle = { x: number; y: number; r: number }`
  - `type CirclePackingParams = { density: number; margin: number; minRadius: number; maxRadius: number; spacing: number }`
  - `packCircles(polygon: Polygon, params: CirclePackingParams, random: () => number): Circle[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/patterns/procedural/__tests__/circle-packing.test.ts`:

```ts
import { mulberry32 } from '$lib/rng';
import { packCircles, type Circle, type CirclePackingParams } from '../circle-packing';
import { distanceToPolygonEdge, type Polygon } from '../polygon-2d';

const square: Polygon = [
	{ x: 0, y: 0 },
	{ x: 200, y: 0 },
	{ x: 200, y: 200 },
	{ x: 0, y: 200 }
];

const ell: Polygon = [
	{ x: 0, y: 0 },
	{ x: 200, y: 0 },
	{ x: 200, y: 100 },
	{ x: 100, y: 100 },
	{ x: 100, y: 200 },
	{ x: 0, y: 200 }
];

const params: CirclePackingParams = {
	density: 0.002,
	margin: 5,
	minRadius: 3,
	maxRadius: 15,
	spacing: 4
};

const EPS = 1e-6;

const expectValidPacking = (circles: Circle[], polygon: Polygon, p: CirclePackingParams) => {
	for (const c of circles) {
		expect(c.r).toBeGreaterThanOrEqual(p.minRadius - EPS);
		expect(c.r).toBeLessThanOrEqual(p.maxRadius + EPS);
		expect(distanceToPolygonEdge({ x: c.x, y: c.y }, polygon) - c.r).toBeGreaterThanOrEqual(
			p.margin - EPS
		);
	}
	for (let i = 0; i < circles.length; i++) {
		for (let j = i + 1; j < circles.length; j++) {
			const a = circles[i];
			const b = circles[j];
			const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
			expect(gap).toBeGreaterThanOrEqual(p.spacing - EPS);
		}
	}
};

describe('packCircles', () => {
	it('places circles inside a square', () => {
		const circles = packCircles(square, params, mulberry32(1));
		expect(circles.length).toBeGreaterThan(10);
	});

	it('satisfies every constraint on a square, across seeds', () => {
		for (const seed of [1, 2, 3, 17, 99]) {
			const circles = packCircles(square, params, mulberry32(seed));
			expectValidPacking(circles, square, params);
		}
	});

	it('satisfies every constraint on a concave polygon', () => {
		for (const seed of [1, 2, 3]) {
			const circles = packCircles(ell, params, mulberry32(seed));
			expectValidPacking(circles, ell, params);
		}
	});

	it('is deterministic for a given seed', () => {
		expect(packCircles(square, params, mulberry32(5))).toEqual(
			packCircles(square, params, mulberry32(5))
		);
	});

	it('differs between seeds', () => {
		expect(packCircles(square, params, mulberry32(5))).not.toEqual(
			packCircles(square, params, mulberry32(6))
		);
	});

	it('returns nothing when the polygon cannot fit a minimum-radius circle', () => {
		const tiny: Polygon = [
			{ x: 0, y: 0 },
			{ x: 4, y: 0 },
			{ x: 4, y: 4 },
			{ x: 0, y: 4 }
		];
		expect(packCircles(tiny, params, mulberry32(1))).toEqual([]);
	});

	it('returns nothing for a degenerate polygon', () => {
		expect(packCircles([{ x: 0, y: 0 }], params, mulberry32(1))).toEqual([]);
	});

	it('scales the count with density', () => {
		const sparse = packCircles(square, { ...params, density: 0.0005 }, mulberry32(1));
		const dense = packCircles(square, { ...params, density: 0.004 }, mulberry32(1));
		expect(dense.length).toBeGreaterThan(sparse.length);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/patterns/procedural/__tests__/circle-packing.test.ts`
Expected: FAIL — cannot find module `../circle-packing`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/patterns/procedural/circle-packing.ts`:

```ts
import {
	distanceToPolygonEdge,
	pointInPolygon,
	polygonArea,
	polygonBounds,
	type Polygon
} from './polygon-2d';

export type Circle = { x: number; y: number; r: number };

export type CirclePackingParams = {
	/** Seeds per square px. `count = round(area * density)`. */
	density: number;
	/** Target clearance between a circle and the polygon boundary. */
	margin: number;
	minRadius: number;
	maxRadius: number;
	/** Target gap between the edges of two circles. */
	spacing: number;
};

/** Dart-throwing attempts allowed per requested seed before giving up. */
const ATTEMPTS_PER_SEED = 20;

/**
 * A uniform bucket grid over the polygon bounds.
 *
 * Cell size is `2 * maxRadius + spacing`, the furthest apart two circle centres
 * can be and still constrain each other. That makes the 3x3 neighbourhood
 * around a query point a complete candidate set, so neighbour lookup is O(1)
 * amortised instead of O(n).
 */
class CircleGrid {
	private readonly cells = new Map<number, number[]>();
	private readonly cols: number;

	constructor(
		private readonly minX: number,
		private readonly minY: number,
		private readonly cellSize: number,
		width: number,
		height: number
	) {
		this.cols = Math.max(1, Math.ceil(width / cellSize) + 1);
	}

	private key(x: number, y: number): number {
		const cx = Math.floor((x - this.minX) / this.cellSize);
		const cy = Math.floor((y - this.minY) / this.cellSize);
		return cy * this.cols + cx;
	}

	insert(index: number, x: number, y: number): void {
		const k = this.key(x, y);
		const bucket = this.cells.get(k);
		if (bucket) bucket.push(index);
		else this.cells.set(k, [index]);
	}

	/** Indices of every circle in the 3x3 cell neighbourhood around (x, y). */
	near(x: number, y: number): number[] {
		const cx = Math.floor((x - this.minX) / this.cellSize);
		const cy = Math.floor((y - this.minY) / this.cellSize);
		const out: number[] = [];
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				const bucket = this.cells.get((cy + dy) * this.cols + (cx + dx));
				if (bucket) out.push(...bucket);
			}
		}
		return out;
	}
}

/**
 * Pack randomized circles into a polygon.
 *
 * Phase 1 (here): dart-throw `area * density` seeds. A candidate is accepted
 * only if the largest radius its constraints allow still reaches `minRadius`;
 * it then takes a uniform random radius in that allowed range.
 *
 * `random` must be a seeded PRNG — see `mulberry32`. The 2D pattern pipeline
 * re-derives on every config change, so an unseeded source would reshuffle the
 * pattern on each keystroke.
 */
export const packCircles = (
	polygon: Polygon,
	params: CirclePackingParams,
	random: () => number
): Circle[] => {
	const { density, margin, minRadius, maxRadius, spacing } = params;
	if (polygon.length < 3) return [];
	if (minRadius <= 0 || maxRadius < minRadius) return [];

	const area = polygonArea(polygon);
	const count = Math.round(area * density);
	if (count <= 0) return [];

	const { minX, minY, maxX, maxY } = polygonBounds(polygon);
	const width = maxX - minX;
	const height = maxY - minY;
	if (width <= 0 || height <= 0) return [];

	const circles: Circle[] = [];
	const grid = new CircleGrid(
		minX,
		minY,
		Math.max(2 * maxRadius + spacing, 1e-6),
		width,
		height
	);

	const budget = count * ATTEMPTS_PER_SEED;
	for (let attempt = 0; attempt < budget && circles.length < count; attempt++) {
		const x = minX + random() * width;
		const y = minY + random() * height;
		if (!pointInPolygon({ x, y }, polygon)) continue;

		let allowed = Math.min(maxRadius, distanceToPolygonEdge({ x, y }, polygon) - margin);
		if (allowed < minRadius) continue;

		for (const i of grid.near(x, y)) {
			const c = circles[i];
			const room = Math.hypot(x - c.x, y - c.y) - c.r - spacing;
			if (room < allowed) allowed = room;
			if (allowed < minRadius) break;
		}
		if (allowed < minRadius) continue;

		const r = minRadius + random() * (allowed - minRadius);
		grid.insert(circles.length, x, y);
		circles.push({ x, y, r });
	}

	return circles;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/patterns/procedural/__tests__/circle-packing.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/patterns/procedural/circle-packing.ts src/lib/patterns/procedural/__tests__/circle-packing.test.ts
git add src/lib/patterns/procedural/
git commit -m "feat(procedural): dart-throw circle seeding with a spatial grid"
```

---

### Task 4: Circle packer — phase 2 (inflation to an LP vertex)

Grow the radii so that as many gaps as possible land exactly on `spacing` (between circles) or `margin` (against the boundary).

Why this algorithm: treating the targets as constraints, `maximize sum(r_i)` subject to `r_i + r_j <= d_ij - spacing`, `r_i <= distToEdge_i - margin`, `r_i <= maxRadius` is a linear program, and an LP optimum sits at a *vertex* — the point where the greatest number of constraints are tight. Uniform inflation reaches such a vertex with no solver: every unfrozen circle grows at the same rate, so its radius at time `t` is `r0_i + t`, and each constraint reduces to a freeze time. Pop the earliest freeze from a heap, freeze that circle, and recompute only its unfrozen neighbours.

The simulation terminates and never backtracks: when `i` freezes at `t_i`, a neighbour's bound against `i` moves from `T = (d_ij - spacing - r0_i - r0_j) / 2` to `2T - t_i`, and `t_i <= T`, so bounds only ever relax. Popped times are therefore monotonically non-decreasing and each circle freezes exactly once.

**Files:**
- Modify: `src/lib/patterns/procedural/circle-packing.ts` (add the inflation pass and call it from `packCircles`)
- Modify: `src/lib/patterns/procedural/__tests__/circle-packing.test.ts` (add the optimality test)

**Interfaces:**
- Consumes: everything from Task 3.
- Produces: no new exports. `packCircles` keeps its signature; its output is now inflated.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/patterns/procedural/__tests__/circle-packing.test.ts`, inside the `describe('packCircles', ...)` block:

```ts
	it('leaves every circle tight against at least one constraint', () => {
		const circles = packCircles(square, params, mulberry32(11));
		expect(circles.length).toBeGreaterThan(5);
		const TIGHT = 1e-4;
		for (const c of circles) {
			const atMax = Math.abs(c.r - params.maxRadius) < TIGHT;
			const atEdge =
				Math.abs(distanceToPolygonEdge({ x: c.x, y: c.y }, square) - c.r - params.margin) < TIGHT;
			const atNeighbour = circles.some((o) => {
				if (o === c) return false;
				const gap = Math.hypot(o.x - c.x, o.y - c.y) - o.r - c.r;
				return Math.abs(gap - params.spacing) < TIGHT;
			});
			expect(atMax || atEdge || atNeighbour).toBe(true);
		}
	});

	it('grows the circles relative to the seeded radii', () => {
		const seeded = packCircles(square, { ...params, maxRadius: params.minRadius }, mulberry32(11));
		const inflated = packCircles(square, params, mulberry32(11));
		const sum = (cs: Circle[]) => cs.reduce((t, c) => t + c.r, 0);
		expect(sum(inflated)).toBeGreaterThan(sum(seeded));
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/patterns/procedural/__tests__/circle-packing.test.ts -t "tight against"`
Expected: FAIL — most circles are loose, since phase 1 assigns random radii.

- [ ] **Step 3: Write the implementation**

In `src/lib/patterns/procedural/circle-packing.ts`, add a minimal binary heap and the inflation pass above `packCircles`:

```ts
/**
 * Minimal binary min-heap over `(index, time)` pairs.
 *
 * Entries are never removed on update — a stale entry is re-pushed with the new
 * time and skipped on pop when its time no longer matches the circle's current
 * bound. That keeps the structure tiny at the cost of a bounded number of dead
 * entries.
 */
class MinHeap {
	private readonly items: { index: number; time: number }[] = [];

	get size(): number {
		return this.items.length;
	}

	push(index: number, time: number): void {
		this.items.push({ index, time });
		let i = this.items.length - 1;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (this.items[parent].time <= this.items[i].time) break;
			[this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
			i = parent;
		}
	}

	pop(): { index: number; time: number } | undefined {
		if (this.items.length === 0) return undefined;
		const top = this.items[0];
		const last = this.items.pop()!;
		if (this.items.length > 0) {
			this.items[0] = last;
			let i = 0;
			for (;;) {
				const l = 2 * i + 1;
				const r = l + 1;
				let small = i;
				if (l < this.items.length && this.items[l].time < this.items[small].time) small = l;
				if (r < this.items.length && this.items[r].time < this.items[small].time) small = r;
				if (small === i) break;
				[this.items[small], this.items[i]] = [this.items[i], this.items[small]];
				i = small;
			}
		}
		return top;
	}
}

/**
 * Grow every circle until it is blocked, so that gaps land on the target
 * `spacing` (between circles) or `margin` (against the boundary).
 *
 * Uniform inflation: all unfrozen circles grow at the same rate, so the radius
 * of circle `i` at time `t` is `seedRadius[i] + t`. Each constraint becomes a
 * freeze time:
 *
 *   pair, both growing      (d_ij - spacing - r0_i - r0_j) / 2
 *   pair, j already frozen   d_ij - spacing - r_j - r0_i
 *   boundary                 distToEdge_i - margin - r0_i
 *   clamp                    maxRadius - r0_i
 *
 * Popping the earliest freeze from a heap and recomputing only that circle's
 * unfrozen neighbours walks to a vertex of the constraint polytope — the
 * configuration with the greatest number of gaps sitting exactly on target.
 *
 * Mutates `circles` in place.
 */
const inflateCircles = (
	circles: Circle[],
	polygon: Polygon,
	params: CirclePackingParams,
	grid: CircleGrid
): void => {
	const { margin, maxRadius, spacing } = params;
	const n = circles.length;
	if (n === 0) return;

	const seedRadius = circles.map((c) => c.r);
	const frozen = new Array<boolean>(n).fill(false);
	// Neighbour lists are fixed: inflation never moves a centre, and the grid
	// cell size already covers the furthest two circles can constrain each other.
	const neighbours = circles.map((c, i) => grid.near(c.x, c.y).filter((j) => j !== i));

	// The bound that does not depend on any other circle's state.
	const staticBound = circles.map((c, i) =>
		Math.min(
			maxRadius - seedRadius[i],
			distanceToPolygonEdge({ x: c.x, y: c.y }, polygon) - margin - seedRadius[i]
		)
	);

	const freezeTime = (i: number): number => {
		let t = staticBound[i];
		for (const j of neighbours[i]) {
			const a = circles[i];
			const b = circles[j];
			const d = Math.hypot(a.x - b.x, a.y - b.y);
			const bound = frozen[j]
				? d - spacing - b.r - seedRadius[i]
				: (d - spacing - seedRadius[i] - seedRadius[j]) / 2;
			if (bound < t) t = bound;
		}
		return t < 0 ? 0 : t;
	};

	const current = new Array<number>(n);
	const heap = new MinHeap();
	for (let i = 0; i < n; i++) {
		current[i] = freezeTime(i);
		heap.push(i, current[i]);
	}

	while (heap.size > 0) {
		const entry = heap.pop();
		if (!entry) break;
		const { index, time } = entry;
		if (frozen[index]) continue;
		// Stale entry: this circle's bound has since relaxed. Its fresh entry is
		// already in the heap.
		if (time !== current[index]) continue;

		circles[index].r = seedRadius[index] + time;
		frozen[index] = true;

		for (const j of neighbours[index]) {
			if (frozen[j]) continue;
			const next = freezeTime(j);
			if (next !== current[j]) {
				current[j] = next;
				heap.push(j, next);
			}
		}
	}
};
```

Then, at the end of `packCircles`, replace `return circles;` with:

```ts
	inflateCircles(circles, polygon, params, grid);
	return circles;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/patterns/procedural/__tests__/circle-packing.test.ts`
Expected: PASS, all tests — the constraint-invariant tests from Task 3 must still hold, because inflation stops exactly at each constraint.

If the constraint tests now fail by a hair (order 1e-9), the cause is float drift in `freezeTime`, not a logic error: subtract a `1e-9` guard inside `freezeTime`'s returned bound rather than loosening the test's `EPS`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/patterns/procedural/circle-packing.ts src/lib/patterns/procedural/__tests__/circle-packing.test.ts
git add src/lib/patterns/procedural/
git commit -m "feat(procedural): inflate packed circles to an LP vertex"
```

---

### Task 5: Fill config types, defaults, and validation

**Files:**
- Modify: `src/lib/types.ts` (near `OutlinedTabConfig`, around line 697-713)
- Modify: `src/lib/shades-config.ts` (near `defaultOutlinedPatternConfig`, line 493)
- Modify: `src/lib/validators.ts`
- Create: `src/lib/__tests__/procedural-fill-config.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `CircleHolesFillConfig`, `ProceduralFillConfig`, `isCircleHolesFillConfig` from `$lib/types`
  - `OutlinedPatternConfig.fill?: ProceduralFillConfig`
  - `defaultCircleHolesFillConfig(): CircleHolesFillConfig` from `$lib/shades-config`
  - `validateProceduralFillConfig(config: ProceduralFillConfig): Validity` from `$lib/validators`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/procedural-fill-config.test.ts`:

```ts
import { defaultCircleHolesFillConfig, defaultOutlinedPatternConfig } from '$lib/shades-config';
import { isCircleHolesFillConfig } from '$lib/types';
import { validateProceduralFillConfig } from '$lib/validators';

describe('defaultCircleHolesFillConfig', () => {
	it('is a valid circle-holes config', () => {
		const config = defaultCircleHolesFillConfig();
		expect(isCircleHolesFillConfig(config)).toBe(true);
		expect(validateProceduralFillConfig(config).isValid).toBe(true);
	});

	it('returns a fresh object each call', () => {
		expect(defaultCircleHolesFillConfig()).not.toBe(defaultCircleHolesFillConfig());
	});
});

describe('defaultOutlinedPatternConfig', () => {
	it('leaves fill off by default', () => {
		expect(defaultOutlinedPatternConfig().fill).toBeUndefined();
	});
});

describe('validateProceduralFillConfig', () => {
	const base = defaultCircleHolesFillConfig();

	it('rejects minRadius above maxRadius', () => {
		const v = validateProceduralFillConfig({ ...base, minRadius: 20, maxRadius: 5 });
		expect(v.isValid).toBe(false);
		expect(v.messages.join(' ')).toMatch(/minRadius/);
	});

	it('rejects a non-positive density', () => {
		expect(validateProceduralFillConfig({ ...base, density: 0 }).isValid).toBe(false);
	});

	it('rejects a non-positive minRadius', () => {
		expect(validateProceduralFillConfig({ ...base, minRadius: 0 }).isValid).toBe(false);
	});

	it('rejects a negative margin', () => {
		expect(validateProceduralFillConfig({ ...base, margin: -1 }).isValid).toBe(false);
	});

	it('rejects a negative spacing', () => {
		expect(validateProceduralFillConfig({ ...base, spacing: -1 }).isValid).toBe(false);
	});

	it('accepts a zero margin and zero spacing', () => {
		expect(validateProceduralFillConfig({ ...base, margin: 0, spacing: 0 }).isValid).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/__tests__/procedural-fill-config.test.ts`
Expected: FAIL — `defaultCircleHolesFillConfig` and `validateProceduralFillConfig` are not exported.

- [ ] **Step 3: Add the types**

In `src/lib/types.ts`, directly above `export type OutlinedPatternConfig` (line 709):

```ts
/**
 * A procedurally generated interior fill layered onto an outlined band pattern.
 *
 * The outlined pipeline already produces a band outline with tab geometry
 * appended; a fill adds internal geometry inside that outline. `kind` is the
 * registry key — adding a fill means a new module plus one registry entry, with
 * no change here beyond a union member.
 *
 * All lengths are raw SVG user units (px), matching `OutlinedTabConfig`.
 */
export type CircleHolesFillConfig = {
	kind: 'circle-holes';
	/** Reroll handle. Combined with the band index so each band differs. */
	seed: number;
	/** Holes per square px. `count = round(bandArea * density)`. */
	density: number;
	/** Target clearance between a hole and the band outline. */
	margin: number;
	minRadius: number;
	maxRadius: number;
	/** Target gap between the edges of two holes. */
	spacing: number;
};

export type ProceduralFillConfig = CircleHolesFillConfig;

export const isCircleHolesFillConfig = (
	config: ProceduralFillConfig
): config is CircleHolesFillConfig => config.kind === 'circle-holes';
```

Then add the field to `OutlinedPatternConfig`:

```ts
export type OutlinedPatternConfig = {
	type: 'outlined';
	tabConfig?: OutlinedTabConfig;
	labels?: PatternLabelsConfig;
	/**
	 * Optional procedural interior geometry. Absent means a bare outline, which
	 * is what every saved config predating this field decodes to — no migration
	 * is needed.
	 */
	fill?: ProceduralFillConfig;
};
```

- [ ] **Step 4: Add the default**

In `src/lib/shades-config.ts`, import `CircleHolesFillConfig` alongside the existing `OutlinedPatternConfig` type import, and add directly above `defaultOutlinedPatternConfig` (line 493):

```ts
export const defaultCircleHolesFillConfig = (): CircleHolesFillConfig => ({
	kind: 'circle-holes',
	seed: 1,
	density: 0.002,
	margin: 6,
	minRadius: 3,
	maxRadius: 14,
	spacing: 4
});
```

Leave `defaultOutlinedPatternConfig` unchanged — the fill stays off until switched on in the UI.

- [ ] **Step 5: Add the validator**

In `src/lib/validators.ts`, add `ProceduralFillConfig` to the type import from `./types`, and append:

```ts
/**
 * Validate a procedural fill config.
 *
 * A bad combination does not throw — the packer degrades to producing nothing —
 * but it silently yields an empty band, so surface the reason instead.
 */
export const validateProceduralFillConfig = (config: ProceduralFillConfig): Validity => {
	const validity: Validity = { isValid: true, messages: [] };
	const fail = (message: string) => {
		validity.isValid = false;
		validity.messages.push(message);
	};

	if (!(config.density > 0)) fail('density must be greater than 0');
	if (!(config.minRadius > 0)) fail('minRadius must be greater than 0');
	if (!(config.maxRadius > 0)) fail('maxRadius must be greater than 0');
	if (config.minRadius > config.maxRadius) fail('minRadius must not exceed maxRadius');
	if (config.margin < 0) fail('margin must not be negative');
	if (config.spacing < 0) fail('spacing must not be negative');

	return validity;
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/__tests__/procedural-fill-config.test.ts`
Expected: PASS, all tests.

- [ ] **Step 7: Confirm no type regression**

Run: `npm run check 2>&1 | tail -3`
Expected: total error count within a couple of the ~434 baseline. A jump of 10+ means the new types broke a consumer — find it before committing.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/lib/types.ts src/lib/shades-config.ts src/lib/validators.ts src/lib/__tests__/procedural-fill-config.test.ts
git add src/lib/types.ts src/lib/shades-config.ts src/lib/validators.ts src/lib/__tests__/procedural-fill-config.test.ts
git commit -m "feat(pattern): add procedural fill config to OutlinedPatternConfig"
```

---

### Task 6: The fill registry

Turn a polygon plus a config into the single `CutPattern` the band will carry.

**Files:**
- Create: `src/lib/patterns/procedural/procedural-fill.ts`
- Create: `src/lib/patterns/procedural/__tests__/procedural-fill.test.ts`

**Interfaces:**
- Consumes: `packCircles`, `Circle` from `./circle-packing`; `Polygon` from `./polygon-2d`; `mulberry32` from `$lib/rng`; `svgPathStringFromSegments` from `$lib/patterns/utils`; `ProceduralFillConfig`, `CutPattern`, `PathSegment` from `$lib/types`.
- Produces:
  - `circlesToPathSegments(circles: Circle[]): PathSegment[]`
  - `generateProceduralFill(polygon: Polygon, config: ProceduralFillConfig, bandIndex: number): CutPattern | undefined`

- [ ] **Step 1: Write the failing test**

Create `src/lib/patterns/procedural/__tests__/procedural-fill.test.ts`:

```ts
import { svgPathStringFromSegments } from '$lib/patterns/utils';
import type { ProceduralFillConfig } from '$lib/types';
import { circlesToPathSegments, generateProceduralFill } from '../procedural-fill';
import type { Polygon } from '../polygon-2d';

const square: Polygon = [
	{ x: 0, y: 0 },
	{ x: 200, y: 0 },
	{ x: 200, y: 200 },
	{ x: 0, y: 200 }
];

const config: ProceduralFillConfig = {
	kind: 'circle-holes',
	seed: 1,
	density: 0.002,
	margin: 5,
	minRadius: 3,
	maxRadius: 15,
	spacing: 4
};

describe('circlesToPathSegments', () => {
	it('emits four segments per circle', () => {
		const segments = circlesToPathSegments([
			{ x: 10, y: 20, r: 5 },
			{ x: 30, y: 40, r: 2 }
		]);
		expect(segments).toHaveLength(8);
	});

	it('draws a closed two-arc circle', () => {
		expect(circlesToPathSegments([{ x: 10, y: 20, r: 5 }])).toEqual([
			['M', 5, 20],
			['A', 5, 5, 0, 1, 0, 15, 20],
			['A', 5, 5, 0, 1, 0, 5, 20],
			['Z']
		]);
	});

	it('emits nothing for no circles', () => {
		expect(circlesToPathSegments([])).toEqual([]);
	});
});

describe('generateProceduralFill', () => {
	it('produces a facet whose path is four segments per circle', () => {
		const facet = generateProceduralFill(square, config, 0);
		expect(facet).toBeDefined();
		expect(facet!.path.length % 4).toBe(0);
		expect(facet!.path.length).toBeGreaterThan(0);
	});

	it('round-trips through svgPathStringFromSegments', () => {
		const facet = generateProceduralFill(square, config, 0);
		expect(facet!.svgPath).toBe(svgPathStringFromSegments(facet!.path));
		expect(facet!.svgPath).toMatch(/^M/);
	});

	it('labels the facet by band index', () => {
		expect(generateProceduralFill(square, config, 7)!.label).toBe('procedural-fill-7');
	});

	it('varies between bands at the same seed', () => {
		const a = generateProceduralFill(square, config, 0)!;
		const b = generateProceduralFill(square, config, 1)!;
		expect(a.svgPath).not.toBe(b.svgPath);
	});

	it('is stable for the same band and seed', () => {
		expect(generateProceduralFill(square, config, 3)!.svgPath).toBe(
			generateProceduralFill(square, config, 3)!.svgPath
		);
	});

	it('changes when the seed changes', () => {
		const a = generateProceduralFill(square, config, 0)!;
		const b = generateProceduralFill(square, { ...config, seed: 99 }, 0)!;
		expect(a.svgPath).not.toBe(b.svgPath);
	});

	it('returns undefined when nothing fits', () => {
		const tiny: Polygon = [
			{ x: 0, y: 0 },
			{ x: 4, y: 0 },
			{ x: 4, y: 4 },
			{ x: 0, y: 4 }
		];
		expect(generateProceduralFill(tiny, config, 0)).toBeUndefined();
	});

	it('returns undefined for an invalid config rather than throwing', () => {
		expect(generateProceduralFill(square, { ...config, minRadius: 50 }, 0)).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/patterns/procedural/__tests__/procedural-fill.test.ts`
Expected: FAIL — cannot find module `../procedural-fill`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/patterns/procedural/procedural-fill.ts`:

```ts
import { mulberry32 } from '$lib/rng';
import { svgPathStringFromSegments } from '$lib/patterns/utils';
import type { CutPattern, PathSegment, ProceduralFillConfig } from '$lib/types';
import { packCircles, type Circle } from './circle-packing';
import type { Polygon } from './polygon-2d';

/**
 * Draw each circle as its own closed subpath: two half-arcs from the leftmost
 * point and back.
 *
 * Every circle in a band goes into ONE `CutPattern`, not one per circle. The
 * renderer emits a `<path>` per facet, and the largest saved configuration
 * carries 1,440 bands — a facet per hole would put tens of thousands of extra
 * nodes into the DOM, which is the known bottleneck of this pane.
 */
export const circlesToPathSegments = (circles: Circle[]): PathSegment[] => {
	const segments: PathSegment[] = [];
	for (const { x, y, r } of circles) {
		segments.push(['M', x - r, y]);
		segments.push(['A', r, r, 0, 1, 0, x + r, y]);
		segments.push(['A', r, r, 0, 1, 0, x - r, y]);
		segments.push(['Z']);
	}
	return segments;
};

/**
 * Build the interior geometry for one band.
 *
 * The RNG is seeded with `seed ^ bandIndex`, so every band gets its own
 * arrangement while the whole pattern stays byte-stable across re-derivation.
 * That stability is a correctness requirement, not a nicety: pattern generation
 * lives in a main-thread derived store that re-runs on every config change.
 *
 * Returns `undefined` when the fill produces nothing — a band too small to hold
 * a single hole, or a config whose radii cannot be satisfied. Callers append
 * nothing in that case rather than an empty facet.
 */
export const generateProceduralFill = (
	polygon: Polygon,
	config: ProceduralFillConfig,
	bandIndex: number
): CutPattern | undefined => {
	// Only one `kind` exists so far; the switch is the registry seam that keeps
	// the next fill from touching any caller.
	switch (config.kind) {
		case 'circle-holes': {
			const circles = packCircles(
				polygon,
				{
					density: config.density,
					margin: config.margin,
					minRadius: config.minRadius,
					maxRadius: config.maxRadius,
					spacing: config.spacing
				},
				mulberry32(config.seed ^ bandIndex)
			);
			if (circles.length === 0) return undefined;
			const path = circlesToPathSegments(circles);
			return {
				path,
				svgPath: svgPathStringFromSegments(path),
				label: `procedural-fill-${bandIndex}`
			};
		}
		default:
			return undefined;
	}
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/patterns/procedural/__tests__/procedural-fill.test.ts`
Expected: PASS, all tests.

If "draws a closed two-arc circle" fails on the arc flags, check the `ArcPathSegment` tuple order in `src/lib/types.ts:355`: `['A', rx, ry, xAxisRotation, largeArcFlag, sweepFlag, x, y]`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/patterns/procedural/procedural-fill.ts src/lib/patterns/procedural/__tests__/procedural-fill.test.ts
git add src/lib/patterns/procedural/
git commit -m "feat(procedural): add the fill registry and circle-hole path emission"
```

---

### Task 7: Wire the fill into the outlined pipeline

**Files:**
- Modify: `src/lib/cut-pattern/generate-outlined-pattern.ts` (imports at the top; `generateOutlinedBandPattern`, lines 476-575)
- Modify: `src/components/cut-pattern/QuadLabels.svelte:11-30` (the adjacent fix)
- Create: `src/lib/cut-pattern/__tests__/outlined-fill-polygon.test.ts`

**Interfaces:**
- Consumes: `generateProceduralFill` from `$lib/patterns/procedural/procedural-fill`; `dedupePolygon` from `$lib/patterns/procedural/polygon-2d`; `OutlinedPatternConfig.fill` from Task 5.
- Produces: `outlinePolygonFromEdges(edges: { start: Vector3 }[]): Polygon`, exported from `generate-outlined-pattern.ts` so it can be tested without constructing a whole band.

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/__tests__/outlined-fill-polygon.test.ts`:

```ts
import { Vector3 } from 'three';
import { outlinePolygonFromEdges } from '../generate-outlined-pattern';

describe('outlinePolygonFromEdges', () => {
	it('takes the start point of each edge, dropping z', () => {
		const edges = [
			{ start: new Vector3(0, 0, 0) },
			{ start: new Vector3(10, 0, 0) },
			{ start: new Vector3(10, 10, 0) }
		];
		expect(outlinePolygonFromEdges(edges)).toEqual([
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 }
		]);
	});

	it('drops the collapsed edges a globule pole facet produces', () => {
		const edges = [
			{ start: new Vector3(0, 0, 0) },
			{ start: new Vector3(0, 0, 0) },
			{ start: new Vector3(10, 0, 0) },
			{ start: new Vector3(10, 10, 0) }
		];
		expect(outlinePolygonFromEdges(edges)).toHaveLength(3);
	});

	it('handles an empty edge list', () => {
		expect(outlinePolygonFromEdges([])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/outlined-fill-polygon.test.ts`
Expected: FAIL — `outlinePolygonFromEdges` is not exported.

- [ ] **Step 3: Add the polygon builder and call the fill**

In `src/lib/cut-pattern/generate-outlined-pattern.ts`, add to the imports:

```ts
import { dedupePolygon, type Polygon } from '$lib/patterns/procedural/polygon-2d';
import { generateProceduralFill } from '$lib/patterns/procedural/procedural-fill';
```

Add above `generateOutlinedBandPattern` (line 476):

```ts
/**
 * The band perimeter as a plain 2D ring, for procedural fills.
 *
 * Takes each edge's start point: consecutive edges share endpoints, so the
 * starts alone walk the closed perimeter. Tab geometry is excluded by
 * construction — tabs exist only in the built outline path, never in the edge
 * list — which is what keeps holes out of glue surfaces.
 *
 * `dedupePolygon` is required, not defensive: `buildOutlinePath` already skips
 * zero-length edges because globule bands begin at a collapsed pole facet, and
 * a zero-length edge would make the fill's distance queries divide by zero.
 */
export const outlinePolygonFromEdges = (edges: { start: Vector3 }[]): Polygon =>
	dedupePolygon(edges.map((e) => ({ x: e.start.x, y: e.start.y })));
```

Inside `generateOutlinedBandPattern`, after `const bounds = getBoundsFromPath(outlinePath);`, add:

```ts
	// Procedural interior geometry, appended AFTER the quad facets so the
	// existing positional reads of `facets[0]` (the outline, used by
	// prepare-merge) keep resolving to the same facet.
	const fillFacet = config.fill
		? generateProceduralFill(outlinePolygonFromEdges(edges), config.fill, localBandIndex)
		: undefined;
```

Then change the `facets` entry of the returned `result` from:

```ts
		facets: [outlineFacet, ...quadFacets],
```

to:

```ts
		facets: fillFacet ? [outlineFacet, ...quadFacets, fillFacet] : [outlineFacet, ...quadFacets],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/outlined-fill-polygon.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Fix the positional facet read in QuadLabels**

`QuadLabels.svelte:28` reads `band.facets[Math.floor((band.facets.length - 1) / 2)].quad`, indexing the facet array positionally to find a middle quad. Appending the fill facet shifts that pick, and the facet it lands on may have no `quad` at all. Filter first.

Open `src/components/cut-pattern/QuadLabels.svelte` and replace the positional read so it selects from facets that actually carry a quad:

```ts
	const quadFacets = band.facets.filter((facet) => facet.quad);
	const quad = quadFacets[Math.floor((quadFacets.length - 1) / 2)]?.quad;
```

Keep the surrounding usage unchanged, and guard any dereference of `quad` with `{#if quad}` if it is not already guarded.

- [ ] **Step 6: Verify nothing regressed**

Run: `npm run test:unit -- src/lib/cut-pattern`
Expected: PASS, no new failures.

Run: `npm run check 2>&1 | tail -3`
Expected: total error count within a couple of the ~434 baseline.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/lib/cut-pattern/generate-outlined-pattern.ts src/lib/cut-pattern/__tests__/outlined-fill-polygon.test.ts src/components/cut-pattern/QuadLabels.svelte
git add src/lib/cut-pattern/generate-outlined-pattern.ts src/lib/cut-pattern/__tests__/outlined-fill-polygon.test.ts src/components/cut-pattern/QuadLabels.svelte
git commit -m "feat(pattern): apply procedural fills to outlined band patterns"
```

---

### Task 8: UI controls

**Files:**
- Modify: `src/components/controls/TilingControl.svelte` (inside the `{#if isOutlined ...}` block, after the tab `{#if ...tabConfig}` section closes, around line 200)

**Interfaces:**
- Consumes: `defaultCircleHolesFillConfig` from `$lib/shades-config`; `OutlinedPatternConfig.fill` from Task 5.
- Produces: nothing consumed by later tasks.

This file uses Svelte 4 syntax (`$:`, `on:click`, `on:change`). Match it — do not convert it to runes.

- [ ] **Step 1: Add the import**

In the `<script>` block of `src/components/controls/TilingControl.svelte`, extend the existing `$lib/shades-config` import:

```ts
	import {
		tiledPatternConfigs,
		defaultOutlinedPatternConfig,
		defaultCircleHolesFillConfig
	} from '$lib/shades-config';
```

- [ ] **Step 2: Add the control block**

Inside the `{#if isOutlined && isOutlinedPatternConfig($patternConfigStore.patternTypeConfig)}` block, after the closing `{/if}` of the `tabConfig` section but still inside the `<div>` that wraps it, add:

```svelte
				<div>
					<span>Procedural Fill</span>
					<input
						type="checkbox"
						checked={!!$patternConfigStore.patternTypeConfig.fill}
						on:change={(e) => {
							$patternConfigStore.patternTypeConfig = {
								...$patternConfigStore.patternTypeConfig,
								fill: e.target.checked ? defaultCircleHolesFillConfig() : undefined
							};
						}}
					/>
				</div>
				{#if $patternConfigStore.patternTypeConfig.fill}
					<NumberInput
						label="Density"
						min={0.0001}
						max={0.02}
						step={0.0001}
						bind:value={$patternConfigStore.patternTypeConfig.fill.density}
					/>
					<NumberInput
						label="Margin"
						min={0}
						max={50}
						step={0.5}
						bind:value={$patternConfigStore.patternTypeConfig.fill.margin}
					/>
					<NumberInput
						label="Min Radius"
						min={0.5}
						max={50}
						step={0.5}
						bind:value={$patternConfigStore.patternTypeConfig.fill.minRadius}
					/>
					<NumberInput
						label="Max Radius"
						min={0.5}
						max={100}
						step={0.5}
						bind:value={$patternConfigStore.patternTypeConfig.fill.maxRadius}
					/>
					<NumberInput
						label="Circle Spacing"
						min={0}
						max={50}
						step={0.5}
						bind:value={$patternConfigStore.patternTypeConfig.fill.spacing}
					/>
					<div class="row">
						<span>Seed {$patternConfigStore.patternTypeConfig.fill.seed}</span>
						<button
							on:click={() => {
								if (!$patternConfigStore.patternTypeConfig.fill) return;
								$patternConfigStore.patternTypeConfig.fill.seed =
									Math.floor(Math.random() * 1_000_000) + 1;
								$patternConfigStore = $patternConfigStore;
							}}>Reroll</button
						>
					</div>
				{/if}
```

The `$patternConfigStore = $patternConfigStore` reassignment after the seed mutation matches the idiom the neighbouring tab selects already use in this file: the store is mutated in place and re-set so `writable.set` notifies.

- [ ] **Step 3: Verify the component compiles**

Run: `npm run check 2>&1 | grep -c "TilingControl"`
Expected: `0`, or the same count as before the change if the file already had errors. Check with `git stash` if unsure.

- [ ] **Step 4: Verify in the browser**

Start the dev server and drive `designer2` with the Playwright recipe (see the `headless-ui-verification` memory: server on port 9776, script at the repo root, target floaters by index into `nav .hover-button-container button` because the rail splits its title letters).

Confirm: switching the pattern type to Outlined shows the "Procedural Fill" checkbox; enabling it puts circles inside the bands; changing Max Radius changes the circles; Reroll produces a different arrangement; disabling it restores the bare outline. Capture a screenshot.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/components/controls/TilingControl.svelte
git add src/components/controls/TilingControl.svelte
git commit -m "feat(controls): add procedural fill controls to the outlined pattern panel"
```

---

### Task 9: Measure the cost at scale

The design commits to reporting a number rather than asserting the fill is fast. Do that, and only optimise if the number says to.

**Files:**
- Create: `perf-procedural-fill.mjs` at the repo root (throwaway; do not commit)

**Interfaces:**
- Consumes: `packCircles` from Task 4.
- Produces: a number in the final report.

- [ ] **Step 1: Write the benchmark**

Create `perf-procedural-fill.mjs` at the repo root. It measures the packer directly, which is where the new cost lives; the rest of the pipeline is unchanged.

```js
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('ts-node/esm', pathToFileURL('./'));

const { packCircles } = await import('./src/lib/patterns/procedural/circle-packing.ts');
const { mulberry32 } = await import('./src/lib/rng.ts');

// A long, thin band, the shape the outlined pipeline actually produces.
const band = [
	{ x: 0, y: 0 },
	{ x: 400, y: 0 },
	{ x: 400, y: 60 },
	{ x: 0, y: 60 }
];
const params = { density: 0.002, margin: 6, minRadius: 3, maxRadius: 14, spacing: 4 };

const BANDS = 1440;
let total = 0;
const start = performance.now();
for (let i = 0; i < BANDS; i++) total += packCircles(band, params, mulberry32(1 ^ i)).length;
const elapsed = performance.now() - start;

console.log(`${BANDS} bands, ${total} circles, ${elapsed.toFixed(0)} ms`);
console.log(`${(elapsed / BANDS).toFixed(3)} ms per band`);
```

If `ts-node/esm` is not installed, run the file through `npx tsx perf-procedural-fill.mjs` instead — `tsx` is already a devDependency (used by `drizzle:migrate`), so rename the file to `.ts` and use plain relative imports.

- [ ] **Step 2: Run it**

Run: `npx tsx perf-procedural-fill.ts`
Record the total milliseconds and the per-band figure.

- [ ] **Step 3: Decide**

Compare against the ~400 ms the whole existing pattern-generation pass costs on the 1,440-band config.

- Under ~200 ms total: acceptable. Do nothing.
- Over that: memoise the fill facet per band on `(seed, params, band identity)` in `generate-outlined-pattern.ts`, then re-measure. Do not add the cache speculatively.

- [ ] **Step 4: Clean up**

```bash
rm -f perf-procedural-fill.mjs perf-procedural-fill.ts
```

Report the measured number in the final summary.

---

### Task 10: Full verification

- [ ] **Step 1: Run the whole unit suite**

Run: `npm run test:unit`
Expected: PASS. Compare the failure count against `git stash && npm run test:unit` if anything fails, to confirm it is pre-existing.

- [ ] **Step 2: Type check**

Run: `npm run check 2>&1 | tail -5`
Expected: total within a couple of the ~434 baseline.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean, or only pre-existing failures.

- [ ] **Step 4: Confirm saved configs still load**

Load an existing saved config in `designer2` and confirm it renders with no fill and no console error. This is the no-migration claim, and it is the one that would bite silently.

- [ ] **Step 5: Final commit if anything was fixed**

```bash
git add -A
git commit -m "chore(procedural): verification fixes"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Configuration type + optional `fill` | 5 |
| Module layout (`polygon-2d`, `circle-packing`, `procedural-fill`, `rng`) | 1, 2, 3, 4, 6 |
| Data flow / polygon from edges / tabs excluded | 7 |
| Output shape (one facet per band, arc subpaths) | 6 |
| Phase 1 seeding | 3 |
| Phase 2 inflation | 4 |
| Determinism | 1, 3, 6 |
| UI, validation, defaults | 5, 8 |
| Testing (invariants, determinism, optimality) | 2, 3, 4, 5, 6, 7 |
| Performance measurement | 9 |
| Adjacent QuadLabels fix | 7 |

No gaps.

**Type consistency:** `Point2`/`Polygon` (Task 2) are consumed unchanged in Tasks 3, 4, 6, 7. `Circle`/`CirclePackingParams` (Task 3) are consumed in Tasks 4, 6. `packCircles` keeps one signature across Tasks 3, 4, 6, 9. `CircleHolesFillConfig`/`ProceduralFillConfig` (Task 5) are consumed in Tasks 6, 7, 8. `generateProceduralFill` (Task 6) is consumed in Task 7 with the argument order it was defined with. `mulberry32` (Task 1) is consumed in Tasks 3, 6, 9.

**Ordering note:** Task 6 imports `ProceduralFillConfig` from `$lib/types`, so Task 5 must land before Task 6. Task 3 must land before Task 4, which modifies the same file. Otherwise the order is as written.
