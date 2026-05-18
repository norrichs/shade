import type { PathSegment, PatternLabelsConfig, TubeCutPattern } from '$lib/types';
import { buildLabelOutlinePath } from './label-outline-path';
import { transformLabelOutlineToBandSpace } from './transform-label-outline';
import { mergeOutlineWithLabel } from './merge-outline-with-label';
import type { LabelTextDims } from '$lib/stores/mergedPathStore';

const FALLBACK_WIDTH = 350;
const FALLBACK_HEIGHT = 280;

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
 */
export const computeMergedBandPaths = (
	tubes: TubeCutPattern[],
	labels: PatternLabelsConfig | undefined,
	patternType: string,
	labelTextDims: Map<string, LabelTextDims>
): Map<string, PathSegment[]> => {
	const result = new Map<string, PathSegment[]>();
	if (patternType !== 'outlined') return result;
	const selfTag = labels?.selfTag;
	if (!selfTag?.enabled) return result;

	const stemLength = selfTag.stemLength ?? 20;
	const stemWidth = selfTag.stemWidth ?? 4;
	const padding = selfTag.padding ?? 10;
	const height = selfTag.height ?? 14;
	const radius = height / 4;
	const configuredAngle = selfTag.angle ?? 0;

	for (const tube of tubes) {
		for (const band of tube.bands) {
			if (band.tagAnchorAutoAngle === undefined) continue;
			const bandPath = band.facets[0]?.path;
			if (!bandPath || bandPath.length === 0) continue;

			const dims = labelTextDims.get(band.id) ?? {
				width: FALLBACK_WIDTH,
				height: FALLBACK_HEIGHT
			};

			const localPath = buildLabelOutlinePath({
				measuredWidth: dims.width,
				measuredHeight: dims.height,
				radius,
				padding,
				stemLength,
				stemWidth
			});

			const effectiveAngle = (band.tagAngle ?? configuredAngle) + band.tagAnchorAutoAngle;
			const renderAnchor = {
				x: band.tagAnchorPoint.x - (stemWidth / 2) * Math.cos(effectiveAngle),
				y: band.tagAnchorPoint.y - (stemWidth / 2) * Math.sin(effectiveAngle)
			};

			const bandSpacePath = transformLabelOutlineToBandSpace(
				localPath,
				renderAnchor,
				effectiveAngle
			);

			const merged = mergeOutlineWithLabel(bandPath, bandSpacePath);
			result.set(band.id, merged);
		}
	}

	return result;
};
