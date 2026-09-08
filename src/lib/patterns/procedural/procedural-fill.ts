import { mulberry32 } from '$lib/rng';
import { svgPathStringFromSegments } from '$lib/patterns/utils';
import type { CutPattern, PathSegment, ProceduralFillConfig } from '$lib/types';
import { packCircles, type Circle } from './circle-packing';
import type { Polygon } from './polygon-2d';

/**
 * Draw each circle as its own closed subpath: two half-arcs from the leftmost
 * point and back.
 *
 * Every circle in a band goes into ONE `CutPattern`, not one per circle. The
 * renderer emits a `<path>` per facet, and the largest saved configuration
 * carries 1,440 bands — a facet per hole would put tens of thousands of extra
 * nodes into the DOM, which is the known bottleneck of this pane.
 */
export const circlesToPathSegments = (circles: Circle[]): PathSegment[] => {
	const segments: PathSegment[] = [];
	for (const { x, y, r } of circles) {
		segments.push(['M', x - r, y]);
		segments.push(['A', r, r, 0, 1, 0, x + r, y]);
		segments.push(['A', r, r, 0, 1, 0, x - r, y]);
		segments.push(['Z']);
	}
	return segments;
};

/**
 * Build the interior geometry for one band.
 *
 * The RNG is seeded with `seed ^ bandIndex`, so every band gets its own
 * arrangement while the whole pattern stays byte-stable across re-derivation.
 * That stability is a correctness requirement, not a nicety: pattern generation
 * lives in a main-thread derived store that re-runs on every config change.
 *
 * Returns `undefined` when the fill produces nothing — a band too small to hold
 * a single hole, or a config whose radii cannot be satisfied. Callers append
 * nothing in that case rather than an empty facet.
 */
export const generateProceduralFill = (
	polygon: Polygon,
	config: ProceduralFillConfig,
	bandIndex: number
): CutPattern | undefined => {
	// Only one `kind` exists so far; the switch is the registry seam that keeps
	// the next fill from touching any caller.
	switch (config.kind) {
		case 'circle-holes': {
			const circles = packCircles(
				polygon,
				{
					density: config.density,
					margin: config.margin,
					minRadius: config.minRadius,
					maxRadius: config.maxRadius,
					spacing: config.spacing
				},
				mulberry32(config.seed ^ bandIndex)
			);
			if (circles.length === 0) return undefined;
			const path = circlesToPathSegments(circles);
			return {
				path,
				svgPath: svgPathStringFromSegments(path),
				label: `procedural-fill-${bandIndex}`
			};
		}
		default:
			return undefined;
	}
};
