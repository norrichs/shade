import { AUTO_PERSIST_KEY, bootstrapShouldUsePersisted, persistable } from '$lib/persistable';
import { generateDefaultGlobulePatternConfig } from '$lib/shades-config';
import type { GlobulePatternConfig } from '$lib/types';
import { loadPersistedOrDefault } from './stores';

export const patternConfigStore = persistable<GlobulePatternConfig>(
	((): GlobulePatternConfig => {
		const config = loadPersistedOrDefault(
			bootstrapShouldUsePersisted(),
			generateDefaultGlobulePatternConfig
		);
		return config;
	})(),
	'GlobulePatternConfig',
	AUTO_PERSIST_KEY,
	bootstrapShouldUsePersisted()
);


