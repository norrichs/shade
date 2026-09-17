import { describe, it, expect } from '@jest/globals';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	generateDefaultGlobulePatternConfig,
	generateDefaultSuperGlobuleConfig
} from '$lib/shades-config';
import { generateProjectionPattern } from '../generate-pattern';
import {
	bandSpaceForTubes,
	keepsFillBands,
	patternBandToReal,
	patternFacetToReal,
	realBandToPattern
} from '../pattern-band-space';
import { partnerHighlightAddresses } from '../../../components/modal/editor/tile-editor/partner-neighbors';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';
import type { Tube } from '$lib/projection-geometry/types';
import type { BandCutPattern, PipelineGates } from '$lib/types';

/**
 * Task 12, real geometry: every pattern quad, mapped onto the 3D tubes the
 * pattern was generated from, must land on the 3D quad it was cut from.
 *
 * Judged by shape: the pattern quad's four sides and shared diagonal must match
 * those of the 3D quad (triangles 2k and 2k+1), each divided by the perimeter.
 * Flattening preserves each triangle and the pattern only adds scale and rigid
 * motion, so the true quad matches; a neighbouring band's quad (what indexing
 * by the pattern number gives) or a fill band does not.
 *
 * Fixtures: the projection with band 1 of every tube hidden and two tubes
 * split into unequal pieces (1+3 and 3+1), and a fillAll surface projection.
 */

const gates: PipelineGates = {
	globule: false,
	globuleTube: false,
	projection: true,
	voronoi: false
};

type V = { x: number; y: number; z?: number };
const d = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const same = (a: V, b: V) => d(a, b) < 1e-6;

/**
 * A quad's intrinsic shape, as flattening preserves it: its four sides and the
 * diagonal the two triangles share, divided by the perimeter. (The other
 * diagonal is not preserved: 3D quads are not planar.)
 */
type Shape = { sides: number[]; diagonal: number };
const shapeOf = (sides: number[], diagonal: number): Shape => {
	const perimeter = sides.reduce((a, b) => a + b, 0);
	return {
		sides: sides.map((x) => x / perimeter).sort((a, b) => a - b),
		diagonal: diagonal / perimeter
	};
};

/** The 3D quad of triangles 2k and 2k+1 of a real band; undefined for a fill band. */
const shape3D = (tubes: Tube[], a: { tube: number; band: number; facet: number }) => {
	const band = tubes[a.tube]?.bands[a.band];
	const t1 = band?.facets[a.facet * 2]?.triangle;
	const t2 = band?.facets[a.facet * 2 + 1]?.triangle;
	if (!band || band.isFill || !t1 || !t2) return undefined;
	const p1 = [t1.a, t1.b, t1.c];
	const p2 = [t2.a, t2.b, t2.c];
	const shared = p1.filter((p) => p2.some((q) => same(p, q)));
	if (shared.length !== 2) return undefined;
	const apex1 = p1.find((p) => !shared.some((q) => same(p, q)))!;
	const apex2 = p2.find((p) => !shared.some((q) => same(p, q)))!;
	const sides = [
		d(apex1, shared[0]),
		d(apex1, shared[1]),
		d(apex2, shared[0]),
		d(apex2, shared[1])
	];
	return shapeOf(sides, d(shared[0], shared[1]));
};

/** Distance between a pattern quad and a 3D quad shape, trying both diagonals. */
const shapeGap = (q: { a: V; b: V; c: V; d: V }, target: Shape) => {
	const sides = [d(q.a, q.b), d(q.b, q.c), d(q.c, q.d), d(q.d, q.a)];
	return Math.min(
		...[d(q.a, q.c), d(q.b, q.d)].map((diagonal) => {
			const s = shapeOf(sides, diagonal);
			return Math.max(
				Math.abs(s.diagonal - target.diagonal),
				...s.sides.map((x, i) => Math.abs(x - target.sides[i]))
			);
		})
	);
};

const judge = (tubes: Tube[], patternTubes: { bands: BandCutPattern[] }[], keepFill: boolean) => {
	const space = bandSpaceForTubes(tubes, keepFill);
	const allBands = patternTubes.flatMap((t) => t.bands);
	const failures: string[] = [];
	let quads = 0;
	allBands.forEach((band) => {
		band.facets.forEach((facet, f) => {
			if (!facet.quad) return;
			// Pieces → parent quad (Task 9), then pattern band → real band (Task 12).
			const parentQuad = partnerHighlightAddresses(allBands, {
				base: { address: { ...band.address, facet: f } }
			} as never).base!;
			const real = patternFacetToReal(space, parentQuad);
			const name = `${JSON.stringify(band.address)} f${f}`;
			const target = real && shape3D(tubes, real);
			if (!target) {
				failures.push(`${name}: no 3D quad at ${JSON.stringify(real)}`);
				return;
			}
			const gap = shapeGap(facet.quad, target);
			if (gap > 1e-4)
				failures.push(`${name}: lands on ${JSON.stringify(real)} (shape gap ${gap.toFixed(3)})`);
			else quads++;
		});
	});
	return { failures, quads, space };
};

