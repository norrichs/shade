import type { BandCutPattern, TubeCutPattern } from '$lib/types';
import { concatAddress } from '$lib/util';
import {
	adjacentParentBands,
	endPartnerPieceAddress,
	hasBand,
	neighbourPieceAtQuad,
	parentBandsOf,
	tubeOfAddress,
	tubePieceIndex
} from './band-piece-index';

type BandTab = NonNullable<BandCutPattern['tabs']>[number];

/**
 * Resolve the text label to render on a band tab. Every label names the exact
 * physical piece (spec amendment 2026-09-16, "Labels name the physical piece").
 *
 * Rules:
 *  - start / end tab → the part that end meets, else ''. A seam names its
 *    sibling piece exactly; an outer end partner is resolved by the end-partner
 *    rule among `tubes`: the partner's piece 0 when its start joins, its last
 *    piece when its end joins.
 *  - mid tab, midIndex === 0 → next band in the tube (parent band + 1, wraps
 *    around). When that band is split, the piece whose parent-quad range holds
 *    the tab's parent quad (own `parentQuadOffset` + `tab.quad`); without a
 *    known quad, the side-neighbour rule (same piece index, else last piece).
 *  - other mid tabs → ''
 *
 * `tube` is the tube the band is rendered from (its band order decides "next"
 * and the wrap). `tubes` is every tube of the pattern, indexed by tube number,
 * for end partners in other tubes. Per-tube lookups are memoised per band array
 * (`tubePieceIndex`), so rendering every tab stays linear in the bands.
 *
 * Note: the current band's own identity is rendered separately via the
 * `selfTag` external callout (see `BandComponent` + `PatternLabel`), so there
 * is no longer a middle-mid rule that points back at the current band.
 */
export const resolveTabLabel = (
	tab: BandTab,
	band: BandCutPattern,
	tube: TubeCutPattern,
	tubes: TubeCutPattern[]
): string => {
	if (tab.position === 'start' || tab.position === 'end') {
		const partner = endPartnerPieceAddress(band, tab.position, (address) => {
			const partnerTube = tubeOfAddress(tubes, address);
			return partnerTube && parentBandsOf(tubePieceIndex(partnerTube.bands), address);
		});
		return partner ? concatAddress(partner, 'tb-slash') : '';
	}

	if (tab.position === 'mid') {
		const midIndex = tab.midIndex ?? 0;

		// First mid tab → next band in tube (wraps): the side neighbour at parent
		// band + 1, resolved by address. A piece's seam sibling joins end to end
		// and is named on its start/end tab instead, so it is never this label.
		if (midIndex === 0) {
			const bands = tube.bands;
			if (bands.length === 0) return '';
			const index = tubePieceIndex(bands);
			if (!hasBand(index, band.address)) {
				// Band not in this tube's array: positional fallback by band index.
				const nextBand = bands[(band.address.band + 1) % bands.length];
				return concatAddress(nextBand.address, 'tb-slash');
			}
			const next = adjacentParentBands(index, band.address, 1, true);
			if (!next) return '';
			const parentQuad =
				tab.quad === undefined ? undefined : (band.parentQuadOffset ?? 0) + tab.quad;
			return concatAddress(neighbourPieceAtQuad(index, next, band, parentQuad).address, 'tb-slash');
		}

		return '';
	}

	return '';
};
