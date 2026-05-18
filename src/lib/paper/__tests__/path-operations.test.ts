import type { PathSegment } from '$lib/types';
import {
	unitePaths,
	subtractPaths,
	intersectPaths,
	excludePaths
} from '../path-operations';
import { getPaperScope } from '../scope';
import { pathSegmentsToPaper } from '../path-segment-to-paper';

const rect = (x: number, y: number, w: number, h: number): PathSegment[] => [
	['M', x, y],
	['L', x + w, y],
	['L', x + w, y + h],
	['L', x, y + h],
	['Z']
];

const area = (segments: PathSegment[]): number => {
	const item = pathSegmentsToPaper(segments);
	const a = Math.abs(item.area);
	item.remove();
	return a;
};

describe('path-operations', () => {
	beforeAll(() => {
		getPaperScope();
	});

	test('unitePaths of two overlapping squares yields a single contour with combined area', () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(5, 0, 10, 10);
		const united = unitePaths(a, b);

		// Single contour: exactly one M, exactly one Z.
		expect(united.filter((s) => s[0] === 'M').length).toBe(1);
		expect(united.filter((s) => s[0] === 'Z').length).toBe(1);
		// Combined area = 10*10 + 10*10 - 5*10 overlap = 150.
		expect(area(united)).toBeCloseTo(150, 1);
	});

	test('unitePaths of two disjoint squares yields a compound path (two M..Z runs)', () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(20, 0, 10, 10);
		const united = unitePaths(a, b);

		expect(united.filter((s) => s[0] === 'M').length).toBe(2);
		expect(united.filter((s) => s[0] === 'Z').length).toBe(2);
		expect(area(united)).toBeCloseTo(200, 1);
	});

	test('subtractPaths removes the overlap', () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(5, 0, 10, 10);
		const diff = subtractPaths(a, b);
		// a (100) minus overlap (50) = 50.
		expect(area(diff)).toBeCloseTo(50, 1);
	});

	test('intersectPaths returns just the overlap', () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(5, 0, 10, 10);
		const inter = intersectPaths(a, b);
		expect(area(inter)).toBeCloseTo(50, 1);
	});

	test('excludePaths returns symmetric difference', () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(5, 0, 10, 10);
		const xor = excludePaths(a, b);
		// Combined (150) minus overlap (50) = 100.
		expect(area(xor)).toBeCloseTo(100, 1);
	});
});
