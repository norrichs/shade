import type { GlobuleAddress_Band, GlobuleAddress_BandPiece } from '$lib/projection-geometry/types';
import type { BandCutPattern, TubeCutPattern } from '$lib/types';
import { isGlobuleAddress_BandPiece, isSameAddress, isSameParentBand } from '$lib/util';

/**
 * Band and band-piece resolution, one function per relationship.
 *
 * Once a band is split, the band a stored address names may exist only as
 * pieces, and which piece is meant depends on HOW the asker relates to it
 * (spec amendment 2026-09-16, "Partner resolution has two rules"):
 *
 * - `findBandByExactAddress` — the address names one band or one piece
 *   precisely. Seam partners (sibling pieces) are always piece-bearing and use
 *   this.
 * - `findSideNeighbourBand` — the adjacent band in the same tube. Splits are
 *   tube-wide at identical quad indices, so the neighbour piece with the SAME
 *   piece index is the one alongside; if the neighbour has fewer pieces, its
 *   last piece.
 * - `resolveEndPartner` — the band a band END meets, usually in another tube.
 *   Resolved by which of the partner's ends joins, independent of the asker's
 *   piece index: the partner's start lives on its piece 0, its end on its last
 *   piece.
 *
 * There is deliberately no generic "find this address" with an optional piece
 * argument: an omitted argument used to select a rule silently.
 */

type BandAddress = GlobuleAddress_Band | GlobuleAddress_BandPiece;

export type BandEnd = 'start' | 'end';

export type ResolvedEndPartner = {
	/** The band or piece whose end meets the asker's end. */
	band: BandCutPattern;
	/** Which end of `band` meets the asker. */
	partnerEnd: BandEnd;
};

/** A piece's index, or 0 for an unsplit band. */
export const pieceIndexOf = (address: BandAddress): number =>
	isGlobuleAddress_BandPiece(address) ? address.piece : 0;

/**
 * The band whose address is exactly `address`. A plain address never matches a
 * piece and a piece address never matches an unsplit band.
 */
export const findBandByExactAddress = (
	tubes: TubeCutPattern[],
	address: BandAddress
): BandCutPattern | undefined =>
	// Bands may be a sparse subset, so look up by address rather than by index.
	findBandByExactAddressInBands(tubes[address.tube]?.bands ?? [], address);

/**
 * `findBandByExactAddress` over a flat band array (any mix of tubes). Same rule;
 * `findBandByExactAddress` delegates here. Used where only a flattened band list
 * is at hand (the tile editor).
 */
export const findBandByExactAddressInBands = <B extends { address: BandAddress }>(
	bands: B[],
	address: BandAddress
): B | undefined => bands.find((b) => isSameAddress(b.address, address));

/**
 * All of `bands` that are `address`'s parent band: the unsplit band itself, or
 * its pieces in piece order. Empty when the band is absent.
 */
const bandsOfParent = <B extends { address: BandAddress }>(bands: B[], address: BandAddress): B[] =>
	bands
		.filter((b) => isSameParentBand(b.address, address))
		.sort((a, b) => pieceIndexOf(a.address) - pieceIndexOf(b.address));

/**
 * Side-neighbour resolution: the band in the same tube at `address.band`
 * alongside the asker.
 *
 * An exact match wins. Otherwise a plain address whose band was split resolves
 * to the piece with index `askerPiece` (pass `pieceIndexOf(asker.address)`,
 * which is 0 for an unsplit asker), falling back to the neighbour's last piece
 * when it was too short to be cut there. A piece address never resolves onto
 * an unsplit band.
 */
export const findSideNeighbourBand = (
	tubes: TubeCutPattern[],
	address: BandAddress,
	askerPiece: number
): BandCutPattern | undefined =>
	findSideNeighbourInBands(tubes[address.tube]?.bands ?? [], address, askerPiece);

/**
 * `findSideNeighbourBand` over one tube's band array rather than all tubes.
 * The adjusters work on a single tube's bands, which are not necessarily the
 * ones stored in `tubes` (the pipeline replaces tubes as it adjusts them, and
 * the carnation adjuster is never given `tubes` at all).
 */
export const findSideNeighbourInBands = <B extends { address: BandAddress }>(
	bands: B[],
	address: BandAddress,
	askerPiece: number
): B | undefined => {
	const exact = bands.find((b) => isSameAddress(b.address, address));
	if (exact || isGlobuleAddress_BandPiece(address)) return exact;
	const pieces = bandsOfParent(bands, address).filter((b) => isGlobuleAddress_BandPiece(b.address));
	if (pieces.length === 0) return undefined;
	return pieces.find((b) => pieceIndexOf(b.address) === askerPiece) ?? pieces[pieces.length - 1];
};

