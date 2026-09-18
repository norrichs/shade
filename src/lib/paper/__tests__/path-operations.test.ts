import type { PathSegment } from '$lib/types';
import {
	unitePaths,
	subtractPaths,
	intersectPaths,
	excludePaths,
	uniteMany
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

	describe('uniteMany', () => {
		test('empty input returns empty array', () => {
			expect(uniteMany([])).toEqual([]);
		});

		test('single outline is returned as a single contour', () => {
			const united = uniteMany([rect(0, 0, 10, 10)]);
			expect(united.filter((s) => s[0] === 'M').length).toBe(1);
			expect(area(united)).toBeCloseTo(100, 1);
		});

		test('many overlapping outlines union to one contour', () => {
			const united = uniteMany([rect(0, 0, 10, 10), rect(5, 0, 10, 10), rect(10, 0, 10, 10)]);
			expect(united.filter((s) => s[0] === 'M').length).toBe(1);
			// 0..20 wide, 10 tall = 200.
			expect(area(united)).toBeCloseTo(200, 1);
		});

		test('a frame of outlines preserves the interior hole', () => {
			// Four bars forming a 30x30 frame with a 10x10 empty center (x/y 10..20).
			const top = rect(0, 0, 30, 10);
			const bottom = rect(0, 20, 30, 10);
			const left = rect(0, 0, 10, 30);
			const right = rect(20, 0, 10, 30);
			const united = uniteMany([top, bottom, left, right]);
			// Outer boundary + one hole = two M..Z runs.
			expect(united.filter((s) => s[0] === 'M').length).toBe(2);
			// Signed area = outer 900 - hole 100 = 800. If the hole were filled it would be 900.
			expect(area(united)).toBeCloseTo(800, 1);
		});

		test('a throw mid-reduction leaves no leftover items in the paper project layer', () => {
			const paper = getPaperScope();
			const layer = paper.project.activeLayer;
			const before = layer.children.length;

			// 5 outlines -> level 0 pairs are (0,1), (2,3), with 4 carried as the odd
			// one out. Let the first pair succeed (its result lives in `next`) and
			// make the second pair's unite throw, so the throw must clean up: the
			// already-produced `next` result, the throwing pair's own operands, and
			// the untouched odd-one-out still sitting in `level`.
			const realUnite = paper.Path.prototype.unite;
			let calls = 0;
			jest.spyOn(paper.Path.prototype, 'unite').mockImplementation(function (
				this: unknown,
				...args: unknown[]
			) {
				calls += 1;
				if (calls === 2) {
					throw new Error('injected unite failure');
				}
				return realUnite.apply(this, args as never);
			});

			const outlines = [
				rect(0, 0, 10, 10),
				rect(5, 0, 10, 10),
				rect(20, 0, 10, 10),
				rect(25, 0, 10, 10),
				rect(40, 0, 10, 10)
			];

			expect(() => uniteMany(outlines)).toThrow('injected unite failure');
			expect(layer.children.length).toBe(before);

			(paper.Path.prototype.unite as jest.Mock).mockRestore();
		});
	});
});
