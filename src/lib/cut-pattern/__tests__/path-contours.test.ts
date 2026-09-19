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
		// A bulge to the right of the chord from (0,0) to (0,10).
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
