import { derived, writable, get, type Writable } from 'svelte/store';
import type { PathSegment } from '$lib/types';

export type LabelTextDims = { width: number; height: number };

/**
 * Per-band merged outline+label path, keyed by band.id. Presence of an entry
 * means the band's merge has been prepared and should be rendered in place of
 * the standalone band path + label outline. Empty map = "not prepared".
 *
 * Populated by `publish()` in `NavHeader.svelte` (via `postProcessBandPaths`,
 * driven by the "Prepare Download" button).
 * Cleared by an invalidation $effect in NavHeader when relevant config or
 * geometry changes.
 */
export const mergedBandPaths: Writable<Map<string, PathSegment[]>> = writable(new Map());

/**
 * Stage 1 output: the merged band paths as the worker pool produced them,
 * before any post-processing.
 *
 * Stage 1 (stroke expansion plus boolean union) costs seconds; the per-band
 * post-processing in `docs/specs/pattern-post-processing.md` costs
 * milliseconds. Keeping the raw result means a change to post-process config
 * re-runs only stage 2, instead of paying for the union again.
 */
export const mergedBandPathsRaw: Writable<Map<string, PathSegment[]>> = writable(new Map());

/**
 * Stage 2: derive the render-facing paths from the raw merge.
 *
 * Identity until hole dropping lands. Callers must route through it rather than
 * writing `mergedBandPaths` directly, so that feature becomes a change to this
 * one function.
 */
export const postProcessBandPaths = (raw: Map<string, PathSegment[]>): Map<string, PathSegment[]> =>
	raw;

/**
 * True once "Prepare Download" has produced a merge. The prepared view is a
 * preview of the file that will be cut, so incidental screen furniture — the
 * assembler highlight, the split seam layer — stands down while it is on. The
 * explicit debug toggles in `patternViewConfig` stay under the user's control
 * and are stripped at export instead (`SCREEN_ONLY_SELECTOR` in `util.ts`).
 */
export const isPrepared = derived(mergedBandPaths, (paths) => paths.size > 0);

/**
 * Per-band measured label-text bbox in label-local coordinate units. Written
 * by PatternLabel after its getBBox() measurement settles. Read by
 * `prepareInputs()` in `NavHeader.svelte` (via `toBandMergePayloads`) to size
 * the label outline accurately, and by CutPatternRenderer to reserve layout
 * space for external labels. Cleared
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
