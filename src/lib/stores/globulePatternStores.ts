import { AUTO_PERSIST_KEY, bootstrapShouldUsePersisted, persistable } from '$lib/persistable';
import { generateDefaultGlobulePatternConfig } from '$lib/shades-config';
import type {
	GlobulePatternConfig,
	PatternSource,
	PatternTypeConfig,
	PixelScale
} from '$lib/types';
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
	patternTypeConfig: PatternTypeConfig;
	pixelScale: PixelScale;
	showBands: boolean;
	range: ProjectionRange;
	patternSource: PatternSource;
};

let lastGenerationConfigJson = '';

export const patternGenerationConfig = derived<typeof patternConfigStore, PatternGenerationConfig>(
	patternConfigStore,
	($patternConfigStore, set) => {
		const config: PatternGenerationConfig = {
			patternTypeConfig: $patternConfigStore.patternTypeConfig,
			pixelScale: $patternConfigStore.patternConfig.pixelScale,
			showBands: $patternConfigStore.patternViewConfig.showBands,
			range: $patternConfigStore.patternViewConfig.range,
			patternSource: $patternConfigStore.patternViewConfig.patternSource ?? 'projection'
		};
		const json = JSON.stringify(config);
		if (json !== lastGenerationConfigJson) {
			lastGenerationConfigJson = json;
			set(config);
		}
	}
);
