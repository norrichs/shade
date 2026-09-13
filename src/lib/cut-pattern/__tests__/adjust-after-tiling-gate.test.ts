import { describe, it, expect, jest } from '@jest/globals';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import { generateProjectionPattern } from '../generate-pattern';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig,
	tiledPatternConfigs
} from '$lib/shades-config';
import { patterns } from '$lib/patterns/pattern-definitions';
import type { BandCutPattern, PathSegment } from '$lib/types';

describe('adjustAfterTiling gate', () => {
	const superGlobule = generateSuperGlobule(generateDefaultSuperGlobuleConfig(), {
		globule: false,
		globuleTube: true,
		projection: false,
		voronoi: false
	});

	const run = (type: string) => {
		const patternConfig = generateDefaultGlobulePatternConfig();
		patternConfig.patternTypeConfig = { ...tiledPatternConfigs['tiledAsanohaPattern-1'], type };
		return generateProjectionPattern(
			superGlobule.globuleTubes,
			'super-1',
			patternConfig,
			patternConfig.patternViewConfig.range
		);
	};

	it('runs an opted-out entry even without tube-end partners', () => {
		const adjust = jest.fn((bands: BandCutPattern[]) => bands);
		patterns['test-gate-optout'] = {
			getPattern: () =>
				[
					['M', 0, 0],
					['L', 1, 1]
				] as PathSegment[],
			adjustAfterTiling: adjust,
			adjustAfterTilingNeedsEndPartners: false
		};
		run('test-gate-optout');
		expect(adjust).toHaveBeenCalled();
	});
});
