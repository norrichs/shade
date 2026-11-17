import { describe, it, expect, beforeAll } from '@jest/globals';
import { Triangle, Vector3 } from 'three';
import type { Band, Facet, PipelineGates } from '#lib/types.js';
import { prepareUnfold, applyUnfold, type UnfoldPlan } from '../unfold-band';
import { getFlatStripV2 } from '#lib/cut-pattern/generate-cut-pattern.js';
import { generateSuperGlobule } from '#lib/generate-superglobule.js';
import { defaultVoronoiConfig, generateDefaultSuperGlobuleConfig } from '#lib/shades-config.js';

// Lattice point (x ∈ {0,1}, y) of a zig-zag strip like tube-fixture's buildBand,
// lifted off the plane so every hinge has a real dihedral.
type Lift = (x: number, y: number) => number;
const wavy: Lift = (x, y) => 0.45 * Math.sin(1.3 * y + 0.4) + 0.25 * x * Math.cos(0.9 * y);

const buildFoldedBand = (
	facetCount: number,
	lift: Lift = wavy,
	opts: { reverseOddWinding?: boolean; poleFacet?: boolean } = {}
): Band => {
	const p = (x: number, y: number) => new Vector3(x, y, lift(x, y));
	const facets: Facet[] = [];
	if (opts.poleFacet) {
		facets.push({
			triangle: new Triangle(p(0, 0), p(1, 0), p(1, 0)),
			orientation: 'axial-right',
			isDegenerate: true
		} as Facet);
	}
	for (let i = 0; i < facetCount; i++) {
		const y = Math.floor(i / 2);
		let triangle =
			i % 2 === 0
				? new Triangle(p(0, y), p(1, y), p(0, y + 1))
				: new Triangle(p(1, y), p(1, y + 1), p(0, y + 1));
		if (opts.reverseOddWinding && i % 2 === 1) {
			triangle = new Triangle(triangle.a, triangle.c, triangle.b);
		}
		facets.push({ triangle, orientation: 'axial-right' } as Facet);
	}
	return { orientation: 'axial-right', visible: true, facets } as unknown as Band;
};

const run = (plan: UnfoldPlan, t: number) => {
	const out = new Float32Array(plan.facetCount * 9);
	applyUnfold(plan, t, out);
	return out;
};

const vertex = (arr: ArrayLike<number>, i: number) =>
	new Vector3(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);

