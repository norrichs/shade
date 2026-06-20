import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import { buildMeshGraph } from '../mesh-graph';
import type { SurfaceTriangle } from '../../types';

const tri = (a: number[], b: number[], c: number[]): SurfaceTriangle => [
	new Vector3(...(a as [number, number, number])),
	new Vector3(...(b as [number, number, number])),
	new Vector3(...(c as [number, number, number]))
];

describe('buildMeshGraph', () => {
	it('welds coincident vertices shared by two triangles', () => {
		// Two triangles sharing edge (0,0,0)-(1,0,0).
		const tris = [tri([0, 0, 0], [1, 0, 0], [0, 1, 0]), tri([1, 0, 0], [0, 0, 0], [1, 1, 0])];
		const g = buildMeshGraph(tris);
		// 4 unique positions despite 6 corner instances.
		expect(g.positions.length).toBe(4);
		expect(g.faces.length).toBe(2);
	});

	it('produces symmetric adjacency with Euclidean weights', () => {
		const tris = [tri([0, 0, 0], [2, 0, 0], [0, 2, 0])];
		const g = buildMeshGraph(tris);
		const a = 0;
		const neighborsOfA = g.adjacency[a];
		// Every neighbor lists `a` back, with matching weight.
		for (const { to, weight } of neighborsOfA) {
			const back = g.adjacency[to].find((n) => n.to === a);
			expect(back).toBeDefined();
			expect(back!.weight).toBeCloseTo(weight, 9);
		}
	});

	it('bridges a seam where two triangles use distinct-but-coincident vertex objects', () => {
		// Same geometry as the welding test but separate Vector3 instances at the seam.
		const tris = [tri([0, 0, 0], [1, 0, 0], [0, 1, 0]), tri([1, 0, 0], [0, 0, 0], [1, -1, 0])];
		const g = buildMeshGraph(tris);
		// Vertex at (0,0,0) must connect into both triangles.
		const origin = g.positions.findIndex((p) => p.length() < 1e-9);
		expect(origin).toBeGreaterThanOrEqual(0);
		expect(g.adjacency[origin].length).toBeGreaterThanOrEqual(3);
	});

	it('produces unit normals pointing along the face normal for a flat mesh', () => {
		// Two coplanar triangles in the z=0 plane wound CCW -> face normal is +Z.
		const tris = [tri([0, 0, 0], [1, 0, 0], [0, 1, 0]), tri([1, 0, 0], [1, 1, 0], [0, 1, 0])];
		const g = buildMeshGraph(tris);
		for (const n of g.normals) {
			expect(n.length()).toBeCloseTo(1, 9); // normalized
			expect(n.z).toBeCloseTo(1, 9); // +Z for CCW winding in z=0 plane
		}
	});
});
