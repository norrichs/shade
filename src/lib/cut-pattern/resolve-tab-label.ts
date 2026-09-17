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
 * Which parent band a mid tab borders: -1 across a before edge, +1 across an
 * after edge. A tab without a recorded side (the facet-tab pipeline) is only
 * labelled when it is the first mid tab, with band + 1; undefined otherwise.
 */
const midTabStep = (tab: BandTab): -1 | 1 | undefined => {
	if (tab.side === undefined) return (tab.midIndex ?? 0) === 0 ? 1 : undefined;
	return tab.side === 'before' ? -1 : 1;
};

/**
 * Resolve the text label to render on a band tab. Every label names the exact
 * physical piece (spec amendment 2026-09-16, "Labels name the physical piece").
 *
 * Rules:
 *  - start / end tab → the part that end meets, else ''. A seam names its
 *    sibling piece exactly; an outer end partner is resolved by the end-partner
 *    rule among `tubes`: the partner's piece 0 when its start joins, its last
 *    piece when its end joins.
 *  - mid tab → the band across the edge the tab sits on: a before edge
 *    (`tab.side`) borders parent band - 1, an after edge parent band + 1,
 *    wrapping within the tube. When that band is split, the piece whose
 *    parent-quad range holds the tab's parent quad (own `parentQuadOffset` +
 *    `tab.quad`); without a known quad, the side-neighbour rule (same piece
 *    index, else last piece).
 *    The first tab on a side (`sideIndex` 0) is always labelled. A later tab is
 *    labelled only where that neighbour piece differs from the previous
 *    same-side tab's (at `prevSideQuad`), so labels appear at piece boundaries
 *    and an unsplit neighbour is named once per side. Tabs are walked in
 *    outline order: before edges from low quad to high, after edges from high
 *    quad to low, so a before-side boundary label lands on the low-quad end of
 *    a neighbour piece and an after-side one on its high-quad end. Without both
 *    quads a later tab stays ''.
 *    Tab records without a side (the facet-tab pipeline) keep the old rule: the
 *    first mid tab (`midIndex` 0) names band + 1, the others ''.
 *  - the band's own identity is the separate `selfTag` callout, never a tab
 *    label.
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
		// The edge side is carried from classification (`collectOutlinedBandTabs`).
		const step = midTabStep(tab);
		if (step === undefined) return '';

		// The side neighbour at parent band + step (wraps), resolved by address. A
		// piece's seam sibling joins end to end and is named on its start/end tab
		// instead, so it is never this label.
		const bands = tube.bands;
		if (bands.length === 0) return '';
		const index = tubePieceIndex(bands);
		const later = tab.side !== undefined && (tab.sideIndex ?? 0) > 0;
		if (!hasBand(index, band.address)) {
			// Band not in this tube's array: positional fallback by band index.
			if (later) return '';
			const neighbour = bands[(band.address.band + step + bands.length) % bands.length];
			return concatAddress(neighbour.address, 'tb-slash');
		}
		const neighbour = adjacentParentBands(index, band.address, step, true);
		if (!neighbour) return '';
		const offset = band.parentQuadOffset ?? 0;
		const piece = neighbourPieceAtQuad(
			index,
			neighbour,
			band,
			tab.quad === undefined ? undefined : offset + tab.quad
		);
		if (later) {
			// Labelled only at a piece boundary; an unsplit neighbour never has one.
			if (neighbour.length === 1 || tab.quad === undefined || tab.prevSideQuad === undefined) {
				return '';
			}
			const previous = neighbourPieceAtQuad(index, neighbour, band, offset + tab.prevSideQuad);
			if (previous === piece) return '';
		}
		return concatAddress(piece.address, 'tb-slash');
	}

	return '';
};
