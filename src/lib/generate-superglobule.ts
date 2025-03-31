import { generateGlobuleData } from './generate-shape';
import { generateTempId } from './id-handler';
import { makeProjection } from './projection-geometry/generate-projection';
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
	const subGlobules = superConfig.subGlobuleConfigs
		.map((sgc, index) => generateSubGlobule(sgc, index))
		.flat();

	const recombinedSubGlobules = recombineSubGlobules(subGlobules);

	const projections = superConfig.projectionConfigs.map((config) => makeProjection(config));

	const superGlobule: SuperGlobule = {
		type: 'SuperGlobule',
		superGlobuleConfigId: superConfig.id,
		name: superConfig.name,
		subGlobules: recombinedSubGlobules,
		projections
	};
	return superGlobule;
};

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
