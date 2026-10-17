import { AUTO_PERSIST_KEY, bootstrapShouldUsePersisted, persistable } from '#lib/persistable.js';
import { generateDefaultGlobulePatternConfig } from '#lib/shades-config.js';
import type {
	GlobulePatternConfig,
	PatternSource,
	PatternTypeConfig,
	PixelScale,
	SplitConfig
} from '#lib/types.js';
import { migrateGlobulePatternConfig } from '#lib/validators.js';
import type { ProjectionRange } from '#lib/projection-geometry/filters.js';
import { derived } from 'svelte/store';
import { loadPersistedOrDefault } from './stores';

export const patternConfigStore = persistable<GlobulePatternConfig>(
	((): GlobulePatternConfig => {
		const config = loadPersistedOrDefault(
			bootstrapShouldUsePersisted(),
			generateDefaultGlobulePatternConfig
		);
		return migrateGlobulePatternConfig(config as GlobulePatternConfig);
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
	/**
	 * Per-tube split positions. Lives here, in the generation config, rather
	 * than being read at generation time, because this store is what decides
	 * whether to regenerate: it JSON-compares itself against the last value
	 * (`:47-51`) so view-only changes do not re-trigger the worker. A split that
	 * is not in this object produces no regeneration when it changes.
	 */
	splits?: SplitConfig;
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
			patternSource: $patternConfigStore.patternViewConfig.patternSource ?? 'projection',
			splits: $patternConfigStore.patternConfig.splits
		};
		const json = JSON.stringify(config);
		if (json !== lastGenerationConfigJson) {
			lastGenerationConfigJson = json;
			set(config);
		}
	}
);
