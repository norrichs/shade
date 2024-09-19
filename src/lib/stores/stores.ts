import { derived } from 'svelte/store';
import {
	persistable,
	bootstrapShouldUsePersisted,
	USE_PERSISTED_KEY,
	AUTO_PERSIST_KEY
} from '$lib/persistable';
import { getPersistedConfig } from '$lib/storage';
import {
	// defaultPatternConfig,
	// defaultPatternViewConfig,
	generateDefaultGlobuleConfig,
	getLevels
} from '../shades-config';
import type {
	Band,
	BandPattern,
	NullBandPattern,
	GlobuleConfig,
	SuperGlobuleConfig,
	GlobulePatternConfig
} from '$lib/types';
import { generateGlobuleData } from '$lib/generate-shape';
import {
	applyStrokeWidth,
	generateBandPatterns,
	generateTiledBandPattern,
	getModelHeight,
	getPatternLength,
	getRenderableOnGeometry
} from '../cut-pattern/cut-pattern';

export const shouldUsePersisted = persistable(false, USE_PERSISTED_KEY, USE_PERSISTED_KEY, true);

export const loadPersistedOrDefault = (
	shouldUsePersisted: boolean,
	getDefault: () => GlobuleConfig | SuperGlobuleConfig | GlobulePatternConfig
) => {
	const autoPersisted = getPersistedConfig(AUTO_PERSIST_KEY, 'GlobuleConfig');
	if (autoPersisted && shouldUsePersisted) {
		return autoPersisted;
	} else {
		return getDefault();
	}
};

// INDIVIDUAL CONFIGS
export const configStore0 = persistable<GlobuleConfig>(
	loadPersistedOrDefault(bootstrapShouldUsePersisted(), generateDefaultGlobuleConfig),
	'GlobuleConfig',
	AUTO_PERSIST_KEY,
	bootstrapShouldUsePersisted()
);
export const configStore = derived(configStore0, ($configStore0) => {
	console.debug('CONFIG - derived', { $configStore0 });
	// console.dir($configStore0, { depth: 4 });
	const derivedConfig: GlobuleConfig = {
		...$configStore0,
		isModified: true,
		levelConfig: {
			...$configStore0.levelConfig,
			levelCount: getLevels(
				$configStore0.levelConfig.silhouetteSampleMethod,
				$configStore0.silhouetteConfig.curves.length
			)
		}
	};
	console.debug('         ', { derivedConfig });
	return derivedConfig;
});

// export const globuleStore = derived(configStore, ($configStore) => {
// 	const data = generateGlobuleData($configStore);
// 	// console.debug('SHAPE DATA - derived', data);
// 	return { ...data, height: getModelHeight(data.bands) };
// });

// export const bandPattern = derived([configStore, globuleStore], ([$configStore, $globuleStore]) => {
// 	// console.debug('DERIVE bandPattern');
// 	const { bands } = $globuleStore;
// 	const displayedBandFacets = getRenderableOnGeometry($configStore.renderConfig, bands);
// 	let pattern: BandPattern;
// 	if ($configStore.patternConfig.showPattern.band === 'none') {
// 		pattern = { projectionType: 'none' } as NullBandPattern;
// 	} else if ($configStore.patternConfig.showPattern.band === 'patterned') {
// 		pattern = generateTiledBandPattern({
// 			bands: displayedBandFacets as Band[],
// 			tiledPatternConfig: $configStore.tiledPatternConfig,
// 			pixelScale: $configStore.patternConfig.pixelScale
// 		});

// 		pattern = applyStrokeWidth(pattern, $configStore.tiledPatternConfig.config);
// 	} else {
// 		pattern = generateBandPatterns(
// 			$configStore.patternConfig,
// 			$configStore.cutoutConfig,
// 			$configStore.bandConfig.bandStyle,
// 			$configStore.bandConfig.tabStyle,
// 			displayedBandFacets
// 		);
// 	}
// 	pattern.meta = { ...pattern.meta, ...getPatternLength(pattern) };
// 	return pattern;
// });
