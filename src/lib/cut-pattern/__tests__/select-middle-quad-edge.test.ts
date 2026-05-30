import { middleQuadIndex, middleQuadEdgeIndices, selectMiddleQuadEdgeIndex } from '../select-middle-quad-edge';

describe('middleQuadIndex', () => {
	test.each([
		[1, 0],
		[2, 0],
		[3, 1],
		[4, 1],
		[5, 2]
	])('quadCount %i -> %i', (quadCount, expected) => {
		expect(middleQuadIndex(quadCount)).toBe(expected);
	});
});

describe('middleQuadEdgeIndices', () => {
	// n = 5 quads; midQuad = 2.
	// before edge index = midQuad = 2.
	// after edge index = 2n - midQuad = 10 - 2 = 8.
	test('returns before and after edge indices for the middle quad', () => {
		expect(middleQuadEdgeIndices(5)).toEqual({ midQuad: 2, beforeIndex: 2, afterIndex: 8 });
	});

	// n = 4 quads; midQuad = 1.
	// before = 1; after = 8 - 1 = 7.
	test('round-down middle for even quad counts', () => {
		expect(middleQuadEdgeIndices(4)).toEqual({ midQuad: 1, beforeIndex: 1, afterIndex: 7 });
	});

	// n = 1 quad; midQuad = 0. before = 0; after = 2 - 0 = 2.
	test('single quad', () => {
		expect(middleQuadEdgeIndices(1)).toEqual({ midQuad: 0, beforeIndex: 0, afterIndex: 2 });
	});
});

describe('selectMiddleQuadEdgeIndex', () => {
	const candidate = (
		index: number,
		hasTab: boolean,
		partnerBand: number | undefined
	) => ({ index, hasTab, partnerBand });

	test('priority 1: prefers the edge with no tab', () => {
		const before = candidate(2, true, 0);
		const after = candidate(8, false, 5);
		expect(selectMiddleQuadEdgeIndex(before, after)).toBe(8);
	});

	test('priority 2: tab tie -> prefers the edge with no partner', () => {
		const before = candidate(2, false, 3); // has partner
		const after = candidate(8, false, undefined); // no partner
		expect(selectMiddleQuadEdgeIndex(before, after)).toBe(8);
	});

	test('priority 3: tab + partner tie -> prefers the higher partner band number', () => {
		const before = candidate(2, false, 1);
		const after = candidate(8, false, 4);
		expect(selectMiddleQuadEdgeIndex(before, after)).toBe(8);
	});

	test('priority 3 the other way: before wins when its partner band is higher', () => {
		const before = candidate(2, false, 9);
		const after = candidate(8, false, 4);
		expect(selectMiddleQuadEdgeIndex(before, after)).toBe(2);
	});

	test('full tie (both no-tab, both no-partner) -> deterministic before edge', () => {
		const before = candidate(2, false, undefined);
		const after = candidate(8, false, undefined);
		expect(selectMiddleQuadEdgeIndex(before, after)).toBe(2);
	});

	test('both tabbed, both partnered, equal partner band -> before edge', () => {
		const before = candidate(2, true, 7);
		const after = candidate(8, true, 7);
		expect(selectMiddleQuadEdgeIndex(before, after)).toBe(2);
	});
});
