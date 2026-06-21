import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import { buildMeshGraph, traceBoundaryLoops } from '../mesh-graph';
import { buildRimChains } from '../rim-edges';
import { OPENING } from '$lib/types';
import type { SurfaceTriangle } from '$lib/voronoi/types';
import type { GeodesicField } from '../geodesic-solver';

const tri = (a: number[], b: number[], c: number[]): SurfaceTriangle => [
	new Vector3(...(a as [number, number, number])),
	new Vector3(...(b as [number, number, number])),
	new Vector3(...(c as [number, number, number]))
];

const quad = () =>
	buildMeshGraph([tri([0, 0, 0], [1, 0, 0], [0, 1, 0]), tri([1, 0, 0], [1, 1, 0], [0, 1, 0])]);

function fieldBy(g: ReturnType<typeof quad>, label: (p: Vector3) => number): GeodesicField {
	return g.positions.map((p) => ({ nearestSeed: label(p), distance: 1 }));
}

describe('buildRimChains', () => {
	it('splits a rim loop into per-cell chains tagged with OPENING', () => {
		const g = quad();
		const field = fieldBy(g, (p) => (p.y < 0.5 ? 0 : 1));
		const chains = buildRimChains(g, field, traceBoundaryLoops(g));
		const cells = chains.map((c) => c.cellIndices[0]).sort();
		expect(cells).toEqual([0, 1]);
		for (const c of chains) {
			expect(c.cellIndices[1]).toBe(OPENING);
			expect(c.points.length).toBeGreaterThanOrEqual(2);
			expect(c.normals.length).toBe(c.points.length);
		}
	});

	it('skips runs of unreachable (-1) vertices', () => {
		const g = quad();
		const field = fieldBy(g, (p) => (p.y < 0.5 ? 0 : -1));
		const chains = buildRimChains(g, field, traceBoundaryLoops(g));
		expect(chains.every((c) => c.cellIndices[0] >= 0)).toBe(true);
		expect(chains.some((c) => c.cellIndices[0] === 0)).toBe(true);
	});

	it('emits a single chain when the whole rim borders one cell', () => {
		const g = quad();
		const field = fieldBy(g, () => 3); // every rim vertex in cell 3
		const chains = buildRimChains(g, field, traceBoundaryLoops(g));
		expect(chains.length).toBe(1);
		expect(chains[0].cellIndices).toEqual([3, OPENING]);
		expect(chains[0].points.length).toBeGreaterThanOrEqual(2);
	});

	it('emits no chains when the whole rim is unreachable', () => {
		const g = quad();
		const field = fieldBy(g, () => -1);
		expect(buildRimChains(g, field, traceBoundaryLoops(g))).toEqual([]);
	});
});
