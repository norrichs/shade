import type { BandCutPattern, PathSegment } from '$lib/types';
import { expandFacetStroke, type StrokeInput } from './expand-stroke';
import { uniteMany } from '$lib/paper';

/** Split a path into its subpaths, breaking before each 'M'. */
const splitSubpaths = (path: PathSegment[]): PathSegment[][] => {
	const subpaths: PathSegment[][] = [];
	let current: PathSegment[] = [];
	for (const seg of path) {
		if (seg[0] === 'M' && current.length) {
			subpaths.push(current);
			current = [];
		}
		current.push(seg);
	}
	if (current.length) subpaths.push(current);
	return subpaths;
};

/**
 * Build one hole-preserving union path for a tiled-pattern band: expand every
 * widthed facet stroke into a filled outline, then boolean-union all outlines.
 *
 * Each facet path is first split into its individual subpaths, and each subpath
 * is expanded separately. This matters: expanding a whole multi-subpath facet in
 * one call makes the expander (svg-path-outline) merge the pieces itself, which
 * loses interior holes where edges share vertices (tessellation cells). Expanding
 * each subpath independently and letting `uniteMany` (paper.js) perform the merge
 * preserves those holes — and confines the expander to trivial single-stroke
 * inputs, reducing reliance on it.
 *
 * `expander` defaults to `expandFacetStroke` and is injectable for tests and
 * future engine swaps.
 */
export const buildBandUnionPath = (
	band: BandCutPattern,
	expander: (stroke: StrokeInput) => PathSegment[] = expandFacetStroke
): PathSegment[] => {
	const outlines = band.facets
		.flatMap((facet) =>
			splitSubpaths(facet.path).map((subpath) =>
				expander({ path: subpath, strokeWidth: facet.strokeWidth ?? 1, cap: 'round' })
			)
		)
		.filter((outline) => outline.length > 0);

	if (outlines.length === 0) return [];
	return uniteMany(outlines);
};
