import { derived, writable, get, type Writable } from 'svelte/store';
import type { PathSegment } from '$lib/types';
import type { BandContourIndex } from '$lib/cut-pattern/contour-index';
import { postProcessBandPath } from '$lib/cut-pattern/drop-holes';
import { DEFAULT_POST_PROCESS, type PostProcessConfig } from '$lib/cut-pattern/hole-drop-config';
import { patternConfigStore } from './globulePatternStores';
import {
	GEOMETRY_TYPES,
	type GeometryType,
	type TaggedPath
} from '$lib/cut-pattern/post-process-types';
import { layerStroke } from '$lib/lightburn/layers';

export type LabelTextDims = { width: number; height: number };

/**
 * Stage 1 output: the merged band paths as the worker pool produced them,
 * before any post-processing.
 *
 * Stage 1 (stroke expansion plus boolean union) costs seconds; stage 2 costs
 * milliseconds. Keeping the raw result means a change to the hole-drop config
 * re-runs only stage 2, instead of paying for the union again.
 *
 * Written by `publish()` in `NavHeader.svelte`, together with
 * `bandContourIndexes`. Cleared by NavHeader's invalidation block when the
 * geometry or label config changes.
 */
export const mergedBandPathsRaw: Writable<Map<string, PathSegment[]>> = writable(new Map());

/**
 * Stage 1b output: every contour of each band, keyed by band.id.
 *
 * Written by the same prepare run that writes `mergedBandPathsRaw`, and cleared
 * with it — a band must never hold a path without its index.
 */
export const bandContourIndexes: Writable<Map<string, BandContourIndex>> = writable(new Map());

/**
 * The post-process block of the pattern config.
 *
 * A plain `derived` over the whole config store would emit on every unrelated
 * config edit, and each emission rebuilds every band's path. The JSON compare
 * narrows it to real changes, mirroring what `patternGenerationConfig` does to
 * avoid re-triggering the geometry worker.
 */
let lastPostProcessJson = '';
export const postProcessConfig = derived<typeof patternConfigStore, PostProcessConfig>(
	patternConfigStore,
	($config, set) => {
		const next = $config.patternConfig.postProcess ?? DEFAULT_POST_PROCESS;
		const json = JSON.stringify(next);
		if (json === lastPostProcessJson) return;
		lastPostProcessJson = json;
		set(next);
	},
	DEFAULT_POST_PROCESS
);

/**
 * Stage 2 over every band, tagging each surviving contour as its own piece.
 *
 * A band with no index is passed through `postProcessBandPath` too, which
 * treats an empty-contours index as one whole outline piece — see its doc
 * comment. There is no early-return-by-reference for the none/no-dropOutline
 * case any more, because the output type (`TaggedPath[]`) differs from the
 * input (`PathSegment[]`); stage 2 is still milliseconds.
 */
export const applyPostProcess = (
	raw: Map<string, PathSegment[]>,
	indexes: Map<string, BandContourIndex>,
	config: PostProcessConfig,
	pageScale = 1
): Map<string, TaggedPath[]> => {
	const out = new Map<string, TaggedPath[]>();
	for (const [bandId, path] of raw) {
		const index = indexes.get(bandId) ?? { seed: 0, contours: [] };
		out.set(bandId, postProcessBandPath(path, index, config, pageScale));
	}
	return out;
};

/**
 * Whether prepared bands stop drawing their label text. Read by PatternLabel;
 * the label's tag outline is unaffected, since that lives in the merged path.
 */
export const dropLabelText = derived(postProcessConfig, (config) => config.dropLabelText === true);

let lastPageScale = NaN;
/** `pageLayout.pageScale`, emitting only when it changes. */
export const pageScaleValue = derived<typeof patternConfigStore, number>(
	patternConfigStore,
	($config, set) => {
		const next = $config.patternConfig.pageLayout?.pageScale ?? 1;
		if (next === lastPageScale) return;
		lastPageScale = next;
		set(next);
	},
	1
);

/**
 * The slice of the post-process config that stage 2 reads. Page labels, the
 * layer map, the download format and the stage-3 toggles do not change a band's
 * path, so they must not rebuild every band's `<path>` either. JSON-guarded like
 * `postProcessConfig`.
 */
let lastStage2Json = '';
const stage2Config = derived<typeof postProcessConfig, PostProcessConfig>(
	postProcessConfig,
	($config, set) => {
		const next: PostProcessConfig = {
			dropHoles: $config.dropHoles,
			runSeed: $config.runSeed,
			dropOutline: $config.dropOutline,
			connectSurround: $config.connectSurround
		};
		const json = JSON.stringify(next);
		if (json === lastStage2Json) return;
		lastStage2Json = json;
		set(next);
	},
	DEFAULT_POST_PROCESS
);

/**
 * Per-band merged outline+label path, keyed by band.id, as it should RENDER.
 * Presence of an entry means the band's merge has been prepared and should be
 * drawn in place of the standalone band path + label outline. Empty map = "not
 * prepared".
 *
 * Derived, not written: stage 1 (seconds, in the pool) lands in
 * `mergedBandPathsRaw`, and stage 2 (milliseconds, here) re-runs on its own
 * whenever the hole-drop config changes. That is the point of the split — a
 * nudged drop chance must never pay for the union again. `runSeed` takes part
 * because rerolling has to change the result.
 */
export const mergedBandPaths = derived(
	[mergedBandPathsRaw, bandContourIndexes, stage2Config, pageScaleValue],
	([$raw, $indexes, $config, $pageScale]) => applyPostProcess($raw, $indexes, $config, $pageScale)
);

/**
 * True once "Prepare Download" has produced a merge. The prepared view is a
 * preview of the file that will be cut, so incidental screen furniture — the
 * assembler highlight, the split seam layer — stands down while it is on. The
 * explicit debug toggles in `patternViewConfig` stay under the user's control
 * and are stripped at export instead (`SCREEN_ONLY_SELECTOR` in `util.ts`).
 */
export const isPrepared = derived(mergedBandPaths, (paths) => paths.size > 0);

/**
 * Stroke hex per geometry type, from the post-process layer map. Every exported
 * producer reads its stroke from here, so preview and export always agree.
 */
export const layerStrokes = derived(
	postProcessConfig,
	(config) =>
		Object.fromEntries(GEOMETRY_TYPES.map((t) => [t, layerStroke(t, config.layerMap)])) as Record<
			GeometryType,
			string
		>
);

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
