import { generateGlobuleData, generateGlobuleTube } from './generate-shape';
import { generateTempId } from './id-handler';
import { makeProjection } from './projection-geometry/generate-projection';
import type { SurfaceConfig, Tube } from './projection-geometry/types';
import { makeVoronoi } from './voronoi/generate-voronoi';
import { recombineSubGlobules } from './recombination';
import { generateTransformedGlobules } from './transform-globule';
import type {
	Band,
	Facet,
	Globule,
	GlobuleConfig,
	GlobuleData,
	Id,
	PipelineError,
	PipelineGates,
	SubGlobule,
	SubGlobuleConfig,
	SuperGlobule,
	SuperGlobuleConfig
} from './types';

const ALL_PIPELINES: PipelineGates = {
	globule: true,
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
	function runPipeline<T>(pipeline: keyof PipelineGates, enabled: boolean, fn: () => T, fallback: T): T {
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

	// Old Globule Pipeline
	const subGlobules = runPipeline<SubGlobule[]>(
		'globule',
		gates.globule,
		() =>
			recombineSubGlobules(
				superConfig.subGlobuleConfigs.map((sgc, index) => generateSubGlobule(sgc, index)).flat()
			),
		[]
	);

	// New Globule Tube Pipeline
	const globuleTubes = runPipeline<Tube[]>(
		'globuleTube',
		gates.globuleTube,
		() => superConfig.subGlobuleConfigs.map((sgc, index) => generateSubGlobuleTubes(sgc, index)).flat(),
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
		subGlobules,
		projections,
		voronoiResult,
		pipelineErrors: pipelineErrors.length > 0 ? pipelineErrors : undefined
	};
	return superGlobule;
};

/**
 * @deprecated
 */
const generateSubGlobule = (subGlobuleConfig: SubGlobuleConfig, sgIndex: number): SubGlobule => {
	const { transforms, id, name } = subGlobuleConfig;

	const prototypeGlobule: Globule = {
		type: 'Globule',
		coord: { s: sgIndex, t: 0, r: 0 },
		coordStack: [],
		address: { s: sgIndex, g: [], b: undefined },
		subGlobuleConfigId: subGlobuleConfig.id,
		globuleConfigId: subGlobuleConfig.globuleConfig.id,
		name: subGlobuleConfig.globuleConfig.name,
		data: generateGlobuleData(subGlobuleConfig.globuleConfig),
		visible: true
	};

	let globules: Globule[];
	if (transforms) {
		globules = generateTransformedGlobules(prototypeGlobule, transforms);
	} else {
		globules = [prototypeGlobule];
	}

	return {
		type: 'SubGlobule',
		subGlobuleConfigId: id,
		name,
		data: globules as Globule[]
	};
};

const generateSubGlobuleTubes = (subGlobuleConfig: SubGlobuleConfig, sgIndex: number): Tube[] => {
	const { transforms, id, name } = subGlobuleConfig;

	// const prototypeGlobule: Globule = {
	// 	type: 'Globule',
	// 	coord: { s: sgIndex, t: 0, r: 0 },
	// 	coordStack: [],
	// 	address: { s: sgIndex, g: [], b: undefined },
	// 	subGlobuleConfigId: subGlobuleConfig.id,
	// 	globuleConfigId: subGlobuleConfig.globuleConfig.id,
	// 	name: subGlobuleConfig.globuleConfig.name,
	// 	data: generateGlobuleTube(subGlobuleConfig.globuleConfig),
	// 	visible: true
	// };

	const globuleTube = generateGlobuleTube(subGlobuleConfig.globuleConfig);

	// let globules: Globule[];
	// if (transforms) {
	// 	globules = generateTransformedGlobules(prototypeGlobule, transforms);
	// } else {
	// 	globules = [prototypeGlobule];
	// }

	// const subGlobule: SubGlobule = {
	// 	type: 'SubGlobule',
	// 	subGlobuleConfigId: id,
	// 	name,
	// 	data: globules as Globule[]
	// };

	return [globuleTube];
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

export const cloneGlobuleData = (globuleData: GlobuleData): GlobuleData => {
	return { bands: globuleData.bands.map((b) => cloneBand(b)) };
};

export const cloneBand = (band: Band): Band => {
	return {
		...band,
		facets: band.facets.map((f) => cloneFacet(f))
	};
};

// tab clone not yet implemented
const cloneFacet = (facet: Facet) => {
	return { triangle: facet.triangle.clone() };
};
