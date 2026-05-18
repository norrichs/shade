import type { PathSegment } from '$lib/types';
import { svgPathStringFromSegments } from '$lib/patterns/utils';
import { getPaperScope } from './scope';

/**
 * Build a paper.PathItem (Path or CompoundPath) from this project's PathSegment[]
 * representation. Goes via the SVG path-data string so paper handles all the
 * curve math (Q → C normalization, A → C decomposition).
 *
 * Throws if the segment list does not begin with an 'M' (paper would silently
 * produce an empty path otherwise).
 *
 * Note: paper-core has no bundled types, so the return type is `any`.
 */
export const pathSegmentsToPaper = (segments: PathSegment[]): any => {
	if (segments.length === 0 || segments[0][0] !== 'M') {
		throw new Error("PathSegment[] must begin with 'M'");
	}
	// Note: multi-contour inputs (multiple 'M's) pass this check; paper will
	// create a CompoundPath from them. Single-'M' validation only.
	const paper = getPaperScope();
	const svg = svgPathStringFromSegments(segments);
	return paper.PathItem.create(svg);
};
