import { AUTO_PERSIST_KEY, bootstrapShouldUsePersisted, persistable } from '$lib/persistable';
import { generateDefaultSuperGlobuleConfig } from '$lib/shades-config';
import type { Id, Recurrence, SuperGlobuleConfig } from '$lib/types';
import { derived, writable } from 'svelte/store';
import { loadPersistedOrDefault } from './stores';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import { generateSuperGlobuleGeometry } from '$lib/generate-globulegeometry';
import { generateSuperGlobulePattern } from '$lib/cut-pattern/generate-pattern';
import { patternConfigStore } from './globulePatternStores';

// SUPER CONFIGS
export const superConfigStore = persistable<SuperGlobuleConfig>(
	((): SuperGlobuleConfig => {
		const config = loadPersistedOrDefault(
			bootstrapShouldUsePersisted(),
			generateDefaultSuperGlobuleConfig
		);
		return config;
	})(),
	'SuperGlobuleConfig',
	AUTO_PERSIST_KEY,
	bootstrapShouldUsePersisted()
);

export const superGlobuleStore = derived(superConfigStore, ($superConfigStore) => {
	const superGlobule = generateSuperGlobule($superConfigStore);
	return superGlobule;
});

export const superGlobuleGeometryStore = derived(superGlobuleStore, ($superGlobuleStore) => {
	const superGlobuleGeometry = generateSuperGlobuleGeometry($superGlobuleStore);
	console.debug('SUPER GLOBULE GEOMETRY STORE', { $superGlobuleStore, superGlobuleGeometry });
	return superGlobuleGeometry;
});

export const superGlobulePatternStore = derived(
	[superGlobuleStore, superConfigStore, patternConfigStore],
	([$superGlobuleStore, $superConfigStore, $patternConfigStore]) => {
		const superGlobulePattern = generateSuperGlobulePattern(
			$superGlobuleStore,
			$superConfigStore,
			$patternConfigStore
		);
		console.debug('SUPER GLOBULE PATTERN STORE', {
			$superGlobuleStore,
			$patternConfigStore,
			superGlobulePattern
		});
		return superGlobulePattern;
	}
);

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

export const selectedSubGlobuleIndex = derived(
	[superConfigStore, selectedGlobule],
	([$superConfigStore, $selectedGlobule]) => {
		const index = $selectedGlobule.globuleId
			? $superConfigStore.subGlobuleConfigs.findIndex(
					(subGlobuleConfig) => subGlobuleConfig.globuleConfig.id === $selectedGlobule.globuleId
			  )
			: 0;

		return index;
	}
);

export const selectedGlobuleConfig = derived(
	[superConfigStore, selectedSubGlobuleIndex],
	([$superConfigStore, $selectedSubGlobuleIndex]) => {
		return $superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig;
	}
);
