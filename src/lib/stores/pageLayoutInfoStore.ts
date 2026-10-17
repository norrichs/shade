import { writable } from 'svelte/store';

/**
 * Live summary of the most recent page-mode layout, written by
 * `CutPatternRenderer` whenever it recomputes the page layout. Read by the Page
 * Layout editor to show how many pages the current pattern occupies.
 *
 * `pageCount` is 0 when not in page mode or when the pattern overflows (the
 * renderer drops pages and falls back to line-wrap in that case).
 *
 * `utilisation` is the per-page material-used fraction (0..1) when the layout
 * algorithm reports it (nest only). `nestPending` is true while a nest worker
 * request for the current inputs is in flight; `nestFailed` is true when the
 * latest nest request failed (the renderer then shows the skyline fallback).
 */
export const pageLayoutInfoStore = writable<{
	pageCount: number;
	overflow: boolean;
	utilisation?: number[];
	nestPending?: boolean;
	nestFailed?: boolean;
}>({
	pageCount: 0,
	overflow: false,
	utilisation: undefined,
	nestPending: false,
	nestFailed: false
});

/**
 * Whether to render the model-size measurement indicators in the 3D scene
 * (color-coded matched point pairs for the X/Y/Z extents).
 */
export const showMeasureIndicators = writable(true);
