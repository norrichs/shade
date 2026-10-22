import { describe, it, expect } from '@jest/globals';
import { Vector2 } from 'three';

import { DEFAULT_GCS_EASE, ease, easeCurve, makePrototypeAt } from '../gcs-blend';
import type { BezierConfig, GcsBlend, LevelPrototype } from '#lib/types.js';

const square = (scale: number): LevelPrototype => ({
	center: new Vector2(0, 0),
	vertices: [
		new Vector2(scale, scale),
		new Vector2(-scale, scale),
		new Vector2(-scale, -scale),
		new Vector2(scale, -scale)
	]
});

const coords = (p: LevelPrototype) => p.vertices.map((v) => [v.x, v.y]);

const expectClose = (actual: LevelPrototype, expected: LevelPrototype) => {
	expect(actual.vertices).toHaveLength(expected.vertices.length);
	actual.vertices.forEach((v, k) => {
		expect(v.x).toBeCloseTo(expected.vertices[k].x, 12);
		expect(v.y).toBeCloseTo(expected.vertices[k].y, 12);
	});
	expect(actual.center.x).toBeCloseTo(expected.center.x, 12);
	expect(actual.center.y).toBeCloseTo(expected.center.y, 12);
};

const bezierBlend = (x1: number, y1: number, x2: number, y2: number): GcsBlend => ({
	mode: 'bezier',
	curve: easeCurve(x1, y1, x2, y2)
});

/** Slope of the eased value at u, by central difference (one-sided at the ends). */
const slope = (blend: GcsBlend | undefined, u: number, h = 1e-6) => {
	const a = Math.max(0, u - h);
	const b = Math.min(1, u + h);
	return (ease(blend, b) - ease(blend, a)) / (b - a);
};

describe('ease', () => {
	it('is identity for linear', () => {
		expect(ease({ mode: 'linear' }, 0.3)).toBe(0.3);
	});

	it('defaults to a smooth ease-in-out when no blend is set', () => {
		expect(ease(undefined, 0.7)).toBeCloseTo(ease(DEFAULT_GCS_EASE, 0.7), 12);
		expect(ease(undefined, 0.25)).toBeLessThan(0.25);
		expect(ease(undefined, 0.75)).toBeGreaterThan(0.75);
	});

	it('the default has zero slope at both ends, so there is no crease at a cross section', () => {
		expect(slope(undefined, 0)).toBeCloseTo(0, 3);
		expect(slope(undefined, 1)).toBeCloseTo(0, 3);
		expect(slope({ mode: 'linear' }, 0)).toBeCloseTo(1, 6);
	});

	it('maps 0 -> 0 and 1 -> 1 exactly for any curve, so each cross section is hit exactly', () => {
		for (const blend of [undefined, bezierBlend(0.9, 0.1, 0.1, 0.9), bezierBlend(0, 1, 1, 0)]) {
			expect(ease(blend, 0)).toBe(0);
			expect(ease(blend, 1)).toBe(1);
		}
	});

	it('a bezier with handles on the diagonal is linear', () => {
		const blend = bezierBlend(1 / 3, 1 / 3, 2 / 3, 2 / 3);
		for (const u of [0.1, 0.37, 0.5, 0.82]) expect(ease(blend, u)).toBeCloseTo(u, 9);
	});

	it('solves x for u rather than reading y at parameter u', () => {
		// Handles at x = 0, so x(s) = s³ lags the parameter. At s = 0.5, x = 0.125 and
		// y = 0.5, so ease(0.125) must be 0.5; reading y at s = u would give ~0.3.
		const blend = bezierBlend(0, 0.5, 0, 0.5);
		const s = 0.5;
		const x = 3 * (1 - s) * s * s * 0 + s ** 3; // handles at x = 0
		const y = 3 * (1 - s) ** 2 * s * 0.5 + 3 * (1 - s) * s * s * 0.5 + s ** 3;
		expect(ease(blend, x)).toBeCloseTo(y, 9);
	});

	it('is monotone for any handles inside the unit square', () => {
		const blend = bezierBlend(0.05, 0.95, 0.95, 0.05);
		let previous = -Infinity;
		for (let i = 0; i <= 100; i++) {
			const value = ease(blend, i / 100);
			expect(value).toBeGreaterThanOrEqual(previous - 1e-12);
			previous = value;
		}
	});

	it('clamps handles that stray outside the unit square instead of folding', () => {
		const wild: GcsBlend = {
			mode: 'bezier',
			curve: {
				...easeCurve(0, 0, 1, 1),
				points: [
					{ type: 'PointConfig2', x: 0, y: 0 },
					{ type: 'PointConfig2', x: 1.8, y: -0.5 },
					{ type: 'PointConfig2', x: -0.8, y: 1.5 },
					{ type: 'PointConfig2', x: 1, y: 1 }
				] as BezierConfig['points']
			}
		};
		for (let i = 0; i <= 20; i++) {
			const value = ease(wild, i / 20);
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThanOrEqual(1);
		}
	});
});

