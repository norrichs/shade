import { writable, type Writable } from 'svelte/store';
import { getPersistedConfig, setLocal, getLocal } from './storage';

export const USE_PERSISTED_KEY = 'global-use-persisted';
export const AUTO_PERSIST_KEY = 'config-auto-persist';

export const bootStrapUsePersisted = (): boolean => {
	const retrievedUsePersisted = getLocal(USE_PERSISTED_KEY);
	console.debug(
		'bootStrapUsePersisted',
		retrievedUsePersisted,
		retrievedUsePersisted ? retrievedUsePersisted[USE_PERSISTED_KEY] : undefined
	);
	return retrievedUsePersisted ? retrievedUsePersisted[USE_PERSISTED_KEY] : undefined;
};

export interface Persistable<T> extends Writable<T> {
	reset(): void;
}

export const persistable = <T>(
	defaultInit: T,
	name: string,
	key = AUTO_PERSIST_KEY,
	doPersistData: boolean
) => {
	// console.debug("init persistable", name, "doPersistData", doPersistData)
	const persistObj = doPersistData ? getPersistedConfig(key, name) : undefined;
	const init = persistObj || defaultInit;

	console.debug(
		'initialize persistable',
		name,
		'with:',
		init,
		'because doPersistData',
		doPersistData
	);
	const { subscribe, set, update } = writable<T>(init);

	return {
		subscribe,
		update: function (value: T) {
			update((value) => value);
			console.debug('update persistable', name, value);
			const persistObj = getLocal(key);
			persistObj[name] = value;
			setLocal(key, persistObj);
		},
		set: (value: T) => {
			const persistObj = getLocal(key) || {};
			persistObj[name] = value;
			setLocal(key, persistObj);
			console.debug('set persistable', name, value);
			set(value);
		},
		reset: () => {
			console.debug('setting default');
			set(defaultInit);
		}
	};
};
