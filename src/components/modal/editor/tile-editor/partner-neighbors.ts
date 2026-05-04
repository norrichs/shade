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

	return { base, top, bottom, left: null, right: null };
};
