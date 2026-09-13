import { describe, it, expect } from '@jest/globals';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import { generateProjectionPattern } from '../generate-pattern';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig,
	tiledPatternConfigs
} from '$lib/shades-config';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';

describe('hexparquet end to end (globule tubes)', () => {
	it('patterns every band or refuses it with an error', () => {
		const superGlobule = generateSuperGlobule(generateDefaultSuperGlobuleConfig(), {
			globule: false,
			globuleTube: true,
			projection: false,
			voronoi: false
		});
		const patternConfig = generateDefaultGlobulePatternConfig();
		patternConfig.patternTypeConfig = { ...tiledPatternConfigs['tiledHexparquetPattern-0'] };
		const pattern = generateProjectionPattern(
			superGlobule.globuleTubes,
			'super-1',
			patternConfig,
			patternConfig.patternViewConfig.range
		) as SuperGlobuleProjectionCutPattern;

		const bands = pattern.projectionCutPattern.tubes.flatMap((t) => t.bands);
		expect(bands.length).toBeGreaterThan(0);
		for (const band of bands) {
			if (band.error) {
				expect(band.facets).toEqual([]);
				expect(band.error).toMatch(/divisible by 3/);
			} else {
				expect(band.facets.length % 3).toBe(0);
				expect(band.svgPath).toEqual(expect.any(String));
			}
		}
	});

	it('patterns real globule bands (divisions=9 gives a quad count divisible by 3)', () => {
		const config = generateDefaultSuperGlobuleConfig();
		config.subGlobuleConfigs.forEach((s) => {
			s.globuleConfig.levelConfig.silhouetteSampleMethod = { method: 'divideCurve', divisions: 9 };
		});
		const superGlobule = generateSuperGlobule(config, {
			globule: false,
			globuleTube: true,
			projection: false,
			voronoi: false
		});
		const patternConfig = generateDefaultGlobulePatternConfig();
		patternConfig.patternTypeConfig = { ...tiledPatternConfigs['tiledHexparquetPattern-0'] };
		const pattern = generateProjectionPattern(
			superGlobule.globuleTubes,
			'super-1',
			patternConfig,
			patternConfig.patternViewConfig.range
		) as SuperGlobuleProjectionCutPattern;

		const bands = pattern.projectionCutPattern.tubes.flatMap((t) => t.bands);
		expect(bands.some((band) => !band.error)).toBe(true);

		for (const band of bands) {
			if (band.error) continue;

			expect(band.facets.length % 3).toBe(0);
			expect(band.svgPath).toEqual(expect.any(String));

			band.facets.forEach((facet, index) => {
				for (const segment of facet.path) {
					for (const value of segment) {
						if (typeof value === 'number') {
							expect(Number.isNaN(value)).toBe(false);
						}
					}
				}

				const remainder = index % 3;
				if (remainder === 1) {
					// green
					expect([16, 18]).toContain(facet.path.length);
					if (facet.path.length === 16) {
						expect(band.leftPartnerBand).toBeDefined();
					}
				} else if (remainder === 2) {
					// red
					expect(facet.path.length).toBe(20);
				} else if (index === 0) {
					// blue, first facet
					expect(facet.path.length).toBe(20);
				} else {
					// blue, subsequent facets
					expect(facet.path.length).toBe(18);
				}
			});
		}
	});
});
