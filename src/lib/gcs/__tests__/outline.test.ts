import { describe, it, expect } from '@jest/globals';
import { Vector2 } from 'three';

import {
	largestLoop,
	orientCCW,
	resampleByArcLength,
	signedArea,
	startIndexedLoop
} from '../outline';

const v = (x: number, y: number) => new Vector2(x, y);
const rotateStart = (loop: Vector2[], by: number) => [...loop.slice(by), ...loop.slice(0, by)];
const circle = (r: number, n: number, phase = 0) =>
	Array.from({ length: n }, (_, i) => {
		const a = phase + (i / n) * Math.PI * 2;
		return v(r * Math.cos(a), r * Math.sin(a));
	});

describe('outline', () => {
	it('orients a clockwise square counter-clockwise', () => {
		const clockwise = [v(-1, -1), v(-1, 1), v(1, 1), v(1, -1)];
		expect(signedArea(clockwise)).toBeLessThan(0);
		expect(signedArea(orientCCW(clockwise))).toBeCloseTo(4, 12);
	});

	it('picks the loop with the largest area', () => {
		const small = circle(1, 16);
		const big = circle(3, 16);
		expect(largestLoop([small, big])).toBe(big);
	});

	it('starts a loop around the axis where it crosses +X', () => {
		const start = startIndexedLoop(circle(3, 31, 2))[0];
		expect(start.x).toBeCloseTo(3, 1);
		expect(start.y).toBeCloseTo(0, 12);
	});

	it('takes the outermost crossing of the +X ray from the centroid', () => {
		// A square with a slot cut down from the top: area centroid (-8/21, -4/21);
		// the ray from it toward +X crosses x = 1, 3 and 5.
		const slotted = [v(-5, -5), v(5, -5), v(5, 5), v(3, 5), v(3, -3), v(1, -3), v(1, 5), v(-5, 5)];
		const start = startIndexedLoop(slotted)[0];
		expect(start.x).toBeCloseTo(5, 12);
		expect(start.y).toBeCloseTo(-4 / 21, 12);
	});

	it('keeps the start direction steady as an off-axis loop drifts across +X', () => {
		// The reviewer's probe: r = 1.5 circles whose centres straddle the +X ray from the origin.
		[1.4, 1.5, 1.6].forEach((cy, i) => {
			const centre = v(0, cy);
			const loop = circle(1.5, 40, 0.37 * i).map((p) => p.add(centre));
			const direction = startIndexedLoop(loop)[0].clone().sub(centre).normalize();
			expect(direction.x).toBeCloseTo(1, 9);
			expect(direction.y).toBeCloseTo(0, 9);
		});
	});

	it('starts a loop away from the axis at the same point regardless of vertex order', () => {
		const offAxis = circle(2, 20, 0.3).map((p) => p.add(v(10, 10)));
		const a = startIndexedLoop(offAxis)[0];
		const b = startIndexedLoop(rotateStart(offAxis, 7))[0];
		expect(a.distanceTo(b)).toBeLessThan(1e-9);
	});

	it('returns a counter-clockwise loop', () => {
		const clockwise = circle(3, 24).reverse();
		expect(signedArea(startIndexedLoop(clockwise))).toBeGreaterThan(0);
	});

	it('resamples at equal arc length from the first point', () => {
		const square = [v(1, -1), v(1, 1), v(-1, 1), v(-1, -1)];
		const points = resampleByArcLength(square, 8);
		expect(points).toHaveLength(8);
		expect(points[0].equals(square[0])).toBe(true);
		points.forEach((p, k) => {
			expect(p.distanceTo(points[(k + 1) % 8])).toBeCloseTo(1, 9);
		});
	});

	it('does not twist a shape across scales', () => {
		const roundedRect = (s: number) =>
			Array.from({ length: 64 }, (_, i) => {
				const a = (i / 64) * Math.PI * 2 + 0.4;
				const c = Math.cos(a);
				const d = Math.sin(a);
				const r = 1 / Math.pow(Math.pow(Math.abs(c) / 3, 4) + Math.pow(Math.abs(d) / 2, 4), 0.25);
				return v(r * c * s, r * d * s);
			});
		// Unit directions, not atan2: a point on -X can read as -π at one scale and π at another.
		const directions = [1, 1.5, 2].map((s) =>
			resampleByArcLength(startIndexedLoop(roundedRect(s)), 16).map((p) => p.clone().normalize())
		);
		directions[0].forEach((d, k) => {
			expect(directions[1][k].distanceTo(d)).toBeLessThan(1e-6);
			expect(directions[2][k].distanceTo(d)).toBeLessThan(1e-6);
		});
	});
});
