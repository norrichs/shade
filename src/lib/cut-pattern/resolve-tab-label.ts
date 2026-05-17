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

		// First mid tab → next band in tube (wraps).
		if (midIndex === 0) {
			const bands = tube.bands;
			if (bands.length === 0) return '';
			const currentIdx = bands.findIndex((b) => b.address.band === band.address.band);
			const baseIdx = currentIdx >= 0 ? currentIdx : band.address.band;
			const nextBand = bands[(baseIdx + 1) % bands.length];
			return concatAddress(nextBand.address, 'tb-slash');
		}

		return '';
	}

	return '';
};
