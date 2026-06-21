import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import { resamplePolyline, straightenToGeodesic } from '../geodesic-straighten';
import type { SurfaceTriangle } from '$lib/voronoi/types';
import { buildMeshGraph } from '../mesh-graph';
import { SurfaceProjector } from '../smooth-chains';

describe('resamplePolyline', () => {
	it('resamples to the requested count, preserving endpoints, evenly by arc length', () => {
		// An L-shaped path: (0,0,0) -> (2,0,0) -> (2,2,0), total length 4.
		const input = [new Vector3(0, 0, 0), new Vector3(2, 0, 0), new Vector3(2, 2, 0)];
		const out = resamplePolyline(input, 5); // spacing 1 along arc length
		expect(out.length).toBe(5);
		expect(out[0].equals(input[0])).toBe(true);
		expect(out[4].equals(input[2])).toBe(true);
		// out[2] is at arc length 2 -> the corner (2,0,0).
		expect(out[2].distanceTo(new Vector3(2, 0, 0))).toBeLessThan(1e-9);
	});

	it('returns clones for degenerate inputs', () => {
		const single = [new Vector3(1, 2, 3)];
		expect(resamplePolyline(single, 5).map((p) => p.toArray())).toEqual([[1, 2, 3]]);
	});
});

/** Flat NxN grid in the z=0 plane. */
function gridMesh(n: number): SurfaceTriangle[] {
	const v = (x: number, y: number) => new Vector3((x / n) * 2 - 1, (y / n) * 2 - 1, 0);
	const tris: SurfaceTriangle[] = [];
	for (let y = 0; y < n; y++) {
		for (let x = 0; x < n; x++) {
			tris.push([v(x, y), v(x + 1, y), v(x, y + 1)]);
			tris.push([v(x + 1, y), v(x + 1, y + 1), v(x, y + 1)]);
		}
	}
	return tris;
}

/** UV sphere -> triangles (unit radius). */
function sphereMesh(seg: number): SurfaceTriangle[] {
	const v = (i: number, j: number) => {
		const u = (i / seg) * Math.PI * 2;
		const t = (j / seg) * Math.PI;
		return new Vector3(Math.sin(t) * Math.cos(u), Math.cos(t), Math.sin(t) * Math.sin(u));
	};
	const tris: SurfaceTriangle[] = [];
	for (let j = 0; j < seg; j++) {
		for (let i = 0; i < seg; i++) {
			tris.push([v(i, j), v(i + 1, j), v(i, j + 1)]);
			tris.push([v(i + 1, j), v(i + 1, j + 1), v(i, j + 1)]);
		}
	}
	return tris;
}

function polylineLength(p: Vector3[]): number {
	let L = 0;
	for (let i = 1; i < p.length; i++) L += p[i].distanceTo(p[i - 1]);
	return L;
}

describe('straightenToGeodesic', () => {
	it('straightens a wiggly path on a plane into the straight chord', () => {
		const tris = gridMesh(16);
		const projector = new SurfaceProjector(tris, buildMeshGraph(tris));
		// Wiggly path from (-0.8,0,0) to (0.8,0,0) with alternating y noise.
		const n = 11;
		const input = Array.from({ length: n }, (_, i) => {
			const x = -0.8 + (1.6 * i) / (n - 1);
			const y = i === 0 || i === n - 1 ? 0 : i % 2 === 0 ? 0.25 : -0.25;
			return new Vector3(x, y, 0);
		});
		const out = straightenToGeodesic(input, projector, { stepFactor: 0.5, tolerance: 1e-9, cap: 400 });
		expect(out.length).toBe(n);
		expect(out[0].equals(input[0])).toBe(true);
		expect(out[n - 1].equals(input[n - 1])).toBe(true);
		// Converged to the x-axis: every interior point has y,z ~ 0.
		for (let i = 1; i < n - 1; i++) {
			expect(Math.abs(out[i].y)).toBeLessThan(0.01);
			expect(Math.abs(out[i].z)).toBeLessThan(1e-6);
		}
	});

	it('shortens a wiggly path on a sphere and keeps it on the surface, endpoints fixed', () => {
		const tris = sphereMesh(24);
		const projector = new SurfaceProjector(tris, buildMeshGraph(tris));
		const a = new Vector3(1, 0, 0);
		const b = new Vector3(0, 0, 1);
		const n = 13;
		const input = Array.from({ length: n }, (_, i) => {
			const t = i / (n - 1);
			const base = a.clone().lerp(b, t).normalize(); // arc-ish
			if (i === 0 || i === n - 1) return base;
			// push off the arc toward +y, then snap to sphere.
			return base.clone().add(new Vector3(0, i % 2 === 0 ? 0.3 : -0.3, 0)).normalize();
		});
		const before = polylineLength(input);
		const out = straightenToGeodesic(input, projector, { stepFactor: 0.5, tolerance: 1e-9, cap: 150 });
		expect(out[0].equals(input[0])).toBe(true);
		expect(out[n - 1].equals(input[n - 1])).toBe(true);
		expect(polylineLength(out)).toBeLessThan(before); // curve-shortening
		for (let i = 0; i < n; i++) expect(Math.abs(out[i].length() - 1)).toBeLessThan(0.05);
	});

	it('returns clones unchanged for paths shorter than 4 points', () => {
		const tris = gridMesh(4);
		const projector = new SurfaceProjector(tris, buildMeshGraph(tris));
		const input = [new Vector3(0, 0, 0), new Vector3(0.5, 0.1, 0), new Vector3(0.9, 0, 0)];
		const out = straightenToGeodesic(input, projector, { stepFactor: 0.5, tolerance: 1e-9, cap: 50 });
		expect(out.map((p) => p.toArray())).toEqual(input.map((p) => p.toArray()));
		expect(out[0]).not.toBe(input[0]);
	});
});
