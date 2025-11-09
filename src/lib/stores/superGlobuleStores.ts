import { AUTO_PERSIST_KEY, bootstrapShouldUsePersisted, persistable } from '$lib/persistable';
import { generateDefaultSuperGlobuleConfig } from '$lib/shades-config';
import type {
	Id,
	BandCutPattern,
	ProjectionPanelPattern,
	SuperGlobule,
	SuperGlobuleConfig,
	TubeCutPattern
} from '$lib/types';
import { derived } from 'svelte/store';
import { loadPersistedOrDefault } from '$lib/stores';
import { generateSuperGlobule, generateSuperGlobuleTubes } from '$lib/generate-superglobule';
import {
	generateSuperGlobuleBandGeometry,
	generateSuperGlobuleGeometry
} from '$lib/generate-globulegeometry';
import {
	generateProjectionPattern,
	generateSuperGlobulePattern,
	validateAllPanels
} from '$lib/cut-pattern/generate-pattern';
import { patternConfigStore } from './globulePatternStores';
import { overrideStore } from './overrideStore';

// SUPER CONFIGS
export const superConfigStore = persistable<SuperGlobuleConfig>(
	((): SuperGlobuleConfig => {
		const config = loadPersistedOrDefault(
			bootstrapShouldUsePersisted(),
			generateDefaultSuperGlobuleConfig
		);
		console.log('SUPER GLOBULE CONFIG STORE', { config });
		return config;
	})(),
	'SuperGlobuleConfig',
	AUTO_PERSIST_KEY,
	bootstrapShouldUsePersisted()
);

export const superGlobuleStore = derived(superConfigStore, ($superConfigStore) => {
	const superGlobule: SuperGlobule = generateSuperGlobule($superConfigStore);
	return superGlobule;
});



export const superGlobuleGeometryStore = derived(superGlobuleStore, ($superGlobuleStore) => {
	const superGlobuleGeometry = generateSuperGlobuleGeometry($superGlobuleStore);
	console.log('SUPER GLOBULE GEOMETRY STORE', { $superGlobuleStore, superGlobuleGeometry });
	return superGlobuleGeometry;
});

export const superGlobuleBandGeometryStore = derived(superGlobuleStore, ($superGlobuleStore) => {
	const superGlobuleGeometry = generateSuperGlobuleBandGeometry($superGlobuleStore);
	console.log('SUPER GLOBULE BAND GEOMETRY STORE', { $superGlobuleStore, superGlobuleGeometry });
	return superGlobuleGeometry;
});

export const superGlobulePatternStore = derived(
	[superGlobuleStore, superConfigStore, patternConfigStore, overrideStore],
	([$superGlobuleStore, $superConfigStore, $patternConfigStore, $overrideStore]) => {

		// const { showGlobuleGeometry, showProjectionGeometry } = $viewControlStore;
		const showGlobuleGeometry = {
			any: false
		};
		const showProjectionGeometry = {
			any: true,
			bands: true
		};
		const showGlobuleTubeGeometry = {
			any: true,
			bands: false,
			facets: false,
			sections: false
		};
		const superGlobulePattern = showGlobuleGeometry.any
			? generateSuperGlobulePattern($superGlobuleStore, $superConfigStore, $patternConfigStore)
			: null;

		const projection = $superGlobuleStore.projections[0];
		const globuleTubes = $superGlobuleStore.globuleTubes;


		const globuleTubePattern = showGlobuleTubeGeometry.any
			? generateProjectionPattern(globuleTubes, $superConfigStore.id, $patternConfigStore)
			: null;

		const projectionPattern =
			showProjectionGeometry.any && showProjectionGeometry.bands && $patternConfigStore.patternViewConfig.showBands
				? generateProjectionPattern(projection.tubes, $superConfigStore.id, $patternConfigStore)
				: undefined;
		// if (isSuperGlobuleProjectionPanelPattern(projectionPattern)) {
		// 	validateAllPanels(projectionPattern.projectionPanelPattern.tubes);
		// }

		console.log('SUPER GLOBULE PATTERN STORE', {
			$superGlobuleStore,
			$patternConfigStore,
			$overrideStore,
			superGlobulePattern,
			projectionPattern
		});
		return { superGlobulePattern, projectionPattern, globuleTubePattern };
	}
);

export type SuperGlobulePattern = SuperGlobuleBandPattern | SuperGlobuleProjectionPattern;

export function isSuperGlobuleBandPattern(
	pattern: SuperGlobulePattern
): pattern is SuperGlobuleBandPattern {
	return (pattern as SuperGlobuleBandPattern).type === 'SuperGlobulePattern';
}

export function isSuperGlobuleProjectionPanelPattern(
	pattern: SuperGlobulePattern | undefined
): pattern is SuperGlobuleProjectionPanelPattern {
	return (
		!!pattern && (pattern as SuperGlobuleProjectionPanelPattern).type === 'SuperGlobuleProjectionPanelPattern'
	);
}

export function isSuperGlobuleProjectionCutPattern(
	pattern: SuperGlobulePattern | undefined
): pattern is SuperGlobuleProjectionCutPattern {
	return !!pattern && (pattern as SuperGlobuleProjectionCutPattern).type === 'SuperGlobuleProjectionCutPattern';
}

export type SuperGlobuleBandPattern = {
	type: 'SuperGlobulePattern';
	superGlobuleConfigId: Id;
	bandPatterns: BandCutPattern[];
};

export type SuperGlobuleProjectionPattern =
	| SuperGlobuleProjectionPanelPattern
	| SuperGlobuleProjectionCutPattern;

export type SuperGlobuleProjectionPanelPattern = {
	type: 'SuperGlobuleProjectionPanelPattern';
	superGlobuleConfigId: Id;
	projectionPanelPattern: ProjectionPanelPattern;
};

export type SuperGlobuleProjectionCutPattern = {
	type: 'SuperGlobuleProjectionCutPattern';
	superGlobuleConfigId: Id;
	projectionCutPattern: ProjectionCutPattern;
};
