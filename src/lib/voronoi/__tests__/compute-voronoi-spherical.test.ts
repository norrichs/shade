import { Vector3 } from 'three';
import {
	toLonLat,
	fromLonLat,
	computeVoronoiSpherical,
	lloydRelaxSpherical
} from '../compute-voronoi-spherical';

describe('toLonLat', () => {
	const center = new Vector3(0, 0, 0);

	it('maps +X axis to lon=0, lat=0', () => {
		const [lon, lat] = toLonLat(new Vector3(1, 0, 0), center);
		expect(lon).toBeCloseTo(0, 5);
		expect(lat).toBeCloseTo(0, 5);
	});

	it('maps +Z axis to lat=90', () => {
		const [lon, lat] = toLonLat(new Vector3(0, 0, 1), center);
		expect(lat).toBeCloseTo(90, 5);
	});

	it('maps -Z axis to lat=-90', () => {
		const [lon, lat] = toLonLat(new Vector3(0, 0, -1), center);
		expect(lat).toBeCloseTo(-90, 5);
	});

	it('maps +Y axis to lon=90', () => {
		const [lon, lat] = toLonLat(new Vector3(0, 1, 0), center);
		expect(lon).toBeCloseTo(90, 5);
		expect(lat).toBeCloseTo(0, 5);
	});
});

describe('fromLonLat', () => {
	it('round-trips arbitrary 3D points', () => {
		const center = new Vector3(0, 0, 0);
		const points = [
			new Vector3(1, 2, 3),
			new Vector3(-4, 1, -2),
			new Vector3(0.5, 0.5, 0.5)
		];
		points.forEach((original) => {
			const [lon, lat] = toLonLat(original, center);
			const direction = fromLonLat(lon, lat);
			const restored = direction.multiplyScalar(original.length());
			expect(restored.x).toBeCloseTo(original.x, 4);
			expect(restored.y).toBeCloseTo(original.y, 4);
			expect(restored.z).toBeCloseTo(original.z, 4);
		});
	});
});

describe('computeVoronoiSpherical', () => {
	const seeds: [number, number][] = [
		[0, 0],
		[90, 0],
		[180, 0],
		[-90, 0],
		[0, 45],
		[0, -45]
	];

	it('returns edges', () => {
		const result = computeVoronoiSpherical(seeds);
		expect(result.edges.length).toBeGreaterThan(0);
		result.edges.forEach((edge) => {
			expect(edge.vertices).toHaveLength(2);
			expect(edge.cellIndices).toHaveLength(2);
		});
	});

	it('each edge references two different adjacent cells', () => {
		const result = computeVoronoiSpherical(seeds);
		result.edges.forEach((edge) => {
			expect(edge.cellIndices[0]).not.toBe(edge.cellIndices[1]);
			expect(edge.cellIndices[0]).toBeGreaterThanOrEqual(0);
			expect(edge.cellIndices[1]).toBeGreaterThanOrEqual(0);
			expect(edge.cellIndices[0]).toBeLessThan(seeds.length);
			expect(edge.cellIndices[1]).toBeLessThan(seeds.length);
		});
	});

	it('returns the original seeds', () => {
		const result = computeVoronoiSpherical(seeds);
		expect(result.seeds).toEqual(seeds);
	});
});

describe('lloydRelaxSpherical', () => {
	it('returns seeds unchanged when iterations is 0', () => {
		const seeds: [number, number][] = [
			[0, 0],
			[90, 45]
		];
		const relaxed = lloydRelaxSpherical(seeds, 0);
		expect(relaxed).toEqual(seeds);
	});

	it('produces valid lon/lat values after relaxation', () => {
		const seeds: [number, number][] = [
			[10, 10],
			[20, 10],
			[15, 50],
			[-30, -20]
		];
		const relaxed = lloydRelaxSpherical(seeds, 5);
		expect(relaxed).toHaveLength(seeds.length);
		relaxed.forEach(([lon, lat]) => {
			expect(lon).toBeGreaterThanOrEqual(-180);
			expect(lon).toBeLessThanOrEqual(180);
			expect(lat).toBeGreaterThanOrEqual(-90);
			expect(lat).toBeLessThanOrEqual(90);
		});
	});

	it('produces more uniform spacing after relaxation', () => {
		const clustered: [number, number][] = [
			[0, 0],
			[2, 1],
			[90, 45],
			[88, 44]
		];
		const relaxed = lloydRelaxSpherical(clustered, 20);
		const distBefore = Math.hypot(clustered[0][0] - clustered[1][0], clustered[0][1] - clustered[1][1]);
		const distAfter = Math.hypot(relaxed[0][0] - relaxed[1][0], relaxed[0][1] - relaxed[1][1]);
		expect(distAfter).toBeGreaterThan(distBefore);
	});
});
