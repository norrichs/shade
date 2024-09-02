import type { GlobuleConfig } from '$lib/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async (): Promise<{ globuleConfigs: GlobuleConfig[] }> => {
	const response: Response = await fetch('/api/globuleConfig', {
		method: 'GET',
		headers: { 'content-type': 'application/json' }
	});

	const globuleConfigs = (await response.json());
	return { globuleConfigs };
};
