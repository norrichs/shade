import { describe, it, expect } from '@jest/globals';
import {
	DEFAULT_POST_PROCESS,
	defaultDropCurve,
	sampleDropCurve,
	lookup,
	LUT_SAMPLES
} from '../hole-drop-config';
import type { BezierConfig, PointConfig2 } from '$lib/types';

const pt = (x: number, y: number): PointConfig2 => ({ type: 'PointConfig2', x, y });
const curve = (
	p0: PointConfig2,
	c1: PointConfig2,
	c2: PointConfig2,
	p1: PointConfig2
): BezierConfig => ({ type: 'BezierConfig', points: [p0, c1, c2, p1] });

describe('DEFAULT_POST_PROCESS', () => {
	it('drops nothing', () => {
		expect(DEFAULT_POST_PROCESS).toEqual({ dropHoles: { mode: 'none' }, runSeed: 0 });
	});
});

describe('sampleDropCurve', () => {
	it('samples a flat curve to a constant table', () => {
		const lut = sampleDropCurve([curve(pt(0, 0.4), pt(0.33, 0.4), pt(0.66, 0.4), pt(1, 0.4))]);

		expect(lut).toHaveLength(LUT_SAMPLES);
		expect(lut[0]).toBeCloseTo(0.4, 6);
		expect(lut[50]).toBeCloseTo(0.4, 6);
		expect(lut[LUT_SAMPLES - 1]).toBeCloseTo(0.4, 6);
	});

	it('samples a rising diagonal so y tracks x', () => {
		const lut = sampleDropCurve([curve(pt(0, 0), pt(1 / 3, 1 / 3), pt(2 / 3, 2 / 3), pt(1, 1))]);

		expect(lut[0]).toBeCloseTo(0, 3);
		expect(lut[25]).toBeCloseTo(0.25, 2);
		expect(lut[50]).toBeCloseTo(0.5, 2);
		expect(lut[LUT_SAMPLES - 1]).toBeCloseTo(1, 3);
	});

	it('clamps values outside the unit square', () => {
		const lut = sampleDropCurve([curve(pt(0, -0.5), pt(0.33, -0.5), pt(0.66, 1.9), pt(1, 1.9))]);

		expect(Math.min(...lut)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...lut)).toBeLessThanOrEqual(1);
	});

	it('returns an all-zero table for an empty curve', () => {
		expect(sampleDropCurve([])).toEqual(new Array(LUT_SAMPLES).fill(0));
	});

	it('samples the default curve to a constant half', () => {
		const lut = sampleDropCurve(defaultDropCurve());
		expect(lut[0]).toBeCloseTo(0.5, 6);
		expect(lut[LUT_SAMPLES - 1]).toBeCloseTo(0.5, 6);
	});

	it('walks a multi-curve run, picking the sub-curve that covers x', () => {
		// Two curves: [0, 0.5] flat at 0.2, then [0.5, 1] flat at 0.9.
		const lut = sampleDropCurve([
			curve(pt(0, 0.2), pt(0.15, 0.2), pt(0.35, 0.2), pt(0.5, 0.2)),
			curve(pt(0.5, 0.9), pt(0.65, 0.9), pt(0.85, 0.9), pt(1, 0.9))
		]);

		expect(lut[10]).toBeCloseTo(0.2, 3);
		expect(lut[90]).toBeCloseTo(0.9, 3);
	});
});

describe('lookup', () => {
	const lut = [0, 0.5, 1];

	it('interpolates between samples and clamps out-of-range x', () => {
		expect(lookup(lut, 0)).toBeCloseTo(0, 6);
		expect(lookup(lut, 0.25)).toBeCloseTo(0.25, 6);
		expect(lookup(lut, 1)).toBeCloseTo(1, 6);
		expect(lookup(lut, -3)).toBeCloseTo(0, 6);
		expect(lookup(lut, 9)).toBeCloseTo(1, 6);
	});

	it('returns 0 for an empty table', () => {
		expect(lookup([], 0.5)).toBe(0);
	});
});
