import { derived } from 'svelte/store';
import {
	persistable,
	bootstrapShouldUsePersisted,
	USE_PERSISTED_KEY,
	AUTO_PERSIST_KEY
} from '$lib/persistable';
import { getPersistedConfig } from '$lib/storage';
import { generateDefaultGlobuleConfig, getLevels } from '../shades-config';
import type { GlobuleConfig, SuperGlobuleConfig, GlobulePatternConfig } from '$lib/types';

export const shouldUsePersisted = persistable(false, USE_PERSISTED_KEY, USE_PERSISTED_KEY, true);

export const loadPersistedOrDefault = (
	shouldUsePersisted: boolean,
	getDefault: () => GlobuleConfig | SuperGlobuleConfig | GlobulePatternConfig
) => {
	const autoPersisted = getPersistedConfig(AUTO_PERSIST_KEY, 'GlobuleConfig');
	if (autoPersisted && shouldUsePersisted) {
		return autoPersisted;
	} else {
		return getDefault();
	}
};

// INDIVIDUAL CONFIGS
export const configStore0 = persistable<GlobuleConfig>(
	loadPersistedOrDefault(bootstrapShouldUsePersisted(), generateDefaultGlobuleConfig),
	'GlobuleConfig',
	AUTO_PERSIST_KEY,
	bootstrapShouldUsePersisted()
);
export const configStore = derived(configStore0, ($configStore0) => {
	// console.dir($configStore0, { depth: 4 });
	const derivedConfig: GlobuleConfig = {
		...$configStore0,
		isModified: true,
		levelConfig: {
			...$configStore0.levelConfig,
			levelCount: getLevels(
				$configStore0.levelConfig.silhouetteSampleMethod,
				$configStore0.silhouetteConfig.curves.length
			)
		}
	};
	return derivedConfig;
});
