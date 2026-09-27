import { describe, it, expect, jest } from '@jest/globals';
import { createBandMergeCore, type MergeResponse } from '../band-merge-worker-core';
import { holesOf } from '$lib/cut-pattern/contour-index';
import { computeMergedBandPaths } from '$lib/cut-pattern/prepare-merge';
import { toBandMergePayloads } from '$lib/cut-pattern/band-merge-payload';
import {
	buildDefaultGeometry,
	splitAllTubesAt,
	generateProjectionTubes
} from '$lib/cut-pattern/__tests__/helpers/real-geometry';
import { tiledPatternConfigs } from '$lib/shades-config';
import type { PatternLabelsConfig } from '$lib/types';

const tiledConfig = tiledPatternConfigs['tiledHexPattern-1'];
const labels: PatternLabelsConfig = {
	selfTag: { enabled: true, height: 16, angle: 0, padding: 5, stemLength: 20, stemWidth: 4 }
};

describe('band merge worker core', () => {
	it('posts a merge-result per band', () => {
		const core = createBandMergeCore();
		const posted: MergeResponse[] = [];
		core.handle(
			{
				type: 'merge',
				bandId: 'b',
				payload: {
					id: 'b',
					facets: [
						{
							path: [
								['M', 0, 0],
								['L', 10, 0]
							],
							strokeWidth: 2
						}
					],
					pieceStartFraction: 0,
					pieceEndFraction: 1,
					seed: 1
				},
				ctx: { patternType: 'tiledHexPattern-1', keepConnected: 0 }
			},
			(r) => posted.push(r)
		);

		expect(posted).toHaveLength(1);
		expect(posted[0].type).toBe('merge-result');
	});

	it('posts merge-error instead of throwing when the merge fails', () => {
		const core = createBandMergeCore({
			mergeBand: jest.fn(() => {
				throw new Error('boom');
			}) as never
		});
		const posted: MergeResponse[] = [];
		core.handle(
			{
				type: 'merge',
				bandId: 'b7',
				payload: { id: 'b7', facets: [], pieceStartFraction: 0, pieceEndFraction: 1, seed: 1 },
				ctx: { patternType: 'tiledHexPattern-1', keepConnected: 0 }
			},
			(r) => posted.push(r)
		);

		expect(posted).toEqual([{ type: 'merge-error', bandId: 'b7', error: 'boom' }]);
	});

	// NOT an independent fidelity oracle: since Task 3, computeMergedBandPaths
	// is itself implemented by mergeBand, so both sides of this comparison call
	// the same function. What this proves is that the MESSAGE-HANDLER path —
	// payload in, ctx in, response out, results reassembled by bandId — carries
	// everything through the protocol without mangling or dropping it, over
	// real split geometry. The genuine regression gate for merge fidelity is
	// the four pre-existing suites: prepare-merge.test.ts,
	// prepare-merge.labels.test.ts, build-band-union-path.test.ts and
	// build-band-union-path.holes.test.ts.
	it('carries every band through the message protocol intact, matching the synchronous merge', () => {
		const geometry = buildDefaultGeometry();
		const splits = splitAllTubesAt(geometry, [2]);
		const tubes = generateProjectionTubes(geometry, tiledConfig, splits, 2);
		const dims = new Map();

		const oracle = computeMergedBandPaths(tubes, labels, 'tiledHexPattern-1', dims, 0);

		const core = createBandMergeCore();
		const fanned = new Map<string, unknown>();
		for (const payload of toBandMergePayloads(tubes, dims)) {
			core.handle(
				{
					type: 'merge',
					bandId: payload.id,
					payload,
					ctx: { patternType: 'tiledHexPattern-1', selfTag: labels.selfTag, keepConnected: 0 }
				},
				(response) => {
					if (response.type === 'merge-result' && response.path.length > 0) {
						fanned.set(response.bandId, response.path);
					}
				}
			);
		}

		expect(fanned.size).toBe(oracle.size);
		expect(fanned.size).toBeGreaterThan(0);
		for (const [id, path] of oracle) expect(fanned.get(id)).toEqual(path);
	});
});

describe('stage 1b: contour index', () => {
	it('returns a contour index alongside the merged path', () => {
		const geometry = buildDefaultGeometry();
		const tubes = generateProjectionTubes(geometry, tiledConfig, undefined, 1);
		const payloads = toBandMergePayloads(tubes, new Map());
		const core = createBandMergeCore();
		const posted: MergeResponse[] = [];

		for (const payload of payloads) {
			core.handle(
				{
					type: 'merge',
					bandId: payload.id,
					payload,
					ctx: { patternType: 'tiledHexPattern-1', keepConnected: 0 }
				},
				(r) => posted.push(r)
			);
		}

		const results = posted.filter((r) => r.type === 'merge-result');
		expect(results.length).toBeGreaterThan(0);

		let totalHoles = 0;
		for (const result of results) {
			if (result.type !== 'merge-result') continue;
			const payload = payloads.find((p) => p.id === result.bandId)!;
			expect(result.contours.seed).toBe(payload.seed);
			const holes = holesOf(result.contours);
			totalHoles += holes.length;
			for (const hole of holes) {
				expect(result.path[hole.start][0]).toBe('M');
				expect(hole.bandFraction).toBeGreaterThanOrEqual(payload.pieceStartFraction - 1e-9);
				expect(hole.bandFraction).toBeLessThanOrEqual(payload.pieceEndFraction + 1e-9);
			}
		}
		// A real tiled band is a tessellation; it must have interior cells.
		expect(totalHoles).toBeGreaterThan(0);
	});

	it('marks every contour of an outlined band as outline, with no holes', () => {
		const core = createBandMergeCore();
		const posted: MergeResponse[] = [];
		core.handle(
			{
				type: 'merge',
				bandId: 'b',
				payload: {
					id: 'b',
					facets: [
						{
							path: [['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['Z']]
						}
					],
					tagAnchorPoint: { x: 5, y: 5 },
					tagAnchorAutoAngle: 0,
					pieceStartFraction: 0,
					pieceEndFraction: 1,
					seed: 42
				},
				ctx: { patternType: 'outlined', selfTag: labels.selfTag, keepConnected: 0 }
			},
			(r) => posted.push(r)
		);

		const [result] = posted;
		expect(result.type).toBe('merge-result');
		if (result.type !== 'merge-result') return;
		expect(result.contours.seed).toBe(42);
		expect(holesOf(result.contours)).toHaveLength(0);
		expect(result.contours.contours.every((c) => c.kind === 'outline')).toBe(true);
		expect(result.contours.contours.length).toBeGreaterThan(0);
	});
});
