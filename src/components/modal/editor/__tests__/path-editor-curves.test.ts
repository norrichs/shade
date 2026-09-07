import type { BezierConfig, PointConfig2 } from '$lib/types';
import {
	addCurve,
	anchorDragsHandles,
	applyLimits,
	mirrorSmoothHandles,
	neighborPointMatch,
	pointOnRay,
	radialEndLock,
	removeCurve,
	splitCurves,
	togglePointType
} from '../path-editor';

const pt = (x: number, y: number, pointType?: 'smooth' | 'angled'): PointConfig2 =>
	pointType ? { type: 'PointConfig2', x, y, pointType } : { type: 'PointConfig2', x, y };

const curve = (points: PointConfig2[]): BezierConfig => ({
	type: 'BezierConfig',
	points: points as BezierConfig['points']
});

/**
 * Two curves joined at (10, 0). Built fresh per assertion — `applyLimits` used to
 * share `points` arrays with its input, so a shared fixture leaks between tests.
 */
const joined = (jointType?: 'smooth' | 'angled'): BezierConfig[] => [
	curve([pt(0, 0), pt(2, 0), pt(8, 0), pt(10, 0, jointType)]),
	curve([pt(10, 0, jointType), pt(12, 0), pt(18, 0), pt(20, 0)])
];

describe('addCurve', () => {
	it('appends a curve reaching `step` model units past the old end', () => {
		const result = addCurve(joined(), 4);
		expect(result).toHaveLength(3);
		expect(result[2].points[3].x).toBe(24);
		expect(result[2].points[0].x).toBe(20);
	});

	it('scales its handles to step, so a 0..1 viewBox stays on screen', () => {
		const result = addCurve([curve([pt(0, 0), pt(0.1, 0), pt(0.2, 0), pt(0.3, 0)])], 0.1);
		expect(result[1].points[3].x).toBeCloseTo(0.4);
		expect(result[1].points[1].x).toBeCloseTo(0.325);
	});

	it('does not mutate the input', () => {
		const input = joined();
		addCurve(input, 4);
		expect(input).toHaveLength(2);
		expect(input[1].points[3].pointType).toBeUndefined();
	});
});

describe('removeCurve', () => {
	it('drops the last curve', () => {
		expect(removeCurve(joined())).toHaveLength(1);
	});

	it('refuses to go below minCurves, where the renderer would throw', () => {
		const single = [curve([pt(0, 0), pt(1, 0), pt(2, 0), pt(3, 0)])];
		expect(removeCurve(single)).toHaveLength(1);
		expect(removeCurve(single, 1)).toHaveLength(1);
	});

	it('honours a higher floor', () => {
		expect(removeCurve(joined(), 2)).toHaveLength(2);
	});
});

describe('splitCurves', () => {
	it('turns one curve into two', () => {
		const result = splitCurves(joined());
		expect(result).toHaveLength(3);
	});

	it('keeps the run endpoints fixed', () => {
		const input = joined();
		const result = splitCurves(input);
		expect(result[0].points[0]).toMatchObject({ x: 0, y: 0 });
		expect(result[result.length - 1].points[3]).toMatchObject({ x: 20, y: 0 });
	});

	it('leaves the new curves sharing one anchor', () => {
		const result = splitCurves(joined());
		expect(result[0].points[3]).toMatchObject({
			x: result[1].points[0].x,
			y: result[1].points[0].y
		});
	});
});

describe('togglePointType', () => {
	it('flips an interior anchor and its partner together', () => {
		const result = togglePointType(joined(), 0, 3);
		expect(result[0].points[3].pointType).toBe('angled');
		expect(result[1].points[0].pointType).toBe('angled');
	});

	it('flips back to smooth', () => {
		const result = togglePointType(joined('angled'), 0, 3);
		expect(result[0].points[3].pointType).toBe('smooth');
		expect(result[1].points[0].pointType).toBe('smooth');
	});

	it('no-ops on direction handles', () => {
		const input = joined();
		expect(togglePointType(input, 0, 1)).toBe(input);
		expect(togglePointType(input, 0, 2)).toBe(input);
	});

	it('no-ops on the two terminal anchors, which have no partner', () => {
		const input = joined();
		expect(togglePointType(input, 0, 0)).toBe(input);
		expect(togglePointType(input, 1, 3)).toBe(input);
	});
});

