import type { Tube } from '$lib/projection-geometry/types';
import type {
	BandAddressed,
	GeometryAddress,
	Globule,
	GlobulePatternConfig,
	PatternedBandPattern,
	SubGlobule,
	SubGlobuleConfig,
	SuperGlobule,
	SuperGlobuleConfig
} from '$lib/types';
import { applyStrokeWidth } from './cut-pattern';
import { generateTiledBandPattern } from './generate-tiled-pattern';

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
			return { globules: subGlobule.data.filter((globule: Globule) => globule.visible), config };
		}
	);

	const collectedBandPatterns: PatternedBandPattern[] = patternGlobules
		.map(({ globules }: { globules: Globule[] }) => {
			const bandPatterns = globules.map(({ data: { bands }, address }) => {
				let pattern: PatternedBandPattern;
				const {
					tiledPatternConfig,
					patternConfig: { pixelScale }
				} = globulePatternConfig;

				pattern = generateTiledBandPattern({
					address,
					bands: bands.filter((b) => b.visible),
					tiledPatternConfig,
					pixelScale
				});
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

	const bandPatterns = collectedBandPatterns
		.map((globulePattern: PatternedBandPattern) => globulePattern.bands)
		.flat();

	return {
		type: 'SuperGlobulePattern',
		superGlobuleConfigId: superGlobuleConfig.id,
		bandPatterns
	};
};

export const generateProjectionPattern = (
	tubes: Tube[],
	superGlobuleConfig: SuperGlobuleConfig,
	globulePatternConfig: GlobulePatternConfig
) => {
	const dummyAddress: GeometryAddress<BandAddressed> = { s: 0, g: [0], b: 0 };
	const patterns: PatternedBandPattern[] = [];
	const {
		tiledPatternConfig,
		patternConfig: { pixelScale }
	} = globulePatternConfig;

	tubes.forEach(({ bands }, i) => {
		let pattern: PatternedBandPattern = generateTiledBandPattern({
			address: dummyAddress,
			bands,
			tiledPatternConfig,
			pixelScale
		});
		pattern = {
			...pattern,
			bands: pattern.bands.map((band) => ({ ...band, projectionType: pattern.projectionType }))
		};
		pattern = applyStrokeWidth(pattern, tiledPatternConfig.config);
		patterns.push(pattern);
	});

	console.debug('*** generateProjectionPattern', patterns);

	const bandPatterns = patterns.map((pattern: PatternedBandPattern) => pattern.bands).flat();

	return {
		type: 'SuperGlobulePattern',
		superGlobuleConfigId: superGlobuleConfig.id,
		bandPatterns
	};
};
