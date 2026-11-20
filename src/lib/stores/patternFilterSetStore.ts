/**
 * The click-driven pattern filter's shown set (see `pattern-filter.ts`).
 *
 * A leaf module, so the pattern-generation config (`globulePatternStores`) can
 * read it without importing the selection / super-globule store graph, which
 * imports `globulePatternStores` back. The rest of the filter state lives in
 * `patternFilterStore.ts`, which re-exports this.
 */
import { writable } from 'svelte/store';
import { AUTO_PERSIST_KEY, persistable } from '#lib/persistable.js';
import type { PatternFilterSet, PatternFilterSettings } from '#lib/cut-pattern/pattern-filter.js';

/**
 * The filter mode, persisted per browser. Here rather than in
 * `patternFilterStore.ts` so generation config can read it (split mode drops
 * the numerical range).
 */
export const patternFilterSettings = persistable<PatternFilterSettings>(
	{ mode: 'off', combine: 'exclusive' },
	'PatternFilterSettings',
	AUTO_PERSIST_KEY,
	true
);

/** The pattern bands shown, in pattern band space; null shows everything. */
export const patternFilterSet = writable<PatternFilterSet>(null);

/**
 * The pattern bands the numerical Range is showing, as `bandFilterKey`s of one
 * geometry source — published by the pattern renderer from what it actually
 * lays out. Null when the range does not narrow anything (every band shows) or
 * a click filter is overriding it. Read by the 3D Selection render mode.
 */
export type RangeShownBands = { source: string; keys: Set<string> } | null;
export const rangeShownBands = writable<RangeShownBands>(null);
