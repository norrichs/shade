import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';
import { bandKey } from './band-key';

/**
 * Diagnostic readout of a band's END CONNECTIONS, read directly from the 3D
 * facet `meta` graph.
 *
 * A band connects to bands in OTHER tubes at its two ends: the "start" end is
 * the first facet (facet index 0); the "end" end is the last facet (highest
 * facet index). Each end facet carries up to three edge partners (`ab`, `bc`,
 * `ac`); an edge whose partner lives in a *different tube* is an end connection.
 *
 * Unlike the cut-pattern derivation (`generate-*-pattern.ts`), which only reads
 * one convention-specific edge and drops a band's partner data entirely unless
 * BOTH ends resolve, this reads every edge of both end facets and reports each
 * end independently. That makes it the ground truth for verifying which bands
 * actually form a ring.
 */

type PartnerRef = {
	globule: number;
	tube: number;
	band: number;
	facet?: number;
	edge?: string;
};

type FacetEdgeMetaLike = { partner?: PartnerRef } | undefined;

type FacetLike = {
	meta?: {
		ab?: FacetEdgeMetaLike;
		bc?: FacetEdgeMetaLike;
		ac?: FacetEdgeMetaLike;
	};
};

type BandLike = { facets: FacetLike[] };
type TubeLike = { bands: BandLike[] };

export type BandPartnerInfo = {
	/** The queried band's address. */
	address: GlobuleAddress_Band;
	/** Whether the band was found in the supplied tubes. */
	found: boolean;
	facetCount: number;
	/** Cross-tube partner bands joined at the START end (first facet). */
	startPartners: GlobuleAddress_Band[];
	/** Cross-tube partner bands joined at the END end (last facet). */
	endPartners: GlobuleAddress_Band[];
};

/** Cross-tube partner bands referenced by any edge of a single facet. */
const crossTubePartnersOfFacet = (
	facet: FacetLike | undefined,
	selfTube: number
): GlobuleAddress_Band[] => {
	if (!facet?.meta) return [];
	const partners: GlobuleAddress_Band[] = [];
	const seen = new Set<string>();
	for (const edge of ['ab', 'bc', 'ac'] as const) {
		const partner = facet.meta[edge]?.partner;
		if (!partner) continue;
		if (partner.tube === selfTube) continue; // within-tube edge — not an end connection
		const ref: GlobuleAddress_Band = {
			globule: partner.globule,
			tube: partner.tube,
			band: partner.band
		};
		const k = bandKey(ref);
		if (seen.has(k)) continue;
		seen.add(k);
		partners.push(ref);
	}
	return partners;
};

export const getBandPartnerInfo = (
	tubes: TubeLike[] | undefined,
	address: GlobuleAddress_Band
): BandPartnerInfo => {
	const band = tubes?.[address.tube]?.bands?.[address.band];
	const facets = band?.facets ?? [];
	if (!band || facets.length === 0) {
		return { address, found: false, facetCount: 0, startPartners: [], endPartners: [] };
	}
	const firstFacet = facets[0];
	const lastFacet = facets[facets.length - 1];
	return {
		address,
		found: true,
		facetCount: facets.length,
		startPartners: crossTubePartnersOfFacet(firstFacet, address.tube),
		endPartners: crossTubePartnersOfFacet(lastFacet, address.tube)
	};
};

/** Compact display form for a band address, e.g. `t28/b0`. */
export const formatBandAddress = (a: GlobuleAddress_Band): string => `t${a.tube}/b${a.band}`;
