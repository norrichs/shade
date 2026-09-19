import type { PathSegment } from '$lib/types';
import { expandFacetStroke, type StrokeInput } from './expand-stroke';
import { uniteMany } from '$lib/paper';

/**
 * Split a path into its individual drawing edges. Each returned edge is a
 * two-command open segment: an `M` at the current pen position followed by the
 * original draw command (`L`, `C`, `Q`, or `A`). A `Z` becomes a straight edge
 * back to the subpath start.
 *
 * We expand per EDGE, not per subpath. A closed-loop subpath (a tessellation
 * cell drawn as `M L L L …` back to start) handed whole to the expander is
 * turned by svg-path-outline into a RING (inside + outside offsets); unioning
 * those rings against crossing edges fills cells that should stay open. Reducing
 * every piece to a simple single-segment stadium makes interior holes form
 * purely from paper's union topology, which is hole-correct at scale. (Patterns
 * whose subpaths are already single edges — e.g. the shield tessellation — are
 * unaffected; this only matters for multi-edge subpaths.)
 */
const splitEdges = (path: PathSegment[]): PathSegment[][] => {
	const edges: PathSegment[][] = [];
	let cx = 0;
	let cy = 0;
	let sx = 0;
	let sy = 0;
	let started = false;
	for (const seg of path) {
		const cmd = seg[0];
		if (cmd === 'M') {
			cx = seg[1];
			cy = seg[2];
			sx = cx;
			sy = cy;
			started = true;
		} else if (cmd === 'Z') {
			if (started)
				edges.push([
					['M', cx, cy],
					['L', sx, sy]
				]);
			cx = sx;
			cy = sy;
		} else if (started && seg.length >= 3) {
			// L / C / Q / A — the endpoint is the last two numbers.
			edges.push([['M', cx, cy], seg]);
			cx = seg[seg.length - 2] as number;
			cy = seg[seg.length - 1] as number;
		}
	}
	return edges;
};

/**
 * Build one hole-preserving union path for a tiled-pattern band: expand every
 * widthed facet edge into a filled outline, then boolean-union all outlines.
 *
 * Each facet path is split into its individual edges (see `splitEdges`) and each
 * edge is expanded separately, so paper's union — not the expander — resolves
 * all the interior cells. This keeps tessellation holes intact and confines the
 * expander to trivial single-segment inputs, reducing reliance on it.
 *
 * `expander` defaults to `expandFacetStroke` and is injectable for tests and
 * future engine swaps.
 */
/** Just the part of a band that stroke expansion reads. `BandCutPattern` satisfies it. */
export type BandUnionInput = {
	facets: { path: PathSegment[]; strokeWidth?: number }[];
};

export const buildBandUnionPath = (
	band: BandUnionInput,
	expander: (stroke: StrokeInput) => PathSegment[] = expandFacetStroke
): PathSegment[] => {
	const outlines = band.facets
		.flatMap((facet) =>
			splitEdges(facet.path).map((edge) =>
				expander({ path: edge, strokeWidth: facet.strokeWidth ?? 1, cap: 'round' })
			)
		)
		.filter((outline) => outline.length > 0);

	if (outlines.length === 0) return [];
	return uniteMany(outlines);
};
