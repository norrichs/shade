import type { BandCutPattern, PathSegment, Quadrilateral } from '#lib/types.js';
import { transformPatternByQuad } from '../quadrilateral';
import { alignNextBandPath, alignPrevBandPath } from './align-prev-band';
import { toQuad } from '../tiled-asanoha-pattern';
import {
	alongsideFacetIndex,
	findSideNeighbourInBands,
	pieceIndexOf
} from '#lib/cut-pattern/resolve-partner-band.js';
import type { GlobuleAddress_BandPiece } from '#lib/projection-geometry/types.js';

/*
 * Side partners for tube-level adjusters whose band outline reaches into the
 * neighbouring bands (HexParquet2, HexParquet2b): finding the bands on either
 * side and laying their lines into this band's frame.
 */

/** The parent-band address with band index `band`, keeping every other component of `of`. */
const withBand = (of: BandCutPattern, band: number) => {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { piece, ...parent } = of.address as GlobuleAddress_BandPiece;
	return { ...parent, band };
};

export const findLeftPartner = (bands: BandCutPattern[], band: BandCutPattern) =>
	band.leftPartnerBand === undefined
		? undefined
		: findSideNeighbourInBands(
				bands,
				withBand(band, band.leftPartnerBand),
				pieceIndexOf(band.address)
			);

/**
 * The band that names `band` as its left partner, or undefined when `band`'s
 * right side is free (the last band of an open tube) or that band is not
 * generated. Pieces resolve with the side-neighbour rule, as on the left.
 */
export const findRightPartner = (bands: BandCutPattern[], band: BandCutPattern) => {
	const right = bands.find(
		(b) =>
			b.leftPartnerBand === band.address.band &&
			b.address.globule === band.address.globule &&
			b.address.tube === band.address.tube
	);
	return right
		? findSideNeighbourInBands(
				bands,
				withBand(band, right.address.band),
				pieceIndexOf(band.address)
			)
		: undefined;
};

/**
 * The partner's quad alongside facet `f`, when the partner covers it with the
 * same subunit. Otherwise the gain falls back to extrapolation.
 */
export const partnerQuadAlongside = (
	band: BandCutPattern,
	f: number,
	partner: BandCutPattern | undefined,
	subunitCount: number
): Quadrilateral | undefined => {
	if (!partner || partner.error) return undefined;
	const index = alongsideFacetIndex(band, f, partner);
	if (index === undefined || index % subunitCount !== f % subunitCount) return undefined;
	const quad = partner.facets[index].quad;
	return quad ? toQuad(quad) : undefined;
};

/**
 * Lay a partner's lines into this facet's frame. `inPartner` is in the
 * partner's unit frame; with the partner's alongside quad it is mapped through
 * that quad and laid onto this quad's shared edge, otherwise it is shifted one
 * band sideways and extrapolated through this quad.
 */
export const layPartnerPath = (
	side: 'left' | 'right',
	inPartner: PathSegment[],
	ownQuad: Quadrilateral,
	partnerQuad: Quadrilateral | undefined
): PathSegment[] => {
	if (partnerQuad) {
		const mapped = transformPatternByQuad(inPartner, partnerQuad);
		return side === 'left'
			? alignPrevBandPath(mapped, partnerQuad, ownQuad)
			: alignNextBandPath(mapped, partnerQuad, ownQuad);
	}
	const shifted = inPartner.map((seg) => {
		const [command, x, y] = seg as ['M' | 'L', number, number];
		return [command, x + (side === 'left' ? -1 : 1), y] as PathSegment;
	});
	return transformPatternByQuad(shifted, ownQuad);
};
