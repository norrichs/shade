import { computeVoronoi, lloydRelax } from '../compute-voronoi';

describe('computeVoronoi', () => {
	const seeds: [number, number][] = [
		[0.2, 0.3],
		[0.5, 0.5],
		[0.8, 0.3],
		[0.5, 0.8]
	];

	it('returns edges connecting voronoi vertices', () => {
		const result = computeVoronoi(seeds);
		expect(result.edges.length).toBeGreaterThan(0);
		result.edges.forEach((edge) => {
			expect(edge.vertices).toHaveLength(2);
			expect(edge.vertices[0]).toHaveLength(2);
			expect(edge.vertices[1]).toHaveLength(2);
		});
	});

	it('each edge references two adjacent cells', () => {
		const result = computeVoronoi(seeds);
		result.edges.forEach((edge) => {
			expect(edge.cellIndices).toHaveLength(2);
			expect(edge.cellIndices[0]).not.toBe(edge.cellIndices[1]);
			expect(edge.cellIndices[0]).toBeGreaterThanOrEqual(0);
			expect(edge.cellIndices[1]).toBeGreaterThanOrEqual(0);
			expect(edge.cellIndices[0]).toBeLessThan(seeds.length);
			expect(edge.cellIndices[1]).toBeLessThan(seeds.length);
		});
	});

	it('returns the original seeds', () => {
		const result = computeVoronoi(seeds);
		expect(result.seeds).toEqual(seeds);
	});
});

describe('lloydRelax', () => {
	it('moves seeds toward cell centroids', () => {
		const seeds: [number, number][] = [
			[0.1, 0.1],
			[0.9, 0.1],
			[0.1, 0.9],
			[0.9, 0.9]
		];
		const relaxed = lloydRelax(seeds, 5);
		expect(relaxed).toHaveLength(seeds.length);
		relaxed.forEach(([u, v]) => {
			expect(u).toBeGreaterThan(0);
			expect(u).toBeLessThan(1);
			expect(v).toBeGreaterThan(0);
			expect(v).toBeLessThan(1);
		});
	});

	it('returns seeds unchanged when iterations is 0', () => {
		const seeds: [number, number][] = [
			[0.2, 0.3],
			[0.8, 0.7]
		];
		const relaxed = lloydRelax(seeds, 0);
		expect(relaxed).toEqual(seeds);
	});

	it('produces more uniform spacing after relaxation', () => {
		const clustered: [number, number][] = [
			[0.1, 0.1],
			[0.12, 0.11],
			[0.9, 0.9],
			[0.88, 0.91]
		];
		const relaxed = lloydRelax(clustered, 20);

		const distanceBefore = Math.hypot(
			clustered[0][0] - clustered[1][0],
			clustered[0][1] - clustered[1][1]
		);
		const distanceAfter = Math.hypot(
			relaxed[0][0] - relaxed[1][0],
			relaxed[0][1] - relaxed[1][1]
		);
		expect(distanceAfter).toBeGreaterThan(distanceBefore);
	});
});