describe('anchorDragsHandles', () => {
	it('carries the anchor’s own handle', () => {
		const curveDef = joined();
		const result = applyLimits({
			limits: [anchorDragsHandles],
			curveDef,
			curveIndex: 0,
			pointIndex: 0,
			newPoint: pt(0, 5),
			oldPoint: pt(0, 0)
		});
		expect(result[0].points[0]).toMatchObject({ x: 0, y: 5 });
		expect(result[0].points[1]).toMatchObject({ x: 2, y: 5 });
	});

	it('carries the partner anchor and its facing handle across a joint', () => {
		const result = applyLimits({
			limits: [anchorDragsHandles],
			curveDef: joined(),
			curveIndex: 0,
			pointIndex: 3,
			newPoint: pt(10, 4),
			oldPoint: pt(10, 0)
		});
		expect(result[0].points[3]).toMatchObject({ x: 10, y: 4 });
		expect(result[1].points[0]).toMatchObject({ x: 10, y: 4 });
		expect(result[0].points[2]).toMatchObject({ x: 8, y: 4 });
		expect(result[1].points[1]).toMatchObject({ x: 12, y: 4 });
	});

	it('composes with neighborPointMatch without double-moving the partner anchor', () => {
		const result = applyLimits({
			limits: [neighborPointMatch, anchorDragsHandles],
			curveDef: joined(),
			curveIndex: 0,
			pointIndex: 3,
			newPoint: pt(10, 4),
			oldPoint: pt(10, 0)
		});
		expect(result[1].points[0]).toMatchObject({ x: 10, y: 4 });
	});

	it('leaves direction handles alone', () => {
		const result = applyLimits({
			limits: [anchorDragsHandles],
			curveDef: joined(),
			curveIndex: 0,
			pointIndex: 1,
			newPoint: pt(2, 9),
			oldPoint: pt(2, 0)
		});
		expect(result[0].points[1]).toMatchObject({ x: 2, y: 9 });
		expect(result[0].points[0]).toMatchObject({ x: 0, y: 0 });
	});
});

describe('mirrorSmoothHandles', () => {
	it('swings the partner handle colinear through a smooth joint', () => {
		const result = applyLimits({
			limits: [mirrorSmoothHandles],
			curveDef: joined('smooth'),
			curveIndex: 0,
			pointIndex: 2,
			newPoint: pt(10, 3),
			oldPoint: pt(8, 0)
		});
		// dragged handle sits straight above the joint at (10,0), so the partner
		// handle must drop straight below it, keeping its length of 2.
		expect(result[1].points[1].x).toBeCloseTo(10);
		expect(result[1].points[1].y).toBeCloseTo(-2);
	});

	it('preserves the partner handle length rather than mirroring position', () => {
		const curveDef = joined('smooth');
		curveDef[1].points[1] = pt(16, 0); // partner handle length 6
		const result = applyLimits({
			limits: [mirrorSmoothHandles],
			curveDef,
			curveIndex: 0,
			pointIndex: 2,
			newPoint: pt(10, 1),
			oldPoint: pt(8, 0)
		});
		expect(Math.hypot(result[1].points[1].x - 10, result[1].points[1].y - 0)).toBeCloseTo(6);
	});

	it('leaves an angled joint free', () => {
		const result = applyLimits({
			limits: [mirrorSmoothHandles],
			curveDef: joined('angled'),
			curveIndex: 0,
			pointIndex: 2,
			newPoint: pt(10, 3),
			oldPoint: pt(8, 0)
		});
		expect(result[1].points[1]).toMatchObject({ x: 12, y: 0 });
	});

	it('leaves the partner untouched when the handle lands on its anchor, where the legacy produced NaN', () => {
		const result = applyLimits({
			limits: [mirrorSmoothHandles],
			curveDef: joined('smooth'),
			curveIndex: 0,
			pointIndex: 2,
			newPoint: pt(10, 0),
			oldPoint: pt(8, 0)
		});
		expect(Number.isNaN(result[1].points[1].x)).toBe(false);
		expect(result[1].points[1]).toMatchObject({ x: 12, y: 0 });
	});
});

