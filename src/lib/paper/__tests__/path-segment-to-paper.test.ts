import type { PathSegment } from '$lib/types';
import { pathSegmentsToPaper } from '../path-segment-to-paper';
import { getPaperScope } from '../scope';

describe('pathSegmentsToPaper', () => {
	beforeAll(() => {
		getPaperScope();
	});

	test('converts a closed unit square to a paper.Path with 4 segments', () => {
		const square: PathSegment[] = [['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['L', 0, 10], ['Z']];
		const item = pathSegmentsToPaper(square);
		expect(item.closed).toBe(true);
		expect(item.segments.length).toBe(4);
		// Bounds: a 10x10 square at the origin.
		expect(item.bounds.width).toBeCloseTo(10);
		expect(item.bounds.height).toBeCloseTo(10);
		item.remove();
	});

	test('throws on segments that do not begin with M', () => {
		const bad: PathSegment[] = [['L', 1, 1], ['Z']];
		expect(() => pathSegmentsToPaper(bad)).toThrow(/must begin with 'M'/);
	});

	test('converts a path containing C and Q segments', () => {
		const curved: PathSegment[] = [
			['M', 0, 0],
			['C', 5, 0, 10, 5, 10, 10],
			['Q', 5, 15, 0, 10],
			['Z']
		];
		const item = pathSegmentsToPaper(curved);
		expect(item.closed).toBe(true);
		// Bezier handles produced from the C/Q segments imply non-zero curvature.
		expect(item.segments.some((s: { hasHandles: () => boolean }) => s.hasHandles())).toBe(true);
		item.remove();
	});
});
