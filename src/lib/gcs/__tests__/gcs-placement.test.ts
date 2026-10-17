import { effectiveGcsLevels, gcsLabel } from '../gcs-placement';

const cfgs = (...levels: (number | null | undefined)[]) => levels.map((level) => ({ level }));

describe('effectiveGcsLevels', () => {
	it('spreads all unpinned (3, div 10)', () => {
		expect(effectiveGcsLevels(cfgs(undefined, undefined, undefined), 10)).toEqual([0, 5, 10]);
	});
	it('spreads all unpinned (4, div 10)', () => {
		expect(effectiveGcsLevels(cfgs(undefined, undefined, undefined, undefined), 10)).toEqual([
			0, 3, 7, 10
		]);
	});
	it('respects a pinned middle', () => {
		expect(effectiveGcsLevels(cfgs(undefined, 2, undefined), 10)).toEqual([0, 2, 10]);
	});
	it('respects a pinned first', () => {
		expect(effectiveGcsLevels(cfgs(3, undefined, undefined), 9)).toEqual([3, 6, 9]);
	});
	it('treats a null level as auto', () => {
		expect(effectiveGcsLevels(cfgs(null, null, null), 10)).toEqual([0, 5, 10]);
		expect(effectiveGcsLevels(cfgs(null, 2, null), 10)).toEqual([0, 2, 10]);
	});
	it('single ignores level', () => {
		expect(effectiveGcsLevels(cfgs(7), 10)).toEqual([0]);
		expect(effectiveGcsLevels(cfgs(undefined), 10)).toEqual([0]);
	});
	it('empty returns empty', () => {
		expect(effectiveGcsLevels([], 10)).toEqual([]);
	});
});

describe('gcsLabel', () => {
	it('labels A, B, C', () => {
		expect([0, 1, 2].map(gcsLabel)).toEqual(['A', 'B', 'C']);
	});
});
