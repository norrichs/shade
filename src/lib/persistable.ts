import { writable, type Writable } from 'svelte/store';
import { getPersistedConfig, setLocal, getLocal } from './storage';

export const USE_PERSISTED_KEY = 'global-use-persisted';
export const AUTO_PERSIST_KEY = 'config-auto-persist';
const OVERRIDE_PERSISTENCE = true;

export const bootstrapShouldUsePersisted = (): boolean => {
	if (OVERRIDE_PERSISTENCE) {
		return false;
	}
	const retrievedUsePersisted = getLocal(USE_PERSISTED_KEY);
	return retrievedUsePersisted ? retrievedUsePersisted[USE_PERSISTED_KEY] : false;
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
	const { subscribe, set, update } = writable<T>(init);

	return {
		subscribe,
		update: function (value: T) {
			update((value) => value);
			const persistObj = getLocal(key);
			persistObj[name] = value;
			setLocal(key, persistObj);
		},
		set: (value: T) => {
			const persistObj = getLocal(key) || {};
			// value.isModified = true;
			persistObj[name] = value;
			setLocal(key, persistObj);
			console.log('SET PERSISTABLE', {
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
