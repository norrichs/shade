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
		width: number
	) {
		this.cols = Math.max(1, Math.ceil(width / cellSize) + 3);
	}

	private cellOf(x: number, y: number): { cx: number; cy: number } {
		return {
			cx: Math.floor((x - this.minX) / this.cellSize),
			cy: Math.floor((y - this.minY) / this.cellSize)
		};
	}

	insert(index: number, x: number, y: number): void {
		const { cx, cy } = this.cellOf(x, y);
		const k = cy * this.cols + cx;
		const bucket = this.cells.get(k);
		if (bucket) bucket.push(index);
		else this.cells.set(k, [index]);
	}

	/** Indices of every circle in the 3x3 cell neighbourhood around (x, y). */
	near(x: number, y: number): number[] {
		const { cx, cy } = this.cellOf(x, y);
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
		const last = this.items.pop() as { index: number; time: number };
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
 * Treating those targets as constraints, `maximize sum(r_i)` subject to
 * `r_i + r_j <= d_ij - spacing`, `r_i <= distToEdge_i - margin` and
 * `r_i <= maxRadius` is a linear program, and an LP optimum sits at a VERTEX of
 * the feasible polytope — the point where the greatest number of constraints
 * are tight. "Maximise the number of gaps sitting exactly on the target" and
 * "find a vertex of this polytope" are the same statement.
 *
 * Uniform inflation reaches such a vertex without a solver. All unfrozen
 * circles grow at the same rate, so the radius of circle `i` at time `t` is
 * `seedRadius[i] + t`, and every constraint reduces to a freeze time:
 *
 *   pair, both growing      (d_ij - spacing - r0_i - r0_j) / 2
 *   pair, j already frozen   d_ij - spacing - r_j - r0_i
 *   boundary                 distToEdge_i - margin - r0_i
 *   clamp                    maxRadius - r0_i
 *
 * Pop the earliest freeze from a heap, freeze that circle, recompute only its
 * unfrozen neighbours. This terminates and never backtracks: when `i` freezes
 * at `t_i`, a neighbour's bound against `i` moves from
 * `T = (d_ij - spacing - r0_i - r0_j) / 2` to `2T - t_i`, and `t_i <= T`, so
 * bounds only ever relax. Popped times are therefore monotonically
 * non-decreasing and each circle freezes exactly once.
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

/**
 * Pack randomized circles into a polygon.
 *
 * Phase 1: dart-throw `area * density` seeds. A candidate is accepted only if
 * the largest radius its constraints allow still reaches `minRadius`; it then
 * takes a uniform random radius in that allowed range.
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
	const grid = new CircleGrid(minX, minY, Math.max(2 * maxRadius + spacing, 1e-6), width);

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

	inflateCircles(circles, polygon, params, grid);
	return circles;
};
