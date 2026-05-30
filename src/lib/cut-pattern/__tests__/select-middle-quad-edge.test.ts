import { middleQuadIndex, middleQuadEdgeIndices } from '../select-middle-quad-edge';

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
