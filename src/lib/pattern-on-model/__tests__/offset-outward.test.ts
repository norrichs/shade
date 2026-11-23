import { describe, it, expect } from '@jest/globals';
import { offsetOutward } from '../offset-outward';

const centroidDistance = (p: Float32Array, c = { x: 0, y: 0, z: 0 }) =>
	Math.hypot(
		(p[0] + p[3] + p[6]) / 3 - c.x,
		(p[1] + p[4] + p[7]) / 3 - c.y,
		(p[2] + p[5] + p[8]) / 3 - c.z
	);

describe('offsetOutward', () => {
	// A triangle in the plane z = 10, wound so its normal points either way.
	const up = () => new Float32Array([0, 0, 10, 1, 0, 10, 0, 1, 10]);
	const down = () => new Float32Array([0, 0, 10, 0, 1, 10, 1, 0, 10]);

	it('moves away from the center whichever way the triangle is wound', () => {
		for (const tri of [up(), down()]) {
			const before = centroidDistance(tri);
			offsetOutward(tri, { x: 0, y: 0, z: 0 }, 0.5);
			expect(tri[2]).toBeCloseTo(10.5);
			expect(tri[5]).toBeCloseTo(10.5);
			expect(centroidDistance(tri)).toBeGreaterThan(before);
		}
	});

	it('moves toward -z when the center is above the triangle', () => {
		const tri = up();
		offsetOutward(tri, { x: 0, y: 0, z: 20 }, 0.5);
		expect(tri[8]).toBeCloseTo(9.5);
	});

	it('leaves a degenerate triangle alone', () => {
		const tri = new Float32Array([1, 1, 1, 1, 1, 1, 2, 2, 2]);
		offsetOutward(tri, { x: 0, y: 0, z: 0 }, 1);
		expect(Array.from(tri)).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 2]);
	});
});
