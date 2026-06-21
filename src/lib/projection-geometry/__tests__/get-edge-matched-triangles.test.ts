import { describe, it, expect, jest } from '@jest/globals';
import { Triangle, Vector3 } from 'three';

// generate-projection pulls in Svelte/store/material transitive deps; mock them
// the same way the voronoi suite does so we can import the real geometry helper.
jest.mock('../../../components/three-renderer/materials', () => ({ materials: { default: {} } }));
jest.mock('$lib/stores/superGlobuleStores', () => ({}));
jest.mock('$lib/stores/selectionStores', () => ({}));
jest.mock('$lib/cut-pattern/generate-pattern', () => ({
	corrected: (e: string) => e,
	getTrianglePointAsKVFromTriangleEdge: jest.fn(),
	getTrianglePointFromTriangleEdge: jest.fn()
}));

import { getEdgeMatchedTriangles } from '../generate-projection';

describe('getEdgeMatchedTriangles', () => {
	it('matches two triangles that share a real edge (two distinct vertices)', () => {
		const t0 = new Triangle(new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0));
		const t1 = new Triangle(new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(2, 2, 0));
		const match = getEdgeMatchedTriangles(t0, t1);
		expect(match).not.toBe(false);
		// t0 shares b,c; t1 shares a,b → canonical edges 'bc' and 'ab'.
		expect(match).toEqual({ t0: 'bc', t1: 'ab' });
	});

	it('rejects a degenerate (coincident-vertex) triangle instead of returning a doubled edge', () => {
		// t0 has two coincident vertices at (1,0,0); t1 has a single vertex there.
		// Pre-fix this produced matched = ['ab','aa'] -> a non-edge key 'aa' that crashed
		// downstream meta lookups. It must now be rejected.
		const t0 = new Triangle(new Vector3(1, 0, 0), new Vector3(1, 0, 0), new Vector3(5, 5, 0));
		const t1 = new Triangle(new Vector3(1, 0, 0), new Vector3(9, 9, 0), new Vector3(8, 8, 0));
		expect(getEdgeMatchedTriangles(t0, t1)).toBe(false);
	});

	it('returns false when triangles share fewer than two vertices', () => {
		const t0 = new Triangle(new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0));
		const t1 = new Triangle(new Vector3(9, 9, 0), new Vector3(8, 8, 0), new Vector3(1, 0, 0));
		expect(getEdgeMatchedTriangles(t0, t1)).toBe(false);
	});
});
