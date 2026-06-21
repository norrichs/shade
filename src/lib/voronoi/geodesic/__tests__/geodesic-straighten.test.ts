import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import { resamplePolyline } from '../geodesic-straighten';

describe('resamplePolyline', () => {
	it('resamples to the requested count, preserving endpoints, evenly by arc length', () => {
		// An L-shaped path: (0,0,0) -> (2,0,0) -> (2,2,0), total length 4.
		const input = [new Vector3(0, 0, 0), new Vector3(2, 0, 0), new Vector3(2, 2, 0)];
		const out = resamplePolyline(input, 5); // spacing 1 along arc length
		expect(out.length).toBe(5);
		expect(out[0].equals(input[0])).toBe(true);
		expect(out[4].equals(input[2])).toBe(true);
		// out[2] is at arc length 2 -> the corner (2,0,0).
		expect(out[2].distanceTo(new Vector3(2, 0, 0))).toBeLessThan(1e-9);
	});

	it('returns clones for degenerate inputs', () => {
		const single = [new Vector3(1, 2, 3)];
		expect(resamplePolyline(single, 5).map((p) => p.toArray())).toEqual([[1, 2, 3]]);
	});
});
