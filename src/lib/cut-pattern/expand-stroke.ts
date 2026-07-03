import type { PathSegment } from '$lib/types';
import { svgPathStringFromSegments } from '$lib/patterns/utils';
import { getPaperScope } from '$lib/paper/scope';
import { paperToPathSegments } from '$lib/paper';
// @ts-expect-error - svg-path-outline ships no types
import outline from 'svg-path-outline';

export type StrokeInput = {
	path: PathSegment[];
	strokeWidth: number;
	cap: 'round';
};

/**
 * Expand one widthed facet stroke into a filled outline that traces the outer
 * visual edge of its stroke width. For a single round-cap segment this is a
 * rounded rectangle. Returns `PathSegment[]` (may contain multiple contours,
 * e.g. outer + inner for a closed input).
 *
 * This is the ONLY unit that depends on `svg-path-outline`. Swapping the
 * expansion engine (Clipper, hand-rolled offsetting) means providing a
 * different function with the same `(StrokeInput) => PathSegment[]` signature.
 */
export const expandFacetStroke = (stroke: StrokeInput): PathSegment[] => {
	const { path, strokeWidth } = stroke;
	if (!path || path.length === 0) return [];

	const d = svgPathStringFromSegments(path);
	// distance is the offset from centerline = half the stroke width.
	const outlineString: string = outline(d, (strokeWidth || 1) / 2, {
		joints: 0, // round joints
		bezierAccuracy: 3,
		inside: true,
		outside: true
	});
	if (!outlineString) return [];

	const paper = getPaperScope();
	const item = paper.PathItem.create(outlineString);
	const segments = paperToPathSegments(item);
	item.remove();
	return segments;
};
