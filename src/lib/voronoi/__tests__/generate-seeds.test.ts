import { Vector3 } from 'three';
import { generateSeeds, buildAreaTable, AREA_SCALE } from '../generate-seeds';
import type { CenterProjectionSeedMethod, SurfaceTriangle } from '../types';

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

const tri = (
	ax: number, ay: number, az: number,
	bx: number, by: number, bz: number,
	cx: number, cy: number, cz: number
): SurfaceTriangle => [
	new Vector3(ax, ay, az),
	new Vector3(bx, by, bz),
	new Vector3(cx, cy, cz)
];

describe('buildAreaTable', () => {
	// Right triangle in XY plane with legs 2 and 2 -> area 2.
	const small = tri(0, 0, 0, 2, 0, 0, 0, 2, 0);
	// Right triangle in XY plane with legs 4 and 4 -> area 8.
	const large = tri(0, 0, 0, 4, 0, 0, 0, 4, 0);

	it('produces one entry per triangle with width = floor(area * AREA_SCALE), min 1', () => {
		const { entries } = buildAreaTable([small, large]);
		expect(entries).toHaveLength(2);
		expect(entries[0].width).toBe(Math.floor(2 * AREA_SCALE));
		expect(entries[1].width).toBe(Math.floor(8 * AREA_SCALE));
	});

	it('produces monotonically increasing keyStart values and a totalArea equal to the sum of widths', () => {
		const { entries, totalArea } = buildAreaTable([small, large]);
		expect(entries[0].keyStart).toBe(0);
		expect(entries[1].keyStart).toBe(entries[0].width);
		expect(totalArea).toBe(entries[0].width + entries[1].width);
	});

	it('floors degenerate (zero-area) triangles to width 1', () => {
		const degenerate = tri(0, 0, 0, 1, 0, 0, 2, 0, 0); // collinear -> area 0
		const { entries } = buildAreaTable([degenerate]);
		expect(entries[0].width).toBe(1);
	});
});
