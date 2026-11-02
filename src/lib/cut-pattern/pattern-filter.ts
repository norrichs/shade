/**
 * Pattern filter: which pattern bands the cut-pattern pane shows, driven by band
 * clicks (3D model, pattern pane or data grid).
 *
 * Modes:
 * - `off`: clicks only select.
 * - `focus`: clicks select and pan the pattern view to the band if it is shown.
 * - `band`: clicks filter the pattern to the clicked band (and focus it).
 * - `tube`: clicks filter the pattern to the clicked band's tube (and focus it).
 *
 * `band` and `tube` combine `exclusive`ly (one band/tube at a time; re-clicking
 * it clears the filter) or `additive`ly (each click toggles the band/tube in or
 * out of the shown set, no limit).
 *
 * Every address here is in PATTERN band space (see `pattern-band-space.ts`);
 * pieces of a split band share their parent's band address, so a filtered band
 * keeps all of its pieces. Store-free so it can be unit tested.
 */
import type { GlobuleAddress_Band, GlobuleAddress_Tube } from '#lib/projection-geometry/types.js';
import type { TubeCutPattern } from '#lib/types.js';
import type { GeometrySource } from '#lib/stores/selectionStores.js';

export type PatternFilterMode = 'off' | 'focus' | 'band' | 'tube';
export type PatternFilterCombine = 'exclusive' | 'additive';

export type PatternFilterSettings = {
	mode: PatternFilterMode;
	combine: PatternFilterCombine;
};

/**
 * The shown set. `kind` records whether `keys` name bands or tubes, so a mode
 * switch can never read tube keys as band keys. `null` means "no filter: show
 * everything".
 */
export type PatternFilterSet = {
	source: GeometrySource;
	kind: 'band' | 'tube';
	keys: string[];
} | null;

export const isFilteringMode = (mode: PatternFilterMode): mode is 'band' | 'tube' =>
	mode === 'band' || mode === 'tube';

export const bandFilterKey = (a: GlobuleAddress_Band): string => `${a.globule}:${a.tube}:${a.band}`;
export const tubeFilterKey = (a: GlobuleAddress_Tube): string => `${a.globule}:${a.tube}`;

const keyFor = (kind: 'band' | 'tube', band: GlobuleAddress_Band) =>
	kind === 'band' ? bandFilterKey(band) : tubeFilterKey(band);

/**
 * The shown set after a click on pattern band `band` of `source`. Settings that
 * do not filter leave the set untouched. A click on another source, or under
 * another kind, starts a fresh set.
 */
export const applyPatternFilterClick = (
	current: PatternFilterSet,
	settings: PatternFilterSettings,
	source: GeometrySource,
	band: GlobuleAddress_Band
): PatternFilterSet => {
	const { mode, combine } = settings;
	if (!isFilteringMode(mode)) return current;
	const key = keyFor(mode, band);
	const compatible = current && current.source === source && current.kind === mode;
	const keys = compatible ? current.keys : [];
	const has = keys.includes(key);

	if (combine === 'exclusive') {
		// Re-clicking the one shown band/tube clears the filter, like the
		// selection highlight's own toggle.
		if (has && keys.length === 1) return null;
		return { source, kind: mode, keys: [key] };
	}
	const next = has ? keys.filter((k) => k !== key) : [...keys, key];
	return next.length ? { source, kind: mode, keys: next } : null;
};

/** Whether `set` shows pattern band `band` of `source` (true when unfiltered). */
export const patternFilterShows = (
	set: PatternFilterSet,
	source: GeometrySource,
	band: GlobuleAddress_Band
): boolean => {
	if (!set || set.source !== source) return true;
	return set.keys.includes(keyFor(set.kind, band));
};

/**
 * Whether `band` is in `set` itself — the 3D "filtered" highlight. Unlike
 * `patternFilterShows`, an empty filter highlights nothing.
 */
export const patternFilterIncludes = (
	set: PatternFilterSet,
	source: GeometrySource,
	band: GlobuleAddress_Band
): boolean => !!set && set.source === source && set.keys.includes(keyFor(set.kind, band));

/**
 * `tubes` narrowed to the bands `set` shows. Tubes left with no band are
 * dropped. Returns `tubes` itself when nothing is filtered, so layout memos keyed
 * on identity hold.
 */
export const filterPatternTubes = (
	tubes: TubeCutPattern[],
	set: PatternFilterSet,
	source: GeometrySource
): TubeCutPattern[] => {
	if (!set || set.source !== source) return tubes;
	return tubes.flatMap((tube) => {
		const bands = tube.bands.filter((band) => patternFilterShows(set, source, band.address));
		if (bands.length === 0) return [];
		return bands.length === tube.bands.length ? [tube] : [{ ...tube, bands }];
	});
};

/** A short readout of the set, e.g. "2 bands" or "1 tube". */
export const describePatternFilter = (set: PatternFilterSet): string => {
	if (!set) return 'showing all';
	const n = set.keys.length;
	return `${n} ${set.kind}${n === 1 ? '' : 's'}`;
};
