import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';

import { deriveDistance, MM_PER_INCH } from '../units';

describe('deriveDistance', () => {
	it('converts a straight-line 3D distance into page units', () => {
		// 3-4-5 triangle in xy, so the distance is exactly 5 model units.
		const result = deriveDistance(new Vector3(0, 0, 0), new Vector3(3, 4, 0), 1);
		expect(result.mm).toBeCloseTo(5, 9);
		expect(result.inch).toBeCloseTo(5 / MM_PER_INCH, 9);
	});

	it('divides by pageScale, which is pattern units per mm', () => {
		const result = deriveDistance(new Vector3(0, 0, 0), new Vector3(0, 0, 10), 2);
		expect(result.mm).toBeCloseTo(5, 9);
	});

	it('measures across all three axes', () => {
		const result = deriveDistance(new Vector3(1, 2, 3), new Vector3(4, 6, 15), 1);
		expect(result.mm).toBeCloseTo(13, 9);
	});

	it('is order independent', () => {
		const a = new Vector3(-2, 7, 1);
		const b = new Vector3(5, -3, 9);
		expect(deriveDistance(a, b, 1.7).mm).toBeCloseTo(deriveDistance(b, a, 1.7).mm, 9);
	});

	it('stays finite when pageScale is zero rather than returning Infinity', () => {
		// Saved configs can carry a zero pageScale; a NaN/Infinity here would
		// poison the readout in the Pattern Layout panel.
		const result = deriveDistance(new Vector3(0, 0, 0), new Vector3(3, 4, 0), 0);
		expect(Number.isFinite(result.mm)).toBe(true);
		expect(Number.isFinite(result.inch)).toBe(true);
	});
});
