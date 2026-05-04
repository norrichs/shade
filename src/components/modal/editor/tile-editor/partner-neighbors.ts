import type { BandCutPattern, PathSegment, Quadrilateral } from '$lib/types';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';

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

	return { base, top: null, bottom: null, left: null, right: null };
};
