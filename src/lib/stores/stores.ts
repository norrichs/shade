import { persistable, USE_PERSISTED_KEY, AUTO_PERSIST_KEY } from '#lib/persistable.js';
import { getPersistedConfig } from '#lib/storage.js';
import type { GlobuleConfig, SuperGlobuleConfig, GlobulePatternConfig } from '#lib/types.js';
import type { ViewControls } from './viewControlStore';

export const shouldUsePersisted = persistable(false, USE_PERSISTED_KEY, USE_PERSISTED_KEY, true);

export const loadPersistedOrDefault = (
	shouldUsePersisted: boolean,
	getDefault: () => GlobuleConfig | SuperGlobuleConfig | GlobulePatternConfig | ViewControls
) => {
	const autoPersisted = getPersistedConfig(AUTO_PERSIST_KEY, 'GlobuleConfig');
	if (autoPersisted && shouldUsePersisted) {
		return autoPersisted;
	} else {
		return getDefault();
	}
};
