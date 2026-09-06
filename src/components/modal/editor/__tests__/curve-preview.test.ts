import { describe, it, expect } from '@jest/globals';

import { pathFromCurves, radializeCurves } from '../curve-preview';
import { radialShapeCurveConfigs } from '$lib/geometry/radial-shape';
import { generateDefaultRadialShapeConfig } from '$lib/shades-config';
import type { BezierConfig } from '$lib/types';

const sampleMethod = { method: 'divideCurve', divisions: 4 } as const;

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
});
