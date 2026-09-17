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

/** Pattern → real band index: the inverse of `PatternBandIndexOf`. */
export type RealBandIndexOf = (tube: number, patternBand: number) => number | undefined;

/** Both directions between the two spaces, built from one table per tube. */
export type BandSpace = { toPattern: PatternBandIndexOf; toReal: RealBandIndexOf };

type PatternedTube = { address: { tube: number }; bands: Band[] };

/**
 * The tubes as pattern generation sees them, before the visibility filter.
 * Every pattern type except outlined drops fillAll's fill bands; outlined keeps
 * them. `generateProjectionPattern` and the pattern → 3D mapping both use this,
 * so they cannot disagree about which bands were patterned.
 */
export const patternedTubes = <T extends { bands: Band[] }>(
	tubes: T[],
	keepFillBands: boolean
): T[] =>
	keepFillBands ? tubes : tubes.map((t) => ({ ...t, bands: t.bands.filter((b) => !b.isFill) }));

/**
 * Real ↔ pattern band index for every tube in `tubes`, each identified by its
 * `address.tube` and holding the bands that will be patterned (see
 * `patternedTubes`; before the visibility filter). Undefined for a band that is
 * hidden, filtered out, or in a tube not among `tubes`.
 *
 * A band's real index is read from its facets' addresses — the same addresses
 * partner meta was written against — which stay correct when the array has
 * had bands removed. A band whose facets carry no address falls back to its
 * position in the array. Tables are built lazily, once per tube.
 */
export const buildBandSpace = (tubes: PatternedTube[]): BandSpace => {
	const byTube = new Map<number, { toPattern: Map<number, number>; toReal: number[] }>();
	const tableOf = (tube: number) => {
		let table = byTube.get(tube);
		if (!table) {
			table = { toPattern: new Map(), toReal: [] };
			(tubes.find((t) => t.address.tube === tube)?.bands ?? []).forEach((band, position) => {
				if (!band.visible) return;
				const real = band.facets.find((f) => f.address)?.address?.band ?? position;
				table!.toPattern.set(real, table!.toReal.length);
				table!.toReal.push(real);
			});
			byTube.set(tube, table);
		}
		return table;
	};
	return {
		toPattern: (tube, realBand) => tableOf(tube).toPattern.get(realBand),
		toReal: (tube, patternBand) => tableOf(tube).toReal[patternBand]
	};
};

/** Real → pattern band index (see `buildBandSpace`). */
export const buildPatternBandIndex = (tubes: PatternedTube[]): PatternBandIndexOf =>
	buildBandSpace(tubes).toPattern;