const roundTrip = (
	tubes: Tube[],
	patternTubes: { bands: BandCutPattern[] }[],
	keepFill: boolean
) => {
	const space = bandSpaceForTubes(tubes, keepFill);
	const patternKeys = new Set(
		patternTubes.flatMap((t) => t.bands).map((b) => `${b.address.tube}:${b.address.band}`)
	);
	const failures: string[] = [];
	tubes.forEach((tube, t) =>
		tube.bands.forEach((band, b) => {
			const address = { globule: tube.address.globule, tube: t, band: b };
			const pattern = realBandToPattern(space, address);
			const patterned = band.visible && (keepFill || !band.isFill);
			if (!patterned) {
				if (pattern)
					failures.push(`t${t}b${b}: unpatterned band maps to ${JSON.stringify(pattern)}`);
				return;
			}
			const back = pattern && patternBandToReal(space, pattern);
			if (!pattern || !patternKeys.has(`${pattern.tube}:${pattern.band}`))
				failures.push(`t${t}b${b}: maps to missing pattern band ${JSON.stringify(pattern)}`);
			else if (JSON.stringify(back) !== JSON.stringify(address))
				failures.push(`t${t}b${b}: round trip gives ${JSON.stringify(back)}`);
		})
	);
	return failures;
};

const RANGE = { tubes: undefined, bands: undefined, facets: undefined };

const patternOf = (tubes: Tube[], config = generateDefaultGlobulePatternConfig()) =>
	(generateProjectionPattern(tubes, 'sg', config, RANGE) as SuperGlobuleProjectionCutPattern)
		.projectionCutPattern.tubes;

describe('pattern → 3D band mapping on real geometry', () => {
	it('projection with band 1 of every tube hidden and unequal pieces', () => {
		const tubes = generateSuperGlobule(generateDefaultSuperGlobuleConfig(), gates).projections[0]
			.tubes;
		tubes.forEach((tube) => (tube.bands[1].visible = false));
		const config = generateDefaultGlobulePatternConfig();
		config.patternConfig.splits = {
			tubeSplits: [
				{ tube: 3, quads: [1] },
				{ tube: 6, quads: [3] }
			]
		};
		const keepFill = keepsFillBands(config.patternTypeConfig);
		const patternTubes = patternOf(tubes, config);
		const pieces = (t: number) =>
			patternTubes[t].bands.filter((b) => b.address.band === 0).map((b) => b.facets.length);
		expect(pieces(3)).toEqual([1, 3]);
		expect(pieces(6)).toEqual([3, 1]);

		const { failures, quads } = judge(tubes, patternTubes, keepFill);
		expect(failures).toEqual([]);
		expect(quads).toBeGreaterThan(400);
		expect(roundTrip(tubes, patternTubes, keepFill)).toEqual([]);
	});

	it('fillAll surface projection (tiled drops the fill bands)', () => {
		const superConfig = generateDefaultSuperGlobuleConfig();
		superConfig.projectionConfigs[0].surfaceProjectionConfig = { divisions: 2, fillAll: true };
		const tubes =
			generateSuperGlobule(superConfig, gates).projections[0].surfaceProjectionTubes ?? [];
		expect(tubes.flatMap((t) => t.bands).filter((b) => b.isFill).length).toBeGreaterThan(0);
		const config = generateDefaultGlobulePatternConfig();
		const keepFill = keepsFillBands(config.patternTypeConfig);
		const patternTubes = patternOf(tubes, config);

		const { failures, quads } = judge(tubes, patternTubes, keepFill);
		expect(failures).toEqual([]);
		expect(quads).toBeGreaterThan(100);
		expect(roundTrip(tubes, patternTubes, keepFill)).toEqual([]);
	});

	it('all visible, no fill, unsplit: every mapping is the identity', () => {
		const tubes = generateSuperGlobule(generateDefaultSuperGlobuleConfig(), gates).projections[0]
			.tubes;
		const config = generateDefaultGlobulePatternConfig();
		const keepFill = keepsFillBands(config.patternTypeConfig);
		const patternTubes = patternOf(tubes, config);
		const { failures, quads, space } = judge(tubes, patternTubes, keepFill);
		expect(failures).toEqual([]);
		expect(quads).toBeGreaterThan(400);
		expect(roundTrip(tubes, patternTubes, keepFill)).toEqual([]);
		patternTubes
			.flatMap((t) => t.bands)
			.forEach((b) =>
				expect(patternBandToReal(space, b.address)).toEqual({
					globule: b.address.globule,
					tube: b.address.tube,
					band: b.address.band
				})
			);
	});
});
