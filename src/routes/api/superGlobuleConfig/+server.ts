import { tursoClient } from '$lib/server/turso';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { GlobuleConfig, SuperGlobuleConfig } from '$lib/types';
import { superGlobuleConfigs, subGlobuleConfigs } from '$lib/server/schema/superGlobuleConfig';
import { getSubGlobuleConfigValues } from './utils';
import { insertNewGlobuleConfig, type IdResponse } from '../globuleConfig/insertNewGlobule';
import { deserializeSubGlobuleConfig, deserialzeSuperGlobuleConfig } from '../globuleConfig/utils';

export const POST: RequestHandler = async ({ request }) => {
	const db = tursoClient();
	const {
		id: superGlobuleConfigTempId,
		name,
		subGlobuleConfigs: subGlobuleConfigsData
	} = (await request.json()) as SuperGlobuleConfig;

	const [{ id: superGlobuleConfigId }] = await db
		.insert(superGlobuleConfigs)
		.values({ name })
		.returning({ id: superGlobuleConfigs.id });

	const uniqueGlobuleConfigs = Array.from(
		new Set<GlobuleConfig>(subGlobuleConfigsData.map((sgc) => sgc.globuleConfig))
	);
	const globuleConfigIds: IdResponse[] = [];

	for (const globuleConfig of uniqueGlobuleConfigs) {
		const globuleConfigIdResponse = await insertNewGlobuleConfig(globuleConfig, db);
		globuleConfigIds.push(globuleConfigIdResponse);
	}

	const subGlobuleConfigIds = await db
		.insert(subGlobuleConfigs)
		.values(
			getSubGlobuleConfigValues(subGlobuleConfigsData, superGlobuleConfigId, globuleConfigIds)
		)
		.returning({ id: subGlobuleConfigs.id });

	const subGlobuleConfigIdResponses: IdResponse[] = subGlobuleConfigIds.map((id, index) => ({
		...id,
		tempId: subGlobuleConfigsData[index].id
	}));

	return json({
		superGlobuleConfig: {
			id: superGlobuleConfigId,
			tempId: superGlobuleConfigTempId
		} as IdResponse,
		subGlobuleConfig: subGlobuleConfigIdResponses,
		globuleConfig: globuleConfigIds
	});
};

//////////////////////////////////

export const GET: RequestHandler = async () => {
	const db = tursoClient();
	const response = await db.query.superGlobuleConfigs.findMany({
		with: { subGlobuleConfigs: true }
	});

	const result = response.map((superGlobuleConfig) =>
		deserialzeSuperGlobuleConfig(superGlobuleConfig)
	);

	return json(result);
};
