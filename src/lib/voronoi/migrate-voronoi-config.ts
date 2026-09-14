import { defaultVoronoiConfig } from '$lib/shades-config';
import type { SuperGlobuleConfig } from '$lib/types';
import type { VoronoiConfig } from './types';
import { normalizeEdgeDivisions, normalizeEdgeDivisionsMultiplier } from './edge-divisions';

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
	const resolved = rest.voronoiConfig ?? fromArray ?? defaultConfigWithRandomSeed();

	// Migrate the legacy scalar `edgeDivisions: number` to `[min, max]` and enforce
	// the min <= max invariant for any persisted pair.
	let voronoiConfig: VoronoiConfig = {
		...resolved,
		edgeDivisions: normalizeEdgeDivisions(resolved.edgeDivisions),
		edgeDivisionsMultiplier: normalizeEdgeDivisionsMultiplier(resolved.edgeDivisionsMultiplier),
		insetMethod: resolved.insetMethod ?? 'centerOut',
		curvedInset: resolved.curvedInset ?? false
	};

	// Geodesic Voronoi requires center-free methods. Coerce stale/persisted configs.
	if (voronoiConfig.voronoiMethod === 'geodesic') {
		const sm = voronoiConfig.seedConfig.seedMethod;
		voronoiConfig = {
			...voronoiConfig,
			insetMethod: 'localProjection',
			seedConfig: {
				...voronoiConfig.seedConfig,
				seedMethod:
					sm.type === 'areaWeighted'
						? sm
						: { type: 'areaWeighted', pointCount: sm.pointCount, seed: sm.seed }
			}
		};
	}

	return { ...rest, voronoiConfig };
}
