// local storage and save to file options

// write a few functions to handle storage and retrieval, with some typesafety
// write a store that does autosave using the storage functions
// write a button component that allows saving a named config

import type { RotatedShapeGeometryConfig } from './rotated-shape';
import { generateUUID } from 'three/src/math/MathUtils';
export const AUTO_PERSIST_KEY = 'config-auto-persist';

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

export const saveLocalConfig = (config: RotatedShapeGeometryConfig) => {
	if (!config.id) {
		config.id = `stored-config-${generateUUID()}`
	}
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

export const getPersistedConfig = (name: (keyof RotatedShapeGeometryConfig) | "RotatedShapeGeometryConfig") => {
	const persistedConfig = getLocal(AUTO_PERSIST_KEY);
	console.debug("persistedConfig", persistedConfig)
	return persistedConfig && persistedConfig[name] ? persistedConfig[name] : undefined;
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
