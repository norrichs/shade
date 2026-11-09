import { get } from 'svelte/store';
import { superConfigStore, patternConfigStore, viewControlStore } from '#lib/stores/index.js';
import { triggerManualRegeneration } from '#lib/stores/superGlobuleStores.js';
import { isManualMode } from '#lib/stores/uiStores.js';
import { tilePatternSpecStore } from '#lib/stores/tilePatternSpecStore.js';
import {
	buildSavedConfig,
	parseSavedConfig,
	collectReferencedTilePatternSpecs
} from '#lib/saved-config.js';
import type { SuperGlobuleConfig, GlobulePatternConfig } from '#lib/types.js';
import type { ViewControls } from '#lib/stores/viewControlStore.js';
import type { TiledPatternSpec } from '#lib/patterns/spec-types.js';

/** Serialize the given config state exactly as it is persisted (SavedConfig v3). */
export const serializeSavedConfig = (
	superConfig: SuperGlobuleConfig,
	patternConfig: GlobulePatternConfig,
	viewControls: ViewControls,
	variants: TiledPatternSpec[]
): string =>
	JSON.stringify(
		buildSavedConfig(
			superConfig,
			patternConfig,
			viewControls,
			collectReferencedTilePatternSpecs(patternConfig, variants)
		)
	);

/** Snapshot the live stores as a SavedConfig JSON string. */
export const captureCurrentConfigJson = (): string =>
	serializeSavedConfig(
		get(superConfigStore),
		get(patternConfigStore),
		get(viewControlStore),
		get(tilePatternSpecStore).variants
	);

/**
 * Replace the working config with a stored SavedConfig JSON string (any
 * version `parseSavedConfig` reads). Throws on unparseable input.
 */
export const applySavedConfigJson = (configJson: string): void => {
	const type = JSON.parse(configJson)?.type;
	if (type !== 'SavedConfig' && type !== 'SuperGlobuleConfig') {
		throw new Error('Not a Shades config.');
	}
	const { superGlobuleConfig, globulePatternConfig, viewControls, tilePatternSpecs } =
		parseSavedConfig(configJson);
	// Register embedded custom specs before applying the pattern config so
	// generation can resolve them (no-ops for ids already in the registry).
	tilePatternSpecStore.ensureRegistered(tilePatternSpecs);
	superConfigStore.set(superGlobuleConfig);
	if (globulePatternConfig) patternConfigStore.set(globulePatternConfig);
	if (viewControls) viewControlStore.set(viewControls);
	if (get(isManualMode)) triggerManualRegeneration();
};
