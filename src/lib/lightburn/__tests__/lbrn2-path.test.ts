import { describe, it, expect } from '@jest/globals';
import { encodeSubpaths, toCubicSegments, fmt } from '../lbrn2-path';

describe('fmt', () => {
	it('rounds to 6 places with no -0', () => {
		expect(fmt(1.23456789)).toBe('1.234568');
		expect(fmt(-0.0000001)).toBe('0');
		expect(fmt(10)).toBe('10');
	});
});

describe('encodeSubpaths', () => {
	it('encodes a closed polyline', () => {
		expect(encodeSubpaths([['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['L', 0, 10], ['Z']])).toEqual([
			{
				vertList: 'V0 0c0x1c1x1V10 0c0x1c1x1V10 10c0x1c1x1V0 10c0x1c1x1',
				primList: 'L0 1L1 2L2 3L3 0'
			}
		]);
	});

	it('stores cubic controls as c0 on the start and c1 on the end vertex', () => {
		expect(encodeSubpaths([['M', 0, 0], ['C', 0, 5, 5, 10, 10, 10]])).toEqual([
			{ vertList: 'V0 0c0x0c0y5c1x1V10 10c0x1c1x5c1y10', primList: 'B0 1' }
		]);
	});

	it('folds a closing point that repeats the start into vertex 0', () => {
		const [enc] = encodeSubpaths([['M', 0, 0], ['L', 10, 0], ['C', 10, 5, 5, 5, 0, 0], ['Z']]);
		expect(enc.primList).toBe('L0 1B1 0');
		expect(enc.vertList).toBe('V0 0c0x1c1x5c1y5V10 0c0x10c0y5c1x1');
	});

	it('emits one entry per M-run', () => {
		expect(encodeSubpaths([['M', 0, 0], ['L', 1, 0], ['M', 5, 5], ['L', 6, 5]])).toHaveLength(2);
	});

	it('rejects arcs', () => {
		expect(() => encodeSubpaths([['M', 0, 0], ['A', 1, 1, 0, 0, 1, 2, 0]])).toThrow();
	});
});

describe('toCubicSegments', () => {
	it('elevates quadratics exactly', () => {
		expect(toCubicSegments([['M', 0, 0], ['Q', 3, 3, 6, 0]])[1]).toEqual(['C', 2, 2, 4, 2, 6, 0]);
	});

	it('turns a half-circle arc into cubics ending on the endpoint', () => {
		const out = toCubicSegments([['M', -10, 0], ['A', 10, 10, 0, 0, 1, 10, 0]]);
		expect(out.every((s) => ['M', 'L', 'C', 'Z'].includes(s[0]))).toBe(true);
		const last = out[out.length - 1];
		expect(last[0]).toBe('C');
		expect(last[5]).toBeCloseTo(10, 9);
		expect(last[6]).toBeCloseTo(0, 9);
		expect(out.length).toBeGreaterThanOrEqual(3);
	});
});
