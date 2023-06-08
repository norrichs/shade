import { derived } from 'svelte/store';
import {
	persistable,
	bootStrapUsePersisted,
	USE_PERSISTED_KEY,
	AUTO_PERSIST_KEY
} from './persistable';
import type { ShadesConfig } from './generate-shape';
import { getPersistedConfig } from './storage';
import {
	// defaultPatternConfig,
	// defaultPatternViewConfig,
	generateDefaultConfig,
	getLevels
} from './shades-config';

export const usePersisted = persistable(false, USE_PERSISTED_KEY, USE_PERSISTED_KEY, true);

const loadAutoPersisted = (usePersisted: boolean) => {
	const autoPersisted = getPersistedConfig(AUTO_PERSIST_KEY, 'ShadesConfig');
	if (autoPersisted && usePersisted) {
		return autoPersisted;
	} else {
		return generateDefaultConfig();
	}
};

export const config0 = persistable<ShadesConfig>(
	loadAutoPersisted(bootStrapUsePersisted()),
	'ShadesConfig',
	AUTO_PERSIST_KEY,
	bootStrapUsePersisted()
);

export const config = derived(config0, ($config0) => {
	const derivedConfig: ShadesConfig = {
		...$config0,
		levelConfig: {
			...$config0.levelConfig,
			levels: getLevels(
				$config0.levelConfig.zCurveSampleMethod,
				$config0.zCurveConfig.curves.length
			)
		}
  };
  console.log("set derived config", derivedConfig)
	return derivedConfig;
});
