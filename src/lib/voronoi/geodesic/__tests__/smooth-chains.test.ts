import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import { smoothSeries, smoothChainPoints, SurfaceProjector } from '../smooth-chains';
import type { SurfaceTriangle } from '$lib/voronoi/types';
import { buildMeshGraph } from '../mesh-graph';

/** Sum of |second differences| — a proxy for jaggedness. */
function roughness(s: number[]): number {
	let r = 0;
	for (let i = 1; i < s.length - 1; i++) r += Math.abs(s[i - 1] - 2 * s[i] + s[i + 1]);
	return r;
}

describe('smoothSeries', () => {
	it('reduces roughness while pinning the endpoints exactly', () => {
		// A straight ramp with alternating zig-zag noise on the interior.
		const n = 21;
		const noisy = Array.from({ length: n }, (_, i) => i + (i % 2 === 0 ? 0.5 : -0.5));
		noisy[0] = 0; // clean endpoints
		noisy[n - 1] = n - 1;
		const out = smoothSeries(noisy, 10);
		expect(out.length).toBe(n);
		expect(out[0]).toBe(noisy[0]);
		expect(out[n - 1]).toBe(noisy[n - 1]);
		expect(roughness(out)).toBeLessThan(roughness(noisy) * 0.5);
	});

	it('returns the input unchanged when lambda is 0', () => {
		const y = [0, 3, 1, 4, 1, 5, 9, 2];
		expect(smoothSeries(y, 0)).toEqual(y);
	});

	it('returns a copy unchanged for series shorter than 4', () => {
		const y = [1, 5, 2];
		const out = smoothSeries(y, 10);
		expect(out).toEqual(y);
		expect(out).not.toBe(y);
	});
});

/** Total turning angle (radians) across a polyline. */
function turning(points: Vector3[]): number {
	let t = 0;
	for (let i = 1; i < points.length - 1; i++) {
		const a = points[i].clone().sub(points[i - 1]);
		const b = points[i + 1].clone().sub(points[i]);
		if (a.lengthSq() < 1e-18 || b.lengthSq() < 1e-18) continue;
		t += a.angleTo(b);
	}
	return t;
}

describe('smoothChainPoints', () => {
	it('reduces turning while leaving the endpoints exactly in place', () => {
		// Zig-zag along +x in the z=0 plane.
		const raw = Array.from({ length: 15 }, (_, i) => new Vector3(i, i % 2 === 0 ? 0.4 : -0.4, 0));
		raw[0].set(0, 0, 0);
		raw[14].set(14, 0, 0);
		const out = smoothChainPoints(raw, 10);
		expect(out.length).toBe(raw.length);
		expect(out[0].equals(raw[0])).toBe(true);
		expect(out[14].equals(raw[14])).toBe(true);
		expect(turning(out)).toBeLessThan(turning(raw) * 0.5);
	});

	it('returns clones unchanged for chains shorter than 4 points', () => {
		const raw = [new Vector3(0, 0, 0), new Vector3(1, 1, 0), new Vector3(2, 0, 0)];
		const out = smoothChainPoints(raw, 10);
		expect(out.map((p) => p.toArray())).toEqual(raw.map((p) => p.toArray()));
		expect(out[0]).not.toBe(raw[0]);
	});
});

/** Flat NxN grid in the z=0 plane (normals point +z). */
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

describe('SurfaceProjector', () => {
	it('snaps a point above the plane back onto the surface via raycast', () => {
		const tris = gridMesh(8);
		const projector = new SurfaceProjector(tris, buildMeshGraph(tris));
		const res = projector.project(new Vector3(0.1, -0.2, 0.3), new Vector3(0, 0, 1));
		expect(Math.abs(res.point.z)).toBeLessThan(1e-6);
		expect(Math.abs(res.normal.z)).toBeGreaterThan(0.99);
	});

	it('falls back to closest-point when the ray misses the surface', () => {
		const tris = gridMesh(8);
		const projector = new SurfaceProjector(tris, buildMeshGraph(tris));
		// Point off the +x edge, normal parallel to the plane so neither ray hits.
		const res = projector.project(new Vector3(1.5, 0, 0), new Vector3(1, 0, 0));
		expect(Math.abs(res.point.z)).toBeLessThan(1e-6); // landed on the z=0 surface
		expect(res.point.x).toBeLessThanOrEqual(1.000001); // clamped onto the mesh extent
		expect(Math.abs(res.normal.z)).toBeGreaterThan(0.99); // blended normal still points off-plane
	});
});
