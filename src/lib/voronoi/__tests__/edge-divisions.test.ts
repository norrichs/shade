import {
	normalizeEdgeDivisions,
	normalizeEdgeDivisionsMultiplier,
	computeAdaptiveEdgeDivisions,
	deriveEdgeDivisionsMax,
	type EdgeMetric
} from '../edge-divisions';

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

	it('multiplies every interpolated count by the multiplier', () => {
		// lengths 0..12, min 1 max 5 -> [1,2,3,4,5] * 3
		expect(computeAdaptiveEdgeDivisions([0, 3, 6, 9, 12], [1, 5], 3)).toEqual([3, 6, 9, 12, 15]);
		expect(computeAdaptiveEdgeDivisions([4, 4], [3, 9], 2)).toEqual([18, 18]);
	});

	it('treats a missing or sub-1 multiplier as 1', () => {
		expect(computeAdaptiveEdgeDivisions([0, 10], [2, 4], 0)).toEqual([2, 4]);
		expect(normalizeEdgeDivisionsMultiplier(undefined)).toBe(1);
		expect(normalizeEdgeDivisionsMultiplier(-3)).toBe(1);
		expect(normalizeEdgeDivisionsMultiplier(2.6)).toBe(3);
	});

	it('normalizes an inverted divisions pair before interpolating', () => {
		const result = computeAdaptiveEdgeDivisions([2, 10], [12, 4]);
		expect(result[0]).toBe(4);
		expect(result[1]).toBe(12);
	});
});

describe('deriveEdgeDivisionsMax', () => {
	const edge = (length: number, width: number): EdgeMetric => ({ length, width });

	it('returns min when there are fewer than two usable edges', () => {
		expect(deriveEdgeDivisionsMax([], 4)).toBe(4);
		expect(deriveEdgeDivisionsMax([edge(10, 2)], 4)).toBe(4);
		// A zero-length / zero-width edge is not usable.
		expect(deriveEdgeDivisionsMax([edge(10, 2), edge(0, 2)], 4)).toBe(4);
	});

	it('returns min when all edges are (near) equal length', () => {
		expect(deriveEdgeDivisionsMax([edge(5, 1), edge(5, 2), edge(5, 3)], 6)).toBe(6);
	});

	it('derives max so long-edge facets match the shortest edge facet aspect', () => {
		// short: 2 long, width 1, at min=4 -> facet aspect = 1 * 4 / 2 = 2.
		// long: 10 long, width 2 -> need 10 divisions so facet aspect = 2 * 10 / 10 = 2.
		expect(deriveEdgeDivisionsMax([edge(2, 1), edge(10, 2)], 4)).toBe(10);
	});

	it('is unaffected by intermediate edges when extremes are unchanged', () => {
		expect(deriveEdgeDivisionsMax([edge(2, 1), edge(6, 5), edge(10, 2)], 4)).toBe(10);
	});

	it('clamps the derived max to the default cap of 20', () => {
		// short facet aspect = 10; long edge would need 1000 divisions -> clamped.
		expect(deriveEdgeDivisionsMax([edge(1, 1), edge(100, 1)], 10)).toBe(20);
	});

	it('honors a custom maxCap', () => {
		expect(deriveEdgeDivisionsMax([edge(1, 1), edge(100, 1)], 10, { maxCap: 12 })).toBe(12);
	});

	it('never returns below min', () => {
		// Longer edge is much wider, so matching would want fewer divisions than min.
		const result = deriveEdgeDivisionsMax([edge(2, 1), edge(10, 50)], 6);
		expect(result).toBeGreaterThanOrEqual(6);
	});
});
