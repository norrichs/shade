/**
 * Pattern filter state: the mode (persisted per browser), the shown set
 * (ephemeral), and focus requests for the pattern pane. The rules live in the
 * store-free `#lib/cut-pattern/pattern-filter.js`.
 */
import { get, writable } from 'svelte/store';
import { AUTO_PERSIST_KEY, persistable } from '#lib/persistable.js';
import type { GlobuleAddress_Band } from '#lib/projection-geometry/types.js';
import {
	applyPatternFilterClick,
	patternFilterShows,
	type PatternFilterSettings
} from '#lib/cut-pattern/pattern-filter.js';
import { sameGlobuleBand } from '#lib/assembler-highlight.js';
import { geometrySourceOfPattern } from '#lib/cut-pattern/pattern-band-space.js';
import { assemblerHighlight, type GeometrySource } from './selectionStores';
import { patternSourceStore } from './superGlobuleStores';

export const patternFilterSettings = persistable<PatternFilterSettings>(
	{ mode: 'off', combine: 'exclusive' },
	'PatternFilterSettings',
	AUTO_PERSIST_KEY,
	true
);

import { patternFilterSet } from './patternFilterSetStore';
export { patternFilterSet };

export const clearPatternFilter = () => patternFilterSet.set(null);

// A set names bands of one pattern source; switching the pane's source would
// leave it filtering nothing, while the controls still report it.
patternSourceStore.subscribe(() => clearPatternFilter());

/**
 * Change the mode or combine rule. Any change clears the shown set: a set built
 * under one rule means something else under another.
 */
export const setPatternFilterSettings = (patch: Partial<PatternFilterSettings>) => {
	const current = get(patternFilterSettings);
	const next = { ...current, ...patch };
	if (next.mode === current.mode && next.combine === current.combine) return;
	patternFilterSettings.set(next);
	clearPatternFilter();
};

/**
 * A request to pan the pattern pane to a band. `seq` makes a repeat click on the
 * same band a new request.
 */
export type PatternFocusRequest = {
	source: GeometrySource;
	band: GlobuleAddress_Band;
	seq: number;
} | null;

export const patternFocusRequest = writable<PatternFocusRequest>(null);
let focusSeq = 0;

export const requestPatternFocus = (source: GeometrySource, band: GlobuleAddress_Band) =>
	patternFocusRequest.set({ source, band, seq: ++focusSeq });

/**
 * A band of `source` (pattern band space) was clicked, in 3D, the pattern pane
 * or the data grid. Call after the selection highlight has been updated.
 *
 * Updates the shown set, and focuses the band when it is still shown. A band the
 * click took out of the set must not stay highlighted, or the selection would
 * name a band the pane no longer draws.
 */
export const patternFilterBandClicked = (source: GeometrySource, band: GlobuleAddress_Band) => {
	const settings = get(patternFilterSettings);
	if (settings.mode === 'off') return;
	// Only bands of the geometry the pattern pane shows can be shown or hidden
	// there; a click on another source's meshes (e.g. the surface projection
	// drawn over the voronoi tubes) leaves the filter alone.
	if (source !== geometrySourceOfPattern(get(patternSourceStore))) return;
	const next = applyPatternFilterClick(get(patternFilterSet), settings, source, band);
	patternFilterSet.set(next);
	if (patternFilterShows(next, source, band)) {
		requestPatternFocus(source, band);
		return;
	}
	const highlight = get(assemblerHighlight);
	if (highlight && highlight.source === source && sameGlobuleBand(highlight.band, band))
		assemblerHighlight.set(null);
};
