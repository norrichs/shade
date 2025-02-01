import type {
	SilhouetteConfig,
	DepthCurveConfig,
	ShapeConfig,
	CurveSampleMethod,
	LevelConfig,
	RenderConfig,
	SpineCurveConfig,
	BandConfig,
	StrutConfig,
	LevelOffset,
	SubGlobuleConfig,
	ChainableTransform,
	Id,
	SuperGlobuleConfig,
	GlobuleConfig
} from '$lib/types';

export const deserializeSilhouetteConfig = (
	res: object & { curves: unknown }
): SilhouetteConfig => {
	return { type: 'SilhouetteConfig', ...res, curves: JSON.parse(res.curves as string) };
};
export const deserializeDepthCurveConfig = (
	res: object & { curves: unknown }
): DepthCurveConfig => {
	return {
		type: 'DepthCurveConfig',
		...res,
		curves: JSON.parse(res.curves as string)
	} as DepthCurveConfig;
};
export const deserializeShapeConfig = (
	res: object & { curves: unknown; sampleMethod: unknown; sampleMethodDivisions: unknown }
): ShapeConfig => {
	return {
		type: 'ShapeConfig',
		...res,
		sampleMethod: {
			method: res.sampleMethod,
			divisions: res.sampleMethodDivisions
		} as CurveSampleMethod,
		curves: JSON.parse(res.curves as string)
	} as unknown as ShapeConfig;
};
export const deserializeLevelConfig = (res: any): LevelConfig => {
	return {
		type: 'LevelConfig',
		...res,
		silhouetteSampleMethod: {
			method: res.silhouetteSampleMethod,
			divisions: res.silhouetteSampleMethodDivisions
		}
	};
};
export const deserializeRenderConfig = (res: any): RenderConfig => {
	return {
		type: 'RenderConfig',
		ranges: {
			rangeStyle: res.rangeStyle,
			bandStart: res.bandStart,
			bandCount: res.bandCount,
			facetStart: res.facetStart,
			facetCount: res.facetCount,
			levelStart: res.levelStart,
			levelCount: res.levelCount,
			strutStart: res.strutStart,
			strutCount: res.strutCount
		},
		show: {
			tabs: res.tabs,
			levels: res.levels,
			bands: res.bands,
			edges: res.edges,
			patterns: res.patterns,
			struts: res.struts
		}
	};
};
export const deserializeSpineCurveConfig = (res: object & { curves: string }): SpineCurveConfig => {
	return {
		type: 'SpineCurveConfig',
		...res,
		curves: JSON.parse(res.curves)
	} as SpineCurveConfig;
};
export const deserializeBandConfig = (res: object): BandConfig => {
	return { type: 'BandConfig', ...res } as BandConfig;
};
export const deserializeStrutConfig = (res: object): StrutConfig => {
	return { type: 'StrutConfig', ...res } as StrutConfig;
};
export type TransitionalSuperGlobuleConfig = Omit<SuperGlobuleConfig, 'subGlobuleConfigs'> & {
	subGlobuleConfigs: TransitionalSubGlobuleConfig[];
};

export type TransitionalSubGlobuleConfig = Omit<SubGlobuleConfig, 'globuleConfig'> & {
	globuleConfigId: Id;
};

export const deserialzeSuperGlobuleConfig = ({
	id,
	name,
	subGlobuleConfigs
}: {
	id: number;
	name: string | null;
	subGlobuleConfigs: {
		id: number;
		name: string | null;
		globuleConfigId: number | null;
		superGlobuleConfigId: number | null;
		transforms: unknown;
	}[];
}): TransitionalSuperGlobuleConfig => {
	return {
		type: 'SuperGlobuleConfig',
		id,
		name: name || 'unknown',
		subGlobuleConfigs: subGlobuleConfigs.map((subGC) => deserializeSubGlobuleConfig(subGC))
	};
};

export const deserializeSubGlobuleConfig = ({
	id,
	name,
	transforms,
	globuleConfigId
}: {
	id: number;
	name: string | null;
	globuleConfigId: number | null;
	superGlobuleConfigId: number | null;
	transforms: unknown;
}): TransitionalSubGlobuleConfig => {
	return {
		type: 'SubGlobuleConfig',
		id,
		name: name || 'unknown',
		globuleConfigId: globuleConfigId || '',
		transforms: JSON.parse(transforms as string) as ChainableTransform[]
	};
};

////////////////////////////////////////////////

export const getSilhouetteConfigValues = (cfg: SilhouetteConfig, globuleConfigId?: number) => {
	const values = {
		...cfg,
		curves: JSON.stringify(cfg.curves),
		...(globuleConfigId ? { globuleConfigId } : {})
	};
	return values;
};

export const getDepthCurveConfigValues = (cfg: DepthCurveConfig, globuleConfigId?: number) => ({
	...cfg,
	curves: JSON.stringify(cfg.curves),
	...(globuleConfigId ? { globuleConfigId } : {})
});

export const getShapeConfigValues = (cfg: ShapeConfig, globuleConfigId?: number) => ({
	...cfg,
	sampleMethod: cfg.sampleMethod.method,
	sampleMethodDivisions: cfg.sampleMethod.divisions,
	curves: JSON.stringify(cfg.curves),
	...(globuleConfigId ? { globuleConfigId } : {})
});

export const getLevelConfigValues = (cfg: LevelConfig, globuleConfigId?: number) => {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { levelOffsets, ...rest } = cfg;
	return {
		...rest,
		silhouetteSampleMethod: rest.silhouetteSampleMethod.method,
		silhouetteSampleMethodDivisions: rest.silhouetteSampleMethod.divisions,
		globuleConfigId
	};
};

export const getLevelOffsetsValues = (cfg: LevelOffset[], levelConfigId: number) => {
	const values = {
		// TODO - remove hack so that this deals with array of offsets correctly
		...cfg[0],
		levelConfigId
	};
	values.id = undefined
	return values;
};

export const getRenderConfigValues = (cfg: RenderConfig, globuleConfigId?: number) => {
	const values = {
		...cfg.ranges,
		...cfg.show,
		...(globuleConfigId ? { globuleConfigId } : {})
	};
	return values;
};

export const getSpineCurveConfigValues = (cfg: SpineCurveConfig, globuleConfigId?: number) => ({
	...cfg,
	curves: JSON.stringify(cfg.curves),
	...(globuleConfigId ? { globuleConfigId } : {})
});

export const getBandConfigValues = (cfg: BandConfig, globuleConfigId?: number) => ({
	...cfg,
	tabStype: JSON.stringify(cfg.tabStyle),
	...(globuleConfigId ? { globuleConfigId } : {})
});

export const getStrutConfigValues = (cfg: StrutConfig, globuleConfigId?: number) => {
	const { type, ...rest } = cfg;
	return {
		...rest,
		...(globuleConfigId ? { globuleConfigId } : {})
	};
};

export const stripId = (globuleConfig: GlobuleConfig) => {
	for (const key in globuleConfig) {
		if (typeof globuleConfig[key] === 'object') {
			globuleConfig[key].id = undefined;
		}
	}
	return globuleConfig;
};
