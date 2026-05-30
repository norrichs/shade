import { Vector3 } from 'three';
import { generateSeeds, buildAreaTable, AREA_SCALE, generateAreaWeightedSeeds } from '../generate-seeds';
import type { CenterProjectionSeedMethod, SurfaceTriangle, AreaWeightedSeedMethod } from '../types';

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
		const seeds = generateSeeds(method, new Vector3(0, 0, 0), intersect, []);
		expect(seeds).toHaveLength(10);
	});

	it('returns points on the sphere surface', () => {
		const intersect = makeSphereIntersector(5);
		const seeds = generateSeeds(method, new Vector3(0, 0, 0), intersect, []);
		seeds.forEach((seed) => {
			expect(seed.length()).toBeCloseTo(5, 4);
		});
	});

	it('produces deterministic results for the same seed', () => {
		const intersect = makeSphereIntersector(5);
		const seeds1 = generateSeeds(method, new Vector3(0, 0, 0), intersect, []);
		const seeds2 = generateSeeds(method, new Vector3(0, 0, 0), intersect, []);
		seeds1.forEach((s, i) => {
			expect(s.x).toBeCloseTo(seeds2[i].x, 10);
			expect(s.y).toBeCloseTo(seeds2[i].y, 10);
			expect(s.z).toBeCloseTo(seeds2[i].z, 10);
		});
	});

	it('produces different results for different seeds', () => {
		const intersect = makeSphereIntersector(5);
		const differentMethod = { ...method, seed: 99 };
		const seeds1 = generateSeeds(method, new Vector3(0, 0, 0), intersect, []);
		const seeds2 = generateSeeds(differentMethod, new Vector3(0, 0, 0), intersect, []);
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

function pointInTriangle(p: Vector3, t: SurfaceTriangle, eps = 1e-6): boolean {
	const [a, b, c] = t;
	const v0 = c.clone().sub(a);
	const v1 = b.clone().sub(a);
	const v2 = p.clone().sub(a);
	const dot00 = v0.dot(v0);
	const dot01 = v0.dot(v1);
	const dot02 = v0.dot(v2);
	const dot11 = v1.dot(v1);
	const dot12 = v1.dot(v2);
	const denom = dot00 * dot11 - dot01 * dot01;
	if (Math.abs(denom) < eps) return false;
	const u = (dot11 * dot02 - dot01 * dot12) / denom;
	const v = (dot00 * dot12 - dot01 * dot02) / denom;
	return u >= -eps && v >= -eps && u + v <= 1 + eps;
}

describe('generateAreaWeightedSeeds', () => {
	const small = tri(0, 0, 0, 2, 0, 0, 0, 2, 0);
	const large = tri(10, 0, 0, 14, 0, 0, 10, 4, 0);

	const method: AreaWeightedSeedMethod = {
		type: 'areaWeighted',
		pointCount: 40,
		seed: 42
	};

	it('returns exactly pointCount seeds', () => {
		const seeds = generateAreaWeightedSeeds(method, [small, large]);
		expect(seeds).toHaveLength(40);
	});

	it('is deterministic for the same seed', () => {
		const a = generateAreaWeightedSeeds(method, [small, large]);
		const b = generateAreaWeightedSeeds(method, [small, large]);
		a.forEach((s, i) => {
			expect(s.x).toBeCloseTo(b[i].x, 10);
			expect(s.y).toBeCloseTo(b[i].y, 10);
			expect(s.z).toBeCloseTo(b[i].z, 10);
		});
	});

	it('places every seed on a surface triangle', () => {
		const seeds = generateAreaWeightedSeeds(method, [small, large]);
		seeds.forEach((s) => {
			expect(pointInTriangle(s, small) || pointInTriangle(s, large)).toBe(true);
		});
	});

	it('assigns proportionally more seeds to the larger-area triangle', () => {
		// small area = 2, large area = 8 -> large should get ~4x the seeds.
		const seeds = generateAreaWeightedSeeds({ ...method, pointCount: 400 }, [small, large]);
		const inSmall = seeds.filter((s) => pointInTriangle(s, small)).length;
		const inLarge = seeds.filter((s) => pointInTriangle(s, large)).length;
		expect(inLarge).toBeGreaterThan(inSmall * 2);
	});

	it('returns no seeds when given no triangles', () => {
		expect(generateAreaWeightedSeeds(method, [])).toEqual([]);
	});
});
