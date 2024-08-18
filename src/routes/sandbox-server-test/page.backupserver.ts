import type { PageServerLoad } from './$types';
import { tursoClient } from '$lib/server/turso';
import { globules, bands, facets } from '$lib/server/schema/globule';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const db = tursoClient();

	// const [globuleData] = await db.select().from(globules).where(eq(globules.name, 'Drop'));
	// const bandData = await db.select().from(bands).where(eq(bands.globuleId, globuleData.id));
	// const facetData = await db.select().from(facets).where(eq(facets.bandId, bandData[0].id));

	// globuleData.bands = bandData;
	// globuleData.bands[0].facets = facetData;
	// const bands = await db.query.bands.findMany({})

	// return { globules: globuleData };
	const globules = await db.query.globules.findMany({
		with: {
			bands: {
				with: {
					facets: true
				}
			}
		}
	});
	return { globules };
};
