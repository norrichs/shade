import { AUTO_PERSIST_KEY, bootstrapShouldUsePersisted, persistable } from '$lib/persistable';
import { generateDefaultSuperGlobuleConfig } from '$lib/shades-config';
import type {
	Id,
	BandCutPattern,
	ProjectionPanelPattern,
	SuperGlobule,
	SuperGlobuleConfig,
	TubeCutPattern,
	ProjectionCutPattern
} from '$lib/types';
import { derived, writable } from 'svelte/store';
import { loadPersistedOrDefault } from './stores';
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
import { overrideStore } from './overrideStore';
import { getMetaInfo } from '$lib/projection-geometry/meta-info';
import {
	generateSuperGlobuleAsync,
	isWorking as workerIsWorking,
	workerError
} from './workerStore';
import { browser } from '$app/environment';
import { toastStore } from './toastStore';

// Re-export the isWorking store for external use
export { workerIsWorking as isGenerating };

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

// Internal writable store for the SuperGlobule result
const superGlobuleInternal = writable<SuperGlobule | null>(null);

// Track whether we've done the initial generation
let isInitialized = false;

// Track last valid result for error recovery
let lastValidResult: SuperGlobule | null = null;

/**
 * Triggers async generation of the SuperGlobule
 * Debounces rapid changes to avoid unnecessary work
 */
let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

function triggerAsyncGeneration(config: SuperGlobuleConfig): void {
	// Clear any pending debounced generation
	if (debounceTimeout) {
		clearTimeout(debounceTimeout);
	}

	// Debounce rapid config changes (e.g., while dragging sliders)
	debounceTimeout = setTimeout(async () => {
		// Clear previous error when attempting new generation
		workerError.set(null);

		console.log('SUPER GLOBULE STORE - Starting async generation');

		try {
			const result = await generateSuperGlobuleAsync(config);
			lastValidResult = result; // Store successful result
			superGlobuleInternal.set(result);
			console.log('SUPER GLOBULE STORE - Async generation complete');
		} catch (error) {
			console.error('SUPER GLOBULE STORE - Async generation failed:', error);
			// Keep last valid result displayed
			if (lastValidResult) {
				console.log('SUPER GLOBULE STORE - Using last valid result');
				// Don't update superGlobuleInternal - keep showing last valid state
			} else {
				console.warn('SUPER GLOBULE STORE - No valid result available');
				// No previous valid result - error will be shown via toast
			}
		}
	}, 50); // 50ms debounce
}

// Subscribe to config changes and trigger async generation
if (browser) {
	superConfigStore.subscribe((config) => {
		if (!isInitialized) {
			// Do initial synchronous generation for fast first render
			console.log('SUPER GLOBULE STORE - Initial sync generation');
			try {
				const result = generateSuperGlobule(config);
				lastValidResult = result; // Store initial result
				superGlobuleInternal.set(result);
				isInitialized = true;
			} catch (error) {
				console.error('SUPER GLOBULE STORE - Initial generation failed:', error);
				// Error will be shown via toast subscription below
				isInitialized = true;
			}
		} else {
			// Subsequent changes use async generation
			triggerAsyncGeneration(config);
		}
	});

	// Subscribe to worker errors and show toast notifications
	workerError.subscribe((error) => {
		if (error) {
			toastStore.add({
				type: 'error',
				message: `Projection generation failed: ${error}. Adjust your geometry and the system will retry automatically.`,
				duration: 10000, // 10 seconds
				dismissible: true
			});
		}
	});
}

// Derived store that provides the SuperGlobule (with fallback for SSR)
export const superGlobuleStore = derived(
	[superGlobuleInternal, superConfigStore],
	([$superGlobuleInternal, $superConfigStore]) => {
		// If we have a result from the worker, use it
		if ($superGlobuleInternal) {
			return $superGlobuleInternal;
		}

		// Fallback: generate synchronously (for SSR or before first result)
		console.log('SUPER GLOBULE STORE - Sync fallback');
		return generateSuperGlobule($superConfigStore);
	}
);

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
			any: false,
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
			showProjectionGeometry.any &&
			showProjectionGeometry.bands &&
			$patternConfigStore.patternViewConfig.showBands
				? generateProjectionPattern(projection.tubes, $superConfigStore.id, $patternConfigStore)
				: undefined;
		// if (isSuperGlobuleProjectionPanelPattern(projectionPattern)) {
		// 	validateAllPanels(projectionPattern.projectionPanelPattern.tubes);
		// }

		const metaInfo = getMetaInfo(projectionPattern);

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
		!!pattern &&
		(pattern as SuperGlobuleProjectionPanelPattern).type === 'SuperGlobuleProjectionPanelPattern'
	);
}

export function isSuperGlobuleProjectionCutPattern(
	pattern: SuperGlobulePattern | undefined
): pattern is SuperGlobuleProjectionCutPattern {
	return (
		!!pattern &&
		(pattern as SuperGlobuleProjectionCutPattern).type === 'SuperGlobuleProjectionCutPattern'
	);
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
