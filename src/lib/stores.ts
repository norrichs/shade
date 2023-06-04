import { derived, writable } from 'svelte/store';
import type { PatternConfig, PatternViewConfig } from './cut-pattern';
import {
	persistable,
	bootStrapUsePersisted,
	USE_PERSISTED_KEY,
	AUTO_PERSIST_KEY
} from './persistable';
import type { RotatedShapeGeometryConfig } from './rotated-shape';
import { getPersistedConfig } from './storage';
import {
	defaultPatternConfig,
	defaultPatternViewConfig,
	generateDefaultConfig,
	getLevels
} from './shades-config';

export const usePersisted = persistable(false, USE_PERSISTED_KEY, USE_PERSISTED_KEY, true);

/// Configs to be kept separate from geometry config
export const patternConfig = persistable<PatternConfig>(
	defaultPatternConfig,
	'PatternConfig',
	AUTO_PERSIST_KEY,
	bootStrapUsePersisted()
);
export const patternViewConfig = writable<PatternViewConfig>(defaultPatternViewConfig);

const loadAutoPersisted = (usePersisted: boolean) => {
	const autoPersisted = getPersistedConfig(AUTO_PERSIST_KEY, 'RotatedShapeGeometryConfig');
	if (autoPersisted && usePersisted) {
		return autoPersisted;
	} else {
		return generateDefaultConfig();
	}
};

export const config0 = persistable<RotatedShapeGeometryConfig>(
	loadAutoPersisted(bootStrapUsePersisted()),
	'RotatedShapeGeometryConfig',
	AUTO_PERSIST_KEY,
	bootStrapUsePersisted()
);

export const config = derived(config0, ($config0) => {
	const derivedConfig: RotatedShapeGeometryConfig = {
		...$config0,
		levelConfig: {
			...$config0.levelConfig,
			levels: getLevels(
				$config0.levelConfig.zCurveSampleMethod,
				$config0.zCurveConfig.curves.length
			)
		}
	};
	return derivedConfig;
});
