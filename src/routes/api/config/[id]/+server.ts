import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tursoClient } from '$lib/server/turso';
import { shadesConfigs } from '$lib/server/schema/shadesConfig';
import { eq, sql } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
	const db = tursoClient();
	const results = await db
		.select()
		.from(shadesConfigs)
		.where(eq(shadesConfigs.id, Number(params.id)));

	if (results.length === 0) {
		return json({ error: 'Config not found' }, { status: 404 });
	}

	return json(results[0]);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const { name, configJson } = body;

	if (!configJson) {
		return json({ error: 'configJson is required' }, { status: 400 });
	}

	const db = tursoClient();
	const updates: Record<string, unknown> = {
		configJson: typeof configJson === 'string' ? configJson : JSON.stringify(configJson),
		updatedAt: sql`datetime('now')`
	};
	if (name !== undefined) {
		updates.name = name;
	}

	await db
		.update(shadesConfigs)
		.set(updates)
		.where(eq(shadesConfigs.id, Number(params.id)));

	return json({ id: Number(params.id), name });
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = tursoClient();
	await db.delete(shadesConfigs).where(eq(shadesConfigs.id, Number(params.id)));
	return json({ success: true });
};
