import type { GlobuleConfig, ShapeConfig, SuperGlobuleConfig } from '$lib/types';

type LegacyGlobuleConfig = Omit<GlobuleConfig, 'shapeConfigs'> & {
	shapeConfig?: ShapeConfig;
	shapeConfigs?: ShapeConfig[];
};

const migrateGlobule = (globule: GlobuleConfig): GlobuleConfig => {
	const legacy = globule as unknown as LegacyGlobuleConfig;
	if (!('shapeConfig' in legacy)) return globule;
	const { shapeConfig, ...rest } = legacy;
	const shapeConfigs =
		rest.shapeConfigs && rest.shapeConfigs.length > 0
			? rest.shapeConfigs
			: shapeConfig
				? [{ ...shapeConfig, isPrimary: true }]
				: [];
	return { ...rest, shapeConfigs } as GlobuleConfig;
};

/**
 * Converts legacy single-`shapeConfig` globules to the `shapeConfigs` list, for
 * every sub-globule and every projection surface that is a GlobuleConfig.
 * Idempotent; already-migrated configs are returned untouched.
 */
export function normalizeShapeConfigs(config: SuperGlobuleConfig): SuperGlobuleConfig {
	return {
		...config,
		subGlobuleConfigs: (config.subGlobuleConfigs ?? []).map((sub) => ({
			...sub,
			globuleConfig: migrateGlobule(sub.globuleConfig)
		})),
		projectionConfigs: (config.projectionConfigs ?? []).map((projection) => {
			const surface = projection.surfaceConfig;
			if (surface?.type !== 'GlobuleConfig') return projection;
			return {
				...projection,
				surfaceConfig: migrateGlobule(surface as GlobuleConfig) as typeof surface
			};
		})
	};
}

/** The primary GCS: the `isPrimary` entry, else the first. */
export function primaryShapeConfig(globule: GlobuleConfig): ShapeConfig {
	return globule.shapeConfigs.find((s) => s.isPrimary) ?? globule.shapeConfigs[0];
}
