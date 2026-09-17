import type { Band } from '$lib/types';

/**
 * Two band index spaces meet in tiled pattern generation:
 *
 * - REAL: a band's position in its 3D tube. Facet partner meta
 *   (`facet.meta[edge].partner`) is written in this space.
 * - PATTERN: a band's position among its tube's visible bands. Hidden bands
 *   (`visible: false`) and filtered-out bands (fillAll's fill bands, for tiled
 *   patterns) are not tiled, so `BandCutPattern.address.band` counts only the
 *   bands that are, and every band-level address a pattern stores must use
 *   this space too or it names the wrong band.
 *
 * When every band is visible and none is filtered, the two coincide.
 */
export type PatternBandIndexOf = (tube: number, realBand: number) => number | undefined;

/**
 * Real → pattern band index for every tube in `tubes`, each identified by its
 * `address.tube` and holding the bands that will be patterned (before the
 * visibility filter). Undefined for a band that is hidden, filtered out, or in
 * a tube not among `tubes`.
 *
 * A band's real index is read from its facets' addresses — the same addresses
 * partner meta was written against — which stay correct when the array has
 * had bands removed. A band whose facets carry no address falls back to its
 * position in the array.
 */
export const buildPatternBandIndex = (
	tubes: { address: { tube: number }; bands: Band[] }[]
): PatternBandIndexOf => {
	const byTube = new Map<number, Map<number, number>>();
	return (tube, realBand) => {
		let index = byTube.get(tube);
		if (!index) {
			index = new Map();
			let visible = 0;
			(tubes.find((t) => t.address.tube === tube)?.bands ?? []).forEach((band, position) => {
				if (!band.visible) return;
				const real = band.facets.find((f) => f.address)?.address?.band ?? position;
				index!.set(real, visible++);
			});
			byTube.set(tube, index);
		}
		return index.get(realBand);
	};
};
