import { Vector3 } from 'three';
import type { PathSegment, Quadrilateral } from '$lib/types';
import { alignPrevBandPath } from '../align-prev-band';

const quad = (
	a: [number, number],
	b: [number, number],
	c: [number, number],
	d: [number, number]
): Quadrilateral => ({
	a: new Vector3(...a, 0),
	b: new Vector3(...b, 0),
	c: new Vector3(...c, 0),
	d: new Vector3(...d, 0)
});

describe('alignPrevBandPath', () => {
	it("translates the previous band's right edge onto this band's left edge", () => {
		const prev = quad([100, 0], [110, 0], [110, 10], [100, 10]);
		const reference = quad([0, 0], [10, 0], [10, 10], [0, 10]);
		const path: PathSegment[] = [
			['M', 110, 0],
			['L', 110, 10]
		];
		const aligned = alignPrevBandPath(path, prev, reference);
		expect(aligned[0][1]).toBeCloseTo(0);
		expect(aligned[0][2]).toBeCloseTo(0);
		expect(aligned[1][1]).toBeCloseTo(0);
		expect(aligned[1][2]).toBeCloseTo(10);
	});

	it('rotates when the two edges are not parallel', () => {
		// prev right edge b→c is vertical; reference left edge a→d is horizontal.
		const prev = quad([0, 5], [5, 5], [5, 15], [0, 15]);
		const reference = quad([0, 0], [0, -10], [10, -10], [10, 0]);
		const path: PathSegment[] = [
			['M', 5, 5],
			['L', 5, 15]
		];
		const aligned = alignPrevBandPath(path, prev, reference);
		// prev.b → reference.a, prev.c → reference.d
		expect(aligned[0][1]).toBeCloseTo(0);
		expect(aligned[0][2]).toBeCloseTo(0);
		expect(aligned[1][1]).toBeCloseTo(10);
		expect(aligned[1][2]).toBeCloseTo(0);
	});
});
