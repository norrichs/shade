import type { PathSegment } from '$lib/types';

export type LabelOutlineInput = {
	measuredWidth: number;
	measuredHeight: number;
	radius: number;
	padding: number;
	stemLength: number;
	stemWidth: number;
};

/**
 * Build the self-tag label outline (stem + body) in label-local coordinates
 * with the stem tip at (0, 0).
 *
 * Mirrors the geometry previously inline in PatternLabel.svelte's
 * getLabelPathSegments. The body sits above the stem (y from stemLength to
 * stemLength + bodyHeight), the stem occupies y in [0, stemLength] with
 * the two long sides at x = ±stemWidth/2. Body corners are rounded with
 * quadratic curves of radius `radius`.
 *
 * `measuredWidth` and `measuredHeight` are the rendered text bbox dims;
 * the body is sized to text + 2 * padding on each axis.
 */
export const buildLabelOutlinePath = (input: LabelOutlineInput): PathSegment[] => {
	const { measuredWidth, measuredHeight, radius: r, padding, stemLength, stemWidth } = input;
	const halfWidth = (measuredWidth + padding * 2) / 2;
	const bodyHeight = measuredHeight + padding * 2;
	return [
		['M', 0, 0],
		['L', stemWidth / 2, 0],
		['L', stemWidth / 2, stemLength],
		['L', halfWidth - r, stemLength],
		['Q', halfWidth, stemLength, halfWidth, r + stemLength],
		['L', halfWidth, stemLength + bodyHeight - r],
		['Q', halfWidth, bodyHeight + stemLength, halfWidth - r, bodyHeight + stemLength],
		['L', r - halfWidth, bodyHeight + stemLength],
		['Q', -halfWidth, bodyHeight + stemLength, -halfWidth, bodyHeight - r + stemLength],
		['L', -halfWidth, r + stemLength],
		['Q', -halfWidth, stemLength, r - halfWidth, stemLength],
		['L', -stemWidth / 2, stemLength],
		['L', -stemWidth / 2, stemLength],
		['L', -stemWidth / 2, 0],
		['Z']
	];
};
