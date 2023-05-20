// local storage and save to file options

// write a few functions to handle storage and retrieval, with some typesafety
// write a store that does autosave using the storage functions
// write a button component that allows saving a named config

import type { RotatedShapeGeometryConfig } from './rotated-shape';
export const AUTO_PERSIST_KEY = 'config-auto-persist';

export const resetLocal = (key: string) => {
	if (confirm("really?")) {
		localStorage.setItem(key, "");
	}
}

export const setLocal = (key: string, config: RotatedShapeGeometryConfig) => {
	// store current as shades_config_current

	console.debug('setLocal', config);
	const str = JSON.stringify(config);

	localStorage.setItem(key, str);
};

export const persistConfig = (config: RotatedShapeGeometryConfig, onSave: () => void) => {
	setLocal(AUTO_PERSIST_KEY, config);
	onSave();
};

export const getPersistedConfig = (name: keyof RotatedShapeGeometryConfig) => {
	const persistedConfig = getLocal(AUTO_PERSIST_KEY);
	console.debug("persistedConfig", persistedConfig)
	return persistedConfig ? persistedConfig[name] : undefined;
};

export const getLocal = (key: string) => {
	const retrieved = localStorage.getItem(key);
	if (retrieved) {
		const parsed = JSON.parse(retrieved);
		console.debug(parsed);
		return parsed;
	}
	return null;
};

// export const resetToDefault = (retrieved: any) => {
//   retrieved = null;
// };
