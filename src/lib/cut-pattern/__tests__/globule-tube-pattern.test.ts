import { describe, it, expect } from '@jest/globals';

import { generateSuperGlobule } from '$lib/generate-superglobule';
import { generateProjectionPattern } from '../generate-pattern';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig
} from '$lib/shades-config';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';

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
