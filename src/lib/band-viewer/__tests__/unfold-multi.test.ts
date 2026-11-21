import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';
import type { Band, Facet, PipelineGates } from '#lib/types.js';
import {
	prepareUnfold,
	prepareMultiUnfold,
	applyMultiUnfold,
	multiFrameNormal,
	type UnfoldPlan
} from '../unfold-band';
import { generateSuperGlobule } from '#lib/generate-superglobule.js';
import { defaultVoronoiConfig, generateDefaultSuperGlobuleConfig } from '#lib/shades-config.js';

const lift = (x: number, y: number) =>
	0.45 * Math.sin(1.3 * y + 0.4) + 0.25 * x * Math.cos(0.9 * y);

/** Zig-zag strip like tube-fixture's buildBand, folded, offset by `shift`. */
const buildBand = (facetCount: number, shift = new Vector3()): Band => {
	const p = (x: number, y: number) => new Vector3(x, y, lift(x, y)).add(shift);
	const facets = Array.from({ length: facetCount }, (_, i) => {
		const y = Math.floor(i / 2);
		const triangle =
			i % 2 === 0
				? new Triangle(p(0, y), p(1, y), p(0, y + 1))
				: new Triangle(p(1, y), p(1, y + 1), p(0, y + 1));
		return { triangle, orientation: 'axial-right' } as Facet;
	});
	return { orientation: 'axial-right', visible: true, facets } as unknown as Band;
};

const v = (arr: ArrayLike<number>, i: number) =>
	new Vector3(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);

/** Max distance of a band slice's vertices from its first facet's plane. */
const offPlane = (arr: ArrayLike<number>, firstVertex: number, vertexCount: number) => {
	const o = v(arr, firstVertex);
	const n = new Vector3()
		.subVectors(v(arr, firstVertex + 1), o)
		.cross(new Vector3().subVectors(v(arr, firstVertex + 2), o))
		.normalize();
	let worst = 0;
	for (let i = 0; i < vertexCount; i++)
		worst = Math.max(
			worst,
			Math.abs(
				v(arr, firstVertex + i)
					.sub(o)
					.dot(n)
			)
		);
	return worst;
};

describe('anchor override', () => {
	const band = buildBand(12);

	it('anchor override picks that facet', () => {
		expect(prepareUnfold(band, { anchor: 3 })!.anchor).toBe(3);
	});

	it('anchor override clamps to the last facet', () => {
		expect(prepareUnfold(band, { anchor: 999 })!.anchor).toBe(11);
	});

	it('auto is unchanged', () => {
		expect(prepareUnfold(band, {})!.anchor).toBe(prepareUnfold(band)!.anchor);
	});

	it('the overridden anchor stays fixed while unfolding', () => {
		const multi = prepareMultiUnfold([prepareUnfold(band, { anchor: 3 })!])!;
		const a = new Float32Array(multi.facetCount * 9);
		const b = new Float32Array(multi.facetCount * 9);
		applyMultiUnfold(multi, 0, a);
		applyMultiUnfold(multi, 1, b);
		expect(Array.from(b.slice(27, 36))).toEqual(Array.from(a.slice(27, 36)));
	});
});

