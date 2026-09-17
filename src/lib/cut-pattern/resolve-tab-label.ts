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
 * Which parent band a labelled mid tab names: -1 for the first before-edge tab,
 * +1 for the first after-edge tab, undefined for a tab that carries no label.
 * A tab without a recorded side labels its first mid tab with band + 1.
 */
const midTabStep = (tab: BandTab): -1 | 1 | undefined => {
	if (tab.side === undefined) return (tab.midIndex ?? 0) === 0 ? 1 : undefined;
	if ((tab.sideIndex ?? 0) !== 0) return undefined;
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
 *  - mid tab → the band across the edge the tab sits on, for the FIRST tab on
 *    that side only: a before edge (`tab.side`, `sideIndex` 0) borders parent
 *    band - 1, an after edge parent band + 1, wrapping within the tube. Tab
 *    records without a side (the facet-tab pipeline) keep the old rule: the
 *    first mid tab (`midIndex` 0) names band + 1. When the named band is split,
 *    the piece whose parent-quad range holds the tab's parent quad (own
 *    `parentQuadOffset` + `tab.quad`); without a known quad, the side-neighbour
 *    rule (same piece index, else last piece).
 *  - other mid tabs → '' (one partner label per side; the band's own identity
 *    is the separate `selfTag` callout)
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
		// The edge side is carried from classification (`collectOutlinedBandTabs`);
		// only the first tab on a side is labelled.
		const step = midTabStep(tab);
		if (step === undefined) return '';

		// The side neighbour at parent band + step (wraps), resolved by address. A
		// piece's seam sibling joins end to end and is named on its start/end tab
		// instead, so it is never this label.
		const bands = tube.bands;
		if (bands.length === 0) return '';
		const index = tubePieceIndex(bands);
		if (!hasBand(index, band.address)) {
			// Band not in this tube's array: positional fallback by band index.
			const neighbour = bands[(band.address.band + step + bands.length) % bands.length];
			return concatAddress(neighbour.address, 'tb-slash');
		}
		const neighbour = adjacentParentBands(index, band.address, step, true);
		if (!neighbour) return '';
		const parentQuad = tab.quad === undefined ? undefined : (band.parentQuadOffset ?? 0) + tab.quad;
		return concatAddress(
			neighbourPieceAtQuad(index, neighbour, band, parentQuad).address,
			'tb-slash'
		);
	}

	return '';
};
