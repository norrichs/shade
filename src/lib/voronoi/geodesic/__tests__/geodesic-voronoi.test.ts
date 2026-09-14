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

	it('treats a division count as segments (N divisions -> N + 1 points)', () => {
		const fixed = generateGeodesicVoronoi(baseConfig(), sphereMesh(24));
		for (const proj of fixed.edgeProjections) expect(proj.edgePoints3d.length).toBe(5);

		// [1, 2] x 3 -> divisions of 3 or 6 -> 4 or 7 points.
		const multiplied = generateGeodesicVoronoi(
			{ ...baseConfig(), edgeDivisions: [1, 2], edgeDivisionsMultiplier: 3 },
			sphereMesh(24)
		);
		const pointCounts = new Set(multiplied.edgeProjections.map((p) => p.edgePoints3d.length));
		expect([...pointCounts].every((n) => n === 4 || n === 7)).toBe(true);
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

describe('generateGeodesicVoronoi edge styles', () => {
	const withStyle = (
		style: 'bisector' | 'smoothed' | 'geodesic',
		extra: Partial<VoronoiConfig> = {}
	): VoronoiConfig => ({ ...baseConfig(), geodesicEdgeStyle: style, ...extra });

	const totalTurning = (r: ReturnType<typeof generateGeodesicVoronoi>) => {
		let t = 0;
		for (const proj of r.edgeProjections) {
			const p = proj.edgePoints3d;
			for (let k = 1; k < p.length - 1; k++) {
				const u = p[k].clone().sub(p[k - 1]);
				const v = p[k + 1].clone().sub(p[k]);
				if (u.lengthSq() > 1e-18 && v.lengthSq() > 1e-18) t += u.angleTo(v);
			}
		}
		return t;
	};

	it('geodesic style reduces total edge turning vs bisector', () => {
		const bis = generateGeodesicVoronoi(withStyle('bisector'), sphereMesh(24));
		const geo = generateGeodesicVoronoi(
			withStyle('geodesic', { geodesicStraightenCap: 120 }),
			sphereMesh(24)
		);
		expect(geo.edges.length).toBe(bis.edges.length);
		expect(totalTurning(geo)).toBeLessThan(totalTurning(bis));
	});

	it('keeps edge endpoints (shared corners) identical across all three styles', () => {
		const bis = generateGeodesicVoronoi(withStyle('bisector'), sphereMesh(24));
		const sm = generateGeodesicVoronoi(
			withStyle('smoothed', { geodesicSmoothing: 8 }),
			sphereMesh(24)
		);
		const geo = generateGeodesicVoronoi(withStyle('geodesic'), sphereMesh(24));
		for (let i = 0; i < bis.edges.length; i++) {
			const a = bis.edgeProjections[i].edgePoints3d;
			const s = sm.edgeProjections[i].edgePoints3d;
			const g = geo.edgeProjections[i].edgePoints3d;
			expect(s[0].distanceTo(a[0])).toBeLessThan(1e-9);
			expect(g[0].distanceTo(a[0])).toBeLessThan(1e-9);
			expect(s[s.length - 1].distanceTo(a[a.length - 1])).toBeLessThan(1e-9);
			expect(g[g.length - 1].distanceTo(a[a.length - 1])).toBeLessThan(1e-9);
		}
	});

	it('does not straighten rim edges; cell-cell edges do change', () => {
		// Open surface -> some edges border an OPENING. With smoothing off, rim
		// edges must be identical between bisector and geodesic; at least one
		// cell-cell edge must differ (proving straightening ran on non-rim edges).
		const bis = generateGeodesicVoronoi(
			withStyle('bisector', { geodesicSmoothing: 0 }),
			gridMesh(16)
		);
		const geo = generateGeodesicVoronoi(
			withStyle('geodesic', { geodesicSmoothing: 0, geodesicStraightenCap: 60 }),
			gridMesh(16)
		);
		let rimChecked = 0;
		let cellChanged = false;
		for (let i = 0; i < bis.edges.length; i++) {
			const isRim = bis.edges[i].cellIndices.includes(OPENING);
			const a = bis.edgeProjections[i].edgePoints3d;
			const g = geo.edgeProjections[i].edgePoints3d;
			let maxDiff = 0;
			for (let k = 0; k < a.length; k++) maxDiff = Math.max(maxDiff, g[k].distanceTo(a[k]));
			if (isRim) {
				expect(maxDiff).toBeLessThan(1e-9); // rim untouched
				rimChecked++;
			} else if (maxDiff > 1e-6) {
				cellChanged = true;
			}
		}
		expect(rimChecked).toBeGreaterThan(0);
		expect(cellChanged).toBe(true);
	});
});

describe('generateGeodesicVoronoi smoothing', () => {
	const withLambda = (lambda: number): VoronoiConfig => ({
		...baseConfig(),
		geodesicEdgeStyle: 'smoothed',
		geodesicSmoothing: lambda
	});

	it('leaves edge endpoints (shared corners) identical to the unsmoothed run', () => {
		const off = generateGeodesicVoronoi(withLambda(0), sphereMesh(24));
		const on = generateGeodesicVoronoi(withLambda(8), sphereMesh(24));
		expect(on.edges.length).toBe(off.edges.length);
		for (let i = 0; i < on.edges.length; i++) {
			const a = off.edgeProjections[i].edgePoints3d;
			const b = on.edgeProjections[i].edgePoints3d;
			expect(b[0].distanceTo(a[0])).toBeLessThan(1e-9);
			expect(b[b.length - 1].distanceTo(a[a.length - 1])).toBeLessThan(1e-9);
		}
	});

	it('keeps re-projected interior points on the unit sphere', () => {
		const on = generateGeodesicVoronoi(withLambda(8), sphereMesh(24));
		for (const proj of on.edgeProjections) {
			const pts = proj.edgePoints3d;
			for (let k = 1; k < pts.length - 1; k++) {
				expect(Math.abs(pts[k].length() - 1)).toBeLessThan(0.05);
			}
		}
	});

	it('reduces total edge turning versus the unsmoothed run', () => {
		const turning = (r: ReturnType<typeof generateGeodesicVoronoi>) => {
			let t = 0;
			for (const proj of r.edgeProjections) {
				const p = proj.edgePoints3d;
				for (let k = 1; k < p.length - 1; k++) {
					const u = p[k].clone().sub(p[k - 1]);
					const v = p[k + 1].clone().sub(p[k]);
					if (u.lengthSq() > 1e-18 && v.lengthSq() > 1e-18) t += u.angleTo(v);
				}
			}
			return t;
		};
		const off = generateGeodesicVoronoi(withLambda(0), sphereMesh(24));
		const on = generateGeodesicVoronoi(withLambda(8), sphereMesh(24));
		expect(turning(on)).toBeLessThan(turning(off));
	});
});
