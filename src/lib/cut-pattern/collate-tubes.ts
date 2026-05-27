import type {
	ShowGlobuleTubeGeometries,
	ShowProjectionGeometries
} from '$lib/stores/viewControlStore';
import type {
	SuperGlobuleProjectionPattern,
	SuperGlobuleProjectionCutPattern
} from '$lib/stores/superGlobuleStores';
import type { PatternSource, TubeCutPattern } from '$lib/types';

const isCutPattern = (
	pattern: SuperGlobuleProjectionPattern | null | undefined
): pattern is SuperGlobuleProjectionCutPattern =>
	!!pattern &&
	(pattern as SuperGlobuleProjectionCutPattern).type === 'SuperGlobuleProjectionCutPattern';

export type CollateTubesInput = {
	globuleTubePattern: SuperGlobuleProjectionPattern | null | undefined;
	projectionPattern: SuperGlobuleProjectionPattern | undefined;
	surfaceProjectionPattern: SuperGlobuleProjectionPattern | undefined;
	voronoiPattern: SuperGlobuleProjectionPattern | undefined;
	voronoiSurfacePattern: SuperGlobuleProjectionPattern | undefined;
	showGlobuleTubeGeometry: ShowGlobuleTubeGeometries;
	showProjectionGeometry: ShowProjectionGeometries;
	patternSource: PatternSource;
};

/**
 * Concatenate tubes from the three pattern variants under the same gating
 * the renderer applies, so the Prepare Download merge operates on the exact
 * band set the renderer paints.
 *
 * The renderer (PatternViewer) and the prepare-download pipeline (NavHeader)
 * MUST agree on which tubes are in scope. `mergedBandPaths` is keyed by
 * `band.id`, and IDs like `outlined-band-{idx}` collide across variants —
 * so if the two sites disagree, the renderer reads merged geometry built
 * from a different variant's bands (different tabs, different anchor).
 * Use this helper from both sites to keep them in lockstep.
 */
export const collateTubes = (input: CollateTubesInput): TubeCutPattern[] => {
	const {
		globuleTubePattern,
		projectionPattern,
		surfaceProjectionPattern,
		voronoiPattern,
		voronoiSurfacePattern,
		showGlobuleTubeGeometry,
		showProjectionGeometry,
		showVoronoiGeometry,
		patternSource
	} = input;

	const getTubes = (pattern: SuperGlobuleProjectionPattern | null | undefined) =>
		pattern && isCutPattern(pattern) && pattern.projectionCutPattern.tubes.length > 0
			? pattern.projectionCutPattern.tubes
			: [];

	return [
		...(showGlobuleTubeGeometry.any ? getTubes(globuleTubePattern) : []),
		...(showProjectionGeometry.any && patternSource === 'projection'
			? getTubes(projectionPattern)
			: []),
		...(showProjectionGeometry.any && patternSource === 'surfaceProjection'
			? getTubes(surfaceProjectionPattern)
			: []),
		...(patternSource === 'voronoi' ? getTubes(voronoiPattern) : []),
		...(patternSource === 'voronoiSurface' ? getTubes(voronoiSurfacePattern) : [])
	];
};
