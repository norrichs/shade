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
		expect(
			dedupePolygon([
				{ x: 1, y: 1 },
				{ x: 1, y: 1 }
			])
		).toHaveLength(1);
	});
});
