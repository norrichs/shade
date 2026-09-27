import { describe, it, expect, afterEach } from '@jest/globals';
import { get } from 'svelte/store';
import { loadedConfigStore, loadedConfigName } from '../loadedConfigStore';

describe('loadedConfigName', () => {
	afterEach(() => loadedConfigStore.set(null));

	it('is the name of the loaded saved config', () => {
		loadedConfigStore.set({ id: 3, name: 'round 1 hexParquet', snapshot: '{}' });
		expect(get(loadedConfigName)).toBe('round 1 hexParquet');
	});

	it('is undefined when no config is loaded', () => {
		loadedConfigStore.set(null);
		expect(get(loadedConfigName)).toBeUndefined();
	});
});
