import { globuleConfigs } from '$lib/server/schema/globuleConfig.js';
import { tursoClient } from '$lib/server/turso.js';

export async function DELETE() {
	const db = tursoClient();

	await db.delete(globuleConfigs).all();

	return new Response(null, { status: 204 });
}
