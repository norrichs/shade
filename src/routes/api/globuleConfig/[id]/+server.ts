import { globuleConfigs } from '$lib/server/schema/globuleConfig.js';
import { tursoClient } from '$lib/server/turso.js';
import { eq } from 'drizzle-orm';

export async function DELETE({ params, cookies }) {
	const userid = cookies.get('userid');

  const db = tursoClient();

  await db.delete(globuleConfigs).where(eq(globuleConfigs.id, Number.parseInt(params.id)))
    
  

	return new Response(null, { status: 204 });
}