describe('makePrototypeAt with easing', () => {
	it('is continuous and smooth across an interior cross section by default', () => {
		const at = makePrototypeAt([square(1), square(2), square(4)], [0, 5, 10], 10, [
			undefined,
			undefined,
			undefined
		]);
		const size = (t: number) => at(t).vertices[0].x;
		const h = 1e-5;
		expect(size(0.5)).toBeCloseTo(2, 12);
		// Rate of change just below and just above the middle cross section both ~0.
		expect((size(0.5) - size(0.5 - h)) / h).toBeCloseTo(0, 2);
		expect((size(0.5 + h) - size(0.5)) / h).toBeCloseTo(0, 2);
	});

	it('linear blends keep the old crease (different slopes either side)', () => {
		const linear: GcsBlend = { mode: 'linear' };
		const at = makePrototypeAt([square(1), square(2), square(4)], [0, 5, 10], 10, [
			linear,
			linear,
			linear
		]);
		const size = (t: number) => at(t).vertices[0].x;
		const h = 1e-5;
		expect((size(0.5) - size(0.5 - h)) / h).toBeCloseTo(2, 3);
		expect((size(0.5 + h) - size(0.5)) / h).toBeCloseTo(4, 3);
	});
});

describe('makePrototypeAt', () => {
	const A = square(1);
	const B = square(2);
	const C = square(4);

	it('two prototypes at [0,10] blend linearly', () => {
		const at = makePrototypeAt([A, B], [0, 10], 10, [undefined, undefined]);
		expect(coords(at(0))).toEqual(coords(A));
		expect(coords(at(1))).toEqual(coords(B));
		expectClose(at(0.5), square(1.5));
	});

	it('three prototypes at [0,5,10] bracket the right pair', () => {
		const at = makePrototypeAt([A, B, C], [0, 5, 10], 10, [undefined, undefined, undefined]);
		expectClose(at(0.25), square(1.5));
		expectClose(at(0.75), square(3));
	});

	it('holds first below and last above the anchors', () => {
		const at = makePrototypeAt([A, B, C], [2, 5, 8], 10, [undefined, undefined, undefined]);
		expect(coords(at(0.1))).toEqual(coords(A));
		expect(coords(at(0.9))).toEqual(coords(C));
	});

	it('blends the center', () => {
		const A2 = { ...square(1), center: new Vector2(0, 0) };
		const B2 = { ...square(1), center: new Vector2(2, 4) };
		const at = makePrototypeAt([A2, B2], [0, 10], 10, [undefined, undefined]);
		expect(at(0.5).center.toArray()).toEqual([1, 2]);
	});

	it('one prototype always returns a clone of it', () => {
		const at = makePrototypeAt([A], [0], 10, [undefined]);
		expect(coords(at(0.37))).toEqual(coords(A));
		expect(at(0.37).vertices[0]).not.toBe(A.vertices[0]);
	});

	it('returns fresh objects every call', () => {
		const at = makePrototypeAt([A, B], [0, 10], 10, [undefined, undefined]);
		const first = at(0);
		first.vertices[0].set(99, 99);
		first.center.set(99, 99);
		expect(coords(at(0))).toEqual(coords(A));
		expect(at(0).center.toArray()).toEqual([0, 0]);
		expect(coords(A)[0]).toEqual([1, 1]);
	});
});
