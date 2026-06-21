import { describe, it, expect } from '@jest/globals';
import { smoothSeries } from '../smooth-chains';

/** Sum of |second differences| — a proxy for jaggedness. */
function roughness(s: number[]): number {
	let r = 0;
	for (let i = 1; i < s.length - 1; i++) r += Math.abs(s[i - 1] - 2 * s[i] + s[i + 1]);
	return r;
}

describe('smoothSeries', () => {
	it('reduces roughness while pinning the endpoints exactly', () => {
		// A straight ramp with alternating zig-zag noise on the interior.
		const n = 21;
		const noisy = Array.from({ length: n }, (_, i) => i + (i % 2 === 0 ? 0.5 : -0.5));
		noisy[0] = 0; // clean endpoints
		noisy[n - 1] = n - 1;
		const out = smoothSeries(noisy, 10);
		expect(out.length).toBe(n);
		expect(out[0]).toBe(noisy[0]);
		expect(out[n - 1]).toBe(noisy[n - 1]);
		expect(roughness(out)).toBeLessThan(roughness(noisy) * 0.5);
	});

	it('returns the input unchanged when lambda is 0', () => {
		const y = [0, 3, 1, 4, 1, 5, 9, 2];
		expect(smoothSeries(y, 0)).toEqual(y);
	});

	it('returns a copy unchanged for series shorter than 4', () => {
		const y = [1, 5, 2];
		const out = smoothSeries(y, 10);
		expect(out).toEqual(y);
		expect(out).not.toBe(y);
	});
});
