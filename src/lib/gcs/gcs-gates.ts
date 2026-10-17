import type { GlobuleConfig, PipelineGates, SuperGlobule, SuperGlobuleConfig } from '$lib/types';
import type { GcsValidation } from './validate-shape-configs';

export type BlockedPipelines = Partial<Record<keyof PipelineGates, true>>;

/**
 * Which pipelines must be skipped because a globule's cross-section list is invalid.
 * Pure: `validate` is injected so this stays testable without the generation stack.
 */
export function gcsBlockedPipelines(
	config: SuperGlobuleConfig,
	validate: (g: GlobuleConfig) => GcsValidation
): { blocked: BlockedPipelines; message: string | null } {
	const results = config.subGlobuleConfigs.map((s) => validate(s.globuleConfig));
	const anyInvalid = results.some((r) => !r.isValid);
	if (!anyInvalid) return { blocked: {}, message: null };

	const blocked: BlockedPipelines = { globule: true, globuleTube: true };
	const firstInvalid = !results[0]?.isValid;
	const projections = config.projectionConfigs ?? [];
	if (firstInvalid) {
		if (projections.some((p) => p.surfaceConfig?.type === 'GlobuleConfig')) {
			blocked.projection = true;
		}
		if (projections[0]?.surfaceConfig?.type === 'GlobuleConfig') {
			blocked.voronoi = true;
		}
	}

	const firstError = results.flatMap((r) => r.errors)[0];
	return {
		blocked,
		message: firstError ? `Cross section: ${firstError.message}` : null
	};
}

export function applyBlocks(gates: PipelineGates, blocked: BlockedPipelines): PipelineGates {
	return {
		globule: gates.globule && !blocked.globule,
		globuleTube: gates.globuleTube && !blocked.globuleTube,
		projection: gates.projection && !blocked.projection,
		voronoi: gates.voronoi && !blocked.voronoi
	};
}

/** Keep the previous output for blocked pipelines the user still has enabled. */
export function backfillBlocked(
	result: SuperGlobule,
	previous: SuperGlobule | null,
	blocked: BlockedPipelines,
	userGates: PipelineGates
): SuperGlobule {
	if (!previous) return result;
	const out: SuperGlobule = { ...result };
	if (blocked.globule && userGates.globule) out.subGlobules = previous.subGlobules;
	if (blocked.globuleTube && userGates.globuleTube) out.globuleTubes = previous.globuleTubes;
	if (blocked.projection && userGates.projection) out.projections = previous.projections;
	if (blocked.voronoi && userGates.voronoi) out.voronoiResult = previous.voronoiResult;
	return out;
}
