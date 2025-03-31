import { AUTO_PERSIST_KEY, bootstrapShouldUsePersisted, persistable } from '$lib/persistable';
import { generateDefaultSuperGlobuleConfig } from '$lib/shades-config';
import type { SuperGlobuleConfig } from '$lib/types';
import { derived } from 'svelte/store';
import { loadPersistedOrDefault, viewControlStore } from '$lib/stores';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	generateSuperGlobuleBandGeometry,
	generateSuperGlobuleGeometry
} from '$lib/generate-globulegeometry';
import {
	generateProjectionPattern,
	generateSuperGlobulePattern
} from '$lib/cut-pattern/generate-pattern';
import { patternConfigStore } from './globulePatternStores';
import { selectedGlobule } from '.';

// SUPER CONFIGS
export const superConfigStore = persistable<SuperGlobuleConfig>(
	((): SuperGlobuleConfig => {
		const config = loadPersistedOrDefault(
			bootstrapShouldUsePersisted(),
			generateDefaultSuperGlobuleConfig
		);
		console.debug('SUPER GLOBULE CONFIG STORE', { config });
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

export const superGlobuleBandGeometryStore = derived(superGlobuleStore, ($superGlobuleStore) => {
	const superGlobuleGeometry = generateSuperGlobuleBandGeometry($superGlobuleStore);
	console.debug('SUPER GLOBULE BAND GEOMETRY STORE', { $superGlobuleStore, superGlobuleGeometry });
	return superGlobuleGeometry;
});

export const superGlobulePatternStore = derived(
	[superGlobuleStore, superConfigStore, patternConfigStore],
	([$superGlobuleStore, $superConfigStore, $patternConfigStore]) => {
		console.debug('*** patternConfigStore', $patternConfigStore);
		// const { showGlobuleGeometry, showProjectionGeometry } = $viewControlStore;
		const showGlobuleGeometry = {
			any: true
		};
		const showProjectionGeometry = {
			any: true,
			bands: true
		};
		const superGlobulePattern = showGlobuleGeometry.any
			? generateSuperGlobulePattern($superGlobuleStore, $superConfigStore, $patternConfigStore)
			: null;

		const { tubes } = $superGlobuleStore.projections[0];
		const projectionPattern =
			showProjectionGeometry.any && showProjectionGeometry.bands
				? generateProjectionPattern(tubes, $superConfigStore, $patternConfigStore)
				: null;

		console.debug('SUPER GLOBULE PATTERN STORE', {
			$superGlobuleStore,
			$patternConfigStore,
			superGlobulePattern,
			projectionPattern
		});
		return { superGlobulePattern, projectionPattern };
	}
);
