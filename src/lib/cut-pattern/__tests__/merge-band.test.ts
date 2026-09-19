import { describe, it, expect } from '@jest/globals';
import { mergeBand } from '../merge-band';
import { computeMergedBandPaths } from '../prepare-merge';
import { toBandMergePayloads } from '../band-merge-payload';
import { buildDefaultGeometry, generateProjectionTubes } from './helpers/real-geometry';
import { getPaperScope } from '$lib/paper/scope';
import { tiledPatternConfigs } from '$lib/shades-config';
import type { PathSegment, PatternLabelsConfig } from '$lib/types';
import type { MergeCtx } from '../merge-band';
import type { BandMergePayload } from '../band-merge-payload';

const tiledConfig = tiledPatternConfigs['tiledHexPattern-1'];
const labels: PatternLabelsConfig = {
	selfTag: { enabled: true, height: 16, angle: 0, padding: 5, stemLength: 20, stemWidth: 4 }
};

const rect = (x: number, y: number, w: number, h: number): PathSegment[] => [
	['M', x, y],
	['L', x + w, y],
	['L', x + w, y + h],
	['L', x, y + h],
	['Z']
];

/**
 * A labelled band with an auto-angle, so it is eligible for BOTH merge
 * branches: the tiled union and the outlined label merge.
 */
const labelledPayload = (): BandMergePayload => ({
	id: 'band-1',
	facets: [{ path: rect(0, 0, 100, 60), strokeWidth: 2 }],
	tagAnchorPoint: { x: 50, y: 60 },
	tagAngle: 0,
	tagAnchorAutoAngle: 0,
	pieceStartFraction: 0,
	pieceEndFraction: 1,
	labelTextDims: { width: 50, height: 20 },
	seed: 1
});

/**
 * Merge `labelledPayload()` with `height` either supplied or OMITTED from
 * selfTag. `height` is declared non-optional on `PatternLabelsConfig`, so the
 * `?? 14` / `?? 16` defaults are only reachable from cast or runtime-shaped
 * config — hence the cast here, and hence the need to pin them.
 */
const mergeAtHeight = (patternType: string, height?: number): PathSegment[] =>
	mergeBand(labelledPayload(), {
		patternType,
		selfTag: {
			enabled: true,
			angle: 0,
			padding: 10,
			stemLength: 20,
			stemWidth: 4,
			...(height === undefined ? {} : { height })
		},
		keepConnected: 0
	} as MergeCtx);

describe('mergeBand', () => {
	beforeAll(() => {
		getPaperScope();
	});

	// Smoke, NOT the fidelity gate: `computeMergedBandPaths` is now implemented
	// by `mergeBand`, so this compares the extraction against itself. Its value
	// is that real geometry survives the round trip and that every payload id
	// lines up with a map key. The true regression gate for this extraction is
	// the four pre-existing suites — prepare-merge, prepare-merge.labels and the
	// two build-band-union-path suites — which encode the old behaviour
	// independently of `mergeBand`.
	it('runs end to end over real geometry and keys every merged band', () => {
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

	// The one place the two merged loop bodies genuinely disagreed: with no
	// configured height, the tiled branch fell back to 16 and the outlined
	// branch to 14. Height only reaches the output through the corner radius
	// (height / 4) of the label body, so these compare whole merged paths
	// against the same merge run with each height stated explicitly. Swapping
	// the two defaults, or unifying them on either value, fails both cases.
	it('defaults the label height to 16 on the tiled branch', () => {
		expect(mergeAtHeight('tiled')).toEqual(mergeAtHeight('tiled', 16));
		expect(mergeAtHeight('tiled')).not.toEqual(mergeAtHeight('tiled', 14));
	});

	it('defaults the label height to 14 on the outlined branch', () => {
		expect(mergeAtHeight('outlined')).toEqual(mergeAtHeight('outlined', 14));
		expect(mergeAtHeight('outlined')).not.toEqual(mergeAtHeight('outlined', 16));
	});
});
