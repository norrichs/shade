import type { BandCutPattern, TubeCutPattern } from '$lib/types';
import { concatAddress, isSameAddress } from '$lib/util';
import { findAdjacentSideNeighbour } from './resolve-partner-band';

type BandTab = NonNullable<BandCutPattern['tabs']>[number];

/**
 * Resolve the text label to render on a band tab.
 *
 * Rules:
 *  - start tab → partner band at start (if any), else ''
 *  - end tab   → partner band at end (if any), else ''
 *  - mid tab, midIndex === 0 → next band in the tube (parent band + 1, wraps
 *    around; for a split band, the same-index piece of it)
 *  - other mid tabs → ''
 *
 * Note: the current band's own identity is rendered separately via the
 * `selfTag` external callout (see `BandComponent` + `PatternLabel`), so there
 * is no longer a middle-mid rule that points back at the current band.
 */
export const resolveTabLabel = (
	tab: BandTab,
	band: BandCutPattern,
	tube: TubeCutPattern
): string => {
	if (tab.position === 'start') {
		const partner = band.meta?.startPartnerBand;
		return partner ? concatAddress(partner, 'tb-slash') : '';
	}

	if (tab.position === 'end') {
		const partner = band.meta?.endPartnerBand;
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
			const currentIdx = bands.findIndex((b) => isSameAddress(b.address, band.address));
			if (currentIdx < 0) {
				// Band not in this tube's array: positional fallback by band index.
				const nextBand = bands[(band.address.band + 1) % bands.length];
				return concatAddress(nextBand.address, 'tb-slash');
			}
			const nextBand = findAdjacentSideNeighbour(bands, currentIdx, 1, true);
			return nextBand ? concatAddress(nextBand.address, 'tb-slash') : '';
		}

		return '';
	}

	return '';
};
