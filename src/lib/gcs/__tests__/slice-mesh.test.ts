import { describe, it, expect } from '@jest/globals';

import { sliceMeshAtZ } from '../slice-mesh';
import { boxMesh, cylinderMesh, openTubeMesh, twoCylindersMesh } from './mesh-fixtures';

const slice = (mesh: { positions: Float32Array; index: Uint32Array }, z: number) =>
	sliceMeshAtZ(mesh.positions, mesh.index, z);

describe('sliceMeshAtZ', () => {
	it('cuts a box into one rectangular loop', () => {
		const { loops, openChains } = slice(boxMesh(2, 4, 6), 0);
		expect(loops).toHaveLength(1);
		expect(openChains).toBe(0);
		const xs = loops[0].map((p) => p.x);
		const ys = loops[0].map((p) => p.y);
		expect(Math.min(...xs)).toBeCloseTo(-1, 6);
		expect(Math.max(...xs)).toBeCloseTo(1, 6);
		expect(Math.min(...ys)).toBeCloseTo(-2, 6);
		expect(Math.max(...ys)).toBeCloseTo(2, 6);
	});

	it('cuts a cylinder into one loop on its radius', () => {
		const { loops } = slice(cylinderMesh(5, 20, 48), 0);
		expect(loops).toHaveLength(1);
		loops[0].forEach((p) => expect(Math.abs(p.length() - 5)).toBeLessThan(1e-5));
	});

	it('cuts a plane through a mesh vertex ring without duplicate points', () => {
		// heightSegments = 4 over height 20 puts a vertex ring at z = 0.
		const { loops } = slice(cylinderMesh(5, 20, 48), 0);
		const keys = new Set(loops[0].map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`));
		expect(keys.size).toBe(loops[0].length);
	});

	it('returns one loop per separate body', () => {
		expect(slice(twoCylindersMesh(), 1).loops).toHaveLength(2);
	});

	it('reports an open mesh as open chains', () => {
		const { loops, openChains } = slice(openTubeMesh(), 1);
		expect(loops).toHaveLength(0);
		expect(openChains).toBeGreaterThanOrEqual(1);
	});

	it('returns nothing for a plane that misses the mesh', () => {
		expect(slice(boxMesh(2, 4, 6), 10)).toEqual({ loops: [], openChains: 0 });
	});
});
