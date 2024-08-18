import { derived } from 'svelte/store';
import {
	persistable,
	bootStrapUsePersisted,
	USE_PERSISTED_KEY,
	AUTO_PERSIST_KEY
} from '$lib/persistable';
import { getPersistedConfig } from '$lib/storage';
import {
	// defaultPatternConfig,
	// defaultPatternViewConfig,
	generateDefaultConfig,
	getLevels
} from './shades-config';
import type { Band, BandPattern, NullBandPattern, ShadesConfig } from '$lib/types';
import { generateRotatedShapeGeometry } from '$lib/generate-shape';
import {
	applyStrokeWidth,
	generateBandPatterns,
	generateTiledBandPattern,
	getModelHeight,
	getPatternLength,
	getRenderableOnGeometry
} from './cut-pattern/cut-pattern';

export const usePersisted = persistable(false, USE_PERSISTED_KEY, USE_PERSISTED_KEY, true);

const loadAutoPersisted = (usePersisted: boolean) => {
	const autoPersisted = getPersistedConfig(AUTO_PERSIST_KEY, 'ShadesConfig');
	if (autoPersisted && usePersisted) {
		return autoPersisted;
	} else {
		return generateDefaultConfig();
	}
};

export const config0 = persistable<ShadesConfig>(
	loadAutoPersisted(bootStrapUsePersisted()),
	'ShadesConfig',
	AUTO_PERSIST_KEY,
	bootStrapUsePersisted()
);

export const config = derived(config0, ($config0) => {
	console.debug('CONFIG0');
	console.dir($config0, { depth: 4 });
	const derivedConfig: ShadesConfig = {
		...$config0,
		levelConfig: {
			...$config0.levelConfig,
			levels: getLevels(
				$config0.levelConfig.silhouetteSampleMethod,
				$config0.silhouetteConfig.curves.length
			)
		}
	};
	return derivedConfig;
});

export const shapeData = derived(config, ($config) => {
	const data = generateRotatedShapeGeometry($config);
	console.debug('SHAPE DATA', data);
	return { ...data, height: getModelHeight(data.bands) };
});

export const bandPattern = derived([config, shapeData], ([$config, $shapeData]) => {
	console.debug('DERIVE bandPattern');
	const { bands } = $shapeData;
	const displayedBandFacets = getRenderableOnGeometry($config.renderConfig, bands);
	let pattern: BandPattern;
	if ($config.patternConfig.showPattern.band === 'none') {
		pattern = { projectionType: 'none' } as NullBandPattern;
	} else if ($config.patternConfig.showPattern.band === 'patterned') {
		pattern = generateTiledBandPattern({
			bands: displayedBandFacets as Band[],
			tiledPatternConfig: $config.tiledPatternConfig,
			pixelScale: $config.patternConfig.pixelScale
		});

		pattern = applyStrokeWidth(pattern, $config.tiledPatternConfig.config);
	} else {
		pattern = generateBandPatterns(
			$config.patternConfig,
			$config.cutoutConfig,
			$config.bandConfig.bandStyle,
			$config.bandConfig.tabStyle,
			displayedBandFacets
		);
	}
	pattern.meta = { ...pattern.meta, ...getPatternLength(pattern) };
	return pattern;
});
