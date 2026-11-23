import type { Band } from '#lib/types.js';
import type { GlobuleAddress_Band, Tube } from '#lib/projection-geometry/types.js';
import type { AssemblerHighlight } from '#lib/assembler-highlight.js';
import type { GeometrySource } from '#lib/stores/selectionStores.js';
import { patternBandToReal, type PatternBandSpaceOf } from '#lib/cut-pattern/pattern-band-space.js';
import { concatAddress_Band } from '#lib/util.js';

export type ResolvedBand = {
	band: Band;
	/** The band's cut-pattern address, as the pattern self-tag prints it (`t3/b7`). */
	label: string;
	/** Identity of the real band, for re-preparing and reframing on change. */
	key: string;
};

/**
 * The real 3D band behind the Assembler highlight. The highlight is in pattern
 * band space, so map it through the source's band space, then find the band by
 * the real index its facets carry (the same identity `buildBandSpace` uses),
 * falling back to array position. Null when nothing is highlighted or the
 * address no longer exists (e.g. after a regeneration).
 */
export const resolveHighlightedBand = (
	highlight: AssemblerHighlight,
	tubesOf: (source: GeometrySource, globule: number) => Tube[] | undefined,
	spaces: PatternBandSpaceOf
): ResolvedBand | null =>
	highlight ? resolvePatternBand(highlight.source, highlight.band, tubesOf, spaces) : null;

/**
 * The real 3D band behind pattern band `patternBand` of `source`. Null when the
 * address no longer exists.
 */
export const resolvePatternBand = (
	source: GeometrySource,
	patternBand: GlobuleAddress_Band,
	tubesOf: (source: GeometrySource, globule: number) => Tube[] | undefined,
	spaces: PatternBandSpaceOf
): ResolvedBand | null => {
	const real = patternBandToReal(spaces(source, patternBand.globule), patternBand);
	if (!real) return null;
	const tubes = tubesOf(source, real.globule);
	const tube = tubes?.find((t) => t.address?.tube === real.tube) ?? tubes?.[real.tube];
	if (!tube) return null;
	const band =
		tube.bands.find((b) => b.facets.find((f) => f.address)?.address?.band === real.band) ??
		tube.bands[real.band];
	if (!band || band.facets.length === 0) return null;
	return {
		band,
		label: concatAddress_Band(patternBand, 'tb-slash'),
		key: `${source}:${concatAddress_Band(real)}`
	};
};
