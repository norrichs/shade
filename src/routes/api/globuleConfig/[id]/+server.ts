import {
	globuleConfigs,
	silhouetteConfigs,
	depthCurveConfigs,
	shapeConfigs,
	levelConfigs,
	renderConfigs,
	spineCurveConfigs,
	bandConfigs,
	strutConfigs
} from '$lib/server/schema/globuleConfig.js';
import { tursoClient } from '$lib/server/turso.js';
import { eq } from 'drizzle-orm';
import type {
	BandConfig,
	DepthCurveConfig,
	GeometryConfig,
	GlobuleConfig,
	LevelConfig,
	RenderConfig,
	ShapeConfig,
	SilhouetteConfig,
	SpineCurveConfig,
	StrutConfig
} from '$lib/types';
import {
	getBandConfigValues,
	getDepthCurveConfigValues,
	getLevelConfigValues,
	getRenderConfigValues,
	getShapeConfigValues,
	getSilhouetteConfigValues,
	getSpineCurveConfigValues,
	getStrutConfigValues
} from '../utils';

export async function DELETE({ params, cookies }) {
	const userId = cookies.get('userid');

	const db = tursoClient();

	await db.delete(globuleConfigs).where(eq(globuleConfigs.id, Number.parseInt(params.id)));

	return new Response(null, { status: 204 });
}

export async function PUT({ params, request, cookies }) {
	const userId = cookies.get('userid');
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

	type ConfigTable<G extends GeometryConfig> = {
		config: G;
		getter: (cfg: G, globuleConfigId?: number) => any;
		table: any;
	};

	const configTables: [
		ConfigTable<SilhouetteConfig>,
		ConfigTable<DepthCurveConfig>,
		ConfigTable<ShapeConfig>,
		ConfigTable<LevelConfig>,
		ConfigTable<RenderConfig>,
		ConfigTable<SpineCurveConfig>,
		ConfigTable<BandConfig>,
		ConfigTable<StrutConfig>
	] = [
		{ config: silhouetteConfig, table: silhouetteConfigs, getter: getSilhouetteConfigValues },
		{ config: depthCurveConfig, table: depthCurveConfigs, getter: getDepthCurveConfigValues },
		{ config: shapeConfig, table: shapeConfigs, getter: getShapeConfigValues },
		{ config: levelConfig, table: levelConfigs, getter: getLevelConfigValues },
		{ config: renderConfig, table: renderConfigs, getter: getRenderConfigValues },
		{ config: spineCurveConfig, table: spineCurveConfigs, getter: getSpineCurveConfigValues },
		{ config: bandConfig, table: bandConfigs, getter: getBandConfigValues },
		{ config: strutConfig, table: strutConfigs, getter: getStrutConfigValues }
	];

	for (const ct of configTables) {
		try {
			console.debug(ct.config.type, ct.config, ct.getter(ct.config, Number.parseInt(params.id)));
			const result = await db
				.update(ct.table)
				.set(ct.getter(ct.config, Number.parseInt(params.id)))
				.where(eq(ct.table.id, ct.config.id));
			console.debug('result', result);
		} catch (err) {
			console.error(err);
		}
	}
	// if (levelConfig.id) {
	// 	db.update(levelOffsets)
	// 		.set(getSilhouetteConfigValues(silhouetteConfig, Number.parseInt(params.id)))
	// 		.where(eq(silhouetteConfigs.id, silhouetteConfig.id));
	// }
	console.debug('*****************');
	return new Response(null, { status: 204 });
}
