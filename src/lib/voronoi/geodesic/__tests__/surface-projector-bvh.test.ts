import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';
import { SurfaceProjector } from '../smooth-chains';
import type { SurfaceTriangle } from '$lib/voronoi/types';
import { buildMeshGraph } from '../mesh-graph';

/** Deterministic pseudo-random in [0,1). */
const rng = (seed: number) => () => {
	seed = (seed * 1664525 + 1013904223) >>> 0;
	return seed / 2 ** 32;
};

/** Bumpy NxN height field so triangles are not coplanar and the nearest one is not obvious. */
function bumpyMesh(n: number): SurfaceTriangle[] {
	const h = (x: number, y: number) => 0.3 * Math.sin(3 * x) * Math.cos(2 * y);
	const v = (x: number, y: number) => {
		const px = (x / n) * 2 - 1;
		const py = (y / n) * 2 - 1;
		return new Vector3(px, py, h(px, py));
	};
	const tris: SurfaceTriangle[] = [];
	for (let y = 0; y < n; y++) {
		for (let x = 0; x < n; x++) {
			tris.push([v(x, y), v(x + 1, y), v(x, y + 1)]);
			tris.push([v(x + 1, y), v(x + 1, y + 1), v(x, y + 1)]);
		}
	}
	return tris;
}

/** Reference: exhaustive closest point over every triangle. */
function bruteClosest(tris: SurfaceTriangle[], p: Vector3): { point: Vector3; index: number } {
	let bestD = Infinity;
	let best = p.clone();
	let bestI = 0;
	const tmp = new Vector3();
	const tri = new Triangle();
	tris.forEach((t, i) => {
		tri.set(t[0], t[1], t[2]);
		tri.closestPointToPoint(p, tmp);
		const d = tmp.distanceToSquared(p);
		if (d < bestD) {
			bestD = d;
			best = tmp.clone();
			bestI = i;
		}
	});
	return { point: best, index: bestI };
}

describe('SurfaceProjector.projectClosest (BVH)', () => {
	const tris = bumpyMesh(24);
	const projector = new SurfaceProjector(tris, buildMeshGraph(tris));
	const rand = rng(42);

	it('matches the exhaustive closest point for points around and on the surface', () => {
		for (let i = 0; i < 200; i++) {
			const p = new Vector3(rand() * 2.4 - 1.2, rand() * 2.4 - 1.2, rand() * 2 - 1);
			const expected = bruteClosest(tris, p);
			const got = projector.projectClosest(p);
			expect(got.point.distanceTo(expected.point)).toBeLessThan(1e-6);
		}
	});

	it('returns a unit normal that agrees with the local surface', () => {
		const p = new Vector3(0.13, -0.41, 0.9);
		const got = projector.projectClosest(p);
		expect(Math.abs(got.normal.length() - 1)).toBeLessThan(1e-6);
		// Height field is shallow, so the blended normal must lean strongly +z.
		expect(got.normal.z).toBeGreaterThan(0.7);
	});

	/**
	 * Analytic normal of the height field z = 0.3 sin(3x) cos(2y).
	 * The blended welded-vertex normal must be within a few degrees of it: a normal
	 * taken from the wrong triangle (e.g. a BVH faceIndex read against the original
	 * triangle order) is off by tens of degrees and tilts every cross-section.
	 */
	const analyticNormal = (x: number, y: number) =>
		new Vector3(
			-0.9 * Math.cos(3 * x) * Math.cos(2 * y),
			0.6 * Math.sin(3 * x) * Math.sin(2 * y),
			1
		).normalize();

	it('blends the normal from the triangle actually hit (closest point)', () => {
		const r = rng(7);
		let worst = 0;
		for (let i = 0; i < 100; i++) {
			const p = new Vector3(r() * 1.6 - 0.8, r() * 1.6 - 0.8, r() * 0.6 + 0.4);
			const got = projector.projectClosest(p);
			const deg = (got.normal.angleTo(analyticNormal(got.point.x, got.point.y)) * 180) / Math.PI;
			worst = Math.max(worst, deg);
		}
		expect(worst).toBeLessThan(8);
	});

	it('blends the normal from the triangle actually hit (raycast)', () => {
		const r = rng(11);
		let worst = 0;
		for (let i = 0; i < 100; i++) {
			const p = new Vector3(r() * 1.6 - 0.8, r() * 1.6 - 0.8, 2);
			const got = projector.project(p, new Vector3(0, 0, 1));
			const deg = (got.normal.angleTo(analyticNormal(got.point.x, got.point.y)) * 180) / Math.PI;
			worst = Math.max(worst, deg);
		}
		expect(worst).toBeLessThan(8);
	});

	it('handles a point far outside the mesh extent by clamping to the rim', () => {
		const got = projector.projectClosest(new Vector3(5, 5, 0));
		const expected = bruteClosest(tris, new Vector3(5, 5, 0));
		expect(got.point.distanceTo(expected.point)).toBeLessThan(1e-6);
		expect(got.point.x).toBeLessThanOrEqual(1 + 1e-6);
	});
});
