import type {
	BandPattern,
	Globule,
	GlobulePatternConfig,
	PatternedBand,
	PatternedBandPattern,
	SubGlobule,
	SubGlobuleConfig,
	SuperGlobule,
	SuperGlobuleConfig
} from '$lib/types';
import {
	generateTiledBandPattern,
	generateBandPatterns,
	applyStrokeWidth,
	getPatternLength
} from './cut-pattern';

type PatternGlobule = {
	globules: Globule[];
	config: SubGlobuleConfig;
};

export const generateSuperGlobulePattern = (
	superGlobule: SuperGlobule,
	superGlobuleConfig: SuperGlobuleConfig,
	globulePatternConfig: GlobulePatternConfig
) => {
	const patternGlobules: PatternGlobule[] = superGlobule.subGlobules.map(
		(subGlobule: SubGlobule) => {
			const config = superGlobuleConfig.subGlobuleConfigs.find(
				(subGlobuleConfig) => subGlobuleConfig.id === subGlobule.subGlobuleConfigId
			);
			if (!config) {
				throw new Error('missing config');
			}
			return { globules: subGlobule.data, config };
		}
	);

	const collectedBandPatterns: PatternedBandPattern[] = patternGlobules
		.map(({ globules }) => {
			const bandPatterns = globules.map(({ data: { bands } }) => {
				let pattern: PatternedBandPattern;
				const {
					tiledPatternConfig,
					patternConfig: { pixelScale }
				} = globulePatternConfig;

				pattern = generateTiledBandPattern({ bands, tiledPatternConfig, pixelScale });
				pattern = {
					...pattern,
					bands: pattern.bands.map((band) => ({ ...band, projectionType: pattern.projectionType }))
				};
				pattern = applyStrokeWidth(pattern, tiledPatternConfig.config);
				return pattern;
			});
			return bandPatterns;
		})
		.flat();

	const bandPatterns = collectedBandPatterns.map((globulePattern: PatternedBandPattern) => globulePattern.bands).flat();

	return {
		type: 'SuperGlobulePattern',
		superGlobuleConfigId: superGlobuleConfig.id,
		bandPatterns
	};
};
