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
	tubes[address.tube]?.bands.find((b) => isSameAddress(b.address, address));

/**
 * All bands that are `address`'s parent band: the unsplit band itself, or its
 * pieces in piece order. Empty when the tube or band is absent.
 */
const bandsOfParent = (tubes: TubeCutPattern[], address: BandAddress): BandCutPattern[] =>
	(tubes[address.tube]?.bands ?? [])
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
): BandCutPattern | undefined => {
	const exact = findBandByExactAddress(tubes, address);
	if (exact || isGlobuleAddress_BandPiece(address)) return exact;
	const pieces = bandsOfParent(tubes, address).filter((b) => isGlobuleAddress_BandPiece(b.address));
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

	if (isGlobuleAddress_BandPiece(address)) {
		const band = findBandByExactAddress(tubes, address);
		if (!band) return undefined;
		const start = band.meta?.startPartnerBand;
		const partnerEnd: BandEnd = start && isSameAddress(start, asker.address) ? 'start' : 'end';
		return { band, partnerEnd };
	}

	const parts = bandsOfParent(tubes, address);
	if (parts.length === 0) return undefined;
	const first = parts[0];
	const outerStart = first.meta?.startPartnerBand;
	if (outerStart && isSameParentBand(outerStart, asker.address)) {
		return { band: first, partnerEnd: 'start' };
	}
	return { band: parts[parts.length - 1], partnerEnd: 'end' };
};
