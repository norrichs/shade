import type { BandCutPattern, PathSegment, Quadrilateral } from '$lib/types';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';
import { resolvePair } from './partner-pair-resolver';

export type PartnerRole = 'top' | 'bottom' | 'left' | 'right';
export type RuleSetKey = 'withinBand' | 'acrossBands' | 'partner.startEnd' | 'partner.endEnd';

export type ResolvedBase = {
	address: GlobuleAddress_Facet;
	quad: Quadrilateral;
	path: PathSegment[];
	originalPath?: PathSegment[];
};

export type ResolvedPartner = {
	role: PartnerRole;
	ruleSet: RuleSetKey;
	address: GlobuleAddress_Facet;
	quad: Quadrilateral;
	path: PathSegment[];
	originalPath?: PathSegment[];
};

export type PartnerBundle = {
	base: ResolvedBase;
	top: ResolvedPartner | null;
	bottom: ResolvedPartner | null;
	left: ResolvedPartner | null;
	right: ResolvedPartner | null;
};

type Pt = { x: number; y: number };

// Rigid 2-point transform: returns a function that maps src1→dst1, src2→dst2
// (assumes |src2-src1| = |dst2-dst1|, true under isometric flattening).
const rigidFromTwoPoints = (
	src1: Pt,
	src2: Pt,
	dst1: Pt,
	dst2: Pt
): ((p: Pt) => Pt) => {
	const srcAng = Math.atan2(src2.y - src1.y, src2.x - src1.x);
	const dstAng = Math.atan2(dst2.y - dst1.y, dst2.x - dst1.x);
	const theta = dstAng - srcAng;
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	const tx = dst1.x - (cos * src1.x - sin * src1.y);
	const ty = dst1.y - (sin * src1.x + cos * src1.y);
	return (p: Pt) => ({
		x: cos * p.x - sin * p.y + tx,
		y: sin * p.x + cos * p.y + ty
	});
};

const transformQuadFn = (q: Quadrilateral, fn: (p: Pt) => Pt): Quadrilateral =>
	({
		a: { ...fn(q.a), z: q.a.z },
		b: { ...fn(q.b), z: q.b.z },
		c: { ...fn(q.c), z: q.c.z },
		d: { ...fn(q.d), z: q.d.z }
	}) as unknown as Quadrilateral;

const transformPathFn = (path: PathSegment[], fn: (p: Pt) => Pt): PathSegment[] =>
	path.map((seg) => {
		if (seg[0] === 'M' || seg[0] === 'L') {
			const p = fn({ x: seg[1] as number, y: seg[2] as number });
			return [seg[0], p.x, p.y] as PathSegment;
		}
		return seg;
	});

const findBand = (
	bands: BandCutPattern[],
	tube: number,
	band: number
): BandCutPattern | undefined =>
	bands.find((b) => b.address.tube === tube && b.address.band === band);

export const resolveBaseAndPartners = (
	allBands: BandCutPattern[],
	baseAddress: GlobuleAddress_Facet
): PartnerBundle | null => {
	const baseBand = findBand(allBands, baseAddress.tube, baseAddress.band);
	if (!baseBand) return null;
	const baseFacet = baseBand.facets[baseAddress.facet];
	if (!baseFacet?.quad) return null;

	const base: ResolvedBase = {
		address: baseAddress,
		quad: baseFacet.quad,
		path: structuredClone(baseFacet.path),
		originalPath: baseFacet.meta?.originalPath
			? structuredClone(baseFacet.meta.originalPath)
			: undefined
	};

	const sameBandTop = (): ResolvedPartner | null => {
		const next = baseBand.facets[baseAddress.facet + 1];
		if (!next?.quad) return null;
		return {
			role: 'top',
			ruleSet: 'withinBand',
			address: { ...baseAddress, facet: baseAddress.facet + 1 },
			quad: next.quad,
			path: structuredClone(next.path),
			originalPath: next.meta?.originalPath
				? structuredClone(next.meta.originalPath)
				: undefined
		};
	};

	const sameBandBottom = (): ResolvedPartner | null => {
		if (baseAddress.facet === 0) return null;
		const prev = baseBand.facets[baseAddress.facet - 1];
		if (!prev?.quad) return null;
		return {
			role: 'bottom',
			ruleSet: 'withinBand',
			address: { ...baseAddress, facet: baseAddress.facet - 1 },
			quad: prev.quad,
			path: structuredClone(prev.path),
			originalPath: prev.meta?.originalPath
				? structuredClone(prev.meta.originalPath)
				: undefined
		};
	};

	const crossTubeBottom = (): ResolvedPartner | null => {
		if (baseAddress.facet !== 0) return null;
		const pair = resolvePair(allBands, baseAddress, 'partnerStart');
		if (!pair) return null;
		return {
			role: 'bottom',
			ruleSet: 'partner.startEnd',
			address: pair.ghostAddress,
			quad: pair.ghostQuad,
			path: pair.ghostPath,
			originalPath: pair.ghostOriginalPath
		};
	};

	const crossTubeTop = (): ResolvedPartner | null => {
		if (baseAddress.facet !== baseBand.facets.length - 1) return null;
		const pair = resolvePair(allBands, baseAddress, 'partnerEnd');
		if (!pair) return null;
		return {
			role: 'top',
			ruleSet: 'partner.endEnd',
			address: pair.ghostAddress,
			quad: pair.ghostQuad,
			path: pair.ghostPath,
			originalPath: pair.ghostOriginalPath
		};
	};

	const top = sameBandTop() ?? crossTubeTop();
	const bottom = sameBandBottom() ?? crossTubeBottom();

	const resolveLeft = (): ResolvedPartner | null => {
		const left = findBand(allBands, baseAddress.tube, baseAddress.band - 1);
		if (!left) return null;
		const facet = left.facets[baseAddress.facet];
		if (!facet?.quad) return null;
		// partner's right edge (b-c) coincides with base's left edge (a-d):
		const fn = rigidFromTwoPoints(facet.quad.b, facet.quad.c, baseFacet.quad.a, baseFacet.quad.d);
		return {
			role: 'left',
			ruleSet: 'acrossBands',
			address: { globule: baseAddress.globule, tube: baseAddress.tube, band: baseAddress.band - 1, facet: baseAddress.facet },
			quad: transformQuadFn(facet.quad, fn),
			path: transformPathFn(structuredClone(facet.path), fn),
			originalPath: facet.meta?.originalPath
				? transformPathFn(structuredClone(facet.meta.originalPath), fn)
				: undefined
		};
	};

	const resolveRight = (): ResolvedPartner | null => {
		const right = findBand(allBands, baseAddress.tube, baseAddress.band + 1);
		if (!right) return null;
		const facet = right.facets[baseAddress.facet];
		if (!facet?.quad) return null;
		// partner's left edge (a-d) coincides with base's right edge (b-c):
		const fn = rigidFromTwoPoints(facet.quad.a, facet.quad.d, baseFacet.quad.b, baseFacet.quad.c);
		return {
			role: 'right',
			ruleSet: 'acrossBands',
			address: { globule: baseAddress.globule, tube: baseAddress.tube, band: baseAddress.band + 1, facet: baseAddress.facet },
			quad: transformQuadFn(facet.quad, fn),
			path: transformPathFn(structuredClone(facet.path), fn),
			originalPath: facet.meta?.originalPath
				? transformPathFn(structuredClone(facet.meta.originalPath), fn)
				: undefined
		};
	};

	const left = resolveLeft();
	const right = resolveRight();

	return { base, top, bottom, left, right };
};
