import { generateGlobuleData, generateGlobuleTube } from './generate-shape';
import { generateTempId } from './id-handler';
import { makeProjection } from './projection-geometry/generate-projection';
import type { Tube } from './projection-geometry/types';
import { recombineSubGlobules } from './recombination';
import { generateTransformedGlobules } from './transform-globule';
import type {
	Band,
	Facet,
	Globule,
	GlobuleConfig,
	GlobuleData,
	Id,
	SubGlobule,
	SubGlobuleConfig,
	SuperGlobule,
	SuperGlobuleConfig
} from './types';

export const generateSuperGlobule = (superConfig: SuperGlobuleConfig): SuperGlobule => {
	
	// Old Globule Pipeline
	const subGlobules: SubGlobule[] = recombineSubGlobules(
		superConfig.subGlobuleConfigs.map((sgc, index) => generateSubGlobule(sgc, index)).flat()
	);

	// New Globule Tube Pipeline
	const globuleTubes = superConfig.subGlobuleConfigs
		.map((sgc, index) => generateSubGlobuleTubes(sgc, index))
		.flat();

	// Projection Tube pipeline
	const projections = superConfig.projectionConfigs.map((config, i) =>
		makeProjection(config, { projection: i })
	);

	const superGlobule: SuperGlobule = {
		type: 'SuperGlobule',
		superGlobuleConfigId: superConfig.id,
		name: superConfig.name,
		globuleTubes,
		subGlobules,
		projections
	};
	return superGlobule;
};

export const generateSuperGlobuleTubes = (superConfig: SuperGlobuleConfig): SuperGlobule => {
	const globuleTubes = superConfig.subGlobuleConfigs
		.map((sgc, index) => generateSubGlobuleTubes(sgc, index))
		.flat();

	// const recombinedSubGlobules: SubGlobule[] = recombineSubGlobules(subGlobules);

	const projections = superConfig.projectionConfigs.map((config, i) =>
		makeProjection(config, { projection: i })
	);

	const superGlobule: SuperGlobule = {
		type: 'SuperGlobule',
		superGlobuleConfigId: superConfig.id,
		name: superConfig.name,
		globuleTubes: globuleTubes,
		subGlobules: [],
		projections
	};
	return superGlobule;
};

/**
 * @deprecated
 */
const generateSubGlobule = (subGlobuleConfig: SubGlobuleConfig, sgIndex: number): SubGlobule => {
	const { transforms, id, name } = subGlobuleConfig;

	console.debug('GENERATE SUBGLOBULE');

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

	console.debug('*** *** *** GENERATE SUBGLOBULE TUBES *** *** ***');

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
	console.debug(
		'--------------------------------- prototypeGlobule ---------------------------------',
		globuleTube
	);

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

	console.debug('subGlobule', globuleTube);
	return [globuleTube];
};

export const cloneSubGlobuleConfig = (original: SubGlobuleConfig): SubGlobuleConfig => {
	return {
		...original,
		id: generateTempId('sub'),
		globuleConfig: cloneGlobuleConfig(original.globuleConfig),
		transforms: window.structuredClone(original.transforms)
	};
};

export const copySubGlobuleConfig = (original: SubGlobuleConfig): SubGlobuleConfig => {
	return {
		...original,
		id: generateTempId('sub'),
		transforms: window.structuredClone(original.transforms)
	};
};

export const cloneGlobuleConfig = (original: GlobuleConfig): GlobuleConfig => {
	return {
		...window.structuredClone(original),
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
