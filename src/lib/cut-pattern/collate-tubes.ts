import type {
	ShowGlobuleTubeGeometries,
	ShowProjectionGeometries
} from '$lib/stores/viewControlStore';
import type {
	SuperGlobuleProjectionPattern,
	SuperGlobuleProjectionCutPattern
} from '$lib/stores/superGlobuleStores';
import type { TubeCutPattern } from '$lib/types';

// Mirrors `isSuperGlobuleProjectionCutPattern` from superGlobuleStores.ts.
// Inlined so this module stays runtime-clean of `$lib/stores` (whose barrel
// pulls in svelte/store and breaks the Jest transform chain).
const isCutPattern = (
	pattern: SuperGlobuleProjectionPattern | null | undefined
): pattern is SuperGlobuleProjectionCutPattern =>
	!!pattern &&
	(pattern as SuperGlobuleProjectionCutPattern).type === 'SuperGlobuleProjectionCutPattern';

export type CollateTubesInput = {
	globuleTubePattern: SuperGlobuleProjectionPattern | null | undefined;
	projectionPattern: SuperGlobuleProjectionPattern | undefined;
	surfaceProjectionPattern: SuperGlobuleProjectionPattern | undefined;
	showGlobuleTubeGeometry: ShowGlobuleTubeGeometries;
	showProjectionGeometry: ShowProjectionGeometries;
	patternSource: 'projection' | 'surfaceProjection';
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
		showGlobuleTubeGeometry,
		showProjectionGeometry,
		patternSource
	} = input;

	const hasGlobuleTube =
		globuleTubePattern &&
		isCutPattern(globuleTubePattern) &&
		globuleTubePattern.projectionCutPattern.tubes.length > 0;
	const hasProjection =
		projectionPattern &&
		isCutPattern(projectionPattern) &&
		projectionPattern.projectionCutPattern.tubes.length > 0;
	const hasSurfaceProjection =
		surfaceProjectionPattern &&
		isCutPattern(surfaceProjectionPattern) &&
		surfaceProjectionPattern.projectionCutPattern.tubes.length > 0;

	return [
		...(hasGlobuleTube && showGlobuleTubeGeometry.any
			? globuleTubePattern.projectionCutPattern.tubes
			: []),
		...(hasProjection && showProjectionGeometry.any && patternSource === 'projection'
			? projectionPattern.projectionCutPattern.tubes
			: []),
		...(hasSurfaceProjection &&
		showProjectionGeometry.any &&
		patternSource === 'surfaceProjection'
			? surfaceProjectionPattern.projectionCutPattern.tubes
			: [])
	];
};
