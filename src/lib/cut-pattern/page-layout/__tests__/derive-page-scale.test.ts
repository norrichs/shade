import { describe, it, expect } from '@jest/globals';
import { Box3, Vector3 } from 'three';

import { derivePageScaleForTarget } from '../derive-page-scale';
import { derivePageDimensions, deriveDistance } from '../units';

describe('derivePageScaleForTarget', () => {
	it('is the exact inverse of derivePageDimensions', () => {
		// pageScale is pattern-units per mm, so mm = units / pageScale and
		// therefore pageScale = units / targetMm.
		const bounds = new Box3(new Vector3(0, 0, 0), new Vector3(762, 340, 340));
		const scale = derivePageScaleForTarget(762, 500)!;
		expect(derivePageDimensions(bounds, scale).mm.x).toBeCloseTo(500, 9);
	});

	it('is the exact inverse of deriveDistance', () => {
		const a = new Vector3(0, 0, 0);
		const b = new Vector3(3, 4, 0); // distance 5
		const scale = derivePageScaleForTarget(5, 25)!;
		expect(deriveDistance(a, b, scale).mm).toBeCloseTo(25, 9);
	});

	it('rejects a non-positive target, which would give an infinite scale', () => {
		expect(derivePageScaleForTarget(762, 0)).toBeUndefined();
		expect(derivePageScaleForTarget(762, -5)).toBeUndefined();
	});

	it('rejects non-finite input', () => {
		expect(derivePageScaleForTarget(762, Number.NaN)).toBeUndefined();
		expect(derivePageScaleForTarget(Number.POSITIVE_INFINITY, 500)).toBeUndefined();
	});

	it('rejects a non-positive raw measurement', () => {
		// A zero-extent axis cannot be scaled to a target.
		expect(derivePageScaleForTarget(0, 500)).toBeUndefined();
	});
});

describe('derivePageDimensions zero guard', () => {
	it('stays finite when pageScale is zero rather than returning Infinity', () => {
		// Mirrors deriveDistance, which already guards. Without this, a zero
		// pageScale from an older saved config poisons every readout in the panel.
		const bounds = new Box3(new Vector3(0, 0, 0), new Vector3(10, 20, 30));
		const d = derivePageDimensions(bounds, 0);
		expect(Number.isFinite(d.mm.x)).toBe(true);
		expect(Number.isFinite(d.inch.z)).toBe(true);
	});

	it('is unchanged for a normal pageScale', () => {
		const bounds = new Box3(new Vector3(0, 0, 0), new Vector3(10, 20, 30));
		expect(derivePageDimensions(bounds, 2).mm).toEqual({ x: 5, y: 10, z: 15 });
	});
});
