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
import type { ShadesConfig } from '$lib/types';

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
	} = (await request.json()) as ShadesConfig;
	console.debug('/api/test request');
	console.dir(
		{
			silhouetteConfig,
			depthCurveConfig,
			shapeConfig,
			levelConfig,
			renderConfig,
			spineCurveConfig,
			bandConfig,
			strutConfig,
			name
		},
		{ depth: 5 }
	);

	const [{ id: globuleConfigId }] = await db
		.insert(globuleConfigs)
		.values({ name })
		.returning({ id: globuleConfigs.id });

	await db
		.insert(silhouetteConfigs)
		.values({ curves: JSON.stringify(silhouetteConfig.curves), globuleConfigId: globuleConfigId });

	const { depthCurveBaseline, curves: dcCurves } = depthCurveConfig;

	await db.insert(depthCurveConfigs).values({
		depthCurveBaseline,
		curves: JSON.stringify(dcCurves),
		globuleConfigId
	});

	const {
		symmetry,
		symmetryNumber,
		sampleMethod: { method: sampleMethod, divisions: sampleMethodDivisions },
		curves: scCurves
	} = shapeConfig;

	await db.insert(shapeConfigs).values({
		symmetry,
		symmetryNumber,
		sampleMethod,
		sampleMethodDivisions,
		curves: JSON.stringify(scCurves),
		globuleConfigId
	});

	const {
		silhouetteSampleMethod: {
			method: silhouetteSampleMethod,
			divisions: silhouetteSampleMethodDivisions
		},
		levelPrototypeSampleMethod,
		levelOffsets: levelOffsetsData
	} = levelConfig;

	const [{ id: levelConfigId }] = await db
		.insert(levelConfigs)
		.values({
			silhouetteSampleMethod,
			silhouetteSampleMethodDivisions,
			levelPrototypeSampleMethod,
			globuleConfigId
		})
		.returning({ id: levelConfigs.id });

	console.debug('POST levelOffsetsData', levelOffsetsData);
	const levelOffsetValues = {
		...levelOffsetsData[0],
		levelConfigId
	};
	console.debug('POST levelOffsetValues', levelOffsetValues);

	// TODO - remove hack so that this deals with array of offsets correctly
	await db.insert(levelOffsets).values(levelOffsetValues);

	await db.insert(renderConfigs).values({
		...renderConfig.ranges,
		...renderConfig.show,
		globuleConfigId
	});

	await db.insert(spineCurveConfigs).values({
		curves: JSON.stringify(spineCurveConfig.curves),
		globuleConfigId
	});
	const { bandStyle, offsetBy, tabStyle } = bandConfig;
	await db.insert(bandConfigs).values({
		bandStyle,
		offsetBy,
		tabStyle: JSON.stringify(tabStyle),
		globuleConfigId
	});

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { type, ...restStrutConfig } = strutConfig;
	await db.insert(strutConfigs).values({
		...restStrutConfig,
		globuleConfigId
	});
	// console.debug('db insert res', res);
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

	console.debug('FETCHED GLOBULE CONFIG');
	// console.dir(response, { depth: 4 });
	const result = response.map((globuleConfig) => {
		console.debug('globuleConfig');
		console.dir(globuleConfig.levelConfig, { depth: 4 });

		const {
			silhouetteConfig: [silhouetteConfig],
			depthCurveConfig: [depthCurveConfig],
			shapeConfig: [{ sampleMethod, sampleMethodDivisions, curves: shapeConfigCurves, ...sc }],
			levelConfig: [{ silhouetteSampleMethodDivisions, silhouetteSampleMethod, ...lc }],
			renderConfig: [
				{
					rangeStyle,
					bandStart,
					bandCount,
					facetStart,
					facetCount,
					levelStart,
					levelCount,
					strutStart,
					strutCount,
					tabs,
					levels,
					bands,
					edges,
					patterns,
					struts
				}
			],
			spineCurveConfig: [spineCurveConfig],
			bandConfig: [bandConfig],
			strutConfig: [strutConfig]
		} = globuleConfig;

		silhouetteConfig.curves = JSON.parse(silhouetteConfig.curves as string);
		depthCurveConfig.curves = JSON.parse(depthCurveConfig.curves as string);

		const shapeConfig = {
			...sc,
			sampleMethod: { method: sampleMethod, divisions: sampleMethodDivisions },
			curves: JSON.parse(shapeConfigCurves as string)
		};
		spineCurveConfig.curves = JSON.parse(spineCurveConfig.curves as string);

		bandConfig.tabStyle = JSON.parse(bandConfig.tabStyle as string);

		console.debug('LEVELCONFIG lc', lc);

		const levelConfig = {
			...lc,
			silhouetteSampleMethod: {
				method: silhouetteSampleMethod,
				divisions: silhouetteSampleMethodDivisions
			}
		};
		const renderConfig = {
			ranges: {
				rangeStyle,
				bandStart,
				bandCount,
				facetStart,
				facetCount,
				levelStart,
				levelCount,
				strutStart,
				strutCount
			},
			show: { tabs, levels, bands, edges, patterns, struts }
		};

		return {
			...globuleConfig,
			silhouetteConfig,
			depthCurveConfig,
			shapeConfig,
			levelConfig,
			renderConfig,
			spineCurveConfig,
			bandConfig,
			strutConfig
		};
	});
	return json(result);
};
