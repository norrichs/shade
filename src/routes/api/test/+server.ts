import { globules } from '$lib/server/schema/globule';
import { tursoClient } from '$lib/server/turso';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const db = tursoClient();
	const requestJSON = await request.json();
	const res = await db.insert(globules).values({ name: requestJSON.name }).returning();
	return json(res);
};
