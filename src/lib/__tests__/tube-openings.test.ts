import { Vector3 } from 'three';
import { computeTubeOpenings } from '../tube-openings';
import type { Tube } from '../projection-geometry/types';

// A ring of `n` points of radius `r` around the z axis at height `z`.
const ring = (r: number, z: number, n = 8) =>
	Array.from({ length: n }, (_, i) => {
		const t = (i / n) * Math.PI * 2;
		return new Vector3(r * Math.cos(t), r * Math.sin(t), z);
	});

const tube = (...rings: Vector3[][]) =>
	({ sections: rings.map((points) => ({ points })), bands: [] }) as unknown as Tube;

describe('computeTubeOpenings', () => {
	test('measures the first and last section of a tube across X', () => {
		const openings = computeTubeOpenings([tube(ring(10, 0), ring(30, 50), ring(20, 100))]);
		expect(openings.map((o) => [o.tube, o.end])).toEqual([
			[0, 'start'],
			[0, 'end']
		]);
		expect(openings[0].width).toBeCloseTo(20);
		expect(openings[1].width).toBeCloseTo(40);
	});

	test('indicators sit on the ring nodes with least and greatest x', () => {
		const [start] = computeTubeOpenings([tube(ring(10, 0), ring(20, 100))]);
		expect(start.a.toArray()).toEqual([-10, expect.closeTo(0), 0]);
		expect(start.b.toArray()).toEqual([10, 0, 0]);
		expect(start.width).toBeCloseTo(start.b.x - start.a.x);
	});

	test('an end collapsed to a pole is not an opening', () => {
		const pole = ring(0, 0);
		const openings = computeTubeOpenings([tube(pole, ring(10, 50), ring(15, 100))]);
		expect(openings.map((o) => o.end)).toEqual(['end']);
	});

	test('each tube contributes its own openings with distinct ids', () => {
		const openings = computeTubeOpenings([
			tube(ring(1, 0), ring(2, 10)),
			tube(ring(3, 0), ring(4, 10))
		]);
		expect(openings.map((o) => o.tube)).toEqual([0, 0, 1, 1]);
		expect(new Set(openings.map((o) => o.id)).size).toBe(4);
	});

	test('a tube with fewer than two sections has no openings', () => {
		expect(computeTubeOpenings([tube(ring(1, 0))])).toEqual([]);
	});
});
