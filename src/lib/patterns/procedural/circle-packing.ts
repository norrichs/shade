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

	return circles;
};