describe('radialEndLock', () => {
	it('pins both terminal anchors to the wedge rays at a shared radius', () => {
		const limitAngle = (Math.PI * 2) / 6;
		const result = applyLimits({
			limits: [radialEndLock(limitAngle)],
			curveDef: joined(),
			curveIndex: 0,
			pointIndex: 0,
			newPoint: pt(0, 5),
			oldPoint: pt(0, 0)
		});
		const first = result[0].points[0];
		const last = result[1].points[3];
		expect(Math.hypot(first.x, first.y)).toBeCloseTo(5);
		expect(Math.hypot(last.x, last.y)).toBeCloseTo(5);
		expect(first).toMatchObject({ x: expect.closeTo(0), y: expect.closeTo(5) });
		expect(last.x).toBeCloseTo(pointOnRay(5, limitAngle).x);
		expect(last.y).toBeCloseTo(pointOnRay(5, limitAngle).y);
	});

	it('takes the radius from whichever end was dragged', () => {
		const limitAngle = Math.PI / 2;
		const result = applyLimits({
			limits: [radialEndLock(limitAngle)],
			curveDef: joined(),
			curveIndex: 1,
			pointIndex: 3,
			newPoint: pt(-3, 4),
			oldPoint: pt(20, 0)
		});
		expect(Math.hypot(result[0].points[0].x, result[0].points[0].y)).toBeCloseTo(5);
		expect(Math.hypot(result[1].points[3].x, result[1].points[3].y)).toBeCloseTo(5);
	});

	it('leaves interior points alone', () => {
		const result = applyLimits({
			limits: [radialEndLock(Math.PI / 3)],
			curveDef: joined(),
			curveIndex: 0,
			pointIndex: 3,
			newPoint: pt(10, 7),
			oldPoint: pt(10, 0)
		});
		expect(result[0].points[3]).toMatchObject({ x: 10, y: 7 });
	});

	describe('with coupleRadius: false (reflected symmetry)', () => {
		// A reflected run is mirrored about the ray through its end anchor, and that
		// mirror preserves radius — so closure constrains only the two end ANGLES.
		// The ends may sit at different distances from the centre.
		const limitAngle = Math.PI / 6;

		it('pins the dragged end to its ray without moving the partner in or out', () => {
			const curveDef = joined();
			// Park the partner (last anchor) at radius 20 on its ray first.
			curveDef[1].points[3] = { ...curveDef[1].points[3], ...pointOnRay(20, limitAngle) };

			const result = applyLimits({
				limits: [radialEndLock(limitAngle, { coupleRadius: false })],
				curveDef,
				curveIndex: 0,
				pointIndex: 0,
				newPoint: pt(0, 5),
				oldPoint: pt(0, 0)
			});

			const first = result[0].points[0];
			const last = result[1].points[3];
			// Dragged end lands on its own ray at its own radius...
			expect(Math.hypot(first.x, first.y)).toBeCloseTo(5);
			// ...and the partner keeps the radius it had, rather than following to 5.
			expect(Math.hypot(last.x, last.y)).toBeCloseTo(20);
		});

		it('still holds the partner on its ray', () => {
			const curveDef = joined();
			curveDef[1].points[3] = { ...curveDef[1].points[3], ...pointOnRay(20, limitAngle) };

			const result = applyLimits({
				limits: [radialEndLock(limitAngle, { coupleRadius: false })],
				curveDef,
				curveIndex: 0,
				pointIndex: 0,
				newPoint: pt(0, 5),
				oldPoint: pt(0, 0)
			});

			const last = result[1].points[3];
			expect(last.x).toBeCloseTo(pointOnRay(20, limitAngle).x);
			expect(last.y).toBeCloseTo(pointOnRay(20, limitAngle).y);
		});

		it('defaults to coupling, so unreflected shapes are unaffected', () => {
			const result = applyLimits({
				limits: [radialEndLock(limitAngle)],
				curveDef: joined(),
				curveIndex: 0,
				pointIndex: 0,
				newPoint: pt(0, 5),
				oldPoint: pt(0, 0)
			});
			expect(Math.hypot(result[1].points[3].x, result[1].points[3].y)).toBeCloseTo(5);
		});
	});
});

describe('applyLimits deep clone', () => {
	it('does not write through to the caller’s points', () => {
		const curveDef = joined();
		applyLimits({
			limits: [anchorDragsHandles],
			curveDef,
			curveIndex: 0,
			pointIndex: 0,
			newPoint: pt(0, 99),
			oldPoint: pt(0, 0)
		});
		expect(curveDef[0].points[0]).toMatchObject({ x: 0, y: 0 });
		expect(curveDef[0].points[1]).toMatchObject({ x: 2, y: 0 });
	});
});

describe('pointOnRay', () => {
	it('puts angle 0 straight up the +y axis', () => {
		expect(pointOnRay(5, 0).x).toBeCloseTo(0);
		expect(pointOnRay(5, 0).y).toBeCloseTo(5);
	});

	it('sweeps toward -x', () => {
		expect(pointOnRay(5, Math.PI / 2).x).toBeCloseTo(-5);
		expect(pointOnRay(5, Math.PI / 2).y).toBeCloseTo(0);
	});
});
