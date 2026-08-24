import type { PatternSource, PipelineGates } from '$lib/types';

export type PatternGenerationTargets = {
	superGlobule: boolean;
	globuleTube: boolean;
	projection: boolean;
	surfaceProjection: boolean;
	voronoi: boolean;
	voronoiSurface: boolean;
};

/**
 * Which tube sets the current SuperGlobule actually carries geometry for.
 *
 * Every one of these must be checked before generating: `generateProjectionPattern`
 * reads `tubes[0].address` and throws on an empty array. A gate can be on while its
 * tubes are still empty — flipping a viewControl `any` flag re-runs pattern
 * generation synchronously, ahead of the worker regenerating the geometry.
 */
export type PatternGenerationAvailability = {
	hasGlobuleTubes: boolean;
	hasProjectionTubes: boolean;
	hasSurfaceProjectionTubes: boolean;
	hasVoronoiTubes: boolean;
	hasVoronoiSurfaceTubes: boolean;
};

/**
 * Decide which pattern variants to generate.
 *
 * Pattern generation follows the *pipeline* gates (the viewControl `any` flags),
 * because those decide whether the source geometry was generated at all. The 3D
 * render sub-flags (bands/facets/sections) are deliberately not consulted here —
 * their 2D counterpart is `showBands`, which is applied instead.
 *
 * `patternSource` selects among all the variants, `globule` included: each tube
 * set is generated only when its own source is selected, because `collateTubes`
 * collates only that source's tubes.
 */
export const resolvePatternGenerationTargets = (
	gates: PipelineGates,
	patternSource: PatternSource,
	showBands: boolean,
	availability: PatternGenerationAvailability
): PatternGenerationTargets => ({
	superGlobule: gates.globule,
	globuleTube:
		patternSource === 'globule' && gates.globuleTube && showBands && availability.hasGlobuleTubes,
	projection:
		patternSource === 'projection' &&
		gates.projection &&
		showBands &&
		availability.hasProjectionTubes,
	surfaceProjection:
		patternSource === 'surfaceProjection' &&
		gates.projection &&
		showBands &&
		availability.hasSurfaceProjectionTubes,
	voronoi: patternSource === 'voronoi' && showBands && availability.hasVoronoiTubes,
	voronoiSurface:
		patternSource === 'voronoiSurface' && showBands && availability.hasVoronoiSurfaceTubes
});
