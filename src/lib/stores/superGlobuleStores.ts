import { AUTO_PERSIST_KEY, bootstrapShouldUsePersisted, persistable } from '$lib/persistable';
import { generateDefaultSuperGlobuleConfig } from '$lib/shades-config';
import type { Id, Recurrence, SuperGlobuleConfig } from '$lib/types';
import { derived, writable } from 'svelte/store';
import { loadPersistedOrDefault } from './stores';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import { generateSuperGlobuleGeometry } from '$lib/generate-globulegeometry';

// SUPER CONFIGS
export const superConfigStore = persistable<SuperGlobuleConfig>(
	((): SuperGlobuleConfig => {
		const config = loadPersistedOrDefault(
			bootstrapShouldUsePersisted(),
			generateDefaultSuperGlobuleConfig
		);
		console.debug('superConfigStore init', config);
		return config;
	})(),
	'SuperGlobuleConfig',
	AUTO_PERSIST_KEY,
	bootstrapShouldUsePersisted()
);

export const superGlobuleStore = derived(superConfigStore, ($superConfigStore) => {
	console.debug('SUPER GLOBULE STORE');
	const superGlobule = generateSuperGlobule($superConfigStore);
	console.debug({ $superConfigStore, superGlobule });
	return superGlobule;
});

export const superGlobuleGeometryStore = derived(superGlobuleStore, ($superGlobuleStore) => {
	console.debug('SUPER GLOBULE GEOMETRY STORE');
	const superGlobuleGeometry = generateSuperGlobuleGeometry($superGlobuleStore);
	console.debug({ $superGlobuleStore, superGlobuleGeometry });
	return superGlobuleGeometry;
});

export const selectedGlobule = writable<{
	subGlobuleConfigIndex: number;
	subGlobuleConfigId?: Id;
	// subGlobuleRecurrence?: number;
	subGlobuleGeometryIndex?: number;
	globuleId?: Id;
}>({
	subGlobuleConfigIndex: 0,
	subGlobuleConfigId: undefined,
	// subGlobuleRecurrence: undefined,
	subGlobuleGeometryIndex: undefined,
	globuleId: undefined
});
