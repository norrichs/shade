import { Vector3 } from 'three';
import { generateSeeds } from '../generate-seeds';
import type { CenterProjectionSeedMethod } from '../types';

const makeSphereIntersector = (radius: number) => {
	return (direction: Vector3): Vector3 | null => {
		return direction.clone().normalize().multiplyScalar(radius);
	};
};

describe('generateSeeds', () => {
	const method: CenterProjectionSeedMethod = {
		type: 'centerProjection',
		pointCount: 10,
		seed: 42
	};

	it('returns the requested number of seed points', () => {
		const intersect = makeSphereIntersector(5);
		const seeds = generateSeeds(method, new Vector3(0, 0, 0), intersect);
		expect(seeds).toHaveLength(10);
	});

	it('returns points on the sphere surface', () => {
		const intersect = makeSphereIntersector(5);
		const seeds = generateSeeds(method, new Vector3(0, 0, 0), intersect);
		seeds.forEach((seed) => {
			expect(seed.length()).toBeCloseTo(5, 4);
		});
	});

	it('produces deterministic results for the same seed', () => {
		const intersect = makeSphereIntersector(5);
		const seeds1 = generateSeeds(method, new Vector3(0, 0, 0), intersect);
		const seeds2 = generateSeeds(method, new Vector3(0, 0, 0), intersect);
		seeds1.forEach((s, i) => {
			expect(s.x).toBeCloseTo(seeds2[i].x, 10);
			expect(s.y).toBeCloseTo(seeds2[i].y, 10);
			expect(s.z).toBeCloseTo(seeds2[i].z, 10);
		});
	});

	it('produces different results for different seeds', () => {
		const intersect = makeSphereIntersector(5);
		const differentMethod = { ...method, seed: 99 };
		const seeds1 = generateSeeds(method, new Vector3(0, 0, 0), intersect);
		const seeds2 = generateSeeds(differentMethod, new Vector3(0, 0, 0), intersect);
		const allSame = seeds1.every(
			(s, i) =>
				Math.abs(s.x - seeds2[i].x) < 1e-10 &&
				Math.abs(s.y - seeds2[i].y) < 1e-10 &&
				Math.abs(s.z - seeds2[i].z) < 1e-10
		);
		expect(allSame).toBe(false);
	});
});
