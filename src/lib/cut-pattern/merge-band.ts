import type { PathSegment, PatternLabelsConfig } from '$lib/types';
import type { BandMergePayload } from './band-merge-payload';
import {
	buildLabelOutlinePath,
	FALLBACK_TEXT_WIDTH,
	FALLBACK_TEXT_HEIGHT
} from './label-outline-path';
import { transformLabelOutlineToBandSpace } from './transform-label-outline';
import { mergeOutlineWithLabel } from './merge-outline-with-label';
import { insertKeepConnectedBreak } from './keep-connected';
import { buildBandUnionPath } from './build-band-union-path';
import { uniteMany } from '$lib/paper';

/** The merge inputs that are identical for every band in one run. */
export type MergeCtx = {
	patternType: string;
	selfTag?: NonNullable<PatternLabelsConfig['selfTag']>;
	keepConnected: number;
};

/**
 * The self-tag label outline (stem + body) in band-local coordinates, or `[]`
 * when the band has no anchor. Mirrors PatternLabel's transform so the merged
 * outline lands exactly under the separately-rendered label text:
 * `effectiveAngle` combines the configured `tagAngle` with `tagAnchorAutoAngle`
 * (the edge-derived orientation), and the anchor is shifted by `stemWidth/2`
 * along the angle, matching PatternLabel's `renderAnchor`.
 *
 * `outlined` selects the two places the tiled and outlined merges differed: the
 * default label height (14 outlined, 16 tiled) and the anchor shift, which the
 * tiled merge skipped when no auto-angle was present. The outlined merge only
 * ever ran with an auto-angle, so it always shifted.
 */
const labelOutline = (
	payload: BandMergePayload,
	selfTag: NonNullable<PatternLabelsConfig['selfTag']>,
	outlined: boolean
): PathSegment[] => {
	if (!payload.tagAnchorPoint) return [];
	const dims = payload.labelTextDims ?? {
		width: FALLBACK_TEXT_WIDTH,
		height: FALLBACK_TEXT_HEIGHT
	};
	const stemWidth = selfTag.stemWidth ?? 4;
	const height = selfTag.height ?? (outlined ? 14 : 16);
	const localPath = buildLabelOutlinePath({
		measuredWidth: dims.width,
		measuredHeight: dims.height,
		radius: height / 4,
		padding: selfTag.padding ?? 10,
		stemLength: selfTag.stemLength ?? 20,
		stemWidth
	});
	const effectiveAngle =
		(payload.tagAngle ?? selfTag.angle ?? 0) + (payload.tagAnchorAutoAngle ?? 0);
	const renderAnchor =
		payload.tagAnchorAutoAngle === undefined && !outlined
			? payload.tagAnchorPoint
			: {
					x: payload.tagAnchorPoint.x - (stemWidth / 2) * Math.cos(effectiveAngle),
					y: payload.tagAnchorPoint.y - (stemWidth / 2) * Math.sin(effectiveAngle)
				};
	return transformLabelOutlineToBandSpace(localPath, renderAnchor, effectiveAngle);
};

/**
 * Merge one band into a single path. Pure, and free of Three.js and DOM, so it
 * runs identically on the main thread and inside a Web Worker.
 *
 * Returns `[]` when the band produces no path; the caller skips storing it,
 * matching the `continue` branches the synchronous merge used to take.
 */
export const mergeBand = (payload: BandMergePayload, ctx: MergeCtx): PathSegment[] => {
	const { selfTag } = ctx;

	if (ctx.patternType !== 'outlined') {
		if (payload.facets.length === 0) return [];
		const bandUnion = buildBandUnionPath(payload);
		if (bandUnion.length === 0) return [];
		if (selfTag?.enabled && payload.tagAnchorPoint) {
			const label = labelOutline(payload, selfTag, false);
			if (label.length > 0) return uniteMany([bandUnion, label]);
		}
		return bandUnion;
	}

	if (!selfTag?.enabled) return [];
	if (payload.tagAnchorAutoAngle === undefined) return [];
	const bandPath = payload.facets[0]?.path;
	if (!bandPath || bandPath.length === 0) return [];

	const label = labelOutline(payload, selfTag, true);
	const merged = mergeOutlineWithLabel(bandPath, label);
	return ctx.keepConnected > 0 ? insertKeepConnectedBreak(merged, ctx.keepConnected) : merged;
};
