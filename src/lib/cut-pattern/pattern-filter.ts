/**
 * Pattern filter: which pattern bands the cut-pattern pane shows, driven by band
 * clicks (3D model, pattern pane or data grid).
 *
 * Modes:
 * - `off`: clicks only select.
 * - `focus`: clicks select and pan the pattern view to the band if it is shown.
 * - `band`: clicks filter the pattern to the clicked band (and focus it).
 * - `tube`: clicks filter the pattern to the clicked band's tube (and focus it).
 * - `split`: the pattern shows the split sections checked in the controls (see
 *   `listSplitSections`); clicks only focus. Replaces the numerical range.
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

export type PatternFilterMode = 'off' | 'focus' | 'band' | 'tube' | 'split';
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
	kind: 'band' | 'tube' | 'split';
	keys: string[];
} | null;

/** Modes whose shown set replaces the numerical range. */
export const isFilteringMode = (mode: PatternFilterMode): mode is 'band' | 'tube' | 'split' =>
	mode === 'band' || mode === 'tube' || mode === 'split';

/** Modes a band click changes the shown set in. */
const isClickFilteringMode = (mode: PatternFilterMode): mode is 'band' | 'tube' =>
	mode === 'band' || mode === 'tube';

export const bandFilterKey = (a: GlobuleAddress_Band): string => `${a.globule}:${a.tube}:${a.band}`;
export const tubeFilterKey = (a: GlobuleAddress_Tube): string => `${a.globule}:${a.tube}`;

/**
 * A split section of a tube: the run of quads between two split cuts, keyed by
 * its first (parent) quad. Every piece of every band in that run starts there,
 * because splits are tube-wide, so a piece's `parentQuadOffset` names its
 * section. Uncut bands (absent offset) sit in the first section.
 */
export const splitFilterKey = (a: GlobuleAddress_Tube, parentQuadOffset = 0): string =>
	`${a.globule}:${a.tube}@${parentQuadOffset}`;

const keyFor = (
	kind: 'band' | 'tube' | 'split',
	band: GlobuleAddress_Band,
	parentQuadOffset?: number
) =>
	kind === 'band'
		? bandFilterKey(band)
		: kind === 'tube'
			? tubeFilterKey(band)
			: splitFilterKey(band, parentQuadOffset);

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
	if (!isClickFilteringMode(mode)) return current;
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

/**
 * Whether `set` shows pattern band `band` of `source` (true when unfiltered).
 * `parentQuadOffset` is the band's own (`BandCutPattern.parentQuadOffset`); a
 * split set reads it to place a piece in its section.
 */
export const patternFilterShows = (
	set: PatternFilterSet,
	source: GeometrySource,
	band: GlobuleAddress_Band,
	parentQuadOffset?: number
): boolean => {
	if (!set || set.source !== source) return true;
	return set.keys.includes(keyFor(set.kind, band, parentQuadOffset));
};

/**
 * Whether `band` is in `set` itself — the 3D "filtered" highlight. Unlike
 * `patternFilterShows`, an empty filter highlights nothing. A split set names
 * quad runs, not whole bands, so it highlights nothing in 3D.
 */
export const patternFilterIncludes = (
	set: PatternFilterSet,
	source: GeometrySource,
	band: GlobuleAddress_Band
): boolean =>
	!!set &&
	set.kind !== 'split' &&
	set.source === source &&
	set.keys.includes(keyFor(set.kind, band));

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
		const bands = tube.bands.filter((band) =>
			patternFilterShows(set, source, band.address, band.parentQuadOffset)
		);
		if (bands.length === 0) return [];
		return bands.length === tube.bands.length ? [tube] : [{ ...tube, bands }];
	});
};

/** A short readout of the set, e.g. "2 bands", "1 tube" or "3 splits". */
export const describePatternFilter = (set: PatternFilterSet): string => {
	if (!set) return 'showing all';
	const n = set.keys.length;
	return `${n} ${set.kind}${n === 1 ? '' : 's'}`;
};

/** One section of a split tube, as the split filter's checkbox list shows it. */
export type SplitSection = {
	key: string;
	globule: number;
	tube: number;
	/** 0-based ordinal of the section within its tube. */
	index: number;
	/** First parent quad of the section. */
	startQuad: number;
	/** Last parent quad of the section, inclusive; undefined for the last section. */
	endQuad?: number;
	/** How many pattern bands (pieces or uncut bands) lie in the section. */
	bandCount: number;
};

export type SplitSections = {
	/** Sections of split tubes, in tube then quad order. */
	sections: SplitSection[];
	/** Keys of the tubes with no split: each is one whole section. */
	unsplitKeys: string[];
};

/**
 * The split sections `tubes` actually hold. Read from the generated pieces
 * rather than the split config, so a split generation dropped never lists an
 * empty section. A tube with no pieces is one section, listed in `unsplitKeys`.
 */
export const listSplitSections = (tubes: TubeCutPattern[]): SplitSections => {
	const sections: SplitSection[] = [];
	const unsplitKeys: string[] = [];
	for (const tube of tubes) {
		if (!tube.bands.some((b) => b.parentQuadOffset !== undefined)) {
			unsplitKeys.push(splitFilterKey(tube.address));
			continue;
		}
		const counts = new Map<number, number>();
		for (const band of tube.bands) {
			const offset = band.parentQuadOffset ?? 0;
			counts.set(offset, (counts.get(offset) ?? 0) + 1);
		}
		const offsets = [...counts.keys()].sort((a, b) => a - b);
		offsets.forEach((startQuad, index) =>
			sections.push({
				key: splitFilterKey(tube.address, startQuad),
				globule: tube.address.globule,
				tube: tube.address.tube,
				index,
				startQuad,
				endQuad: index + 1 < offsets.length ? offsets[index + 1] - 1 : undefined,
				bandCount: counts.get(startQuad) ?? 0
			})
		);
	}
	return { sections, unsplitKeys };
};

/** Every key `listSplitSections` lists. */
export const allSplitKeys = ({ sections, unsplitKeys }: SplitSections): string[] => [
	...sections.map((s) => s.key),
	...unsplitKeys
];

/**
 * The shown set after (un)checking split sections `keys`. `all` is every key
 * listed; a set showing every one collapses back to null (show everything).
 */
export const toggleSplitSections = (
	current: PatternFilterSet,
	source: GeometrySource,
	all: string[],
	keys: string[],
	shown: boolean
): PatternFilterSet => {
	const base =
		current && current.source === source && current.kind === 'split' ? current.keys : all;
	const next = shown ? [...new Set([...base, ...keys])] : base.filter((k) => !keys.includes(k));
	if (all.every((k) => next.includes(k))) return null;
	return { source, kind: 'split', keys: next };
};

/**
 * How many pattern bands generation makes from `tubes`: the visible bands, less
 * fillAll's fill bands unless the pattern keeps them — the same count the band
 * space maps (`buildBandSpace`). Pieces of a split band count once.
 */
export const patternedBandCount = (
	tubes: { bands: { visible?: boolean; isFill?: boolean }[] }[] | undefined,
	keepFillBands: boolean
): number =>
	(tubes ?? []).reduce(
		(n, tube) => n + tube.bands.filter((b) => b.visible && (keepFillBands || !b.isFill)).length,
		0
	);
