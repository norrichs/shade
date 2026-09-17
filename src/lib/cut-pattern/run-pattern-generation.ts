import type {
	GlobulePatternConfig,
	PipelineGates,
	SuperGlobule,
	SuperGlobuleConfig,
	TubeSplitRejection
} from '$lib/types';
import type { Tube } from '$lib/projection-geometry/types';
import type { PatternGenerationConfig } from '$lib/stores/globulePatternStores';
import type {
	SuperGlobuleBandPattern,
	SuperGlobuleProjectionCutPattern,
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
	// Persisted splits that generation dropped, for the page to report.
	rejectedSplits: TubeSplitRejection[];
};

export const EMPTY_PATTERN_RESULT: PatternGenerationResult = {
	superGlobulePattern: null,
	projectionPattern: undefined,
	globuleTubePattern: null,
	surfaceProjectionPattern: undefined,
	voronoiPattern: undefined,
	voronoiSurfacePattern: undefined,
	rejectedSplits: []
};

/**
 * Gather the split rejections carried on each tube of the generated patterns.
 *
 * Splits are persisted per tube, so a rejection is identified by (tube, quad):
 * the same split is reported once per tube however many pattern variants were
 * generated. The first reason seen wins. Sorted by tube, then quad.
 */
export const collectSplitRejections = (
	patterns: (SuperGlobuleProjectionPattern | null | undefined)[]
): TubeSplitRejection[] => {
	const byKey = new Map<string, TubeSplitRejection>();
	for (const pattern of patterns) {
		if (pattern?.type !== 'SuperGlobuleProjectionCutPattern') continue;
		for (const tube of (pattern as SuperGlobuleProjectionCutPattern).projectionCutPattern.tubes) {
			for (const rejection of tube.rejectedSplits ?? []) {
				const key = `${rejection.tube}:${rejection.quad}`;
				if (!byKey.has(key)) byKey.set(key, rejection);
			}
		}
	}
	return [...byKey.values()].sort((a, b) => a.tube - b.tube || a.quad - b.quad);
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

	const superGlobulePattern = targets.superGlobule
		? generateSuperGlobulePattern(superGlobule, superConfig, patternConfigForGeneration)
		: null;
	const globuleTubePattern = targets.globuleTube ? patternFor(globuleTubes) : null;
	const projectionPattern = targets.projection ? patternFor(projection.tubes) : undefined;
	const surfaceProjectionPattern = targets.surfaceProjection
		? patternFor(projection.surfaceProjectionTubes!)
		: undefined;
	const voronoiPattern = targets.voronoi ? patternFor(voronoiTubes) : undefined;
	const voronoiSurfacePattern = targets.voronoiSurface
		? patternFor(voronoiSurfaceProjectionTubes)
		: undefined;

	return {
		superGlobulePattern,
		globuleTubePattern,
		projectionPattern,
		surfaceProjectionPattern,
		voronoiPattern,
		voronoiSurfacePattern,
		rejectedSplits: collectSplitRejections([
			globuleTubePattern,
			projectionPattern,
			surfaceProjectionPattern,
			voronoiPattern,
			voronoiSurfacePattern
		])
	};
};
