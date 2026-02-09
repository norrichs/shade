import { AUTO_PERSIST_KEY, bootstrapShouldUsePersisted, persistable } from '$lib/persistable';
import { generateDefaultSuperGlobuleConfig } from '$lib/shades-config';
import type {
	Id,
	BandCutPattern,
	GlobulePatternConfig,
	ProjectionPanelPattern,
	SuperGlobule,
	SuperGlobuleConfig,
	TubeCutPattern,
	ProjectionCutPattern,
	SuperGlobuleMesh,
	BandGeometry,
	SuperGlobuleGeometry
} from '$lib/types';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';
import { derived, writable, get } from 'svelte/store';
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
import { patternConfigStore, patternGenerationConfig, type PatternGenerationConfig } from './globulePatternStores';
import { overrideStore } from './overrideStore';
import { getMetaInfo } from '$lib/projection-geometry/meta-info';
import { computationMode, pausePatternUpdates, isManualMode, hasPendingChanges } from './uiStores';
import {
	generateSuperGlobuleAsync,
	isWorking as workerIsWorking,
	workerError
} from './workerStore';
import { browser } from '$app/environment';
import { toastStore } from './toastStore';
import { Box3, Vector3 } from 'three';

// Re-export the isWorking store for external use
export { workerIsWorking as isGenerating };

/**
 * Manual trigger for regenerating geometry/patterns when in manual mode
 * Checks worker state and respects current computation mode
 */
export function triggerManualRegeneration(): void {
	const config = get(superConfigStore);
	const mode = get(computationMode);
	const manual = get(isManualMode);
	const working = get(workerIsWorking);

	if (!manual) {
		console.warn('triggerManualRegeneration called but not in manual mode');
		return;
	}

	// Don't trigger if worker is already busy
	if (working) {
		console.warn('triggerManualRegeneration: Worker already busy, skipping');
		toastStore.add({
			type: 'warning',
			message: 'Generation already in progress, please wait...',
			duration: 3000
		});
		return;
	}

	// Clear pending changes flag
	hasPendingChanges.set(false);

	// Reset pause flag (for 2d-only mode)
	pausePatternUpdates.set(false);

	// Trigger 3D regeneration (unless in 2d-only mode)
	if (mode !== '2d-only') {
		console.log('MANUAL TRIGGER: Regenerating 3D geometry');
		triggerAsyncGeneration(config);
	} else {
		// In 2d-only mode, unsetting pausePatternUpdates triggers pattern update
		console.log('MANUAL TRIGGER: Regenerating patterns only');
	}
}

/**
 * Extracts minimal mesh data from SuperGlobule for lightweight 3D rendering
 * Used in 2d-only mode to preserve 3D visualization while freeing memory
 */
export function extractMeshData(superGlobule: SuperGlobule): SuperGlobuleMesh {
	// Extract band geometry for 3D rendering
	const geometryResult: SuperGlobuleGeometry = generateSuperGlobuleBandGeometry(superGlobule);
	const bandGeometry: BandGeometry[] =
		geometryResult.variant === 'Band' ? geometryResult.subGlobules.flat() : [];

	// Extract projection addresses for selection mapping
	const projectionAddresses: GlobuleAddress_Facet[] = [];
	superGlobule.projections.forEach((proj, globuleIdx) => {
		proj.tubes.forEach((tube, tubeIdx) => {
			tube.bands.forEach((band, bandIdx) => {
				band.facets.forEach((facet, facetIdx) => {
					projectionAddresses.push({
						globule: globuleIdx,
						tube: tubeIdx,
						band: bandIdx,
						facet: facetIdx
					});
				});
			});
		});
	});

	// Compute bounds from all band geometry points
	const bounds = new Box3();
	bandGeometry.forEach((bg) => {
		bg.points.forEach((point) => {
			bounds.expandByPoint(point);
		});
	});

	return {
		type: 'SuperGlobuleMesh',
		superGlobuleConfigId: superGlobule.superGlobuleConfigId,
		bandGeometry,
		projectionAddresses,
		bounds
	};
}

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

