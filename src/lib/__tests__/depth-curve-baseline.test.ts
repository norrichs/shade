import { describe, it, expect } from '@jest/globals';

import { generateSections } from '../generate-level';
import { generateLevelPrototype } from '../generate-shape';
import { generateDefaultGlobuleConfig } from '../shades-config';
import { DEFAULT_DEPTH_CURVE_BASELINE, type DepthCurveConfig } from '../types';

/** A flat depth curve pinned at `x`, i.e. a constant depth of x / baseline. */
const depthCurve = (x: number, depthCurveBaseline: number): DepthCurveConfig => ({
	type: 'DepthCurveConfig',
	depthCurveBaseline,
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig2', x, y: -100 },
				{ type: 'PointConfig2', x, y: -75 },
				{ type: 'PointConfig2', x, y: 75 },
				{ type: 'PointConfig2', x, y: 100 }
			]
		}
	]
});

/**
 * How far a mid-height cross-section deviates from a circle. Depth interpolates each
 * vertex between the level's inscribed radius and its own, so spread 0 means the
 * level has collapsed to a circle and larger spreads mean more pronounced lobes.
 */
const midLevelRadiusSpread = (config: DepthCurveConfig): number => {
	const globule = generateDefaultGlobuleConfig();
	const prototype = generateLevelPrototype(globule.shapeConfig, globule.levelConfig);
	const sections = generateSections(
		globule.levelConfig,
		globule.silhouetteConfig,
		config,
		prototype
	);
	const mid = sections[Math.floor(sections.length / 2)];
	const radii = mid.points.map((p) => Math.hypot(p.x, p.y));
	return Math.max(...radii) - Math.min(...radii);
};

describe('depthCurveBaseline', () => {
	it('treats a curve sitting on the baseline as full shape', () => {
		const atBaseline = midLevelRadiusSpread(depthCurve(100, 100));
		const halfBaseline = midLevelRadiusSpread(depthCurve(50, 100));

		expect(atBaseline).toBeGreaterThan(0);
		// depth 0.5 keeps half the deviation from the inscribed circle
		expect(halfBaseline).toBeCloseTo(atBaseline / 2, 4);
	});

	it('rescales depth with the baseline rather than a hardcoded 100', () => {
		// x=50 against a baseline of 50 is depth 1 — the same full shape x=100/100 gives.
		expect(midLevelRadiusSpread(depthCurve(50, 50))).toBeCloseTo(
			midLevelRadiusSpread(depthCurve(100, 100)),
			4
		);
		// ...and x=100 against a baseline of 50 is depth 2, doubling the lobing.
		expect(midLevelRadiusSpread(depthCurve(100, 50))).toBeCloseTo(
			midLevelRadiusSpread(depthCurve(100, 100)) * 2,
			4
		);
	});

	it('collapses the cross-section to a circle at depth 0', () => {
		expect(midLevelRadiusSpread(depthCurve(0, 100))).toBeCloseTo(0, 6);
	});

	it('falls back to the default baseline rather than dividing by zero', () => {
		// Configs saved before the field was honored can carry 0 or omit it entirely.
		const zero = midLevelRadiusSpread(depthCurve(100, 0));
		expect(Number.isFinite(zero)).toBe(true);
		expect(zero).toBeCloseTo(
			midLevelRadiusSpread(depthCurve(100, DEFAULT_DEPTH_CURVE_BASELINE)),
			6
		);
	});
});
