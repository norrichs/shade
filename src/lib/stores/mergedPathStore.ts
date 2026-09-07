import { writable, get, type Writable } from 'svelte/store';
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
 * `computeMergedBandPaths` to size the label outline accurately, and by
 * CutPatternRenderer to reserve layout space for external labels. Cleared
 * alongside `mergedBandPaths` so a fresh measurement cycle drives the next
 * prep.
 */
export const labelTextDimensions: Writable<Map<string, LabelTextDims>> = writable(new Map());

const pendingDims = new Map<string, LabelTextDims>();
let flushScheduled = false;

const flushNow = () => {
	flushScheduled = false;
	if (pendingDims.size === 0) return;
	const current = get(labelTextDimensions);
	let changed = false;
	const next = new Map(current);
	for (const [id, dims] of pendingDims) {
		const prev = current.get(id);
		if (!prev || prev.width !== dims.width || prev.height !== dims.height) {
			next.set(id, dims);
			changed = true;
		}
	}
	pendingDims.clear();
	if (changed) labelTextDimensions.set(next);
};

/**
 * Record one band's measured label dims. Writes are coalesced into a single
 * store update per microtask, and dropped when nothing changed.
 *
 * Every PatternLabel measures itself after mount, so a pattern with N bands used
 * to produce N store updates in a row. Each one rebuilt the whole layout index
 * and re-rendered every band, so a regeneration cost O(N²) instead of O(N).
 */
export const setLabelTextDimension = (bandId: string, dims: LabelTextDims) => {
	pendingDims.set(bandId, dims);
	if (!flushScheduled) {
		flushScheduled = true;
		queueMicrotask(flushNow);
	}
};

/** Apply pending measurements now (tests). */
export const flushLabelTextDimensions = flushNow;
