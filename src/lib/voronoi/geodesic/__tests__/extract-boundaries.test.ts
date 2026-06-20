import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import { buildMeshGraph } from '../mesh-graph';
import { extractBoundaries } from '../extract-boundaries';
import type { SurfaceTriangle } from '../../types';
import type { GeodesicField } from '../geodesic-solver';

const tri = (a: number[], b: number[], c: number[]): SurfaceTriangle => [
	new Vector3(...(a as [number, number, number])),
	new Vector3(...(b as [number, number, number])),
	new Vector3(...(c as [number, number, number]))
];

describe('extractBoundaries', () => {
	it('produces one segment for a two-label triangle, midpoint-crossing when distances tie', () => {
		const g = buildMeshGraph([tri([0, 0, 0], [2, 0, 0], [0, 2, 0])]);
		const field: GeodesicField = g.positions.map(() => ({ nearestSeed: 0, distance: 1 }));
		const v2 = g.positions.findIndex((p) => p.distanceTo(new Vector3(0, 2, 0)) < 1e-6);
		field[v2] = { nearestSeed: 1, distance: 1 };

		const chains = extractBoundaries(g, field);
		expect(chains.length).toBe(1);
		expect(new Set(chains[0].cellIndices)).toEqual(new Set([0, 1]));
		expect(chains[0].points.length).toBe(2);
		for (const p of chains[0].points) {
			const isMid =
				p.distanceTo(new Vector3(0, 1, 0)) < 1e-6 || p.distanceTo(new Vector3(1, 1, 0)) < 1e-6;
			expect(isMid).toBe(true);
		}
	});

	it('shares an identical corner between adjacent cell-pair chains at a triple point', () => {
		const tris = [tri([0, 0, 0], [2, 0, 0], [1, 2, 0]), tri([2, 0, 0], [3, 2, 0], [1, 2, 0])];
		const g = buildMeshGraph(tris);
		const field: GeodesicField = g.positions.map((p) => {
			if (p.x < 1) return { nearestSeed: 0, distance: 1 };
			if (p.y > 1) return { nearestSeed: 2, distance: 1 };
			return { nearestSeed: 1, distance: 1 };
		});
		const chains = extractBoundaries(g, field);
		const counts = new Map<number, number>();
		for (const c of chains) for (const cid of c.vertices) counts.set(cid, (counts.get(cid) ?? 0) + 1);
		const shared = [...counts.values()].some((n) => n >= 2);
		expect(shared).toBe(true);
	});

	it('welds a crossing shared by two adjacent faces into one chain', () => {
		// Two triangles sharing edge (0,0,0)-(2,0,0). The shared edge has one endpoint
		// in cell 0 and one in cell 1, so the crossing on it must be reused by both faces
		// -> the two per-face segments stitch into a single chain.
		const tris = [tri([0, 0, 0], [2, 0, 0], [1, 1, 0]), tri([0, 0, 0], [2, 0, 0], [1, -1, 0])];
		const g = buildMeshGraph(tris);
		const field: GeodesicField = g.positions.map((p) =>
			p.distanceTo(new Vector3(0, 0, 0)) < 1e-6
				? { nearestSeed: 1, distance: 1 }
				: { nearestSeed: 0, distance: 1 }
		);
		const chains = extractBoundaries(g, field);
		const pair = chains.filter((c) => new Set(c.cellIndices).has(0) && new Set(c.cellIndices).has(1));
		expect(pair.length).toBe(1); // one stitched chain, not two disjoint segments
		expect(pair[0].points.length).toBe(3); // crossing on top edge, shared crossing, crossing on bottom edge
	});

	it('skips faces touching an unreachable vertex', () => {
		const g = buildMeshGraph([tri([0, 0, 0], [2, 0, 0], [0, 2, 0])]);
		const field: GeodesicField = g.positions.map(() => ({ nearestSeed: 0, distance: 1 }));
		const v2 = g.positions.findIndex((p) => p.distanceTo(new Vector3(0, 2, 0)) < 1e-6);
		field[v2] = { nearestSeed: -1, distance: Infinity }; // unreachable
		expect(extractBoundaries(g, field)).toEqual([]);
	});
});
