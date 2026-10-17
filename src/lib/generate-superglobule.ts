import { generateGlobuleTube } from './generate-shape';
import { generateTempId } from './id-handler';
import { makeProjection } from './projection-geometry/generate-projection';
import type { SurfaceConfig, Tube } from './projection-geometry/types';
import { makeVoronoi } from './voronoi/generate-voronoi';
import type {
	GlobuleConfig,
	Id,
	PipelineError,
	PipelineGates,
	SubGlobuleConfig,
	SuperGlobule,
	SuperGlobuleConfig
} from './types';

const ALL_PIPELINES: PipelineGates = {
	globuleTube: true,
	projection: true,
	voronoi: true
};

/**
 * Run all generation pipelines whose gate is enabled. Each pipeline is gated
 * (skipped when its gate is false) AND fault-isolated (its failure is collected
 * as a non-fatal `pipelineError` rather than aborting the others). Gates are wired
 * to the viewControl `any` flags so a pipeline only runs when its output is wanted.
 */
export const generateSuperGlobule = (
	superConfig: SuperGlobuleConfig,
	gates: PipelineGates = ALL_PIPELINES
): SuperGlobule => {
	const pipelineErrors: PipelineError[] = [];

	// Run a gated, fault-isolated pipeline: skip when disabled; on failure record
	// the error and fall back rather than propagating.
	function runPipeline<T>(
		pipeline: keyof PipelineGates,
		enabled: boolean,
		fn: () => T,
		fallback: T
	): T {
		if (!enabled) return fallback;
		try {
			return fn();
		} catch (error) {
			pipelineErrors.push({
				pipeline,
				message: error instanceof Error ? error.message : String(error)
			});
			return fallback;
		}
	}

	// Globule Tube Pipeline
	const globuleTubes = runPipeline<Tube[]>(
		'globuleTube',
		gates.globuleTube,
		() => generateGlobuleTubes(superConfig.subGlobuleConfigs),
		[]
	);

	// Surface-config resolution is cheap (no mesh/raycasting) and is needed by the
	// voronoi pipeline even when the projection pipeline is gated off, so it runs
	// unconditionally here.
	const globuleConfig = superConfig.subGlobuleConfigs[0]?.globuleConfig;
	const resolvedProjectionConfigs = superConfig.projectionConfigs.map((config) => {
		if (config.surfaceConfig.type === 'GlobuleConfig' && globuleConfig) {
			return {
				...config,
				surfaceConfig: {
					...globuleConfig,
					transform: config.surfaceConfig.transform
				} as SurfaceConfig
			};
		}
		return config;
	});

	// Projection Tube pipeline (the center-based ray-casting pipeline that throws on
	// open/gapped surfaces — gating it off keeps it from aborting the others).
	const projections = runPipeline<SuperGlobule['projections']>(
		'projection',
		gates.projection,
		() => resolvedProjectionConfigs.map((config, i) => makeProjection(config, { globule: i })),
		[]
	);

	// Voronoi Tube pipeline (single config)
	const projectionSurfaceConfig = resolvedProjectionConfigs[0]?.surfaceConfig;
	const voronoiResult = runPipeline<SuperGlobule['voronoiResult']>(
		'voronoi',
		gates.voronoi && !!projectionSurfaceConfig && !!superConfig.voronoiConfig,
		() => makeVoronoi(superConfig.voronoiConfig!, { globule: 0 }, projectionSurfaceConfig!),
		undefined
	);

	const superGlobule: SuperGlobule = {
		type: 'SuperGlobule',
		superGlobuleConfigId: superConfig.id,
		name: superConfig.name,
		globuleTubes,
		projections,
		voronoiResult,
		pipelineErrors: pipelineErrors.length > 0 ? pipelineErrors : undefined
	};
	return superGlobule;
};

/**
 * One tube per DISTINCT globule.
 *
 * Sub-globule configs can share a `globuleConfig`: the legacy recombination flow adds
 * copies of the same globule that differ only by their `transforms` (placements). This
 * pipeline does not implement transforms, so a tube per entry emitted the same globule
 * twice, stacked on itself — visible in the pattern as t0/b0 AND t1/b0 for a single
 * globule. Keep the first entry per `globuleConfig.id`; an independent globule
 * (`cloneGlobuleConfig` gives it a fresh id) still gets its own tube.
 *
 * The tube address indexes into this list — partner lookups index tubes by
 * `address.tube`, and band keys/ids downstream are derived from that address.
 */
const generateGlobuleTubes = (subGlobuleConfigs: SubGlobuleConfig[]): Tube[] => {
	const seen = new Set<Id>();
	const tubes: Tube[] = [];
	for (const subGlobuleConfig of subGlobuleConfigs) {
		const globuleConfigId = subGlobuleConfig.globuleConfig.id;
		if (seen.has(globuleConfigId)) continue;
		seen.add(globuleConfigId);
		tubes.push(
			generateGlobuleTube(subGlobuleConfig.globuleConfig, { globule: 0, tube: tubes.length })
		);
	}
	return tubes;
};

export const cloneSubGlobuleConfig = (original: SubGlobuleConfig): SubGlobuleConfig => {
	return {
		...original,
		id: generateTempId('sub'),
		globuleConfig: cloneGlobuleConfig(original.globuleConfig),
		transforms: structuredClone(original.transforms)
	};
};

export const copySubGlobuleConfig = (original: SubGlobuleConfig): SubGlobuleConfig => {
	return {
		...original,
		id: generateTempId('sub'),
		transforms: structuredClone(original.transforms)
	};
};

export const cloneGlobuleConfig = (original: GlobuleConfig): GlobuleConfig => {
	return {
		...structuredClone(original),
		id: generateTempId('glb')
	};
};

export const updateGlobuleConfigs = (
	superGlobuleConfig: SuperGlobuleConfig,
	newGlobuleConfig: GlobuleConfig
): SuperGlobuleConfig => {
	return {
		...superGlobuleConfig,
		subGlobuleConfigs: superGlobuleConfig.subGlobuleConfigs.map((subGlobuleConfig) => {
			return {
				...subGlobuleConfig,
				globuleConfig:
					subGlobuleConfig.globuleConfig.id === newGlobuleConfig.id
						? newGlobuleConfig
						: subGlobuleConfig.globuleConfig
			};
		}),
		projectionConfigs: superGlobuleConfig.projectionConfigs.map((pc) => {
			if (pc.surfaceConfig.type === 'GlobuleConfig') {
				return {
					...pc,
					surfaceConfig: {
						...newGlobuleConfig,
						transform: pc.surfaceConfig.transform
					} as SurfaceConfig
				};
			}
			return pc;
		})
	};
};

export const divergeSubGlobuleConfig = (
	superGlobuleConfig: SuperGlobuleConfig,
	subGlobuleConfigId: Id
): SuperGlobuleConfig => {
	const index = superGlobuleConfig.subGlobuleConfigs.findIndex(
		(sgc) => sgc.id === subGlobuleConfigId
	);
	if (index >= 0) {
		superGlobuleConfig.subGlobuleConfigs[index] = {
			...superGlobuleConfig.subGlobuleConfigs[index],
			globuleConfig: cloneGlobuleConfig(superGlobuleConfig.subGlobuleConfigs[index].globuleConfig)
		};
	}
	return superGlobuleConfig;
};
