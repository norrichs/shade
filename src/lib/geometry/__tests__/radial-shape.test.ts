import { describe, it, expect } from '@jest/globals';

import { radialSideCurveConfigs, radialShapeCurveConfigs, radialUnitAngle } from '../radial-shape';
import type { BezierConfig, ShapeConfig } from '$lib/types';

/** A single bezier spanning `unitAngle`, in the codebase's (-sin, cos) convention. */
const runSpanning = (unitAngle: number): BezierConfig[] => [
	{
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: 0, y: 100 },
			{
				type: 'PointConfig2',
				x: -Math.sin(unitAngle / 6) * 150,
				y: Math.cos(unitAngle / 6) * 150
			},
			{
				type: 'PointConfig2',
				x: -Math.sin((unitAngle * 5) / 6) * 150,
				y: Math.cos((unitAngle * 5) / 6) * 150
			},
			{
				type: 'PointConfig2',
				x: -Math.sin(unitAngle) * 100,
				y: Math.cos(unitAngle) * 100
			}
		]
	}
];

const shape = (symmetry: ShapeConfig['symmetry'], symmetryNumber: number): ShapeConfig => {
	const config = {
		type: 'ShapeConfig',
		symmetry,
		symmetryNumber,
		sampleMethod: { method: 'divideCurve', divisions: 4 },
		curves: []
	} as ShapeConfig;
	config.curves = runSpanning(radialUnitAngle(config));
	return config;
};

/**
 * The largest distance between a curve's start point and the previous curve's
 * end point, wrapping around. Zero means the outline closes cleanly; anything
 * else is a gap that `pathFromCurves` would render as a phantom loop.
 */
const maxJointGap = (curves: BezierConfig[]): number =>
	Math.max(
		...curves.map((curve, i) => {
			const previous = curves[(i - 1 + curves.length) % curves.length];
			return Math.hypot(
				curve.points[0].x - previous.points[3].x,
				curve.points[0].y - previous.points[3].y
			);
		})
	);

describe('radialUnitAngle', () => {
	it('spans a full wedge when the shape is not reflected', () => {
		expect(radialUnitAngle({ symmetry: 'radial', symmetryNumber: 7 })).toBeCloseTo(
			(Math.PI * 2) / 7,
			12
		);
	});

	it('spans a half wedge when the shape is reflected, so run + mirror fill the wedge', () => {
		expect(radialUnitAngle({ symmetry: 'radial-lateral', symmetryNumber: 7 })).toBeCloseTo(
			Math.PI / 7,
			12
		);
		expect(radialUnitAngle({ symmetry: 'lateral', symmetryNumber: 1 })).toBeCloseTo(Math.PI, 12);
	});
});

describe('radialSideCurveConfigs', () => {
	it('emits one side per repeat when not reflected', () => {
		expect(radialSideCurveConfigs(shape('radial', 7))).toHaveLength(7);
		expect(radialSideCurveConfigs(shape('asymmetric', 1))).toHaveLength(1);
	});

	it('emits a forward and a reflected side per repeat when reflected', () => {
		// Decided: a "side" is the authored run as authored, so a 7-fold
		// radial-lateral shape has 14 sides, not 7.
		expect(radialSideCurveConfigs(shape('radial-lateral', 7))).toHaveLength(14);
		expect(radialSideCurveConfigs(shape('lateral', 1))).toHaveLength(2);
	});

	it('closes the outline for every symmetry', () => {
		const cases: [ShapeConfig['symmetry'], number][] = [
			['radial', 3],
			['radial', 7],
			['asymmetric', 1],
			['radial-lateral', 3],
			['radial-lateral', 7],
			['lateral', 1]
		];
		for (const [symmetry, symmetryNumber] of cases) {
			const curves = radialShapeCurveConfigs(shape(symmetry, symmetryNumber));
			expect(maxJointGap(curves)).toBeLessThan(1e-9);
		}
	});

	it('keeps every point on the authored radius, so reflection does not rescale', () => {
		const curves = radialShapeCurveConfigs(shape('radial-lateral', 7));
		const anchorRadii = curves.map((c) => Math.hypot(c.points[0].x, c.points[0].y));
		for (const r of anchorRadii) expect(r).toBeCloseTo(100, 9);
	});

	it('does not mutate the input config', () => {
		const config = shape('radial-lateral', 5);
		const before = JSON.stringify(config);
		radialShapeCurveConfigs(config);
		expect(JSON.stringify(config)).toBe(before);
	});
});
