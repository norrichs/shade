import { defaultVoronoiConfig } from '$lib/shades-config';
import type { SuperGlobuleConfig } from '$lib/types';
import type { VoronoiConfig } from './types';

type LegacySuperGlobuleConfig = SuperGlobuleConfig & {
	voronoiConfigs?: VoronoiConfig[];
};

function randomSeed(): number {
	return Math.floor(Math.random() * 2 ** 31);
}

function defaultConfigWithRandomSeed(): VoronoiConfig {
	return {
		...defaultVoronoiConfig,
		seedConfig: {
			...defaultVoronoiConfig.seedConfig,
			seedMethod: {
				...defaultVoronoiConfig.seedConfig.seedMethod,
				seed: randomSeed()
			}
		}
	};
}

/**
 * Normalizes a (possibly legacy / persisted) SuperGlobuleConfig so it always
 * carries exactly one `voronoiConfig`:
 *  - a legacy `voronoiConfigs` array collapses to its first entry (if any);
 *  - a missing/empty config is replaced by the default with a fresh random seed;
 *  - an existing single `voronoiConfig` is preserved as-is;
 *  - the legacy `voronoiConfigs` key is removed.
 */
export function normalizeVoronoiConfig(config: SuperGlobuleConfig): SuperGlobuleConfig {
	const legacy = config as LegacySuperGlobuleConfig;
	const { voronoiConfigs, ...rest } = legacy;

	const fromArray = voronoiConfigs && voronoiConfigs.length > 0 ? voronoiConfigs[0] : undefined;
	const voronoiConfig = rest.voronoiConfig ?? fromArray ?? defaultConfigWithRandomSeed();

	return { ...rest, voronoiConfig };
}
