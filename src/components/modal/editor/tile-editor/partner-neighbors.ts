import type { BandCutPattern, PathSegment, Quadrilateral } from '$lib/types';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';
import { resolvePair } from './partner-pair-resolver';
import {
	alongsideFacetIndex,
	findAdjacentSideNeighbour,
	findBandByExactAddressInBands
} from '$lib/cut-pattern/resolve-partner-band';
import { bandAddressOf } from './base-quad-selection';

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
	// True when the rule's `target` index lives on the base path and `source` lives on this
	// partner's path. False when the runtime adjuster treats this partner as the "current"
	// facet (i.e. its path is the one being mutated) — in that case `target` lives on the
	// partner and `source` lives on base. Drives both rule rendering and rule authoring.
	baseIsTarget: boolean;
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
const rigidFromTwoPoints = (src1: Pt, src2: Pt, dst1: Pt, dst2: Pt): ((p: Pt) => Pt) => {
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

/**
 * The base quad and its four partners, as the tiled adjusters see them.
 *
 * `allBands` may hold pieces of split bands, so every band is identified by
 * address, never by array position (spec amendment 2026-09-16):
 * - base: the band or piece `baseAddress` names exactly (a piece selection
 *   carries `piece`; `facet` is local to that piece);
 * - top/bottom: within the base band or piece; past its ends, the end partner
 *   (`resolvePair`: outer end by which end joins, seam exactly);
 * - left/right: side neighbours by the side-neighbour rule
 *   (`findAdjacentSideNeighbour`, no wrap), paired in parent quad coordinates
 *   (`alongsideFacetIndex`).
 */
export const resolveBaseAndPartners = (
	allBands: BandCutPattern[],
	baseAddress: GlobuleAddress_Facet
): PartnerBundle | null => {
	const baseBand = findBandByExactAddressInBands(allBands, bandAddressOf(baseAddress));
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
		// Runtime processes base (facet f) with `nextPath` as source → base IS current; baseIsTarget=true.
		return {
			role: 'top',
			ruleSet: 'withinBand',
			baseIsTarget: true,
			address: { ...baseAddress, facet: baseAddress.facet + 1 },
			quad: next.quad,
			path: structuredClone(next.path),
			originalPath: next.meta?.originalPath ? structuredClone(next.meta.originalPath) : undefined
		};
	};

	const sameBandBottom = (): ResolvedPartner | null => {
		if (baseAddress.facet === 0) return null;
		const prev = baseBand.facets[baseAddress.facet - 1];
		if (!prev?.quad) return null;
		// Runtime processes bottom (facet f-1) with base (facet f) as its source → bottom is current,
		// base is neighbor. So rule.target lives on the bottom path; baseIsTarget=false.
		return {
			role: 'bottom',
			ruleSet: 'withinBand',
			baseIsTarget: false,
			address: { ...baseAddress, facet: baseAddress.facet - 1 },
			quad: prev.quad,
			path: structuredClone(prev.path),
			originalPath: prev.meta?.originalPath ? structuredClone(prev.meta.originalPath) : undefined
		};
	};

	const crossTubeBottom = (): ResolvedPartner | null => {
		if (baseAddress.facet !== 0) return null;
		const pair = resolvePair(allBands, baseBand.address, 'partnerStart');
		if (!pair) return null;
		return {
			role: 'bottom',
			ruleSet: 'partner.startEnd',
			baseIsTarget: true,
			address: pair.ghostAddress,
			quad: pair.ghostQuad,
			path: pair.ghostPath,
			originalPath: pair.ghostOriginalPath
		};
	};

	const crossTubeTop = (): ResolvedPartner | null => {
		if (baseAddress.facet !== baseBand.facets.length - 1) return null;
		const pair = resolvePair(allBands, baseBand.address, 'partnerEnd');
		if (!pair) return null;
		return {
			role: 'top',
			ruleSet: 'partner.endEnd',
			baseIsTarget: true,
			address: pair.ghostAddress,
			quad: pair.ghostQuad,
			path: pair.ghostPath,
			originalPath: pair.ghostOriginalPath
		};
	};

	const top = sameBandTop() ?? crossTubeTop();
	const bottom = sameBandBottom() ?? crossTubeBottom();

	// Side neighbours live in the base's own tube. Parent order, and so which band
	// is "previous", is the order parents appear in the tube's band array.
	const tubeBands = allBands.filter(
		(b) =>
			b.address.globule === baseBand.address.globule && b.address.tube === baseBand.address.tube
	);
	const baseIndex = tubeBands.indexOf(baseBand);

	const resolveLeft = (): ResolvedPartner | null => {
		// The adjuster processes base with its previous side neighbour as source.
		const left = findAdjacentSideNeighbour(tubeBands, baseIndex, -1, false);
		if (!left) return null;
		const index = alongsideFacetIndex(baseBand, baseAddress.facet, left);
		const facet = index === undefined ? undefined : left.facets[index];
		if (index === undefined || !facet?.quad) return null;
		// partner's right edge (b-c) coincides with base's left edge (a-d):
		const fn = rigidFromTwoPoints(facet.quad.b, facet.quad.c, baseFacet.quad.a, baseFacet.quad.d);
		// Runtime processes base with prevBand=left as source → base IS current; baseIsTarget=true.
		return {
			role: 'left',
			ruleSet: 'acrossBands',
			baseIsTarget: true,
			address: { ...left.address, facet: index },
			quad: transformQuadFn(facet.quad, fn),
			path: transformPathFn(structuredClone(facet.path), fn),
			originalPath: facet.meta?.originalPath
				? transformPathFn(structuredClone(facet.meta.originalPath), fn)
				: undefined
		};
	};

	const resolveRight = (): ResolvedPartner | null => {
		// The adjuster processes the right-hand band with ITS previous side neighbour
		// as source, so the right partner is the band whose previous neighbour (by the
		// side-neighbour rule) is base and which covers base's parent quad. For an
		// unsplit tube that is band + 1, facet f. An uncut base beside a split band
		// is the previous neighbour of every piece, so the piece covering the quad wins.
		for (let i = 0; i < tubeBands.length; i++) {
			const right = tubeBands[i];
			if (findAdjacentSideNeighbour(tubeBands, i, -1, false) !== baseBand) continue;
			const index = alongsideFacetIndex(baseBand, baseAddress.facet, right);
			if (index === undefined) continue;
			const facet = right.facets[index];
			if (!facet?.quad) return null;
			// partner's left edge (a-d) coincides with base's right edge (b-c):
			const fn = rigidFromTwoPoints(facet.quad.a, facet.quad.d, baseFacet.quad.b, baseFacet.quad.c);
			// Runtime processes right (band+1) with base (band) as its source → right is current,
			// base is neighbor. rule.target lives on the right partner; baseIsTarget=false.
			return {
				role: 'right',
				ruleSet: 'acrossBands',
				baseIsTarget: false,
				address: { ...right.address, facet: index },
				quad: transformQuadFn(facet.quad, fn),
				path: transformPathFn(structuredClone(facet.path), fn),
				originalPath: facet.meta?.originalPath
					? transformPathFn(structuredClone(facet.meta.originalPath), fn)
					: undefined
			};
		}
		return null;
	};

	const left = resolveLeft();
	const right = resolveRight();

	return { base, top, bottom, left, right };
};

