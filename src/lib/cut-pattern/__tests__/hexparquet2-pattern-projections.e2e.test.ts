import { describe, it, expect } from '@jest/globals';
import { generateSuperGlobule } from '#lib/generate-superglobule.js';
import { generateProjectionPattern } from '../generate-pattern';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig,
	tiledPatternConfigs
} from '#lib/shades-config.js';
import type { SuperGlobuleProjectionCutPattern } from '#lib/stores/superGlobuleStores.js';
import type { SuperGlobuleConfig } from '#lib/types.js';

/**
 * Real projection geometry with 3 quads per band (see the hexparquet e2e test:
 * the default edge curve's 4 divisions give 4 quads, which a 3-subunit pattern
 * refuses).
 */
const buildDivisibleProjectionConfig = (): SuperGlobuleConfig => {
	const config = generateDefaultSuperGlobuleConfig();
	const projectionConfig = config.projectionConfigs[0] as unknown as {
		projectorConfig: { polyhedron: { edgeCurves: { sampleMethod: unknown }[] } };
	};
	projectionConfig.projectorConfig.polyhedron.edgeCurves[0].sampleMethod = {
		method: 'divideCurvePath',
		divisions: 3
	};
	return config;
};

describe('HexParquet2 end to end (projections, real geometry)', () => {
	it('patterns every band with finite coordinates, partners included', () => {
		const superGlobule = generateSuperGlobule(buildDivisibleProjectionConfig(), {
			globuleTube: false,
			projection: true,
			voronoi: false
		});
		const patternConfig = generateDefaultGlobulePatternConfig();
		patternConfig.patternTypeConfig = { ...tiledPatternConfigs['tiledHexparquet2Pattern-0'] };
		patternConfig.patternViewConfig.range = { tubes: undefined, bands: undefined };

		const pattern = generateProjectionPattern(
			superGlobule.projections[0].tubes,
			'super-1',
			patternConfig,
			patternConfig.patternViewConfig.range
		) as SuperGlobuleProjectionCutPattern;
		const bands = pattern.projectionCutPattern.tubes.flatMap((t) => t.bands);

		expect(bands.length).toBeGreaterThan(0);
		expect(bands.every((b) => !b.error && b.facets.length === 3)).toBe(true);
		const coords = bands.flatMap((b) =>
			b.facets.flatMap((f) => f.path.flatMap((seg) => seg.slice(1) as number[]))
		);
		expect(coords.every(Number.isFinite)).toBe(true);
		expect(bands.filter((b) => b.leftPartnerBand !== undefined).length).toBeGreaterThan(0);
		const scores = bands.flatMap((b) => b.seamDeviation ?? []);
		expect(scores).toHaveLength(bands.length * 3);
		expect(scores.every(Number.isFinite)).toBe(true);
	});
});
