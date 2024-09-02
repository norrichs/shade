import { globules, bands, facets } from '$lib/server/schema/globule';
import { tursoClient } from '$lib/server/turso';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Band } from '$lib/types';
import type { SerializedBand, SerializedFacet } from '$lib/patterns/utils';

export const POST: RequestHandler = async ({ request }) => {
	const db = tursoClient();
	const intermediate = await request.json();
	const req = await JSON.parse(intermediate);

	console.dir(req, { depth: 4 });
	const globuleRecords = await db.insert(globules).values({ name: req.name }).returning();
	const bandRecords = await db
		.insert(bands)
		.values(
			req.data.bands.map((_band: Band, i: number) => ({
				name: `${req.name} ${i}`,
				globuleId: globuleRecords[0].id
			}))
		)
		.returning();

	const facetValues: (SerializedFacet & { bandId: number })[] = [];
	req.data.bands.forEach((band: SerializedBand, i: number) => {
		band.facets.forEach((facet: SerializedFacet) => {
			facetValues.push({ triangle: facet.triangle, bandId: bandRecords[i].id });
		});
	});
	const facetRecords = await db.insert(facets).values(facetValues);
	return json(globuleRecords);
};
