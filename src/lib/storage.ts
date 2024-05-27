// local storage and save to file options

// write a few functions to handle storage and retrieval, with some typesafety
// write a store that does autosave using the storage functions
// write a button component that allows saving a named config

import { generateUUID } from 'three/src/math/MathUtils';
import { AUTO_PERSIST_KEY } from '$lib/persistable';
import type { ShadesConfig } from '$lib/types';

export const resetLocal = (key: string) => {
	if (confirm('really?')) {
		localStorage.setItem(key, '');
	}
};

export const listLocalConfigs = () => {
	const storedConfigKeys = Object.keys(localStorage).filter((key) =>
		key.startsWith('stored-config-')
	);
	const storedConfigMeta = storedConfigKeys.map((key) => {
		const config = getLocal(key);
		return { id: key, name: config.name || '' };
	});
	return storedConfigMeta;
};

export const saveLocalConfig = (config: ShadesConfig, asNew = false) => {
	if (asNew || !config.id || !config.id.startsWith('stored-config')) {
		config.id = `stored-config-${generateUUID()}`;
	}
	setLocal(config.id, config);
};

export const setLocal = (key: string, config: ShadesConfig) => {
	const str = JSON.stringify(config);

	localStorage.setItem(key, str);
};

export const persistConfig = (config: ShadesConfig, onSave: () => void) => {
	setLocal(AUTO_PERSIST_KEY, config);
	onSave();
};

export const getPersistedConfig = (key: string, name: keyof ShadesConfig | 'ShadesConfig') => {
	const persistedConfig = getLocal(key);
	return persistedConfig && persistedConfig[name] !== undefined && persistedConfig[name] !== null
		? persistedConfig[name]
		: undefined;
};

export const getLocal = (key: string) => {
	const retrieved = localStorage.getItem(key);
	if (retrieved) {
		const parsed = JSON.parse(retrieved);
		return parsed;
	}
	return null;
};

export const deleteLocal = (key: string) => {
	localStorage.removeItem(key);
};

// export const resetToDefault = (retrieved: any) => {
//   retrieved = null;
// };
