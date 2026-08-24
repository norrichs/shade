import type { Vector3 } from 'three';
import type { PatternSource, SuperGlobule } from './types';
import type { Tube } from './projection-geometry/types';

const pushTubePoints = (tubes: Tube[] | undefined, out: Vector3[]): void => {
	if (!tubes) return;
	for (const tube of tubes) {
		for (const band of tube.bands) {
			for (const facet of band.facets) {
				const { a, b, c } = facet.triangle;
				out.push(a, b, c);
			}
		}
	}
};

/**
 * Collect the 3D points actually rendered for the active `patternSource`, taken
 * from the facet triangles of the matching tube set:
 *  - `globule`           → globuleTubes
 *  - `projection`        → projections[0].tubes
 *  - `surfaceProjection` → projections[0].surfaceProjectionTubes
 *  - `voronoi`           → voronoiResult.tubes
 *  - `voronoiSurface`    → voronoiResult.surfaceProjectionTubes
 *
 * Returns an empty array when the chosen source has no geometry (e.g. `voronoi`
 * on a model with the voronoi pipeline gated off); callers fall back to the
 * legacy sub-globule band geometry in that case. These are the same points
 * `collate-geometry` feeds to the rendered meshes, so a bounding box over them
 * matches what is on screen — unlike the legacy sub-globule bands, which ignore
 * projection/voronoi geometry.
 */
export const collectRenderedPoints = (
	superGlobule: SuperGlobule,
	patternSource: PatternSource
): Vector3[] => {
	const out: Vector3[] = [];
	const projection = superGlobule.projections?.[0];
	const voronoi = superGlobule.voronoiResult;
	switch (patternSource) {
		case 'globule':
			pushTubePoints(superGlobule.globuleTubes, out);
			break;
		case 'projection':
			pushTubePoints(projection?.tubes, out);
			break;
		case 'surfaceProjection':
			pushTubePoints(projection?.surfaceProjectionTubes, out);
			break;
		case 'voronoi':
			pushTubePoints(voronoi?.tubes, out);
			break;
		case 'voronoiSurface':
			pushTubePoints(voronoi?.surfaceProjectionTubes, out);
			break;
	}
	return out;
};
