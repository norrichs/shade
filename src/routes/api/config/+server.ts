import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tursoClient } from '$lib/server/turso';
import { shadesConfigs } from '$lib/server/schema/shadesConfig';
import { desc } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
	const db = tursoClient();
	const configs = await db
		.select({
			id: shadesConfigs.id,
			name: shadesConfigs.name,
			createdAt: shadesConfigs.createdAt,
			updatedAt: shadesConfigs.updatedAt
		})
		.from(shadesConfigs)
		.orderBy(desc(shadesConfigs.updatedAt));

	return json(configs);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { name, configJson } = body;

	if (!name || !configJson) {
		return json({ error: 'name and configJson are required' }, { status: 400 });
	}

	const db = tursoClient();
	const result = await db.insert(shadesConfigs).values({
		name,
		configJson: typeof configJson === 'string' ? configJson : JSON.stringify(configJson)
	});

	return json({ id: Number(result.lastInsertRowid), name }, { status: 201 });
};
