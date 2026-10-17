import { describe, it, expect } from '@jest/globals';

import { silhouetteLevelSamples } from '../generate-level';
import { generateSilhouette } from '../generate-shape';
import { generateDefaultGlobuleConfig } from '../shades-config';
import type { CurveSampleMethod } from '../types';

describe('silhouetteLevelSamples', () => {
	const config = generateDefaultGlobuleConfig();
	const silhouette = generateSilhouette(config.silhouetteConfig);
	const divisions = config.levelConfig.silhouetteSampleMethod.divisions;

	it.each<[CurveSampleMethod['method'], 'getPoint' | 'getPointAt']>([
		['divideCurve', 'getPoint'],
		['divideCurvePath', 'getPointAt']
	])('follows the generator sampling for %s', (method, accessor) => {
		const samples = silhouetteLevelSamples(silhouette, { method, divisions } as CurveSampleMethod);

		expect(samples).toHaveLength(divisions + 1);
		expect(samples[0].t).toBe(0);
		expect(samples[samples.length - 1].t).toBe(1);
		samples.forEach(({ t, x, y }, i) => {
			if (i < divisions) expect(t).toBeCloseTo(i / divisions, 12);
			const point = silhouette[accessor](t);
			expect(x).toBe(point.x);
			expect(y).toBe(point.y);
		});
	});
});
