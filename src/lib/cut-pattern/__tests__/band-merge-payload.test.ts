import { describe, it, expect } from '@jest/globals';
import { toBandMergePayloads, seedForBand } from '../band-merge-payload';
import {
	buildDefaultGeometry,
	splitAllTubesAt,
	generateProjectionTubes,
	partsOf
} from './helpers/real-geometry';
import { tiledPatternConfigs } from '$lib/shades-config';

const tiledConfig = tiledPatternConfigs['tiledHexPattern-1'];

describe('toBandMergePayloads', () => {
	it('spans an unsplit band across the whole parent', () => {
		const geometry = buildDefaultGeometry();
		const tubes = generateProjectionTubes(geometry, tiledConfig, undefined, 1);
		const payloads = toBandMergePayloads(tubes, new Map());

		expect(payloads.length).toBeGreaterThan(0);
		for (const payload of payloads) {
			expect(payload.pieceStartFraction).toBe(0);
			expect(payload.pieceEndFraction).toBe(1);
		}
	});

	it('spans split pieces contiguously across the parent, in order', () => {
		const geometry = buildDefaultGeometry();
		// Default bands are 4 quads; split at quad 2 gives two equal halves.
		const splits = splitAllTubesAt(geometry, [2]);
		const tubes = generateProjectionTubes(geometry, tiledConfig, splits, 1);
		const payloads = toBandMergePayloads(tubes, new Map());
		const byId = new Map(payloads.map((p) => [p.id, p]));

		const parts = partsOf(tubes[0], 0);
		expect(parts.length).toBe(2);

		const first = byId.get(parts[0].id);
		const second = byId.get(parts[1].id);
		expect(first?.pieceStartFraction).toBeCloseTo(0, 10);
		expect(first?.pieceEndFraction).toBeCloseTo(0.5, 10);
		expect(second?.pieceStartFraction).toBeCloseTo(0.5, 10);
		expect(second?.pieceEndFraction).toBeCloseTo(1, 10);
	});

	it('carries only structured-cloneable data', () => {
		const geometry = buildDefaultGeometry();
		const tubes = generateProjectionTubes(geometry, tiledConfig, undefined, 1);
		const payloads = toBandMergePayloads(tubes, new Map());

		// Throws DataCloneError on a class instance or a function.
		const cloned = structuredClone(payloads);
		expect(cloned).toEqual(payloads);
		// No Three.js objects smuggled in via facets.
		expect(JSON.stringify(payloads)).not.toContain('"isVector3"');
		expect(JSON.stringify(payloads)).not.toContain('"triangle"');
	});

	it('attaches measured label dims when present and leaves them undefined otherwise', () => {
		const geometry = buildDefaultGeometry();
		const tubes = generateProjectionTubes(geometry, tiledConfig, undefined, 1);
		const firstId = tubes[0].bands[0].id;
		const dims = new Map([[firstId, { width: 42, height: 7 }]]);

		const payloads = toBandMergePayloads(tubes, dims);
		const measured = payloads.find((p) => p.id === firstId);
		const unmeasured = payloads.find((p) => p.id !== firstId);

		expect(measured?.labelTextDims).toEqual({ width: 42, height: 7 });
		expect(unmeasured?.labelTextDims).toBeUndefined();
	});
});

describe('seedForBand', () => {
	it('is deterministic for the same run seed and band id', () => {
		expect(seedForBand(1, 'g0-t0-b0')).toBe(seedForBand(1, 'g0-t0-b0'));
	});

	it('differs across bands and across run seeds', () => {
		expect(seedForBand(1, 'g0-t0-b0')).not.toBe(seedForBand(1, 'g0-t0-b1'));
		expect(seedForBand(1, 'g0-t0-b0')).not.toBe(seedForBand(2, 'g0-t0-b0'));
	});
});
