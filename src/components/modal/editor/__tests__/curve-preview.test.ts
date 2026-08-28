import type { BezierConfig, PointConfig2 } from '$lib/types';
import {
	fillPathToAxis,
	mirrorCurvesAcrossY,
	pathFromCurves,
	radializeCurves,
	reverseReflectCurves,
	rotateCurvesAroundOrigin
} from '../curve-preview';

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
const twoCurves = () => [
	curve([0, 0], [1, 0], [2, 0], [3, 0]),
	curve([3, 0], [4, 1], [5, 2], [6, 3])
];

describe('pathFromCurves', () => {
	it('emits a move to the first anchor then one cubic per curve', () => {
		expect(pathFromCurves(oneCurve())).toBe('M 0 0 C 1 0, 2 0, 3 0');
	});

	it('chains curves without repeating the shared anchor', () => {
		expect(pathFromCurves(twoCurves())).toBe('M 0 0 C 1 0, 2 0, 3 0 C 4 1, 5 2, 6 3');
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

describe('reverseReflectCurves', () => {
	it('mirrors and reverses so the result continues from the input end', () => {
		const input = twoCurves();
		const result = reverseReflectCurves(input);
		// input ends at (6, 3); the reflection should start at (-6, 3)
		expect([result[0].points[0].x, result[0].points[0].y]).toEqual([-6, 3]);
	});

	it('does not mutate the input', () => {
		const input = twoCurves();
		reverseReflectCurves(input);
		expect(input[0].points[0].x).toBe(0);
	});
});

describe('rotateCurvesAroundOrigin', () => {
	it('rotates a quarter turn exactly', () => {
		const [rotated] = rotateCurvesAroundOrigin(
			[curve([1, 0], [1, 0], [1, 0], [1, 0])],
			Math.PI / 2
		);
		expect(rotated.points[0].x).toBeCloseTo(0);
		expect(rotated.points[0].y).toBeCloseTo(1);
	});

	it('handles negative-x points, which the legacy atan(y/x) folded into the wrong quadrant', () => {
		const [rotated] = rotateCurvesAroundOrigin(
			[curve([-1, 0], [-1, 0], [-1, 0], [-1, 0])],
			Math.PI
		);
		expect(rotated.points[0].x).toBeCloseTo(1);
		expect(rotated.points[0].y).toBeCloseTo(0);
	});

	it('leaves a point on the y-axis finite, where the legacy divided by zero', () => {
		const [rotated] = rotateCurvesAroundOrigin(
			[curve([0, 2], [0, 2], [0, 2], [0, 2])],
			Math.PI / 2
		);
		expect(rotated.points[0].x).toBeCloseTo(-2);
		expect(rotated.points[0].y).toBeCloseTo(0);
		expect(Number.isNaN(rotated.points[0].x)).toBe(false);
	});

	it('preserves radius', () => {
		const [rotated] = rotateCurvesAroundOrigin([curve([3, 4], [3, 4], [3, 4], [3, 4])], 1.234);
		expect(Math.hypot(rotated.points[0].x, rotated.points[0].y)).toBeCloseTo(5);
	});
});

describe('radializeCurves', () => {
	it('emits exactly symmetryNumber copies, not the legacy off-by-one', () => {
		const result = radializeCurves(oneCurve(), { symmetryNumber: 6, reflect: false });
		expect(result).toHaveLength(6);
	});

	it('doubles the unit when reflecting', () => {
		const result = radializeCurves(twoCurves(), { symmetryNumber: 3, reflect: true });
		expect(result).toHaveLength(3 * 2 * 2);
	});

	it('returns empty for a degenerate symmetry number', () => {
		expect(radializeCurves(oneCurve(), { symmetryNumber: 0, reflect: false })).toEqual([]);
	});

	it('returns empty for no curves', () => {
		expect(radializeCurves([], { symmetryNumber: 5, reflect: false })).toEqual([]);
	});
});