export type PartnerHighlightAddresses = Record<
	'base' | 'top' | 'bottom' | 'left' | 'right',
	GlobuleAddress_Facet | null
>;

/**
 * The 3D highlight addresses for a bundle. The 3D view has no pieces: it indexes
 * the parent band's facets by quad. A piece-local facet `f` is parent quad
 * `parentQuadOffset + f`, on the parent band (piece dropped). Unsplit addresses
 * pass through unchanged. An address whose band is not in `allBands` is dropped.
 */
export const partnerHighlightAddresses = (
	allBands: BandCutPattern[],
	bundle: PartnerBundle | null
): PartnerHighlightAddresses => {
	const toParentQuad = (address: GlobuleAddress_Facet | undefined): GlobuleAddress_Facet | null => {
		if (!address) return null;
		const bandAddress = bandAddressOf(address);
		const band = findBandByExactAddressInBands(allBands, bandAddress);
		if (!band) return null;
		const { globule, tube, band: bandIndex } = bandAddress;
		return { globule, tube, band: bandIndex, facet: (band.parentQuadOffset ?? 0) + address.facet };
	};
	return {
		base: toParentQuad(bundle?.base.address),
		top: toParentQuad(bundle?.top?.address),
		bottom: toParentQuad(bundle?.bottom?.address),
		left: toParentQuad(bundle?.left?.address),
		right: toParentQuad(bundle?.right?.address)
	};
};
