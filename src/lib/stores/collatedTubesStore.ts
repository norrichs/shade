import { derived } from 'svelte/store';

import { collateTubes } from '$lib/cut-pattern/collate-tubes';
import type { TubeCutPattern } from '$lib/types';

import { superGlobulePatternStore, patternSourceStore } from './superGlobuleStores';
import { viewControlStore } from './viewControlStore';

/**
 * The collated `TubeCutPattern[]` the pattern view actually paints.
 *
 * One shared definition, because `collateTubes` CONCATENATES tubes from several
 * pattern variants and `mergedBandPaths` is keyed by `band.id`, whose ids
 * collide across variants — two sites computing this independently can silently
 * disagree about which bands are in scope (`collate-tubes.ts:28-38`). Both
 * `PatternViewer` and the Splits panel read this one store.
 *
 * Note this is the UNFILTERED set: the renderer's `range` slice is applied
 * downstream of it, so a consumer judging a tube (auto-split, split counts) sees
 * every tube, not just the rendered ones.
 */
export const collatedTubesStore = derived(
	[superGlobulePatternStore, viewControlStore, patternSourceStore],
	([$pattern, $viewControl, $patternSource]): TubeCutPattern[] =>
		collateTubes({
			globuleTubePattern: $pattern.globuleTubePattern,
			projectionPattern: $pattern.projectionPattern,
			surfaceProjectionPattern: $pattern.surfaceProjectionPattern,
			voronoiPattern: $pattern.voronoiPattern,
			voronoiSurfacePattern: $pattern.voronoiSurfacePattern,
			showGlobuleTubeGeometry: $viewControl.showGlobuleTubeGeometry,
			showProjectionGeometry: $viewControl.showProjectionGeometry,
			patternSource: $patternSource
		})
);
