import type { Tube } from '#lib/projection-geometry/types.js';
import type { AssemblerHighlight } from '#lib/assembler-highlight.js';
import type { GeometrySource } from '#lib/stores/selectionStores.js';
import type { PatternBandSpaceOf } from '#lib/cut-pattern/pattern-band-space.js';
import { resolveRangeList } from '#lib/projection-geometry/filters.js';
import { resolveHighlightedBand, resolvePatternBand, type ResolvedBand } from './resolve-band';
import type { BandViewerSelection } from './viewer-selection';

type TubesOf = (source: GeometrySource, globule: number) => Tube[] | undefined;

/** Parse a `bandFilterKey` (`g:t:b`); null if malformed. */
const parseKey = (key: string) => {
	const parts = key.split(':').map(Number);
	if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) return null;
	const [globule, tube, band] = parts;
	return { globule, tube, band };
};

/**
 * The real bands the band viewer shows for `sel`, in display order. Stale or
 * unknown addresses are skipped, never thrown.
 *
 * Range mode ranges over `rangeSource` (the current pattern source): tube
 * positions among the tubes that have pattern bands, then pattern band indices
 * within each picked tube, both with the pattern view's Range rules
 * (`resolveRangeList`: inclusive, negative from the end, wrapping).
 */
export const resolveViewerBands = (
	sel: BandViewerSelection,
	highlight: AssemblerHighlight,
	rangeSource: GeometrySource,
	tubesOf: TubesOf,
	spaces: PatternBandSpaceOf
): ResolvedBand[] => {
	if (sel.mode === 'selected') {
		const one = resolveHighlightedBand(highlight, tubesOf, spaces);
		return one ? [one] : [];
	}

	if (sel.mode === 'clicked') {
		const clicked = sel.clicked;
		if (!clicked) return [];
		return clicked.keys.flatMap((key) => {
			const address = parseKey(key);
			const r = address && resolvePatternBand(clicked.source, address, tubesOf, spaces);
			return r ? [r] : [];
		});
	}

	const globule = 0;
	const space = spaces(rangeSource, globule);
	const tubes = tubesOf(rangeSource, globule);
	if (!space || !tubes) return [];
	// Pattern bands per tube: probe the band space until it runs out.
	const patternTubes = [...new Set(tubes.map((t, i) => t.address?.tube ?? i))]
		.sort((a, b) => a - b)
		.map((tube) => {
			let count = 0;
			while (space.toReal(tube, count) !== undefined) count++;
			return { tube, count };
		})
		.filter((t) => t.count > 0);

	return resolveRangeList(sel.range.tubes, patternTubes.length).flatMap((position) => {
		const { tube, count } = patternTubes[position];
		return resolveRangeList(sel.range.bands, count).flatMap((band) => {
			const r = resolvePatternBand(rangeSource, { globule, tube, band }, tubesOf, spaces);
			return r ? [r] : [];
		});
	});
};

/** Fallback order when the pattern's source has no tubes (default model first). */
const RANGE_SOURCE_FALLBACK: GeometrySource[] = [
	'voronoi',
	'voronoiSurface',
	'projection',
	'surfaceProjection',
	'globuleTube'
];

/**
 * The geometry source Range mode ranges over: the pattern's source when it has
 * tubes (so indices match the pattern pane), else the first source that does —
 * e.g. the default Voronoi model while the pattern source still says projection.
 */
export const pickRangeSource = (
	preferred: GeometrySource,
	hasTubes: (source: GeometrySource) => boolean
): GeometrySource =>
	hasTubes(preferred)
		? preferred
		: (RANGE_SOURCE_FALLBACK.find((s) => s !== preferred && hasTubes(s)) ?? preferred);
