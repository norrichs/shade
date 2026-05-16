import type { BandCutPattern, TubeCutPattern } from '$lib/types';
import { concatAddress } from '$lib/util';

type BandTab = NonNullable<BandCutPattern['tabs']>[number];

/**
 * Resolve the text label to render on a band tab.
 *
 * Rules:
 *  - start tab → partner band at start (if any), else ''
 *  - end tab   → partner band at end (if any), else ''
 *  - mid tab, midIndex === 0 → next band in the tube (wraps around)
 *  - mid tab, midIndex === floor(midCount/2) → the band itself
 *  - otherwise → ''
 *
 * If midIndex === 0 and also equals floor(midCount/2) (i.e. a single mid tab),
 * the first-tab rule wins and we return the next band.
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
		const midCount = tab.midCount ?? 0;

		// First mid tab → next band in tube (wraps). Wins over middle rule when both match.
		if (midIndex === 0) {
			const bands = tube.bands;
			if (bands.length === 0) return '';
			const currentIdx = bands.findIndex((b) => b.address.band === band.address.band);
			const baseIdx = currentIdx >= 0 ? currentIdx : band.address.band;
			const nextBand = bands[(baseIdx + 1) % bands.length];
			return concatAddress(nextBand.address, 'tb-slash');
		}

		// Middle mid tab → current band's own address.
		if (midIndex === Math.floor(midCount / 2)) {
			return concatAddress(band.address, 'tb-slash');
		}

		return '';
	}

	return '';
};
