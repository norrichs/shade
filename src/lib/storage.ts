// local storage and save to file options

// write a few functions to handle storage and retrieval, with some typesafety
// write a store that does autosave using the storage functions
// write a button component that allows saving a named config

import type { GlobuleConfig } from '#lib/types.js';

// Check if localStorage is available (not available in web workers)
const hasLocalStorage = typeof localStorage !== 'undefined';

export const setLocal = (key: string, config: GlobuleConfig) => {
	if (!hasLocalStorage) return;
	const str = JSON.stringify(config);

	localStorage.setItem(key, str);
};

export const getPersistedConfig = (key: string, name: keyof GlobuleConfig | 'GlobuleConfig') => {
	const persistedConfig = getLocal(key);
	return persistedConfig && persistedConfig[name] !== undefined && persistedConfig[name] !== null
		? persistedConfig[name]
		: undefined;
};

export const getLocal = (key: string) => {
	if (!hasLocalStorage) return null;
	const retrieved = localStorage.getItem(key);
	if (retrieved) {
		const parsed = JSON.parse(retrieved);
		return parsed;
	}
	return null;
};

// export const resetToDefault = (retrieved: any) => {
//   retrieved = null;
// };
