import { describe, it, expect } from '@jest/globals';
import { allPointsInUnitSquare } from '../path-editor';
import type { BezierConfig, PointConfig2 } from '$lib/types';

const pt = (x: number, y: number): PointConfig2 => ({ type: 'PointConfig2', x, y });

describe('allPointsInUnitSquare', () => {
	const curveDef = (): BezierConfig[] => [
		{ type: 'BezierConfig', points: [pt(0, 0), pt(0.3, 0.3), pt(0.6, 0.6), pt(1, 1)] }
	];

	it('clamps a dragged point into the unit square', () => {
		const result = allPointsInUnitSquare({
			curveIndex: 0,
			pointIndex: 1,
			curveDef: curveDef(),
			newPoint: pt(1.8, -0.4),
			oldPoint: pt(0.3, 0.3)
		});

		expect(result[0].points[1]).toEqual(pt(1, 0));
	});

	it('leaves an in-range point alone', () => {
		const result = allPointsInUnitSquare({
			curveIndex: 0,
			pointIndex: 2,
			curveDef: curveDef(),
			newPoint: pt(0.5, 0.5),
			oldPoint: pt(0.6, 0.6)
		});

		expect(result[0].points[2]).toEqual(pt(0.5, 0.5));
	});

	it('clamps control handles, not just the terminal anchors', () => {
		const result = allPointsInUnitSquare({
			curveIndex: 0,
			pointIndex: 2,
			curveDef: curveDef(),
			newPoint: pt(0.5, 3),
			oldPoint: pt(0.6, 0.6)
		});

		expect(result[0].points[2].y).toBe(1);
	});
});