// Frozen mesh store for 2d-only mode (lightweight 3D representation)
export const frozenMeshStore = writable<SuperGlobuleMesh | null>(null);

// Persisted pattern store for 2d-only mode (maintains patterns when 3D is cleared)
export const persistedPatternStore = writable<{
	superGlobulePattern: any;
	projectionPattern: any;
	globuleTubePattern: any;
} | null>(null);

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
	// Check if we're in 2d-only mode - if so, skip generation
	const currentMode = get(computationMode);

	if (currentMode === '2d-only') {
		console.log('SUPER GLOBULE STORE - Skipping generation in 2d-only mode');
		return;
	}

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
		// Check if we're in 2d-only mode - if so, switch back to continuous
		const currentMode = get(computationMode);
		const manual = get(isManualMode);

		if (currentMode === '2d-only' && isInitialized) {
			console.log(
				'MODE TRANSITION: Geometry config changed in 2d-only mode, switching to continuous'
			);
			computationMode.set('continuous');
			// The mode transition handler will trigger regeneration
			return;
		}

		// MANUAL MODE: Don't auto-generate, just mark pending
		if (manual && isInitialized) {
			console.log('MANUAL MODE: Config changed, marking pending (not auto-generating)');
			hasPendingChanges.set(true);
			return;
		}

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
			// Subsequent changes use async generation (only if NOT manual)
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

	// Handle computation mode transitions
	let previousMode: string | null = null;
	computationMode.subscribe(($mode) => {
		// Skip initial subscription call
		if (previousMode === null) {
			previousMode = $mode;
			return;
		}

		const manual = get(isManualMode);
		const enteringTwoDOnly = $mode === '2d-only' && previousMode !== '2d-only';
		const leavingTwoDOnly = $mode !== '2d-only' && previousMode === '2d-only';

		if (enteringTwoDOnly) {
			// Entering 2d-only mode: geometry stays frozen, pattern generation continues
			console.log('MODE TRANSITION: Entering 2d-only mode (3D frozen, pattern updates enabled)');
		}

		if (leavingTwoDOnly) {
			// Leaving 2d-only mode: trigger regeneration
			console.log('MODE TRANSITION: Leaving 2d-only mode, triggering regeneration');

			// MANUAL MODE: Don't auto-trigger, just mark pending
			if (manual) {
				console.log('MODE TRANSITION: Manual mode active, marking pending instead');
				hasPendingChanges.set(true);
			} else {
				// Trigger regeneration with current config
				const config = get(superConfigStore);
				triggerAsyncGeneration(config);
			}
		}

		previousMode = $mode;
	});

	// Handle manual mode transitions
	let previousManualMode: boolean | null = null;
	isManualMode.subscribe(($isManual) => {
		// Skip initial subscription
		if (previousManualMode === null) {
			previousManualMode = $isManual;
			return;
		}

		const turningOffManual = !$isManual && previousManualMode;

		if (turningOffManual) {
			// Turning off manual mode: auto-regenerate if there are pending changes
			const pending = get(hasPendingChanges);
			if (pending) {
				console.log('MANUAL MODE: Disabled with pending changes, auto-regenerating');
				const config = get(superConfigStore);
				const mode = get(computationMode);

				hasPendingChanges.set(false);

				if (mode !== '2d-only') {
					triggerAsyncGeneration(config);
				}

				// Pattern will update automatically via derived store
				pausePatternUpdates.set(false);
			}
		}

		previousManualMode = $isManual;
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

// Internal pattern store (non-debounced)
// Uses patternGenerationConfig instead of patternConfigStore to avoid
// re-triggering pattern generation on view-only changes (zoom, pan, display toggles)
const superGlobulePatternStoreInternal = derived(
	[
		superGlobuleStore,
		superConfigStore,
		patternGenerationConfig,
		overrideStore,
		computationMode,
		pausePatternUpdates,
		isManualMode,
		hasPendingChanges
	],
	([
		$superGlobuleStore,
		$superConfigStore,
		$genConfig,
		$overrideStore,
		$computationMode,
		$pausePatternUpdates,
		$isManualMode,
		$hasPendingChanges
	]): { superGlobulePattern: any; projectionPattern: any; globuleTubePattern: any } | 'paused' => {
		// Skip pattern generation if paused - return 'paused' marker
		if ($pausePatternUpdates) {
			console.log('PATTERN STORE: Updates paused');
			return 'paused' as const;
		}

		// MANUAL MODE: Pause patterns when pending changes exist
		if ($isManualMode && $hasPendingChanges) {
			console.log('PATTERN STORE: Manual mode with pending changes, returning cached');
			return 'paused' as const;
		}

		// Skip pattern generation in 3d-only mode
		if ($computationMode === '3d-only') {
			return { superGlobulePattern: null, projectionPattern: undefined, globuleTubePattern: null };
		}

		console.time('PATTERN_GENERATION');

		const showGlobuleGeometry = { any: false };
		const showProjectionGeometry = { any: true, bands: true };
		const showGlobuleTubeGeometry = { any: false, bands: false, facets: false, sections: false };

		// Build a GlobulePatternConfig-compatible object from the generation config
		// for generateSuperGlobulePattern which still expects the full config
		const patternConfigForGeneration: GlobulePatternConfig = {
			type: 'GlobulePatternConfig',
			id: '',
			cutoutConfig: {} as any,
			patternConfig: { pixelScale: $genConfig.pixelScale } as any,
			patternViewConfig: { showBands: $genConfig.showBands, range: $genConfig.range } as any,
			tiledPatternConfig: $genConfig.tiledPatternConfig
		};

		const superGlobulePattern = showGlobuleGeometry.any
			? generateSuperGlobulePattern($superGlobuleStore, $superConfigStore, patternConfigForGeneration)
			: null;

		const projection = $superGlobuleStore.projections[0];
		const globuleTubes = $superGlobuleStore.globuleTubes;
		const globuleTubePattern = showGlobuleTubeGeometry.any
			? generateProjectionPattern(globuleTubes, $superConfigStore.id, patternConfigForGeneration, $genConfig.range)
			: null;

		const projectionPattern =
			showProjectionGeometry.any &&
			showProjectionGeometry.bands &&
			$genConfig.showBands
				? generateProjectionPattern(projection.tubes, $superConfigStore.id, patternConfigForGeneration, $genConfig.range)
				: undefined;

		const metaInfo = getMetaInfo(projectionPattern);

		console.timeEnd('PATTERN_GENERATION');
		console.log('SUPER GLOBULE PATTERN STORE', {
			$superGlobuleStore,
			$genConfig,
			$overrideStore,
			superGlobulePattern,
			projectionPattern
		});
		return { superGlobulePattern, projectionPattern, globuleTubePattern };
	}
);

// Debounced pattern store (exposed publicly)
let patternDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
let lastPatternResult: any = {
	superGlobulePattern: null,
	projectionPattern: undefined,
	globuleTubePattern: null
};

export const superGlobulePatternStore = derived(
	[superGlobulePatternStoreInternal],
	([$internal], set) => {
		// Clear any pending debounced update
		if (patternDebounceTimeout) {
			clearTimeout(patternDebounceTimeout);
		}

		// If paused, return last result immediately
		if ($internal === 'paused') {
			console.log('PATTERN STORE: Returning cached result (paused)');
			return lastPatternResult;
		}

		// Debounce pattern updates (300ms)
		patternDebounceTimeout = setTimeout(() => {
			if ($internal && typeof $internal !== 'string') {
				lastPatternResult = $internal;
				set($internal);
			}
		}, 300);

		// Return last result while debouncing, or current result if available
		return lastPatternResult;
	},
	{ superGlobulePattern: null, projectionPattern: undefined, globuleTubePattern: null }
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
