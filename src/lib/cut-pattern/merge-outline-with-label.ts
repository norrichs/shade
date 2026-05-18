import type { PathSegment } from '$lib/types';
import { unitePaths } from '$lib/paper';

/**
 * Combine a pattern outline path with a label outline path into a single
 * continuous contour using paper.js boolean union.
 *
 * Both inputs must be closed contours (begin with 'M', end with 'Z') in the
 * same coordinate space. The label is expected to be positioned so it shares
 * geometry with the outline (e.g. the label stem's base lies on the outline);
 * if the two are disjoint, the result is a compound path with two contours
 * and a console warning is emitted — that almost certainly indicates a
 * positioning bug in the caller.
 */
export const mergeOutlineWithLabel = (
	outline: PathSegment[],
	label: PathSegment[]
): PathSegment[] => {
	const merged = unitePaths(outline, label);
	const contourCount = merged.filter((s) => s[0] === 'M').length;
	if (contourCount > 1) {
		console.warn(
			`mergeOutlineWithLabel: union produced ${contourCount} contours; ` +
				'expected one. Label is likely not touching the outline.'
		);
	}
	return merged;
};
