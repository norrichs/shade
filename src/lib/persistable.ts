import { writable, type Writable } from 'svelte/store';
import { getPersistedConfig, setLocal, getLocal } from './storage';

export const USE_PERSISTED_KEY = 'global-use-persisted';
export const AUTO_PERSIST_KEY = 'config-auto-persist';

export const bootStrapUsePersisted = (): boolean => {
	const retrievedUsePersisted = getLocal(USE_PERSISTED_KEY);
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
	const persistObj = doPersistData ? getPersistedConfig(key, name) : undefined;
	const init = persistObj || defaultInit;

	// console.log(
	// 	'initialize persistable',
	// 	name,
	// 	'\n  with:',
	// 	init,
	// 	'\n  doPersistData',
	// 	doPersistData
	// );
	const { subscribe, set, update } = writable<T>(init);

	return {
		subscribe,
		update: function (value: T) {
			console.debug('PERSISTABLE UPDATE', { value });
			update((value) => value);
			const persistObj = getLocal(key);
			persistObj[name] = value;
			setLocal(key, persistObj);
		},
		set: (value: T) => {
			console.debug('PERSISTABLE SET', { value });
			const persistObj = getLocal(key) || {};
			// value.isModified = true;
			persistObj[name] = value;
			setLocal(key, persistObj);
			console.log('***  set persistable', {
				name,
				value,
				currentLocal: getLocal(AUTO_PERSIST_KEY)
			});
			set(value);
		},
		reset: () => {
			// console.log('setting default', defaultInit);
			set(defaultInit);
		}
	};
};
