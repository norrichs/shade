import { describe, it, expect } from '@jest/globals';

import { cloneGlobuleConfig, generateSuperGlobule } from '$lib/generate-superglobule';
import { generateProjectionPattern } from '../generate-pattern';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig
} from '$lib/shades-config';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';
import { concatAddress, concatAddress_Tube } from '$lib/util';

/**
 * End-to-end guard for the bare-globule workflow: configure a globule with no
 * projection and no voronoi, and still get cut patterns out the other end.
 */
describe('bare globule -> globule tubes -> cut pattern', () => {
	const superGlobule = generateSuperGlobule(generateDefaultSuperGlobuleConfig(), {
		globule: false,
		globuleTube: true,
		projection: false,
		voronoi: false
	});

	it('generates globule tubes with the projection and voronoi pipelines off', () => {
		expect(superGlobule.pipelineErrors).toBeUndefined();
		expect(superGlobule.projections).toEqual([]);
		expect(superGlobule.voronoiResult).toBeUndefined();
		expect(superGlobule.globuleTubes.length).toBeGreaterThan(0);
		expect(superGlobule.globuleTubes[0].bands.length).toBeGreaterThan(0);
	});

	it('generates a cut pattern from those globule tubes', () => {
		const patternConfig = generateDefaultGlobulePatternConfig();
		const pattern = generateProjectionPattern(
			superGlobule.globuleTubes,
			'super-1',
			patternConfig,
			patternConfig.patternViewConfig.range
		) as SuperGlobuleProjectionCutPattern;

		expect(pattern.type).toBe('SuperGlobuleProjectionCutPattern');
		expect(pattern.projectionCutPattern.tubes.length).toBeGreaterThan(0);
		expect(pattern.projectionCutPattern.tubes[0].bands.length).toBeGreaterThan(0);
	});

	// The default config carries two sub-globule configs that share ONE globuleConfig:
	// the second is a legacy recombination copy (same globule, placed by transforms).
	// The tube pipeline does not implement transforms, so emitting a tube per entry
	// produced two identical overlapping tubes — one globule must be one tube.
	it('emits one tube per distinct globule, not per sub-globule entry', () => {
		const config = generateDefaultSuperGlobuleConfig();
		const globuleIds = config.subGlobuleConfigs.map((sgc) => sgc.globuleConfig.id);
		expect(globuleIds.length).toBeGreaterThan(1);
		expect(new Set(globuleIds).size).toBe(1);

		expect(superGlobule.globuleTubes).toHaveLength(1);
	});

	// The flat page-layout `#each` is keyed by the band address, so two tubes that
	// report the same address collide (each_key_duplicate). Distinct globules get
	// their own tubes, so those tubes must carry distinct addresses.
	it('addresses each globule tube distinctly', () => {
		const config = generateDefaultSuperGlobuleConfig();
		// A second, independent globule (cloned, so it gets its own id) — unlike the
		// shared-globuleConfig copy the default config ships with.
		config.subGlobuleConfigs.push({
			...config.subGlobuleConfigs[0],
			id: 'sub-distinct',
			globuleConfig: cloneGlobuleConfig(config.subGlobuleConfigs[0].globuleConfig),
			transforms: []
		});
		const multi = generateSuperGlobule(config, {
			globule: false,
			globuleTube: true,
			projection: false,
			voronoi: false
		});

		expect(multi.globuleTubes).toHaveLength(2);
		const addresses = multi.globuleTubes.map((tube) => concatAddress_Tube(tube.address, 'gt'));
		expect(new Set(addresses).size).toBe(addresses.length);
	});

	it('gives every band in the cut pattern a unique address', () => {
		const patternConfig = generateDefaultGlobulePatternConfig();
		const pattern = generateProjectionPattern(
			superGlobule.globuleTubes,
			'super-1',
			patternConfig,
			patternConfig.patternViewConfig.range
		) as SuperGlobuleProjectionCutPattern;

		const bandAddresses = pattern.projectionCutPattern.tubes.flatMap((tube) =>
			tube.bands.map((band) => concatAddress(band.address))
		);
		expect(bandAddresses.length).toBeGreaterThan(0);
		expect(new Set(bandAddresses).size).toBe(bandAddresses.length);
	});

	// Every globule-tube band starts at the pole, where the level collapses to a point
	// and the leading facets have a zero-length edge. Those must not NaN-poison the
	// flattening chain — the symptom is a whole band of "M 0 0 L 0 0" segments.
	it('flattens to real coordinates despite the collapsed facets at the pole', () => {
		const patternConfig = generateDefaultGlobulePatternConfig();
		const pattern = generateProjectionPattern(
			superGlobule.globuleTubes,
			'super-1',
			patternConfig,
			patternConfig.patternViewConfig.range
		) as SuperGlobuleProjectionCutPattern;

		for (const tube of pattern.projectionCutPattern.tubes) {
			for (const band of tube.bands) {
				const numbers = (band.svgPath ?? '').match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
				expect(numbers.length).toBeGreaterThan(0);
				expect(numbers.every((n) => Number.isFinite(n))).toBe(true);
				expect(numbers.some((n) => n !== 0)).toBe(true);
			}
		}
	});
});
