import { writable } from 'svelte/store';
import { AUTO_PERSIST_KEY, persistable } from '#lib/persistable.js';
import type { GlobuleAddress_Band } from '#lib/projection-geometry/types.js';
import type { GeometrySource } from './selectionStores';
import {
	DEFAULT_BAND_VIEWER_SELECTION,
	toggleViewerClick,
	type BandViewerSelection
} from '#lib/band-viewer/viewer-selection.js';

/**
 * The band viewer's band selection and anchor. A module store (not component
 * state) because the editor lives in a Floater, whose content unmounts on close.
 */
export const bandViewerSelection = persistable<BandViewerSelection>(
	DEFAULT_BAND_VIEWER_SELECTION,
	'BandViewerSelection',
	AUTO_PERSIST_KEY,
	true
);

/**
 * A pattern band was clicked in some Assembler pane. Called beside
 * `patternFilterBandClicked` at both click sites; acts only in Clicked mode.
 */
export const bandViewerBandClicked = (source: GeometrySource, band: GlobuleAddress_Band) =>
	bandViewerSelection.update((sel) => toggleViewerClick(sel, source, band));

/** Most facets in any shown band; the anchor dropdown offers 0 … this − 1. */
export const bandViewerMaxFacets = writable(0);
