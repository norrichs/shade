import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import type { SurfaceTriangle, VoronoiConfig } from '$lib/voronoi/types';
import { OPENING } from '$lib/types';
import { defaultVoronoiConfig } from '$lib/shades-config';
import { generateGeodesicVoronoi } from '../geodesic-voronoi';

/** Flat NxN grid in the z=0 plane — an OPEN surface (perimeter rim). */
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

/** UV sphere sampling -> triangles. */
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

// Base on the real default so bandConfig/crossSectionConfig stay type-valid; override
// only what the geodesic path reads (seeds, edgeDivisions, method).
const baseConfig = (): VoronoiConfig => ({
	...defaultVoronoiConfig,
	seedConfig: {
		...defaultVoronoiConfig.seedConfig,
		seedMethod: { type: 'areaWeighted', pointCount: 8, seed: 42 },
		relaxationIterations: 0
	},
	edgeDivisions: [4, 4],
	voronoiMethod: 'geodesic',
	insetMethod: 'localProjection'
});

describe('generateGeodesicVoronoi', () => {
	it('emits parallel edges/edgeProjections and per-cell seed points', () => {
		const result = generateGeodesicVoronoi(baseConfig(), sphereMesh(24));
		expect(result.edges.length).toBeGreaterThan(0);
		expect(result.edgeProjections.length).toBe(result.edges.length);
		expect(result.seedPoints3d.length).toBe(8);
		for (let i = 0; i < result.edges.length; i++) {
			const proj = result.edgeProjections[i];
			expect(proj.edgePoints3d.length).toBeGreaterThanOrEqual(2);
			expect(proj.normals.length).toBe(proj.edgePoints3d.length);
		}
	});

	it('shares corner keys between edges meeting at a Voronoi corner', () => {
		const result = generateGeodesicVoronoi(baseConfig(), sphereMesh(24));
		const counts = new Map<number, number>();
		for (const e of result.edges) {
			for (const v of e.vertices) counts.set(v[0], (counts.get(v[0]) ?? 0) + 1);
		}
		expect([...counts.values()].some((n) => n >= 2)).toBe(true);
	});

	it('runs Lloyd relaxation without changing the cell count', () => {
		const config = { ...baseConfig() };
		config.seedConfig = { ...config.seedConfig, relaxationIterations: 3 };
		const result = generateGeodesicVoronoi(config, sphereMesh(24));
		expect(result.seedPoints3d.length).toBe(8); // cellCount invariant across iterations
		expect(result.edges.length).toBeGreaterThan(0);
		expect(result.edgeProjections.length).toBe(result.edges.length);
	});

	it('emits opening-sentinel edges on an open surface', () => {
		const result = generateGeodesicVoronoi(baseConfig(), gridMesh(16));
		expect(result.edges.some((e) => e.cellIndices.includes(OPENING))).toBe(true);
	});

	it('emits no opening-sentinel edges on a closed surface', () => {
		const result = generateGeodesicVoronoi(baseConfig(), sphereMesh(24));
		expect(result.edges.some((e) => e.cellIndices.includes(OPENING))).toBe(false);
	});

	it('coerces a centerProjection seed method to area-weighted', () => {
		const config = { ...baseConfig() };
		config.seedConfig = {
			...config.seedConfig,
			seedMethod: { type: 'centerProjection', pointCount: 8, seed: 42 }
		};
		const result = generateGeodesicVoronoi(config, sphereMesh(24));
		// Same seed/pointCount as the area-weighted baseConfig -> identical seed positions.
		const baseline = generateGeodesicVoronoi(baseConfig(), sphereMesh(24));
		expect(result.seedPoints3d.length).toBe(8);
		for (let i = 0; i < 8; i++) {
			expect(result.seedPoints3d[i]?.distanceTo(baseline.seedPoints3d[i]!)).toBeCloseTo(0, 9);
		}
	});
});
