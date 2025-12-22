import {
	globuleConfigs,
	silhouetteConfigs,
	depthCurveConfigs,
	shapeConfigs,
	levelConfigs,
	levelOffsets,
	renderConfigs,
	spineCurveConfigs,
	bandConfigs,
	strutConfigs
} from '$lib/server/schema/globuleConfig';
import type { tursoClient } from '$lib/server/turso';
import type { GlobuleConfig, Id } from '$lib/types';
import {
	getSilhouetteConfigValues,
	getDepthCurveConfigValues,
	getShapeConfigValues,
	getLevelConfigValues,
	getLevelOffsetsValues,
	getRenderConfigValues,
	getSpineCurveConfigValues,
	getBandConfigValues,
	getStrutConfigValues,
	stripId
} from './utils';

export type IdResponse = { id: number; tempId: Id };

export const insertNewGlobuleConfig = async (
	globuleConfigData: GlobuleConfig,
	db: ReturnType<typeof tursoClient>
): Promise<{ id: number; tempId: Id }> => {
	const {
		silhouetteConfig,
		depthCurveConfig,
		shapeConfig,
		levelConfig,
		renderConfig,
		spineCurveConfig,
		bandConfig,
		strutConfig,
		name,
		id: globuleConfigTempId
	} = stripId(globuleConfigData);

	const [{ id: globuleConfigId }] = await db
		.insert(globuleConfigs)
		.values({ name })
		.returning({ id: globuleConfigs.id });

	await db
		.insert(silhouetteConfigs)
		.values(getSilhouetteConfigValues(silhouetteConfig, globuleConfigId));

	await db
		.insert(depthCurveConfigs)
		.values(getDepthCurveConfigValues(depthCurveConfig, globuleConfigId));

	await db.insert(shapeConfigs).values(getShapeConfigValues(shapeConfig, globuleConfigId));

	const levelConfigValues = getLevelConfigValues(levelConfig, globuleConfigId);
	const { id: lcId, ...lcRest } = levelConfigValues;

	const levelConfigInsertResult = await db
		.insert(levelConfigs)
		.values(lcRest)
		.returning({ id: levelConfigs.id });

	const [{ id: levelConfigId }] = levelConfigInsertResult;

	await db
		.insert(levelOffsets)
		.values(getLevelOffsetsValues(levelConfig.levelOffsets, levelConfigId));

	await db.insert(renderConfigs).values(getRenderConfigValues(renderConfig, globuleConfigId));

	await db
		.insert(spineCurveConfigs)
		.values(getSpineCurveConfigValues(spineCurveConfig, globuleConfigId));

	await db.insert(bandConfigs).values(getBandConfigValues(bandConfig, globuleConfigId));

	await db.insert(strutConfigs).values(getStrutConfigValues(strutConfig, globuleConfigId));

	return { id: globuleConfigId, tempId: globuleConfigTempId };
};
