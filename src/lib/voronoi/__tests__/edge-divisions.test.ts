import { normalizeEdgeDivisions, computeAdaptiveEdgeDivisions } from '../edge-divisions';

describe('normalizeEdgeDivisions', () => {
	it('passes a valid ordered pair through (rounded)', () => {
		expect(normalizeEdgeDivisions([6, 6])).toEqual([6, 6]);
		expect(normalizeEdgeDivisions([3, 9])).toEqual([3, 9]);
	});

	it('reorders an inverted pair to satisfy min <= max', () => {
		expect(normalizeEdgeDivisions([9, 3])).toEqual([3, 9]);
	});

	it('converts the legacy scalar form to a pair', () => {
		expect(normalizeEdgeDivisions(6)).toEqual([6, 6]);
	});

	it('rounds and clamps to a minimum of 1 division', () => {
		expect(normalizeEdgeDivisions([0, 0])).toEqual([1, 1]);
		expect(normalizeEdgeDivisions([2.4, 5.6])).toEqual([2, 6]);
	});
});

describe('computeAdaptiveEdgeDivisions', () => {
	it('returns an empty array for no edges', () => {
		expect(computeAdaptiveEdgeDivisions([], [6, 6])).toEqual([]);
	});

	it('gives every edge the same count when min == max', () => {
		expect(computeAdaptiveEdgeDivisions([1, 5, 10], [6, 6])).toEqual([6, 6, 6]);
	});

	it('gives every edge maxDivisions when all lengths are equal', () => {
		expect(computeAdaptiveEdgeDivisions([4, 4, 4], [3, 9])).toEqual([9, 9, 9]);
	});

	it('assigns minDivisions to the shortest and maxDivisions to the longest edge', () => {
		const result = computeAdaptiveEdgeDivisions([2, 10], [4, 12]);
		expect(result[0]).toBe(4);
		expect(result[1]).toBe(12);
	});

	it('linearly interpolates intermediate edges by length', () => {
		// lengths 0..10, min 6 max 16 -> divisions = round(6 + t*10)
		const result = computeAdaptiveEdgeDivisions([0, 5, 10], [6, 16]);
		expect(result).toEqual([6, 11, 16]);
	});

	it('normalizes an inverted divisions pair before interpolating', () => {
		const result = computeAdaptiveEdgeDivisions([2, 10], [12, 4]);
		expect(result[0]).toBe(4);
		expect(result[1]).toBe(12);
	});
});