/**
 * End-partner resolution: the band (or piece) whose end meets `asker`'s
 * `askerEnd`, and which of its ends that is. Undefined when that end has no
 * partner address or the partner is not among `tubes`.
 *
 * - A piece-bearing partner address is a seam: resolved exactly, and the
 *   joining end is the one whose stored partner is exactly the asker.
 * - A plain partner address is an outer end. The partner is taken as a whole
 *   (all its pieces): if its START partner — carried by its first piece — is
 *   the asker's parent band, the partner's start meets the asker and the result
 *   is its first piece; otherwise its end meets the asker and the result is its
 *   last piece. An unsplit partner is both, so it resolves to itself. The
 *   comparison is by parent band, ignoring `piece` on both sides, because
 *   stored outer partner addresses are plain while the asker may be a piece.
 *
 * If both of the partner's ends name the asker's parent, the start is chosen,
 * matching the unsplit behaviour this replaces.
 */
export const resolveEndPartner = (
	tubes: TubeCutPattern[],
	asker: BandCutPattern,
	askerEnd: BandEnd
): ResolvedEndPartner | undefined => {
	const address = askerEnd === 'start' ? asker.meta?.startPartnerBand : asker.meta?.endPartnerBand;
	if (!address) return undefined;
	return resolveEndPartnerInBands(tubes[address.tube]?.bands ?? [], asker, askerEnd);
};

/**
 * `resolveEndPartner` over a flat band array (any mix of tubes) rather than
 * `tubes` indexed by tube number. Same rule; `resolveEndPartner` delegates here.
 * Used where only a flattened band list is at hand (the tile editor).
 */
export const resolveEndPartnerInBands = (
	bands: BandCutPattern[],
	asker: BandCutPattern,
	askerEnd: BandEnd
): ResolvedEndPartner | undefined => {
	const address = askerEnd === 'start' ? asker.meta?.startPartnerBand : asker.meta?.endPartnerBand;
	if (!address) return undefined;

	if (isGlobuleAddress_BandPiece(address)) {
		const band = bands.find((b) => isSameAddress(b.address, address));
		if (!band) return undefined;
		const start = band.meta?.startPartnerBand;
		const partnerEnd: BandEnd = start && isSameAddress(start, asker.address) ? 'start' : 'end';
		return { band, partnerEnd };
	}

	const parts = bandsOfParent(bands, address);
	if (parts.length === 0) return undefined;
	const first = parts[0];
	const outerStart = first.meta?.startPartnerBand;
	if (outerStart && isSameParentBand(outerStart, asker.address)) {
		return { band: first, partnerEnd: 'start' };
	}
	return { band: parts[parts.length - 1], partnerEnd: 'end' };
};

/**
 * The band that carries `end` of the band `address` names, from a flat array.
 *
 * A piece address names its piece exactly. A plain address names a parent band:
 * an unsplit band is its own start and end; a split one's start lives on its
 * first piece and its end on its last piece (the same rule `resolveEndPartner`
 * applies to the partner side).
 */
export const findBandCarryingEnd = <B extends { address: BandAddress }>(
	bands: B[],
	address: BandAddress,
	end: BandEnd
): B | undefined => {
	if (isGlobuleAddress_BandPiece(address)) {
		return bands.find((b) => isSameAddress(b.address, address));
	}
	const parts = bandsOfParent(bands, address);
	return end === 'start' ? parts[0] : parts[parts.length - 1];
};

/**
 * The side neighbour of `bands[bandIndex]` one PARENT band before (`step` -1)
 * or after (`step` +1) it in the same tube.
 *
 * Neighbour identity is by address, never by array position (spec amendment
 * 2026-09-16): a split tube's array interleaves pieces (`[b0p0, b0p1, b1p0,
 * …]`), so `bands[i ± 1]` may be the asker's own seam sibling.
 *
 * - Parent order is the order parents first appear in `bands`. For an unsplit
 *   array that is exactly positional `bands[i ± 1]`, including over a sparse
 *   band range or hidden bands.
 * - Past either end: wraps when `wrap`, otherwise undefined.
 * - The piece of that parent is chosen by the side-neighbour rule
 *   (`findSideNeighbourInBands`: same piece index as the asker, else its last
 *   piece; an uncut asker counts as piece 0).
 *
 * All of `bands` must carry an address.
 */
