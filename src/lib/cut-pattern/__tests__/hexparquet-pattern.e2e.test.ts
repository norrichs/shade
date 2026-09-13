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
});
