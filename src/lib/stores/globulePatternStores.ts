import { AUTO_PERSIST_KEY, bootstrapShouldUsePersisted, persistable } from '$lib/persistable';
import { generateDefaultGlobulePatternConfig } from '$lib/shades-config';
import type { GlobulePatternConfig, PixelScale, TiledPatternConfig } from '$lib/types';
import type { ProjectionRange } from '$lib/projection-geometry/filters';
import { derived } from 'svelte/store';
import { loadPersistedOrDefault } from './stores';

export const patternConfigStore = persistable<GlobulePatternConfig>(
	((): GlobulePatternConfig => {
		const config = loadPersistedOrDefault(
			bootstrapShouldUsePersisted(),
			generateDefaultGlobulePatternConfig
		);
		return config;
	})(),
	'GlobulePatternConfig',
	AUTO_PERSIST_KEY,
	bootstrapShouldUsePersisted()
);

export type PatternGenerationConfig = {
	tiledPatternConfig: TiledPatternConfig;
	pixelScale: PixelScale;
	showBands: boolean;
	range: ProjectionRange;
};

let lastGenerationConfigJson = '';

export const patternGenerationConfig = derived<
	typeof patternConfigStore,
	PatternGenerationConfig
>(patternConfigStore, ($patternConfigStore, set) => {
	const config: PatternGenerationConfig = {
		tiledPatternConfig: $patternConfigStore.tiledPatternConfig,
		pixelScale: $patternConfigStore.patternConfig.pixelScale,
		showBands: $patternConfigStore.patternViewConfig.showBands,
		range: $patternConfigStore.patternViewConfig.range
	};
	const json = JSON.stringify(config);
	if (json !== lastGenerationConfigJson) {
		lastGenerationConfigJson = json;
		set(config);
	}
});
