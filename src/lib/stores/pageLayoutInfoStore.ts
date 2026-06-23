import { writable } from 'svelte/store';

/**
 * Live summary of the most recent page-mode layout, written by
 * `CutPatternRenderer` whenever it recomputes the page layout. Read by the Page
 * Layout editor to show how many pages the current pattern occupies.
 *
 * `pageCount` is 0 when not in page mode or when the pattern overflows (the
 * renderer drops pages and falls back to line-wrap in that case).
 */
export const pageLayoutInfoStore = writable<{ pageCount: number; overflow: boolean }>({
	pageCount: 0,
	overflow: false
});

/**
 * Whether to render the model-size measurement indicators in the 3D scene
 * (color-coded matched point pairs for the X/Y/Z extents).
 */
export const showMeasureIndicators = writable(true);
