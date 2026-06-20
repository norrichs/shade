import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import { buildMeshGraph } from '../mesh-graph';
import { DijkstraGeodesicSolver } from '../geodesic-solver';
import type { SurfaceTriangle } from '../../types';

/** A flat NxN grid of unit quads, each split into 2 triangles, in the z=0 plane. */
function gridMesh(n: number): SurfaceTriangle[] {
	const v = (x: number, y: number) => new Vector3(x, y, 0);
	const tris: SurfaceTriangle[] = [];
	for (let y = 0; y < n; y++) {
		for (let x = 0; x < n; x++) {
			tris.push([v(x, y), v(x + 1, y), v(x, y + 1)]);
			tris.push([v(x + 1, y), v(x + 1, y + 1), v(x, y + 1)]);
		}
	}
	return tris;
}

describe('DijkstraGeodesicSolver', () => {
	it('returns 0 distance at each source and nearest-source labels', () => {
		const g = buildMeshGraph(gridMesh(4));
		const solver = new DijkstraGeodesicSolver(g);
		const s0 = g.positions.findIndex((p) => p.distanceTo(new Vector3(0, 0, 0)) < 1e-6);
		const s1 = g.positions.findIndex((p) => p.distanceTo(new Vector3(4, 4, 0)) < 1e-6);
		const field = solver.solveMultiSource([s0, s1]);
		expect(field[s0].distance).toBeCloseTo(0, 9);
		expect(field[s1].distance).toBeCloseTo(0, 9);
		expect(field[s0].nearestSeed).toBe(0); // first source -> seed index 0
		expect(field[s1].nearestSeed).toBe(1);
	});

	it('labels each vertex by its nearest source', () => {
		const g = buildMeshGraph(gridMesh(4));
		const solver = new DijkstraGeodesicSolver(g);
		const s0 = g.positions.findIndex((p) => p.distanceTo(new Vector3(0, 0, 0)) < 1e-6);
		const s1 = g.positions.findIndex((p) => p.distanceTo(new Vector3(4, 4, 0)) < 1e-6);
		const field = solver.solveMultiSource([s0, s1]);
		const near00 = g.positions.findIndex((p) => p.distanceTo(new Vector3(1, 1, 0)) < 1e-6);
		const near44 = g.positions.findIndex((p) => p.distanceTo(new Vector3(3, 3, 0)) < 1e-6);
		expect(field[near00].nearestSeed).toBe(0);
		expect(field[near44].nearestSeed).toBe(1);
	});

	it('distance along grid edges from a single source is finite and >= straight-line', () => {
		const g = buildMeshGraph(gridMesh(3));
		const solver = new DijkstraGeodesicSolver(g);
		const s0 = g.positions.findIndex((p) => p.distanceTo(new Vector3(0, 0, 0)) < 1e-6);
		const field = solver.solveMultiSource([s0]);
		const far = g.positions.findIndex((p) => p.distanceTo(new Vector3(3, 3, 0)) < 1e-6);
		expect(field[far].distance).toBeGreaterThanOrEqual(Math.sqrt(18) - 1e-9);
		expect(Number.isFinite(field[far].distance)).toBe(true);
	});

	it('leaves vertices in a disconnected component unreachable', () => {
		// Two separate single-triangle islands; source only on the first island.
		const tri = (a: number[], b: number[], c: number[]): SurfaceTriangle => [
			new Vector3(...(a as [number, number, number])),
			new Vector3(...(b as [number, number, number])),
			new Vector3(...(c as [number, number, number]))
		];
		const g = buildMeshGraph([
			tri([0, 0, 0], [1, 0, 0], [0, 1, 0]),
			tri([10, 10, 0], [11, 10, 0], [10, 11, 0])
		]);
		const s0 = g.positions.findIndex((p) => p.distanceTo(new Vector3(0, 0, 0)) < 1e-6);
		const field = solver(g).solveMultiSource([s0]);
		const island2 = g.positions.findIndex((p) => p.distanceTo(new Vector3(10, 10, 0)) < 1e-6);
		expect(field[island2].nearestSeed).toBe(-1);
		expect(field[island2].distance).toBe(Infinity);
	});
});

function solver(g: ReturnType<typeof buildMeshGraph>): DijkstraGeodesicSolver {
	return new DijkstraGeodesicSolver(g);
}
