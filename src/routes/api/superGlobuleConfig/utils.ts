// export const deserializeSilhouetteConfig = (
// 	res: object & { curves: unknown }
// ): SilhouetteConfig => {
// 	return { type: 'SilhouetteConfig', ...res, curves: JSON.parse(res.curves as string) };
// };
// export const deserializeDepthCurveConfig = (
// 	res: object & { curves: unknown }
// ): DepthCurveConfig => {
// 	return {
// 		type: 'DepthCurveConfig',
// 		...res,
// 		curves: JSON.parse(res.curves as string)
// 	} as DepthCurveConfig;
// };
// export const deserializeShapeConfig = (
// 	res: object & { curves: unknown; sampleMethod: unknown; sampleMethodDivisions: unknown }
// ): ShapeConfig => {
// 	return {
// 		type: 'ShapeConfig',
// 		...res,
// 		sampleMethod: {
// 			method: res.sampleMethod,
// 			divisions: res.sampleMethodDivisions
// 		} as CurveSampleMethod,
// 		curves: JSON.parse(res.curves as string)
// 	} as unknown as ShapeConfig;
// };
// export const deserializeLevelConfig = (res: any): LevelConfig => {
// 	return {
// 		type: 'LevelConfig',
// 		...res,
// 		silhouetteSampleMethod: {
// 			method: res.silhouetteSampleMethod,
// 			divisions: res.silhouetteSampleMethodDivisions
// 		}
// 	};
// };
// export const deserializeRenderConfig = (res: any): RenderConfig => {
// 	return {
// 		type: 'RenderConfig',
// 		ranges: {
// 			rangeStyle: res.rangeStyle,
// 			bandStart: res.bandStart,
// 			bandCount: res.bandCount,
// 			facetStart: res.facetStart,
// 			facetCount: res.facetCount,
// 			levelStart: res.levelStart,
// 			levelCount: res.levelCount,
// 			strutStart: res.strutStart,
// 			strutCount: res.strutCount
// 		},
// 		show: {
// 			tabs: res.tabs,
// 			levels: res.levels,
// 			bands: res.bands,
// 			edges: res.edges,
// 			patterns: res.patterns,
// 			struts: res.struts
// 		}
// 	};
// };
// export const deserializeSpineCurveConfig = (
// 	res: object & { curves: unknown }
// ): SpineCurveConfig => {
// 	return {
// 		type: 'SpineCurveConfig',
// 		...res,
// 		curves: JSON.parse(res.curves as string)
// 	} as SpineCurveConfig;
// };
// export const deserializeBandConfig = (res: object): BandConfig => {
// 	return { type: 'BandConfig', ...res } as BandConfig;
// };
// export const deserializeStrutConfig = (res: object): StrutConfig => {
// 	return { type: 'StrutConfig', ...res } as StrutConfig;
// };

import type { SubGlobuleConfig } from '$lib/types';
import type { IdResponse } from '../globuleConfig/insertNewGlobule';

////////////////////////////////////////////////

export const getSubGlobuleConfigValues = (
	cfgs: SubGlobuleConfig[],
	superGlobuleConfigId: number,
	globuleConfigIds: IdResponse[]
) => {
	return cfgs.map((cfg) => {
		const globuleConfigIdObj = globuleConfigIds.find(
			(idResponse) => idResponse.tempId === cfg.globuleConfig.id
		);
		if (!globuleConfigIdObj) {
			throw new Error("globuleConfigId required")
		}
		return {
			name: cfg.name,
			superGlobuleConfigId,
			globuleConfigId: globuleConfigIdObj.id,
			tempId: cfg.id,
			transforms: JSON.stringify(cfg.transforms)
		};
	});
};