const edgeLengths = (arr: ArrayLike<number>, facetCount: number) => {
	const lengths: number[] = [];
	for (let f = 0; f < facetCount; f++) {
		const [a, b, c] = [0, 1, 2].map((k) => vertex(arr, f * 3 + k));
		lengths.push(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
	}
	return lengths;
};

const planeDistances = (arr: ArrayLike<number>, plan: UnfoldPlan) => {
	const o = vertex(arr, plan.anchor * 3);
	const n = new Vector3()
		.subVectors(vertex(arr, plan.anchor * 3 + 1), o)
		.cross(new Vector3().subVectors(vertex(arr, plan.anchor * 3 + 2), o))
		.normalize();
	const d: number[] = [];
	for (let i = 0; i < plan.facetCount * 3; i++) d.push(Math.abs(vertex(arr, i).sub(o).dot(n)));
	return d;
};

const maxAbsDiff = (a: ArrayLike<number>, b: ArrayLike<number>) => {
	let m = 0;
	for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
	return m;
};

describe('prepareUnfold / applyUnfold', () => {
	const band = buildFoldedBand(16);
	const plan = prepareUnfold(band)!;

	it('returns null for an empty band', () => {
		expect(prepareUnfold({ facets: [] } as unknown as Band)).toBeNull();
	});

	it('t=0 reproduces the original 3D vertices', () => {
		const out = run(plan, 0);
		band.facets.forEach((f, i) => {
			(['a', 'b', 'c'] as const).forEach((k, j) => {
				expect(vertex(out, i * 3 + j).distanceTo(f.triangle[k])).toBeLessThan(1e-5);
			});
		});
	});

	it('t=1 is coplanar with the anchor', () => {
		expect(Math.max(...planeDistances(run(plan, 1), plan))).toBeLessThan(1e-4);
	});

	it('the band really is folded at t=0 (fixture sanity)', () => {
		expect(Math.max(...planeDistances(run(plan, 0), plan))).toBeGreaterThan(0.1);
	});

	it('preserves edge lengths at intermediate t', () => {
		const base = edgeLengths(run(plan, 0), plan.facetCount);
		for (const t of [0.3, 0.7, 1]) {
			const lengths = edgeLengths(run(plan, t), plan.facetCount);
			lengths.forEach((l, i) => expect(Math.abs(l - base[i])).toBeLessThan(1e-4));
		}
	});

	it('keeps the anchor facet fixed at every t', () => {
		const slice = (arr: Float32Array) => Array.from(arr.slice(plan.anchor * 9, plan.anchor * 9 + 9));
		const at0 = slice(run(plan, 0));
		expect(slice(run(plan, 0.5))).toEqual(at0);
		expect(slice(run(plan, 1))).toEqual(at0);
	});

	it('anchors on the facet most parallel to the averaged plane', () => {
		// Facet 8 spans lattice points (0,4),(1,4),(0,5); keep exactly those flat
		// and fold everything else symmetrically so the fit plane stays ~z.
		const flatAt = new Set(['0,4', '1,4', '0,5']);
		const lift: Lift = (x, y) => (flatAt.has(`${x},${y}`) ? 0 : 0.4 * (y % 2 === 0 ? 1 : -1));
		const p = prepareUnfold(buildFoldedBand(16, lift))!;
		expect(p.anchor).toBe(8);
	});

	it('is continuous approaching 1 (no 180°/0° jump)', () => {
		expect(maxAbsDiff(run(plan, 0.999), run(plan, 1))).toBeLessThan(0.01 * 8);
		expect(maxAbsDiff(run(plan, 0.5), run(plan, 0.501))).toBeLessThan(0.01 * 8);
	});

	it('flattens bands whose stored winding alternates', () => {
		const p = prepareUnfold(buildFoldedBand(16, wavy, { reverseOddWinding: true }))!;
		expect(Math.max(...planeDistances(run(p, 1), p))).toBeLessThan(1e-4);
		const base = edgeLengths(run(p, 0), p.facetCount);
		edgeLengths(run(p, 1), p.facetCount).forEach((l, i) =>
			expect(Math.abs(l - base[i])).toBeLessThan(1e-4)
		);
	});

	it('flattens to a non-overlapping strip, not folded back on itself', () => {
		// Unfolded consecutive facets lie on opposite sides of their shared edge,
		// so the flat strip spans its full length (~8 units of y here).
		const out = run(plan, 1);
		let maxSpan = 0;
		for (let i = 0; i < plan.facetCount * 3; i++)
			maxSpan = Math.max(maxSpan, vertex(out, i).distanceTo(vertex(out, 0)));
		expect(maxSpan).toBeGreaterThan(7.5);
	});

	it('keeps a collapsed pole facet finite', () => {
		const p = prepareUnfold(buildFoldedBand(12, wavy, { poleFacet: true }))!;
		for (const t of [0, 0.5, 1]) {
			expect(run(p, t).every((v) => Number.isFinite(v))).toBe(true);
		}
		expect(Math.max(...planeDistances(run(p, 1), p))).toBeLessThan(1e-4);
	});
});

describe('unfold on real generated bands', () => {
	const gates: PipelineGates = { globuleTube: true, projection: true, voronoi: true };
	let bands: Band[] = [];
	let projectionBands: Band[] = [];
	let voronoiBandCount = 0;

	beforeAll(() => {
		const config = { ...generateDefaultSuperGlobuleConfig(), voronoiConfig: defaultVoronoiConfig };
		const sg = generateSuperGlobule(config, gates);
		projectionBands = (sg.projections[0]?.tubes ?? [])
			.flatMap((t) => t.bands)
			.filter((b) => b.facets.length > 0);
		voronoiBandCount = (sg.voronoiResult?.tubes ?? []).flatMap((t) => t.bands).length;
		bands = [
			...(sg.globuleTubes ?? []).flatMap((t) => t.bands),
			...projectionBands,
			...(sg.voronoiResult?.tubes ?? []).flatMap((t) => t.bands),
			...(sg.voronoiResult?.surfaceProjectionTubes ?? []).flatMap((t) => t.bands)
		].filter(
			(b) => b.facets.length > 0
		);
	});

	// The test fixture's vertex layout is not one getFlatStripV2's orientation
	// tables read correctly, and globule-tube bands start at a pole sliver that
	// getFlatStripV2 collapses to a point, so congruence is checked on real
	// projection bands.
	it('t=1 is congruent to the pattern pipeline flattening (getFlatStripV2)', () => {
		expect(projectionBands.length).toBeGreaterThan(0);
		const problems: string[] = [];
		projectionBands.forEach((band, b) => {
			const flatStrip = getFlatStripV2(band, { bandStyle: 'helical-right' });
			const flat: number[] = [];
			flatStrip.facets.forEach((f) =>
				(['a', 'b', 'c'] as const).forEach((k) => flat.push(f.triangle[k].x, f.triangle[k].y, 0))
			);
			const p = prepareUnfold(band)!;
			const ours = run(p, 1);
			const scale = Math.max(...edgeLengths(ours, p.facetCount));
			const n = p.facetCount * 3;
			let worst = 0;
			for (let i = 0; i < n; i++) {
				for (let j = i + 1; j < n; j++) {
					const dOurs = vertex(ours, i).distanceTo(vertex(ours, j));
					const dFlat = vertex(flat, i).distanceTo(vertex(flat, j));
					worst = Math.max(worst, Math.abs(dOurs - dFlat));
				}
			}
			if (worst > 1e-5 * scale) problems.push(`${b}: ${worst}`);
		});
		expect(problems).toEqual([]);
	});

	it('every band flattens finite, coplanar and isometric', () => {
		expect(projectionBands.length).toBeGreaterThan(0);
		expect(voronoiBandCount).toBeGreaterThan(0);
		const problems: string[] = [];
		bands.forEach((band, i) => {
			const p = prepareUnfold(band)!;
			const flat = run(p, 1);
			if (!flat.every((v) => Number.isFinite(v))) return problems.push(`${i}: NaN`);
			const scale = Math.max(1, ...edgeLengths(run(p, 0), p.facetCount));
			const off = Math.max(...planeDistances(flat, p));
			if (off > 1e-4 * scale) problems.push(`${i}: off-plane ${off}`);
			const base = edgeLengths(run(p, 0), p.facetCount);
			const lens = edgeLengths(flat, p.facetCount);
			const worst = Math.max(...lens.map((l, k) => Math.abs(l - base[k])));
			if (worst > 1e-4 * scale) problems.push(`${i}: edge drift ${worst}`);
		});
		expect(problems).toEqual([]);
	});
});
