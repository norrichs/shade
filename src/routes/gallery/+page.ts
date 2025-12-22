import type { GlobuleConfig, SuperGlobuleConfig } from '$lib/types';

import type { PageLoad } from './$types';

export const load: PageLoad = async ({
	fetch
}): Promise<{
	globuleConfigs: GlobuleConfig[];
	superGlobuleConfigs: SuperGlobuleConfig[];
}> => {
	const globuleResponse: Response = await fetch('/api/globuleConfig', {
		method: 'GET',
		headers: { 'content-type': 'application/json' }
	});
	const globuleConfigs = await globuleResponse.json();

	const superGlobuleResponse: Response = await fetch('/api/superGlobuleConfig', {
		method: 'GET',
		headers: { 'content-type': 'application/json' }
	});

	const superGlobuleConfigs = await superGlobuleResponse.json();

	return {
		globuleConfigs,
		superGlobuleConfigs
	};
};
