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
import { tursoClient } from '$lib/server/turso';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { GlobuleConfig } from '$lib/types';
import {
	deserializeSilhouetteConfig,
	deserializeDepthCurveConfig,
	deserializeShapeConfig,
	deserializeLevelConfig,
	deserializeRenderConfig,
	deserializeSpineCurveConfig,
	deserializeBandConfig,
	deserializeStrutConfig,
	getSilhouetteConfigValues,
	getDepthCurveConfigValues,
	getShapeConfigValues,
	getLevelConfigValues,
	getLevelOffsetsValues,
	getRenderConfigValues,
	getSpineCurveConfigValues,
	getBandConfigValues,
	getStrutConfigValues
} from './utils';

export const POST: RequestHandler = async ({ request }) => {
	const db = tursoClient();
	const {
		silhouetteConfig,
		depthCurveConfig,
		shapeConfig,
		levelConfig,
		renderConfig,
		spineCurveConfig,
		bandConfig,
		strutConfig,
		name
	} = (await request.json()) as GlobuleConfig;
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

	const [{ id: levelConfigId }] = await db
		.insert(levelConfigs)
		.values(getLevelConfigValues(levelConfig, globuleConfigId))
		.returning({ id: levelConfigs.id });

	await db
		.insert(levelOffsets)
		.values(getLevelOffsetsValues(levelConfig.levelOffsets, levelConfigId));

	await db.insert(renderConfigs).values(getRenderConfigValues(renderConfig, globuleConfigId));

	await db
		.insert(spineCurveConfigs)
		.values(getSpineCurveConfigValues(spineCurveConfig, globuleConfigId));
	
	await db.insert(bandConfigs).values(getBandConfigValues(bandConfig, globuleConfigId));

	await db.insert(strutConfigs).values(getStrutConfigValues(strutConfig, globuleConfigId));
	return json(globuleConfigId);
};

//////////////////////////////////

export const GET: RequestHandler = async () => {
	const db = tursoClient();
	const response = await db.query.globuleConfigs.findMany({
		with: {
			silhouetteConfig: true,
			depthCurveConfig: true,
			shapeConfig: true,
			levelConfig: {
				with: {
					levelOffsets: true
				}
			},
			renderConfig: true,
			bandConfig: true,
			strutConfig: true,
			spineCurveConfig: true
		}
	});

	const result = response.map((globuleConfig) => {
		const {
			silhouetteConfig: [silhouetteConfig],
			depthCurveConfig: [depthCurveConfig],
			shapeConfig: [shapeConfig],
			levelConfig: [levelConfig],
			renderConfig: [renderConfig],
			spineCurveConfig: [spineCurveConfig],
			bandConfig: [bandConfig],
			strutConfig: [strutConfig]
		} = globuleConfig;

		return {
			...globuleConfig,
			silhouetteConfig: deserializeSilhouetteConfig(silhouetteConfig),
			depthCurveConfig: deserializeDepthCurveConfig(depthCurveConfig),
			shapeConfig: deserializeShapeConfig(shapeConfig),
			levelConfig: deserializeLevelConfig(levelConfig),
			renderConfig: deserializeRenderConfig(renderConfig),
			spineCurveConfig: deserializeSpineCurveConfig(spineCurveConfig),
			bandConfig: deserializeBandConfig(bandConfig),
			strutConfig: deserializeStrutConfig(strutConfig)
		};
	});
	return json(result);
};