export const findAdjacentSideNeighbour = <B extends { address: BandAddress }>(
	bands: B[],
	bandIndex: number,
	step: -1 | 1,
	wrap: boolean
): B | undefined => {
	const self = bands[bandIndex]?.address;
	if (!self) return undefined;
	const parents: BandAddress[] = [];
	for (const b of bands) {
		if (!parents.some((p) => isSameParentBand(p, b.address))) parents.push(b.address);
	}
	const target = parents.findIndex((p) => isSameParentBand(p, self)) + step;
	if (!wrap && (target < 0 || target >= parents.length)) return undefined;
	// The parent's plain address: drop `piece` (keeping every other component
	// exactly as stored) so the side-neighbour rule picks the piece.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { piece, ...parent } = parents[
		(parents.length + target) % parents.length
	] as GlobuleAddress_BandPiece;
	return findSideNeighbourInBands(bands, parent, pieceIndexOf(self));
};

/** The shape the previous-band lookup needs; `BandCutPattern` satisfies it. */
export type SideNeighbourCandidate<F> = {
	address?: BandAddress;
	parentQuadOffset?: number;
	facets: F[];
};

/**
 * The facets of the band on `bands[bandIndex]`'s previous (left-hand, unit
 * x = 0) side, paired one-to-one with its own facets. Tiled output has one
 * facet per quad, so facet index and quad index coincide.
 *
 * Neighbour identity is by address, never by array position (spec amendment
 * 2026-09-16). A split tube's array interleaves pieces (`[b0p0, b0p1, b1p0,
 * …]`), so the array predecessor may be the asker's own sibling.
 *
 * - The previous PARENT band is the one before the asker's parent in the order
 *   parents first appear in `bands`, wrapping from the first to the last. For an
 *   unsplit array that is exactly the positional `bands[i - 1]` with wrap-around
 *   used before, including over a sparse band range or hidden bands.
 * - The piece of it is chosen by the side-neighbour rule
 *   (`findSideNeighbourInBands`: same piece index, else its last piece).
 * - Facets are paired in PARENT quad coordinates: this band's facet `f` sits at
 *   parent quad `P = parentQuadOffset + f` (0 for an uncut band), and pairs
 *   with the neighbour's facet `P - neighbour.parentQuadOffset`. Same-index
 *   pieces share their offset (splits are tube-wide), so that is facet `f`;
 *   an uncut band beside a split neighbour lands in the neighbour's piece 0,
 *   which spans the uncut band's whole length. A parent quad the neighbour
 *   piece does not cover yields `undefined` — there is no counterpart, and the
 *   caller skips the cross-band adjustment for that facet.
 *
 * If any band lacks an address (never so on the tiled pipeline), falls back to
 * the positional behaviour.
 */
export const findPreviousBandFacets = <F>(
	bands: SideNeighbourCandidate<F>[],
	bandIndex: number
): (F | undefined)[] => {
	const band = bands[bandIndex];
	if (!bands.every((b) => b.address)) {
		const prev = bands[(bands.length + bandIndex - 1) % bands.length];
		return band.facets.map((_, f) => prev.facets[f]);
	}
	const addressed = bands as (SideNeighbourCandidate<F> & { address: BandAddress })[];
	const neighbour = findAdjacentSideNeighbour(addressed, bandIndex, -1, true);
	if (!neighbour) return band.facets.map(() => undefined);
	return band.facets.map((_, f) => {
		const index = alongsideFacetIndex(band, f, neighbour);
		return index === undefined ? undefined : neighbour.facets[index];
	});
};

/**
 * The index of `neighbour`'s facet alongside `band`'s facet `facet`, pairing
 * them in PARENT quad coordinates: facet `f` sits at parent quad
 * `parentQuadOffset + f` (0 offset for an uncut band). Undefined when the
 * neighbour does not cover that parent quad. Tiled output has one facet per
 * quad, so facet and quad indices coincide.
 */
export const alongsideFacetIndex = (
	band: { parentQuadOffset?: number },
	facet: number,
	neighbour: { parentQuadOffset?: number; facets: unknown[] }
): number | undefined => {
	const index = (band.parentQuadOffset ?? 0) + facet - (neighbour.parentQuadOffset ?? 0);
	return index >= 0 && index < neighbour.facets.length ? index : undefined;
};