describe('prepareMultiUnfold / applyMultiUnfold', () => {
	const p0 = prepareUnfold(buildBand(8))!;
	const p1 = prepareUnfold(buildBand(10, new Vector3(5, 0, 0)))!;

	it('returns null for no plans', () => {
		expect(prepareMultiUnfold([])).toBeNull();
	});

	it('offsets and facet count', () => {
		const m = prepareMultiUnfold([p0, p1])!;
		expect(Array.from(m.offsets)).toEqual([0, 8 * 9]);
		expect(m.facetCount).toBe(18);
	});

	it('t=0 is each band as modelled, concatenated', () => {
		const m = prepareMultiUnfold([p0, p1])!;
		const out = new Float32Array(m.facetCount * 9);
		applyMultiUnfold(m, 0, out);
		const expected = [...Array.from(p0.original), ...Array.from(p1.original)];
		Array.from(out).forEach((x, i) => expect(Math.abs(x - expected[i])).toBeLessThan(1e-5));
	});

	it('t=1 is coplanar per band', () => {
		const m = prepareMultiUnfold([p0, p1])!;
		const out = new Float32Array(m.facetCount * 9);
		applyMultiUnfold(m, 1, out);
		expect(offPlane(out, 0, 8 * 3)).toBeLessThan(1e-4);
		expect(offPlane(out, 8 * 3, 10 * 3)).toBeLessThan(1e-4);
	});

	it('bounds cover every band', () => {
		const m = prepareMultiUnfold([p0, p1])!;
		expect(m.radius).toBeGreaterThanOrEqual(Math.max(p0.radius, p1.radius));
		expect(m.centroid.x).toBeGreaterThan(p0.centroid.x);
		expect(m.centroid.x).toBeLessThan(p1.centroid.x);
	});

	it('frameNormal: one band → its anchor normal; several → away from the origin', () => {
		expect(prepareMultiUnfold([p0])!.frameNormal.toArray()).toEqual(p0.anchorNormal.toArray());
		const m = prepareMultiUnfold([p0, p1])!;
		const expected = m.centroid.clone().normalize();
		expect(m.frameNormal.distanceTo(expected)).toBeLessThan(1e-9);
	});

	it('frameNormal falls back to +Y when the centroid is at the origin', () => {
		expect(multiFrameNormal([p0, p1], new Vector3()).toArray()).toEqual([0, 1, 0]);
	});
});

describe('multi plan over real bands', () => {
	const gates: PipelineGates = { globuleTube: true, projection: true, voronoi: true };
	const config = { ...generateDefaultSuperGlobuleConfig(), voronoiConfig: defaultVoronoiConfig };
	const sg = generateSuperGlobule(config, gates);
	const bands: Band[] = [
		...(sg.globuleTubes ?? []).flatMap((t) => t.bands),
		...(sg.projections[0]?.tubes ?? []).flatMap((t) => t.bands),
		...(sg.voronoiResult?.tubes ?? []).flatMap((t) => t.bands)
	].filter((b) => b.facets.length > 0);

	for (const anchor of [undefined, 2]) {
		it(`every band at once stays finite and coplanar per band (anchor ${anchor ?? 'auto'})`, () => {
			const plans = bands.map((b) => prepareUnfold(b, { anchor })!) as UnfoldPlan[];
			const m = prepareMultiUnfold(plans)!;
			const out = new Float32Array(m.facetCount * 9);
			applyMultiUnfold(m, 0.5, out);
			expect(out.every(Number.isFinite)).toBe(true);
			applyMultiUnfold(m, 1, out);
			expect(out.every(Number.isFinite)).toBe(true);
			const problems: string[] = [];
			plans.forEach((p, i) => {
				const scale = Math.max(1, p.radius);
				// Plane of the band's anchor facet; every vertex of the band on it.
				const o = v(out, m.offsets[i] / 3 + p.anchor * 3);
				const n = new Vector3()
					.subVectors(v(out, m.offsets[i] / 3 + p.anchor * 3 + 1), o)
					.cross(new Vector3().subVectors(v(out, m.offsets[i] / 3 + p.anchor * 3 + 2), o));
				if (n.length() === 0) return; // collapsed anchor: no plane to test against
				n.normalize();
				for (let k = 0; k < p.facetCount * 3; k++) {
					const d = Math.abs(
						v(out, m.offsets[i] / 3 + k)
							.sub(o)
							.dot(n)
					);
					if (d > 1e-4 * scale) {
						problems.push(`${i}: ${d}`);
						break;
					}
				}
			});
			expect(problems).toEqual([]);
		});
	}
});
