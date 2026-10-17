import { describe, it, expect } from '@jest/globals';
import { Vector2 } from 'three';

import { ease, makePrototypeAt } from '../gcs-blend';
import type { LevelPrototype } from '#lib/types.js';

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

describe('ease', () => {
	it('is identity for linear and undefined', () => {
		expect(ease({ mode: 'linear' }, 0.3)).toBe(0.3);
		expect(ease(undefined, 0.7)).toBe(0.7);
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
