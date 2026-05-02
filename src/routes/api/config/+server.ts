import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tursoClient } from '$lib/server/turso';
import { shadesConfigs } from '$lib/server/schema/shadesConfig';
import { desc, eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
	const kind = url.searchParams.get('kind');
	const includeConfigJson =
		url.searchParams.get('include') === 'configJson' || kind === 'tile-pattern-spec';

	const db = tursoClient();
	const baseColumns = {
		id: shadesConfigs.id,
		name: shadesConfigs.name,
		kind: shadesConfigs.kind,
		createdAt: shadesConfigs.createdAt,
		updatedAt: shadesConfigs.updatedAt
	};
	const columns = includeConfigJson
		? { ...baseColumns, configJson: shadesConfigs.configJson }
		: baseColumns;

	const query = db.select(columns).from(shadesConfigs);
	const filtered = kind ? query.where(eq(shadesConfigs.kind, kind)) : query;
	const configs = await filtered.orderBy(desc(shadesConfigs.updatedAt));

	return json(configs);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { name, configJson, kind } = body;

	if (!name || !configJson) {
		return json({ error: 'name and configJson are required' }, { status: 400 });
	}

	const db = tursoClient();
	const result = await db.insert(shadesConfigs).values({
		name,
		kind: kind || 'project',
		configJson: typeof configJson === 'string' ? configJson : JSON.stringify(configJson)
	});

	return json(
		{ id: Number(result.lastInsertRowid), name, kind: kind || 'project' },
		{ status: 201 }
	);
};
