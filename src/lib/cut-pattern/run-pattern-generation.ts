import type {
	GlobulePatternConfig,
	PipelineGates,
	SuperGlobule,
	SuperGlobuleConfig
} from '$lib/types';
import type { Tube } from '$lib/projection-geometry/types';
import type { PatternGenerationConfig } from '$lib/stores/globulePatternStores';
import type {
	SuperGlobuleBandPattern,
	SuperGlobuleProjectionPattern
} from '$lib/stores/superGlobuleStores';
import { generateProjectionPattern, generateSuperGlobulePattern } from './generate-pattern';
import { resolvePatternGenerationTargets } from './pattern-generation-gates';

export type PatternGenerationResult = {
	superGlobulePattern: SuperGlobuleBandPattern | null;
	projectionPattern: SuperGlobuleProjectionPattern | undefined;
	globuleTubePattern: SuperGlobuleProjectionPattern | null;
	surfaceProjectionPattern: SuperGlobuleProjectionPattern | undefined;
	voronoiPattern: SuperGlobuleProjectionPattern | undefined;
	voronoiSurfacePattern: SuperGlobuleProjectionPattern | undefined;
};

export const EMPTY_PATTERN_RESULT: PatternGenerationResult = {
	superGlobulePattern: null,
	projectionPattern: undefined,
	globuleTubePattern: null,
	surfaceProjectionPattern: undefined,
	voronoiPattern: undefined,
	voronoiSurfacePattern: undefined
};

export type PatternGenerationInput = {
	superGlobule: SuperGlobule;
	superConfig: SuperGlobuleConfig;
	genConfig: PatternGenerationConfig;
	gates: PipelineGates;
};

/**
 * Generate every pattern variant the current source and gates call for.
 *
 * Pure: same inputs, same output. Runs inside the geometry worker (on its cached
 * SuperGlobule) and, as a fallback, on the main thread when the geometry did not
 * come from the worker.
 */
export const runPatternGeneration = ({
	superGlobule,
	superConfig,
	genConfig,
	gates
}: PatternGenerationInput): PatternGenerationResult => {
	// generateSuperGlobulePattern still expects the full config shape.
	const patternConfigForGeneration: GlobulePatternConfig = {
		type: 'GlobulePatternConfig',
		id: '',
		cutoutConfig: {} as GlobulePatternConfig['cutoutConfig'],
		patternConfig: {
			pixelScale: genConfig.pixelScale,
			splits: genConfig.splits
		} as GlobulePatternConfig['patternConfig'],
		patternViewConfig: {
			showBands: genConfig.showBands,
			range: genConfig.range
		} as GlobulePatternConfig['patternViewConfig'],
		patternTypeConfig: genConfig.patternTypeConfig
	};

	const projection = superGlobule.projections[0];
	const globuleTubes = superGlobule.globuleTubes;
	const voronoiResult = superGlobule.voronoiResult;
	const voronoiTubes = voronoiResult?.tubes ?? [];
	const voronoiSurfaceProjectionTubes = voronoiResult?.surfaceProjectionTubes ?? [];

	const patternSource = genConfig.patternSource ?? 'projection';

	const targets = resolvePatternGenerationTargets(gates, patternSource, genConfig.showBands, {
		hasGlobuleTubes: globuleTubes.length > 0,
		hasProjectionTubes: !!projection?.tubes?.length,
		hasSurfaceProjectionTubes: !!projection?.surfaceProjectionTubes?.length,
		hasVoronoiTubes: voronoiTubes.length > 0,
		hasVoronoiSurfaceTubes: voronoiSurfaceProjectionTubes.length > 0
	});

	const patternFor = (tubes: Tube[]) =>
		generateProjectionPattern(tubes, superConfig.id, patternConfigForGeneration, genConfig.range);

	return {
		superGlobulePattern: targets.superGlobule
			? generateSuperGlobulePattern(superGlobule, superConfig, patternConfigForGeneration)
			: null,
		globuleTubePattern: targets.globuleTube ? patternFor(globuleTubes) : null,
		projectionPattern: targets.projection ? patternFor(projection.tubes) : undefined,
		surfaceProjectionPattern: targets.surfaceProjection
			? patternFor(projection.surfaceProjectionTubes!)
			: undefined,
		voronoiPattern: targets.voronoi ? patternFor(voronoiTubes) : undefined,
		voronoiSurfacePattern: targets.voronoiSurface
			? patternFor(voronoiSurfaceProjectionTubes)
			: undefined
	};
};
