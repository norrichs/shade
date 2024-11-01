import { tursoClient } from '$lib/server/turso';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	deserializeSilhouetteConfig,
	deserializeDepthCurveConfig,
	deserializeShapeConfig,
	deserializeLevelConfig,
	deserializeRenderConfig,
	deserializeSpineCurveConfig,
	deserializeBandConfig,
	deserializeStrutConfig
} from './utils';
import { insertNewGlobuleConfig } from './insertNewGlobule';
import type { GlobuleConfig } from '$lib/types';

export const POST: RequestHandler = async ({ request }) => {
	const db = tursoClient();
	const globuleConfigData = (await request.json()) as GlobuleConfig;
	const idResponse = await insertNewGlobuleConfig(globuleConfigData, db);

	return json(idResponse);
};

//////////////////////////////////

export const GET: RequestHandler = async () => {
	const db = tursoClient();
	const response = await db.query.globuleConfigs.findMany({
		with: {
			silhouetteConfig: { columns: { globuleConfigId: false } },
			depthCurveConfig: { columns: { globuleConfigId: false } },
			shapeConfig: { columns: { globuleConfigId: false } },
			levelConfig: {
				columns: { globuleConfigId: false },
				with: {
					levelOffsets: true
				}
			},
			renderConfig: { columns: { globuleConfigId: false } },
			bandConfig: { columns: { globuleConfigId: false } },
			strutConfig: { columns: { globuleConfigId: false } },
			spineCurveConfig: { columns: { globuleConfigId: false } }
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
