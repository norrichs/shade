import { writable, type Writable } from 'svelte/store';
import type { PathSegment } from '$lib/types';

export type LabelTextDims = { width: number; height: number };

/**
 * Per-band merged outline+label path, keyed by band.id. Presence of an entry
 * means the band's merge has been prepared and should be rendered in place of
 * the standalone band path + label outline. Empty map = "not prepared".
 *
 * Populated by `computeMergedBandPaths` (via the "Prepare Download" button).
 * Cleared by an invalidation $effect in NavHeader when relevant config or
 * geometry changes.
 */
export const mergedBandPaths: Writable<Map<string, PathSegment[]>> = writable(new Map());

/**
 * Per-band measured label-text bbox in label-local coordinate units. Written
 * by PatternLabel after its getBBox() measurement settles. Read by
 * `computeMergedBandPaths` to size the label outline accurately. Cleared
 * alongside `mergedBandPaths` so a fresh measurement cycle drives the next
 * prep.
 */
export const labelTextDimensions: Writable<Map<string, LabelTextDims>> = writable(new Map());
