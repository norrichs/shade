import type { GlobuleAddress_Band } from '#lib/projection-geometry/types.js';
import type { ProjectionRange } from '#lib/projection-geometry/filters.js';
import type { GeometrySource } from '#lib/stores/selectionStores.js';
import { bandFilterKey } from '#lib/cut-pattern/pattern-filter.js';

/**
 * Which bands the Assembler's band viewer unfolds. Independent of the pattern
 * view's click filter and Range, so editing one never filters the other.
 *
 * - `selected`: the one highlighted band (the original single-band viewer).
 * - `clicked`: bands toggled in and out by clicks in any Assembler pane.
 * - `range`: numeric tube / band ranges, with the pattern view's Range rules.
 *
 * Click keys and ranges are in PATTERN band space (`bandFilterKey`), so labels
 * and indices match the pattern pane.
 */
export type BandViewerMode = 'selected' | 'clicked' | 'range';

export type BandViewerSelection = {
	mode: BandViewerMode;
	clicked: { source: GeometrySource; keys: string[] } | null;
	range: { tubes?: ProjectionRange['tubes']; bands?: ProjectionRange['bands'] };
	/** Facet index anchoring every shown band, or the per-band auto choice. */
	anchor: 'auto' | number;
};

export const DEFAULT_BAND_VIEWER_SELECTION: BandViewerSelection = {
	mode: 'selected',
	clicked: null,
	range: {},
	anchor: 'auto'
};

/**
 * The selection after a click on pattern band `band` of `source`. Only Clicked
 * mode reacts (other modes return `sel` itself). Clicks toggle; an emptied
 * set is `null`. While the set holds bands, clicks on another geometry source
 * (e.g. a stray click on an overlay) are ignored rather than wiping it.
 */
export const toggleViewerClick = (
	sel: BandViewerSelection,
	source: GeometrySource,
	band: GlobuleAddress_Band
): BandViewerSelection => {
	if (sel.mode !== 'clicked') return sel;
	if (sel.clicked && sel.clicked.source !== source) return sel;
	const key = bandFilterKey(band);
	const keys = sel.clicked?.keys ?? [];
	const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
	return { ...sel, clicked: next.length ? { source, keys: next } : null };
};
