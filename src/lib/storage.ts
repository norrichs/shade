// local storage and save to file options

// write a few functions to handle storage and retrieval, with some typesafety
// write a store that does autosave using the storage functions
// write a button component that allows saving a named config

import type { RotatedShapeGeometryConfig } from './rotated-shape';
import { generateUUID } from 'three/src/math/MathUtils';
import { AUTO_PERSIST_KEY } from './persistable';

export const resetLocal = (key: string) => {
	if (confirm("really?")) {
		localStorage.setItem(key, "");
	}
}

export const listLocalConfigs = () => {
	const storedConfigKeys= Object.keys(localStorage).filter((key) => key.startsWith("stored-config-"))
	const storedConfigMeta = storedConfigKeys.map((key) => {
		const config = getLocal(key)
		return {id: key, name: config.name || ""}
	})
	// console.debug(storedConfigMeta)
	return storedConfigMeta
}

export const saveLocalConfig = (config: RotatedShapeGeometryConfig, asNew = false) => {
	if (asNew || !config.id || !config.id.startsWith("stored-config")) {
		console.debug("Save local config, new ID")
		config.id = `stored-config-${generateUUID()}`
	}
	console.debug("Save local config", config.id, config)
	setLocal(config.id, config);
}

export const setLocal = (key: string, config: RotatedShapeGeometryConfig) => {
	const str = JSON.stringify(config);

	localStorage.setItem(key, str);
};

export const persistConfig = (config: RotatedShapeGeometryConfig, onSave: () => void) => {
	setLocal(AUTO_PERSIST_KEY, config);
	onSave();
};

export const getPersistedConfig = (key: string, name: (keyof RotatedShapeGeometryConfig) | "RotatedShapeGeometryConfig") => {
	const persistedConfig = getLocal(key);
	console.debug("key", key, "name", name, "getPersistedConfig", persistedConfig, "return", persistedConfig && persistedConfig[name] ? persistedConfig[name] : undefined)
	return persistedConfig && (persistedConfig[name] !== undefined) && (persistedConfig[name] !== null) ? persistedConfig[name] : undefined;
};

export const getLocal = (key: string) => {
	const retrieved = localStorage.getItem(key);
	if (retrieved) {
		const parsed = JSON.parse(retrieved);
		// console.debug(parsed);
		return parsed;
	}
	return null;
};

export const deleteLocal = (key: string) => {
	localStorage.removeItem(key)
}



// export const resetToDefault = (retrieved: any) => {
//   retrieved = null;
// };
