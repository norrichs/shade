import { AUTO_PERSIST_KEY, bootstrapShouldUsePersisted, persistable } from '$lib/persistable';
import { generateDefaultSuperGlobuleConfig } from '$lib/shades-config';
import type {
	BandPattern,
	Id,
	PatternedBand,
	ProjectionPanelPattern,
	SuperGlobule,
	SuperGlobuleConfig
} from '$lib/types';
import { derived } from 'svelte/store';
import { loadPersistedOrDefault, viewControlStore } from '$lib/stores';
import { generateSuperGlobule } from '$lib/generate-superglobule';
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
import { selectedGlobule } from '.';
import { overrideStore } from './overrideStore';

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
	const superGlobule: SuperGlobule = generateSuperGlobule($superConfigStore);
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
	[superGlobuleStore, superConfigStore, patternConfigStore, overrideStore],
	([$superGlobuleStore, $superConfigStore, $patternConfigStore, $overrideStore]) => {
		console.debug('*** patternConfigStore', $patternConfigStore);
		// const { showGlobuleGeometry, showProjectionGeometry } = $viewControlStore;
		const showGlobuleGeometry = {
			any: false
		};
		const showProjectionGeometry = {
			any: true,
			bands: true
		};
		console.debug('GENERATE OLD STYLE? ', showGlobuleGeometry.any);
		const superGlobulePattern = showGlobuleGeometry.any
			? generateSuperGlobulePattern($superGlobuleStore, $superConfigStore, $patternConfigStore)
			: null;

		const projection = $superGlobuleStore.projections[0];
		// const range = {
		// 	tubes: { start: 0, end: 6 },
		// 	bands: { start: 0, end: 6 },
		// 	panels: { start: 0, end: 8 }
		// };

		let projectionPattern;
		if ($overrideStore.shouldUseOverride && $overrideStore.projection.tubes) {
			console.debug('OVERRIDE STORE', $overrideStore);
			projectionPattern = generateProjectionPattern(
				$overrideStore.projection.tubes,
				$superConfigStore.id,
				$patternConfigStore
			);
		} else {
			projectionPattern =
				showProjectionGeometry.any && showProjectionGeometry.bands
					? generateProjectionPattern(projection.tubes, $superConfigStore.id, $patternConfigStore)
					: undefined;
		}
		if (isSuperGlobuleProjectionPanelPattern(projectionPattern)) {
			validateAllPanels(projectionPattern.projectionPanelPattern.tubes);
		}

		console.debug('SUPER GLOBULE PATTERN STORE', {
			$superGlobuleStore,
			$patternConfigStore,
			$overrideStore,
			superGlobulePattern,
			projectionPattern
		});
		return { superGlobulePattern, projectionPattern };
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
		(pattern as SuperGlobuleProjectionPanelPattern).type === 'SuperGlobuleProjectionPanelPattern'
	);
}

export function isSuperGlobuleProjectionBandPattern(
	pattern: SuperGlobulePattern | undefined
): pattern is SuperGlobuleProjectionBandPattern {
	return (
		(pattern as SuperGlobuleProjectionBandPattern).type === 'SuperGlobuleProjectionBandPattern'
	);
}

export type SuperGlobuleBandPattern = {
	type: 'SuperGlobulePattern';
	superGlobuleConfigId: Id;
	bandPatterns: PatternedBand[];
};

export type SuperGlobuleProjectionPattern =
	| SuperGlobuleProjectionPanelPattern
	| SuperGlobuleProjectionBandPattern;

export type SuperGlobuleProjectionPanelPattern = {
	type: 'SuperGlobuleProjectionPanelPattern';
	superGlobuleConfigId: Id;
	projectionPanelPattern: ProjectionPanelPattern;
};

export type SuperGlobuleProjectionBandPattern = {
	type: 'SuperGlobuleProjectionBandPattern';
	superGlobuleConfigId: Id;
	bandPatterns: PatternedBand[];
};
