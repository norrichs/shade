import type { BandCutPattern, PathSegment, Quadrilateral } from '$lib/types';
import type {
	GlobuleAddress_Band,
	GlobuleAddress_BandPiece,
	GlobuleAddress_Facet
} from '$lib/projection-geometry/types';
import type { TransformConfig } from '$lib/projection-geometry/types';
import { newTransformPS } from '$lib/patterns/tesselation/shared/helpers';
import {
	findBandCarryingEnd,
	resolveEndPartnerInBands
} from '$lib/cut-pattern/resolve-partner-band';

const transformQuad = (quad: Quadrilateral, transform: TransformConfig): Quadrilateral => {
	const {
		translate: { x: translateX, y: translateY },
		rotate: { z: theta }
	} = transform;
	const thetaRad = (theta * Math.PI) / 180;
	const cos = Math.cos(thetaRad);
	const sin = Math.sin(thetaRad);
	const tp = (p: { x: number; y: number; z: number }) =>
		({
			x: cos * p.x - sin * p.y + translateX,
			y: sin * p.x + cos * p.y + translateY,
			z: p.z
		}) as Quadrilateral['a'];
	return {
		a: tp(quad.a),
		b: tp(quad.b),
		c: tp(quad.c),
		d: tp(quad.d)
	};
};

export type PartnerMode = 'partnerStart' | 'partnerEnd';

export type ResolvedPair = {
	mainAddress: GlobuleAddress_Facet;
	ghostAddress: GlobuleAddress_Facet;
	mainQuad: Quadrilateral;
	ghostQuad: Quadrilateral;
	mainPath: PathSegment[];
	ghostPath: PathSegment[];
	mainOriginalPath?: PathSegment[];
	ghostOriginalPath?: PathSegment[];
};

type BandAddress = GlobuleAddress_Band | GlobuleAddress_BandPiece;

/**
 * The main band's end and the partner end that meets it.
 *
 * `allBands` may hold pieces of split bands, so bands are resolved by address
 * with the shared rules rather than by (globule, tube, band) alone:
 * - the main band is the piece carrying the requested end (`findBandCarryingEnd`:
 *   exact for a piece address; first/last piece for a plain split parent);
 * - its partner is resolved by the end-partner rule (`resolveEndPartnerInBands`),
 *   which covers both an outer end (partner's piece 0 or last piece, by which
 *   end joins) and a seam (the exact sibling piece).
 */
export const resolvePair = (
	allBands: BandCutPattern[],
	mainAddress: BandAddress,
	mode: PartnerMode
): ResolvedPair | null => {
	const askerEnd = mode === 'partnerStart' ? 'start' : 'end';
	const mainBand = findBandCarryingEnd(allBands, mainAddress, askerEnd);
	if (!mainBand?.meta) return null;

	const transformKey = mode === 'partnerStart' ? 'startPartnerTransform' : 'endPartnerTransform';

	const resolved = resolveEndPartnerInBands(allBands, mainBand, askerEnd);
	if (!resolved) return null;
	const partnerBand = resolved.band;

	const facetIndex = mode === 'partnerStart' ? 0 : mainBand.facets.length - 1;
	const ghostFacetIndex = resolved.partnerEnd === 'start' ? 0 : partnerBand.facets.length - 1;

	const mainFacet = mainBand.facets[facetIndex];
	const ghostFacet = partnerBand.facets[ghostFacetIndex];
	if (!mainFacet?.quad || !ghostFacet?.quad) return null;

	const transform = mainBand.meta[transformKey];
	const ghostPath = transform
		? newTransformPS(structuredClone(ghostFacet.path), transform)
		: structuredClone(ghostFacet.path);
	const ghostQuad = transform ? transformQuad(ghostFacet.quad, transform) : ghostFacet.quad;

	const mainOriginalPath = mainFacet.meta?.originalPath
		? structuredClone(mainFacet.meta.originalPath)
		: undefined;
	const ghostOriginalRaw = ghostFacet.meta?.originalPath;
	const ghostOriginalPath = ghostOriginalRaw
		? transform
			? newTransformPS(structuredClone(ghostOriginalRaw), transform)
			: structuredClone(ghostOriginalRaw)
		: undefined;

	return {
		mainAddress: { ...mainBand.address, facet: facetIndex },
		ghostAddress: { ...partnerBand.address, facet: ghostFacetIndex },
		mainQuad: mainFacet.quad,
		ghostQuad,
		mainPath: structuredClone(mainFacet.path),
		ghostPath,
		mainOriginalPath,
		ghostOriginalPath
	};
};

export const pairsEqual = (a: ResolvedPair | null, b: ResolvedPair | null): boolean => {
	if (a === null && b === null) return true;
	if (a === null || b === null) return false;
	return JSON.stringify(a) === JSON.stringify(b);
};
