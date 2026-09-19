import { describe, it, expect } from '@jest/globals';
import { mergeBand } from '../merge-band';
import { computeMergedBandPaths } from '../prepare-merge';
import { toBandMergePayloads } from '../band-merge-payload';
import { buildDefaultGeometry, generateProjectionTubes } from './helpers/real-geometry';
import { tiledPatternConfigs } from '$lib/shades-config';
import type { PatternLabelsConfig } from '$lib/types';

const tiledConfig = tiledPatternConfigs['tiledHexPattern-1'];
const labels: PatternLabelsConfig = {
	selfTag: { enabled: true, height: 16, angle: 0, padding: 5, stemLength: 20, stemWidth: 4 }
};

describe('mergeBand', () => {
	it('reproduces the synchronous tiled merge band for band', () => {
		const geometry = buildDefaultGeometry();
		const tubes = generateProjectionTubes(geometry, tiledConfig, undefined, 1);
		const dims = new Map();

		const oracle = computeMergedBandPaths(tubes, labels, 'tiledHexPattern-1', dims, 0);
		const payloads = toBandMergePayloads(tubes, dims);

		expect(payloads.length).toBeGreaterThan(0);
		for (const payload of payloads) {
			const mine = mergeBand(payload, {
				patternType: 'tiledHexPattern-1',
				selfTag: labels.selfTag,
				keepConnected: 0
			});
			expect(mine).toEqual(oracle.get(payload.id) ?? []);
		}
	});

	it('returns an empty path for a band with no facets', () => {
		const empty = {
			id: 'x',
			facets: [],
			pieceStartFraction: 0,
			pieceEndFraction: 1,
			seed: 1
		};
		expect(mergeBand(empty, { patternType: 'tiledHexPattern-1', keepConnected: 0 })).toEqual([]);
	});
});
