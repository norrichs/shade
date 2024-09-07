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
	LevelOffset
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
export const deserializeSpineCurveConfig = (
	res: object & { curves: unknown }
): SpineCurveConfig => {
	return {
		type: 'SpineCurveConfig',
		...res,
		curves: JSON.parse(res.curves as string)
	} as SpineCurveConfig;
};
export const deserializeBandConfig = (res: object): BandConfig => {
	return { type: 'BandConfig', ...res } as BandConfig;
};
export const deserializeStrutConfig = (res: object): StrutConfig => {
	return { type: 'StrutConfig', ...res } as StrutConfig;
};

////////////////////////////////////////////////

export const getSilhouetteConfigValues = (cfg: SilhouetteConfig, globuleConfigId?: number) => ({
	...cfg,
	curves: JSON.stringify(cfg.curves),
	...(globuleConfigId ? { globuleConfigId } : {})
});

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

export const getLevelConfigValues = (cfg: LevelConfig, globuleConfigId?: number) => ({
	...cfg,
	silhouetteSampleMethod: cfg.silhouetteSampleMethod.method,
	silhouetteSampleMethodDivisions: cfg.silhouetteSampleMethod.divisions,
	...(globuleConfigId ? { globuleConfigId } : {})
});

export const getLevelOffsetsValues = (cfg: LevelOffset[], levelConfigId: number) => ({
	// TODO - remove hack so that this deals with array of offsets correctly
	...cfg[0],
	levelConfigId
});

export const getRenderConfigValues = (cfg: RenderConfig, globuleConfigId?: number) => ({
	...cfg.ranges,
	...cfg.show,
	...(globuleConfigId ? { globuleConfigId } : {})
});

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
