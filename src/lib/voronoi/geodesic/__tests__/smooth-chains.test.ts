import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import { smoothSeries, smoothChainPoints } from '../smooth-chains';

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

/** Total turning angle (radians) across a polyline. */
function turning(points: Vector3[]): number {
	let t = 0;
	for (let i = 1; i < points.length - 1; i++) {
		const a = points[i].clone().sub(points[i - 1]);
		const b = points[i + 1].clone().sub(points[i]);
		if (a.lengthSq() < 1e-18 || b.lengthSq() < 1e-18) continue;
		t += a.angleTo(b);
	}
	return t;
}

describe('smoothChainPoints', () => {
	it('reduces turning while leaving the endpoints exactly in place', () => {
		// Zig-zag along +x in the z=0 plane.
		const raw = Array.from({ length: 15 }, (_, i) => new Vector3(i, i % 2 === 0 ? 0.4 : -0.4, 0));
		raw[0].set(0, 0, 0);
		raw[14].set(14, 0, 0);
		const out = smoothChainPoints(raw, 10);
		expect(out.length).toBe(raw.length);
		expect(out[0].equals(raw[0])).toBe(true);
		expect(out[14].equals(raw[14])).toBe(true);
		expect(turning(out)).toBeLessThan(turning(raw) * 0.5);
	});

	it('returns clones unchanged for chains shorter than 4 points', () => {
		const raw = [new Vector3(0, 0, 0), new Vector3(1, 1, 0), new Vector3(2, 0, 0)];
		const out = smoothChainPoints(raw, 10);
		expect(out.map((p) => p.toArray())).toEqual(raw.map((p) => p.toArray()));
		expect(out[0]).not.toBe(raw[0]);
	});
});
