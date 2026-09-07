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
