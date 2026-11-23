/**
 * Map a cut-pattern band back onto the 3D band it was cut from, as a mesh whose
 * UVs are the band's own pattern (path) space.
 *
 * Why this is exact: flattening is isometric per triangle and keeps vertex labels
 * (flat `a/b/c` ↔ 3D `a/b/c`, `getFlatTriangle`). The pattern paths are drawn in
 * quad space, which is the flat layout under ONE similarity per band —
 * `pixelScale`, an x-mirror for inside bands and a shift (`getQuadrilaterals`).
 * So a 3D vertex's UV is simply its flat position mapped into path space.
 *
 * `CutPattern.triangles` holds the flat triangles BEFORE that similarity, and
 * `CutPattern.quad` the quad AFTER it. `quad.a` is always `triangles[0].a` and
 * `quad.b` always `triangles[0].b` (both orientation branches of
 * `getQuadrilaterals`), which is what the transform is fitted from.
 *
 * Pure and Three-free so it is unit-testable and worker-safe.
 */
import type { BandCutPattern } from '#lib/types.js';

type XY = { x: number; y: number };
type Tri = { a: XY; b: XY; c: XY };
type Tri3 = { a: XY & { z: number }; b: XY & { z: number }; c: XY & { z: number } };

/** Flat layout → path space: `x' = s·m·x + tx`, `y' = s·y + ty`. */
export type FlatToPath = { s: number; m: 1 | -1; tx: number; ty: number };

export type PatternBandMesh = {
	bandId: string;
	/** Non-indexed, 3 floats per vertex, 3 vertices per real facet. */
	positions: Float32Array;
	/** Per triangle: the real 3D band's facet index it was built from (for picking). */
	facetIndices: Int32Array;
	/** 2 floats per vertex, normalised to `bounds`, v flipped for a canvas texture. */
	uvs: Float32Array;
	/** The band's path-space box the UVs are normalised to (= the texture's extent). */
	bounds: { minX: number; minY: number; width: number; height: number };
};

/** Pattern facets that carry a quad and its two flat triangles, in quad order. */
const quadFacets = (band: BandCutPattern) =>
	band.facets.filter(
		(f): f is typeof f & { quad: NonNullable<typeof f.quad>; triangles: [Tri, Tri] } =>
			!!f.quad && !!f.triangles
	);

/**
 * Fit the band's flat → path similarity. The mirror is `getQuadrilaterals`' own
 * rule (inside bands are x-mirrored) — it cannot be read off an a→b edge that
 * alignment left vertical, which a one-quad split piece can be. Scale comes from
 * the longest a→b edge (a degenerate pole facet has none), the shift from
 * `quad.a ↔ triangles[0].a`. Undefined when nothing fits.
 */
export const fitFlatToPath = (band: BandCutPattern): FlatToPath | undefined => {
	const facets = quadFacets(band);
	let best: (typeof facets)[number] | undefined;
	let bestLen = 0;
	for (const f of facets) {
		const len = Math.hypot(
			f.triangles[0].b.x - f.triangles[0].a.x,
			f.triangles[0].b.y - f.triangles[0].a.y
		);
		if (len > bestLen) {
			bestLen = len;
			best = f;
		}
	}
	if (!best || bestLen < 1e-9) return undefined;
	const fa = best.triangles[0].a;
	const quadLen = Math.hypot(best.quad.b.x - best.quad.a.x, best.quad.b.y - best.quad.a.y);
	const s = quadLen / bestLen;
	// `getQuadrilaterals` treats an unset orientation as inside.
	const m: 1 | -1 = (band.sideOrientation ?? 'inside') === 'inside' ? -1 : 1;
	return {
		s,
		m,
		tx: best.quad.a.x - s * m * fa.x,
		ty: best.quad.a.y - s * fa.y
	};
};

const applyFlatToPath = (t: FlatToPath, p: XY): XY => ({
	x: t.s * t.m * p.x + t.tx,
	y: t.s * p.y + t.ty
});

const KEYS = ['a', 'b', 'c'] as const;

/**
 * The pattern band's mesh on its real 3D band. `realFacets` is the 3D band's
 * facet list (parent band for a split piece); pattern quad `q` covers real
 * facets `2(parentQuadOffset + q)` and `+1`. Undefined when the band cannot be
 * mapped: no quads with triangles, an unfittable transform, or a fit that does
 * not reproduce the quads (a safety net, never expected).
 */
export const buildPatternBandMesh = (
	band: BandCutPattern,
	realFacets: { triangle: Tri3 }[]
): PatternBandMesh | undefined => {
	const facets = quadFacets(band);
	const t = fitFlatToPath(band);
	if (!t || facets.length === 0) return undefined;

	const offset = band.parentQuadOffset ?? 0;
	const tolerance = 1e-6 * Math.max(1, t.s) * 1000;
	const pos: number[] = [];
	const flat: XY[] = [];
	const facetIndices: number[] = [];
	for (let q = 0; q < facets.length; q++) {
		const f = facets[q];
		// quad.a and quad.b are triangles[0].a and .b under the transform; a miss
		// means the fit (or the mirror rule) is wrong, so refuse rather than smear.
		for (const k of ['a', 'b'] as const) {
			const check = applyFlatToPath(t, f.triangles[0][k]);
			if (Math.hypot(check.x - f.quad[k].x, check.y - f.quad[k].y) > tolerance) return undefined;
		}
		for (let j = 0; j < 2; j++) {
			const realIndex = 2 * (offset + q) + j;
			const real = realFacets[realIndex]?.triangle;
			if (!real) continue;
			facetIndices.push(realIndex);
			for (const k of KEYS) {
				pos.push(real[k].x, real[k].y, real[k].z);
				flat.push(applyFlatToPath(t, f.triangles[j][k]));
			}
		}
	}
	if (flat.length === 0) return undefined;

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of flat) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	const width = Math.max(maxX - minX, 1e-9);
	const height = Math.max(maxY - minY, 1e-9);
	const uvs = new Float32Array(flat.length * 2);
	flat.forEach((p, i) => {
		uvs[2 * i] = (p.x - minX) / width;
		// Canvas row 0 is the top; CanvasTexture's default flipY puts it at v = 1.
		uvs[2 * i + 1] = 1 - (p.y - minY) / height;
	});
	return {
		bandId: band.id,
		positions: new Float32Array(pos),
		facetIndices: new Int32Array(facetIndices),
		uvs,
		bounds: { minX, minY, width, height }
	};
};
