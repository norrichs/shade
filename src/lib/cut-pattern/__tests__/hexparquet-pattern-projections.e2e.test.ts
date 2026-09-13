import { describe, it, expect } from '@jest/globals';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import { generateProjectionPattern } from '../generate-pattern';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig,
	tiledPatternConfigs
} from '$lib/shades-config';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';
import type { SuperGlobuleConfig } from '$lib/types';

/**
 * Real projection geometry for these tests: the default super-globule config's
 * projection uses an icosahedron polyhedron whose single edge curve (widthCurve)
 * defaults to 4 divisions, producing 8 facets (4 quads) per band — not divisible
 * by hexparquet's subunitCount (3), so every band is refused and no tube-end
 * partner ever has facets. Overriding that edge curve's sampleMethod to 3
 * divisions instead produces 6 facets (3 quads) per band, which hexparquet
 * accepts, while still generating real cross-tube start/end partner links
 * (projection tubes meet at shared vertices, so a band's tube-end partner is a
 * band on a *different* tube).
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

describe('hexparquet end to end (projections, real geometry)', () => {
	it('does not throw when a patterned band tube-end-partners a refused band', () => {
		const config = buildDivisibleProjectionConfig();
		const superGlobule = generateSuperGlobule(config, {
			globule: false,
			globuleTube: false,
			projection: true,
			voronoi: false
		});

		const tubes = superGlobule.projections[0].tubes;

		// Confirm the fixture actually has cross-tube tube-end partners before
		// forcing one of them to be refused, so this test would fail loudly (rather
		// than vacuously pass) if the projection geometry ever changes shape.
		expect(tubes[0].bands[0].facets[0].meta?.ab?.partner?.tube).toBe(6);

		// Minimal, documented adjustment: force tube 6's band 5 (the real
		// startPartnerBand of tube 0's band 0, per the fixture above) to be
		// refused by generateTiling, by dropping one facet pair so its quad count
		// (3) becomes 2 — no longer divisible by hexparquet's subunitCount of 3.
		// This reproduces, on real projection geometry, the exact scenario from
		// the regression: a tiled band's tube-end partner band was refused.
		const targetBand = tubes[6].bands[5];
		targetBand.facets = targetBand.facets.slice(0, targetBand.facets.length - 2);

		const patternConfig = generateDefaultGlobulePatternConfig();
		patternConfig.patternTypeConfig = { ...tiledPatternConfigs['tiledHexparquetPattern-0'] };
		patternConfig.patternViewConfig.range = { tubes: undefined, bands: undefined };

		let pattern: SuperGlobuleProjectionCutPattern | undefined;
		expect(() => {
			pattern = generateProjectionPattern(
				tubes,
				'super-1',
				patternConfig,
				patternConfig.patternViewConfig.range
			) as SuperGlobuleProjectionCutPattern;
		}).not.toThrow();

		const outputTubes = pattern!.projectionCutPattern.tubes;

		const refusedBand = outputTubes[6].bands.find((b) => b.address.band === 5);
		expect(refusedBand?.error).toMatch(/divisible by 3/);
		expect(refusedBand?.facets).toEqual([]);

		// The band whose tube-end partner was refused still patterns successfully.
		const originBand = outputTubes[0].bands.find((b) => b.address.band === 0);
		expect(originBand?.error).toBeUndefined();
		expect(originBand?.facets.length).toBeGreaterThan(0);

		// Every other (non-refused) band across the whole projection still patterns.
		const otherBands = outputTubes.flatMap((t) => t.bands).filter((b) => b !== refusedBand);
		for (const band of otherBands) {
			expect(band.error).toBeUndefined();
			expect(band.facets.length % 3).toBe(0);
		}
	});

	it('surface-projection open tube: band 0 has no leftPartnerBand, later bands do', () => {
		const config = buildDivisibleProjectionConfig();
		const superGlobule = generateSuperGlobule(config, {
			globule: false,
			globuleTube: false,
			projection: true,
			voronoi: false
		});

		const surfaceProjectionTubes = superGlobule.projections[0].surfaceProjectionTubes;
		expect(surfaceProjectionTubes.length).toBeGreaterThan(0);

		const patternConfig = generateDefaultGlobulePatternConfig();
		patternConfig.patternTypeConfig = { ...tiledPatternConfigs['tiledHexparquetPattern-0'] };
		patternConfig.patternViewConfig.range = { tubes: undefined, bands: undefined };

		let pattern: SuperGlobuleProjectionCutPattern | undefined;
		expect(() => {
			pattern = generateProjectionPattern(
				surfaceProjectionTubes,
				'super-1',
				patternConfig,
				patternConfig.patternViewConfig.range
			) as SuperGlobuleProjectionCutPattern;
		}).not.toThrow();

		const outputTubes = pattern!.projectionCutPattern.tubes;
		expect(outputTubes.length).toBeGreaterThan(0);

		// Surface-projection tubes are open (non-wrapping): band 0 has no left
		// partner, since there is no preceding band to be a partner. At least one
		// other band in the tube does have a defined leftPartnerBand.
		const tubeWithMultipleBands = outputTubes.find((t) => t.bands.length > 1);
		expect(tubeWithMultipleBands).toBeDefined();

		const bandZero = tubeWithMultipleBands!.bands.find((b) => b.address.band === 0);
		expect(bandZero?.leftPartnerBand).toBeUndefined();

		const otherBandWithPartner = tubeWithMultipleBands!.bands.find(
			(b) => b.address.band !== 0 && b.leftPartnerBand !== undefined
		);
		expect(otherBandWithPartner).toBeDefined();
	});
});
