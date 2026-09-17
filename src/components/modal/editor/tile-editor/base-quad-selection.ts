import type { BandCutPattern } from '$lib/types';
import type {
	GlobuleAddress_Band,
	GlobuleAddress_BandPiece,
	GlobuleAddress_Facet
} from '$lib/projection-geometry/types';
import type { PartnerHighlightSource } from '$lib/stores/partnerHighlightStore';
import { concatAddress, isGlobuleAddress_BandPiece } from '$lib/util';

type BandAddress = GlobuleAddress_Band | GlobuleAddress_BandPiece;

export type BaseQuadAddress = {
	source: PartnerHighlightSource;
	globule: number;
	tube: number;
	band: number;
	piece?: number;
	facet: number;
};

export type BandOption = {
	key: string;
	label: string;
	address: BandAddress;
	facetCount: number;
};

/**
 * The band selector's rows for one tube.
 *
 * A split tube's band array interleaves pieces (`[b0p0, b0p1, b1, …]`), so a
 * row is identified by its address, never by array position (spec amendment
 * 2026-09-16). Each piece is its own row, labelled the way cut-pattern labels
 * name it (`b3p1`); an unsplit band is `b3`. The key is the label, which is
 * unique within a tube.
 */
export const bandOptionsForTube = (bands: BandCutPattern[]): BandOption[] =>
	bands.map((b) => {
		const label = concatAddress(b.address, 'b');
		return { key: label, label, address: b.address, facetCount: b.facets.length };
	});

/** The row key of a selection (or of a band address), matching `BandOption.key`. */
export const bandKeyOf = (address: BandAddress): string =>
	concatAddress(bandAddressOf(address), 'b');

/**
 * The band (or piece) address of a facet-level address: `facet` and any other
 * extra fields dropped, `piece` kept only when present. A `piece: undefined`
 * key would make the address read as a piece (`Object.hasOwn`), so it is never
 * written.
 */
export const bandAddressOf = (address: BandAddress & { facet?: number }): BandAddress => {
	const plain: GlobuleAddress_Band = {
		globule: address.globule,
		tube: address.tube,
		band: address.band
	};
	return isGlobuleAddress_BandPiece(address) && address.piece !== undefined
		? { ...plain, piece: address.piece }
		: plain;
};

/** A complete selector value for `facet` of the band or piece `address`. */
export const baseQuadAddressOf = (
	source: PartnerHighlightSource,
	address: BandAddress,
	facet: number
): BaseQuadAddress => ({ source, ...bandAddressOf(address), facet });

/** The facet address a selection names, carrying its piece when it has one. */
export const facetAddressOf = (base: BaseQuadAddress): GlobuleAddress_Facet => ({
	...bandAddressOf(base),
	facet: base.facet
});
