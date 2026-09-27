import { describe, it, expect } from '@jest/globals';
import { parsePathD, applyMatrix } from '../parse-path-d';

describe('parsePathD', () => {
	it('parses what svgPathStringFromSegments writes', () => {
		expect(parsePathD('M 0 0\nL 10 0\nC 1 2 3 4 5 6\nQ 1 1 2 2\nA 5 5 0 0 1 10 10\nZ')).toEqual([
			['M', 0, 0], ['L', 10, 0], ['C', 1, 2, 3, 4, 5, 6], ['Q', 1, 1, 2, 2], ['A', 5, 5, 0, 0, 1, 10, 10], ['Z']
		]);
	});
	it('handles H, V, exponents and implicit repeats', () => {
		expect(parsePathD('M0,0 H5 V-1e-1 L1 1 2 2')).toEqual([
			['M', 0, 0], ['L', 5, 0], ['L', 5, -0.1], ['L', 1, 1], ['L', 2, 2]
		]);
	});
	it('rejects relative commands', () => {
		expect(() => parsePathD('m 0 0 l 1 1')).toThrow();
	});
});

describe('applyMatrix', () => {
	it('maps every point', () => {
		expect(
			applyMatrix([['M', 1, 0], ['C', 1, 0, 1, 0, 1, 0], ['Z']], { a: 0, b: 1, c: -1, d: 0, e: 10, f: 0 })
		).toEqual([['M', 10, 1], ['C', 10, 1, 10, 1, 10, 1], ['Z']]);
	});
});
