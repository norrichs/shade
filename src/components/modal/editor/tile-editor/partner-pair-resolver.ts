import type { BandCutPattern, PathSegment, Quadrilateral } from '$lib/types';
import type { GlobuleAddress_Band, GlobuleAddress_Facet } from '$lib/projection-geometry/types';
import type { TransformConfig } from '$lib/projection-geometry/types';
import { newTransformPS } from '$lib/patterns/tesselation/shield/helpers';
import { isSameAddress } from '$lib/util';

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

export const getEligibleBands = (
	allBands: BandCutPattern[],
	mode: PartnerMode
): BandCutPattern[] => {
	const key = mode === 'partnerStart' ? 'startPartnerBand' : 'endPartnerBand';
	return allBands.filter((b) => b.meta && b.meta[key]);
};

const findBandByAddress = (
	allBands: BandCutPattern[],
	address: GlobuleAddress_Band
): BandCutPattern | undefined =>
	allBands.find(
		(b) =>
			b.address.globule === address.globule &&
			b.address.tube === address.tube &&
			b.address.band === address.band
	);

export const resolvePair = (
	allBands: BandCutPattern[],
	mainAddress: GlobuleAddress_Band,
	mode: PartnerMode
): ResolvedPair | null => {
	const mainBand = findBandByAddress(allBands, mainAddress);
	if (!mainBand?.meta) return null;

	const partnerKey = mode === 'partnerStart' ? 'startPartnerBand' : 'endPartnerBand';
	const transformKey = mode === 'partnerStart' ? 'startPartnerTransform' : 'endPartnerTransform';

	const partnerBandAddress = mainBand.meta[partnerKey];
	if (!partnerBandAddress) return null;

	const partnerBand = findBandByAddress(allBands, partnerBandAddress);
	if (!partnerBand) return null;

	const facetIndex = mode === 'partnerStart' ? 0 : mainBand.facets.length - 1;
	const ghostFacetIndex =
		partnerBand.meta && isSameAddress(partnerBand.meta.startPartnerBand, mainBand.address)
			? 0
			: partnerBand.facets.length - 1;

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
		mainAddress: { ...mainAddress, facet: facetIndex },
		ghostAddress: { ...partnerBandAddress, facet: ghostFacetIndex },
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
