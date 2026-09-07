import { describe, it, expect } from '@jest/globals';

import {
	fillPathToAxis,
	mirrorCurvesAcrossY,
	pathFromCurves,
	radializeCurves
} from '../curve-preview';
import { radialShapeCurveConfigs } from '$lib/geometry/radial-shape';
import { generateDefaultRadialShapeConfig } from '$lib/shades-config';
import type { BezierConfig, PointConfig2 } from '$lib/types';

const sampleMethod = { method: 'divideCurve', divisions: 4 } as const;

const pt = (x: number, y: number): PointConfig2 => ({ type: 'PointConfig2', x, y });

const curve = (
	p0: [number, number],
	p1: [number, number],
	p2: [number, number],
	p3: [number, number]
): BezierConfig => ({
	type: 'BezierConfig',
	points: [pt(...p0), pt(...p1), pt(...p2), pt(...p3)]
});

// Fresh fixtures per assertion: these helpers clone, but a shared literal would
// still be easy to mutate accidentally from a future test.
const oneCurve = () => [curve([0, 0], [1, 0], [2, 0], [3, 0])];

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

describe('radializeCurves', () => {
	it('closes the outline for an unreflected shape', () => {
		// Regression: the preview used to be handed y-flipped coordinates and
		// rotate the wrong way round, leaving a 156-unit gap at every joint on
		// the radius-100 default — the seven tangential lobes in the bug report.
		const config = generateDefaultRadialShapeConfig(7, sampleMethod);
		const preview = radializeCurves(config.curves, {
			symmetryNumber: 7,
			symmetry: 'radial'
		});
		expect(maxJointGap(preview)).toBeLessThan(1e-9);
	});

	it('closes the outline for a reflected shape', () => {
		const config = generateDefaultRadialShapeConfig(7, sampleMethod, 'radial-lateral');
		const preview = radializeCurves(config.curves, {
			symmetryNumber: 7,
			symmetry: 'radial-lateral'
		});
		expect(maxJointGap(preview)).toBeLessThan(1e-9);
	});

	it('draws exactly what the generator generates', () => {
		// The preview and the 3D geometry must not be able to drift apart.
		for (const symmetry of ['radial', 'radial-lateral'] as const) {
			for (const n of [3, 5, 7]) {
				const config = generateDefaultRadialShapeConfig(n, sampleMethod, symmetry);
				const preview = radializeCurves(config.curves, { symmetryNumber: n, symmetry });
				expect(preview).toEqual(radialShapeCurveConfigs(config));
			}
		}
	});
});

describe('pathFromCurves', () => {
	const curveFrom = (x0: number, y0: number, x3: number, y3: number): BezierConfig => ({
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: x0, y: y0 },
			{ type: 'PointConfig2', x: x0, y: y0 },
			{ type: 'PointConfig2', x: x3, y: y3 },
			{ type: 'PointConfig2', x: x3, y: y3 }
		]
	});

	it('chains contiguous curves with a single move', () => {
		const d = pathFromCurves([curveFrom(0, 0, 10, 0), curveFrom(10, 0, 10, 10)]);
		expect(d.match(/M/g)).toHaveLength(1);
	});

	it('starts a new subpath at a genuine discontinuity instead of bridging it', () => {
		// A silent bridge is what turned gaps into phantom loops. A break must
		// look like a break.
		const d = pathFromCurves([curveFrom(0, 0, 10, 0), curveFrom(50, 50, 60, 50)]);
		expect(d.match(/M/g)).toHaveLength(2);
	});

	it('tolerates floating-point drift at a joint', () => {
		const d = pathFromCurves([curveFrom(0, 0, 10, 0), curveFrom(10 + 1e-12, 0, 10, 10)]);
		expect(d.match(/M/g)).toHaveLength(1);
	});

	it('returns an empty string for no curves', () => {
		expect(pathFromCurves([])).toBe('');
	});

	it('does not negate y', () => {
		expect(pathFromCurves([curve([0, 5], [1, 5], [2, 5], [3, 5])])).toContain('M 0 5');
	});
});

describe('fillPathToAxis', () => {
	it('closes the run back to the y-axis', () => {
		expect(fillPathToAxis([curve([1, 0], [2, 0], [3, 0], [4, 8])])).toBe(
			'M 0 0 L 1 0 C 2 0, 3 0, 4 8 L 0 8 Z'
		);
	});

	it('closes to the x-axis when asked', () => {
		expect(fillPathToAxis([curve([1, 2], [2, 0], [3, 0], [4, 8])], 'x')).toBe(
			'M 1 0 L 1 2 C 2 0, 3 0, 4 8 L 4 0 Z'
		);
	});
});

describe('mirrorCurvesAcrossY', () => {
	it('negates x and leaves y and ordering alone', () => {
		const [mirrored] = mirrorCurvesAcrossY(oneCurve());
		expect(mirrored.points.map((p) => [p.x, p.y])).toEqual([
			[-0, 0],
			[-1, 0],
			[-2, 0],
			[-3, 0]
		]);
	});

	it('does not mutate the input', () => {
		const input = oneCurve();
		mirrorCurvesAcrossY(input);
		expect(input[0].points[3].x).toBe(3);
	});
});
