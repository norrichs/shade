import { describe, it, expect } from '@jest/globals';
import { generateSuperGlobule } from '#lib/generate-superglobule.js';
import {
	generateDefaultGlobulePatternConfig,
	generateDefaultSuperGlobuleConfig,
	defaultOutlinedPatternConfig
} from '#lib/shades-config.js';
import { generateProjectionPattern } from '#lib/cut-pattern/generate-pattern.js';
import {
	bandSpaceForTubes,
	keepsFillBands,
	patternBandToReal
} from '#lib/cut-pattern/pattern-band-space.js';
import type { SuperGlobuleProjectionCutPattern } from '#lib/stores/superGlobuleStores.js';
import type { Tube } from '#lib/projection-geometry/types.js';
import type { GlobulePatternConfig, PipelineGates } from '#lib/types.js';
import { buildPatternBandMesh, fitFlatToPath } from '../band-uv-mesh';

const gates: PipelineGates = { globuleTube: false, projection: true, voronoi: false };
const RANGE = { tubes: undefined, bands: undefined, facets: undefined };

const setup = (config: GlobulePatternConfig, hideBand1 = false) => {
	const tubes: Tube[] = generateSuperGlobule(generateDefaultSuperGlobuleConfig(), gates)
		.projections[0].tubes;
	if (hideBand1) tubes.forEach((tube) => (tube.bands[1].visible = false));
	const patternTubes = (
		generateProjectionPattern(tubes, 'sg', config, RANGE) as SuperGlobuleProjectionCutPattern
	).projectionCutPattern.tubes;
	const space = bandSpaceForTubes(tubes, keepsFillBands(config.patternTypeConfig));
	return { tubes, bands: patternTubes.flatMap((t) => t.bands), space };
};

/**
 * Isometry: each mapped triangle's 3D side lengths, times the band's scale, must
 * equal its side lengths in path space (UV × bounds). Wrong facet indexing,
 * vertex labels or mirroring all break this.
 */
const isometryGap = (mesh: NonNullable<ReturnType<typeof buildPatternBandMesh>>, s: number) => {
	const { positions: p, uvs, bounds } = mesh;
	const path = (i: number) => ({
		x: uvs[2 * i] * bounds.width + bounds.minX,
		y: (1 - uvs[2 * i + 1]) * bounds.height + bounds.minY
	});
	let worst = 0;
	for (let v = 0; v < p.length / 3; v += 3) {
		for (const [i, j] of [
			[v, v + 1],
			[v + 1, v + 2],
			[v + 2, v]
		]) {
			const d3 = Math.hypot(
				p[3 * i] - p[3 * j],
				p[3 * i + 1] - p[3 * j + 1],
				p[3 * i + 2] - p[3 * j + 2]
			);
			const a = path(i);
			const b = path(j);
			const d2 = Math.hypot(a.x - b.x, a.y - b.y);
			worst = Math.max(worst, Math.abs(d2 - d3 * s) / Math.max(1, d3 * s));
		}
	}
	return worst;
};

const judge = ({ tubes, bands, space }: ReturnType<typeof setup>) => {
	let meshes = 0;
	let mirrored = 0;
	let worst = 0;
	for (const band of bands) {
		const real = patternBandToReal(space, band.address);
		expect(real).not.toBeNull();
		const realBand = tubes[real!.tube].bands[real!.band];
		const mesh = buildPatternBandMesh(band, realBand.facets);
		expect(mesh).toBeDefined();
		const t = fitFlatToPath(band)!;
		if (t.m < 0) mirrored++;
		worst = Math.max(worst, isometryGap(mesh!, t.s));
		// Each triangle names the real facet it was built from, and its position is
		// that facet's triangle.
		mesh!.facetIndices.forEach((realIndex, t) => {
			const tri = realBand.facets[realIndex].triangle;
			expect(mesh!.positions[9 * t]).toBeCloseTo(tri.a.x, 3);
			expect(mesh!.positions[9 * t + 8]).toBeCloseTo(tri.c.z, 3);
		});
		expect(mesh!.positions.length / 9).toBe(
			band.facets.filter((f) => f.quad && f.triangles).length * 2
		);
		meshes++;
	}
	return { meshes, mirrored, worst };
};

describe('buildPatternBandMesh on real geometry', () => {
	it('tiled default: every band maps isometrically, inside bands mirrored', () => {
		const result = judge(setup(generateDefaultGlobulePatternConfig()));
		expect(result.meshes).toBeGreaterThan(100);
		expect(result.mirrored).toBeGreaterThan(0);
		expect(result.worst).toBeLessThan(1e-6);
	});

	it('hidden bands and unequal split pieces land on their own 3D facets', () => {
		const config = generateDefaultGlobulePatternConfig();
		config.patternConfig.splits = {
			tubeSplits: [
				{ tube: 3, quads: [1] },
				{ tube: 6, quads: [3] }
			]
		};
		const result = judge(setup(config, true));
		expect(result.meshes).toBeGreaterThan(100);
		expect(result.worst).toBeLessThan(1e-6);
	});

	it('outlined: quad facets carry triangles and map isometrically', () => {
		const config = generateDefaultGlobulePatternConfig();
		config.patternTypeConfig = defaultOutlinedPatternConfig();
		const result = judge(setup(config));
		expect(result.meshes).toBeGreaterThan(100);
		expect(result.worst).toBeLessThan(1e-6);
	});
});
