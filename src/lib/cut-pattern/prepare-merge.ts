import type { PathSegment, PatternLabelsConfig, TubeCutPattern } from '$lib/types';
import type { LabelTextDims } from '$lib/stores/mergedPathStore';
import { toBandMergePayloads } from './band-merge-payload';
import { mergeBand, type MergeCtx } from './merge-band';

/**
 * Merge every band of `tubes` on this thread, in tube-then-band order, using
 * the same pure `mergeBand` the worker pool runs. Bands that produce no path
 * are omitted, matching the `continue` branches this loop used to take.
 */
const runSync = (
	tubes: TubeCutPattern[],
	labelTextDims: Map<string, LabelTextDims>,
	ctx: MergeCtx
): Map<string, PathSegment[]> => {
	const result = new Map<string, PathSegment[]>();
	for (const payload of toBandMergePayloads(tubes, labelTextDims)) {
		const path = mergeBand(payload, ctx);
		if (path.length > 0) result.set(payload.id, path);
	}
	return result;
};

/**
 * Build one hole-preserving union path per band for tiled (non-outlined)
 * patterns. Same output shape and key (`band.id`) as the outlined merge, so it
 * feeds the same `mergedBandPaths` store and render branch.
 *
 * When `labels.selfTag.enabled`, the self-tag label outline is merged into the
 * band union AFTER the facet geometry is unioned, so the label attaches to the
 * finished silhouette (mirroring the outlined `mergeOutlineWithLabel` step).
 */
export const computeTiledUnionPaths = (
	tubes: TubeCutPattern[],
	labels?: PatternLabelsConfig,
	labelTextDims: Map<string, LabelTextDims> = new Map()
): Map<string, PathSegment[]> =>
	runSync(tubes, labelTextDims, {
		patternType: 'tiled',
		selfTag: labels?.selfTag,
		keepConnected: 0
	});

/**
 * Compute merged outline+label paths for every eligible band in `tubes`.
 *
 * A band is eligible when:
 *  - `patternType === 'outlined'`
 *  - `labels.selfTag.enabled === true`
 *  - `band.tagAnchorAutoAngle !== undefined`
 *  - `band.facets[0]?.path` is non-empty
 *
 * For each eligible band, computes the label outline using the current label
 * config + measured text dims (falling back to FALLBACK_WIDTH/HEIGHT when the
 * band's dims aren't in `labelTextDims`), transforms it to band-local coords,
 * and merges with the band outline via `mergeOutlineWithLabel`.
 *
 * Returns a new Map<bandId, PathSegment[]> with one entry per merged band.
 * Pure; does not write to any store. The caller is responsible for writing
 * the result to `mergedBandPaths`.
 *
 * When `keepConnected > 0`, each merged path gets a single uncut bridge of that
 * pixel width (see `insertKeepConnectedBreak`) so the laser-cut piece stays
 * attached to the surrounding sheet.
 *
 * For non-`outlined` pattern types, each band is instead expanded and unioned
 * from its facet strokes (see `computeTiledUnionPaths`).
 */
export const computeMergedBandPaths = (
	tubes: TubeCutPattern[],
	labels: PatternLabelsConfig | undefined,
	patternType: string,
	labelTextDims: Map<string, LabelTextDims>,
	keepConnected = 0
): Map<string, PathSegment[]> =>
	runSync(tubes, labelTextDims, {
		patternType,
		selfTag: labels?.selfTag,
		keepConnected
	});
