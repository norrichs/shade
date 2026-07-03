import type { BandCutPattern, PathSegment } from '$lib/types';
import { expandFacetStroke, type StrokeInput } from './expand-stroke';
import { uniteMany } from '$lib/paper';

/**
 * Build one hole-preserving union path for a tiled-pattern band: expand every
 * widthed facet stroke into a filled outline, then boolean-union all outlines.
 *
 * `expander` defaults to `expandFacetStroke` and is injectable for tests and
 * future engine swaps.
 */
export const buildBandUnionPath = (
	band: BandCutPattern,
	expander: (stroke: StrokeInput) => PathSegment[] = expandFacetStroke
): PathSegment[] => {
	const outlines = band.facets
		.map((facet) =>
			expander({ path: facet.path, strokeWidth: facet.strokeWidth ?? 1, cap: 'round' })
		)
		.filter((outline) => outline.length > 0);

	if (outlines.length === 0) return [];
	return uniteMany(outlines);
};
