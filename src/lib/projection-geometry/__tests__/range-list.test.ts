import {
	keepRangeOrder,
	resolveRangeIndices,
	resolveRangeList,
	sliceProjectionCutPattern
} from '../filters';
import type { TubeCutPattern } from '#lib/types.js';

describe('resolveRangeList', () => {
	it('selects everything when undefined', () => {
		expect(resolveRangeList(undefined, 4)).toEqual([0, 1, 2, 3]);
	});
	it('includes both ends', () => {
		expect(resolveRangeList([0, 1], 10)).toEqual([0, 1]);
		expect(resolveRangeList([3, 5], 10)).toEqual([3, 4, 5]);
		expect(resolveRangeList([2, 2], 10)).toEqual([2]);
	});
	it('counts negatives back from the end and wraps', () => {
		expect(resolveRangeList([-1, 2], 10)).toEqual([9, 0, 1, 2]);
		expect(resolveRangeList([-3, -1], 10)).toEqual([7, 8, 9]);
		expect(resolveRangeList([8, 1], 10)).toEqual([8, 9, 0, 1]);
	});
	it('handles a single index and an open-ended start', () => {
		expect(resolveRangeList(-2, 10)).toEqual([8]);
		expect(resolveRangeList(12, 10)).toEqual([]);
		expect(resolveRangeList([-2], 10)).toEqual([8, 9]);
		expect(resolveRangeList([7], 10)).toEqual([7, 8, 9]);
	});
	it('clamps to the array', () => {
		expect(resolveRangeList([0, 30], 30)).toHaveLength(30);
		expect(resolveRangeList([-50, 1], 5)).toEqual([0, 1]);
		expect(resolveRangeList([0, 3], 0)).toEqual([]);
	});
});

describe('resolveRangeIndices', () => {
	it('is the covering [start, end) window, widened by expand', () => {
		expect(resolveRangeIndices([3, 5], 10)).toEqual([3, 6]);
		expect(resolveRangeIndices([3, 5], 10, 1)).toEqual([2, 7]);
		expect(resolveRangeIndices([-1, 2], 10)).toEqual([0, 10]);
		expect(resolveRangeIndices(undefined, 4)).toEqual([0, 4]);
	});
});

describe('keepRangeOrder', () => {
	it('keeps selected items in range order, pieces together', () => {
		const items = [0, 1, 1, 2, 3, 9].map((band, i) => ({ band, i }));
		const kept = keepRangeOrder(items, [-1, 1], 10, (x) => x.band);
		expect(kept.map((x) => x.i)).toEqual([5, 0, 1, 2]);
	});
	it('passes everything through when undefined', () => {
		const items = [{ band: 3 }];
		expect(keepRangeOrder(items, undefined, 10, (x) => x.band)).toBe(items);
	});
});

describe('sliceProjectionCutPattern', () => {
	it('slices facets inclusively, wrapping on negatives', () => {
		const tubes = [{ bands: [{ facets: [0, 1, 2, 3, 4] }] }] as unknown as TubeCutPattern[];
		expect(sliceProjectionCutPattern(tubes, { facets: [1, 2] })[0].bands[0].facets).toEqual([1, 2]);
		expect(sliceProjectionCutPattern(tubes, { facets: [-1, 0] })[0].bands[0].facets).toEqual([
			4, 0
		]);
	});
});
