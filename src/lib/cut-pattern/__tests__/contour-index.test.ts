import { describe, it, expect } from '@jest/globals';
import { buildContourIndex, holesOf } from '../contour-index';
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

describe('buildContourIndex', () => {
	it('finds a contour nested inside another and ignores the outer one', () => {
		const path: PathSegment[] = [...square(0, 0, 10, 10), ...square(4, 4, 2, 2)];
		const index = buildContourIndex(
			path,
			{
				...straightBand(10),
				pieceStartFraction: 0,
				pieceEndFraction: 1,
				seed: 7
			},
			'tiled'
		);

		expect(index.seed).toBe(7);
		expect(holesOf(index)).toHaveLength(1);
		expect(holesOf(index)[0].start).toBe(5);
		expect(holesOf(index)[0].end).toBe(10);
		expect(holesOf(index)[0].area).toBeCloseTo(4, 6);
	});

	it('treats an island inside a hole as solid, not as a hole', () => {
		const path: PathSegment[] = [
			...square(0, 0, 20, 20), // depth 0 — outer
			...square(4, 4, 10, 10), // depth 1 — hole
			...square(6, 6, 2, 2) // depth 2 — island inside the hole
		];
		const index = buildContourIndex(
			path,
			{
				...straightBand(20),
				pieceStartFraction: 0,
				pieceEndFraction: 1,
				seed: 1
			},
			'tiled'
		);

		expect(holesOf(index).map((h) => h.start)).toEqual([5]);
	});

	it('handles several disconnected outer contours', () => {
		const path: PathSegment[] = [
			...square(0, 0, 4, 4),
			...square(1, 1, 1, 1), // hole in the first island
			...square(10, 0, 4, 4),
			...square(11, 1, 1, 1) // hole in the second island
		];
		const index = buildContourIndex(
			path,
			{
				...straightBand(4),
				pieceStartFraction: 0,
				pieceEndFraction: 1,
				seed: 1
			},
			'tiled'
		);

		expect(holesOf(index).map((h) => h.start)).toEqual([5, 15]);
	});

	it('positions a hole by arc length along the centerline', () => {
		// 10 stacked unit facets; a hole centred at y≈7.5 sits ~0.78 along a
		// centerline that runs 0.5 → 9.5.
		const path: PathSegment[] = [...square(0, 0, 1, 10), ...square(0.4, 7.4, 0.2, 0.2)];
		const index = buildContourIndex(
			path,
			{
				...straightBand(10),
				pieceStartFraction: 0,
				pieceEndFraction: 1,
				seed: 1
			},
			'tiled'
		);

		expect(holesOf(index)[0].bandFraction).toBeCloseTo((7.5 - 0.5) / 9, 2);
	});

	it('maps a piece-local position onto the parent band (centre of piece 2 of 3)', () => {
		// Piece 2 of 3 spans [1/3, 2/3]; a hole at its local centre is 0.5 of the parent.
		const path: PathSegment[] = [...square(0, 0, 1, 10), ...square(0.4, 4.9, 0.2, 0.2)];
		const index = buildContourIndex(
			path,
			{
				...straightBand(10),
				pieceStartFraction: 1 / 3,
				pieceEndFraction: 2 / 3,
				seed: 1
			},
			'tiled'
		);

		expect(holesOf(index)[0].bandFraction).toBeCloseTo(0.5, 2);
	});

	it('maps a third of the way along piece 3 of 3 to 7/9', () => {
		// Piece 3 spans [2/3, 1]; local 1/3 → 2/3 + (1/3)(1/3) = 7/9.
		const localThird = 0.5 + (1 / 3) * 9; // centerline runs 0.5 → 9.5
		const path: PathSegment[] = [
			...square(0, 0, 1, 10),
			...square(0.4, localThird - 0.1, 0.2, 0.2)
		];
		const index = buildContourIndex(
			path,
			{
				...straightBand(10),
				pieceStartFraction: 2 / 3,
				pieceEndFraction: 1,
				seed: 1
			},
			'tiled'
		);

		expect(holesOf(index)[0].bandFraction).toBeCloseTo(7 / 9, 2);
	});

	it('returns no holes for a path with a single contour', () => {
		const index = buildContourIndex(
			square(0, 0, 10, 10),
			{
				...straightBand(10),
				pieceStartFraction: 0,
				pieceEndFraction: 1,
				seed: 3
			},
			'tiled'
		);

		expect(holesOf(index)).toEqual([]);
	});

	it('falls back to the piece midpoint when the band has no usable centerline', () => {
		const path: PathSegment[] = [...square(0, 0, 10, 10), ...square(4, 4, 2, 2)];
		const index = buildContourIndex(
			path,
			{
				facets: [],
				pieceStartFraction: 0,
				pieceEndFraction: 1,
				seed: 1
			},
			'tiled'
		);

		expect(holesOf(index)[0].bandFraction).toBeCloseTo(0.5, 6);
	});
});

describe('buildContourIndex kinds, axis and ends', () => {
	const input = (count: number) => ({
		...straightBand(count),
		pieceStartFraction: 0,
		pieceEndFraction: 1,
		seed: 1
	});

	it('records every contour with an even/odd kind', () => {
		const path: PathSegment[] = [...square(0, 0, 10, 10), ...square(4, 4, 2, 2)];
		const index = buildContourIndex(path, input(10), 'tiled');
		expect(index.contours.map((c) => c.kind)).toEqual(['outline', 'hole']);
		expect(index.contours.map((c) => c.depth)).toEqual([0, 1]);
	});

	it('marks every contour of an outlined band as outline', () => {
		const path: PathSegment[] = [...square(0, 0, 10, 10), ...square(4, 4, 2, 2)];
		const index = buildContourIndex(path, input(10), 'outlined');
		expect(index.contours.every((c) => c.kind === 'outline')).toBe(true);
		expect(holesOf(index)).toHaveLength(0);
	});

	it('finds the major axis and the two ends of a tall band', () => {
		// 2 wide, 10 tall, facets run down +y
		const path: PathSegment[] = square(-0.5, 0, 2, 10);
		const index = buildContourIndex(path, input(10), 'tiled');
		expect(Math.abs(index.axis!.direction.y)).toBeCloseTo(1, 6);
		const { start, end } = index.ends!;
		expect(start.point.y).toBeCloseTo(0, 6); // first facet is at the top
		expect(end.point.y).toBeCloseTo(10, 6);
		expect(start.outward.y).toBeCloseTo(-1, 6);
		expect(end.outward.y).toBeCloseTo(1, 6);
	});

	it('puts the end on a protruding tag', () => {
		// band plus a small tag sticking out below the last facet
		const path: PathSegment[] = [
			['M', 0, 0],
			['L', 1, 0],
			['L', 1, 10],
			['L', 0.6, 10],
			['L', 0.6, 12],
			['L', 0.4, 12],
			['L', 0.4, 10],
			['L', 0, 10],
			['Z']
		];
		const index = buildContourIndex(path, input(10), 'tiled');
		expect(index.ends!.end.point.y).toBeCloseTo(12, 6);
	});

	it('returns no ends for an empty path', () => {
		const index = buildContourIndex([], input(3), 'tiled');
		expect(index.contours).toEqual([]);
		expect(index.ends).toBeUndefined();
	});
});
