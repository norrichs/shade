import { describe, it, expect } from '@jest/globals';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig
} from '$lib/shades-config';
import { generateProjectionPattern } from '../generate-pattern';
import { runPatternGeneration } from '../run-pattern-generation';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';
import type { PatternGenerationConfig } from '$lib/stores/globulePatternStores';
import type { PatternGenerationResult } from '../run-pattern-generation';
import type { PipelineGates, SuperGlobuleConfig } from '$lib/types';

/**
 * Task 9a (shades-0u5): before this task, `patternGenerationConfig` never carried
 * `splits`, and `runPatternGeneration` rebuilt `patternConfig` as
 * `{ pixelScale: genConfig.pixelScale }`, dropping everything else — so a split
 * written to the store reached neither generation path. These tests use REAL
 * geometry and REAL (unmocked) generation, not the existing mocked
 * `run-pattern-generation.test.ts` fixtures: that file's top-level
 * `jest.mock('../generate-pattern', ...)` replaces `generateProjectionPattern`
 * with an identity stub (`(tubes) => ({ tubes })`), which can never exercise
 * `splitFlatBands` — a test built on it would pass identically whether or not
 * the wiring exists. Proving the wiring requires the real pipeline end to end.
 *
 * Without Steps 1-3 of the task: `PatternGenerationConfig` has no `splits`
 * field (a TS excess-property error on the object literals below), and even
 * forcing the type through, no `splitQuads` reaches `generateTubeCutPattern`,
 * so every band comes back as a single unsplit piece.
 */

const gates: PipelineGates = {
	globule: false,
	globuleTube: false,
	projection: true,
	voronoi: false
};

const buildSuperConfig = (): SuperGlobuleConfig => generateDefaultSuperGlobuleConfig();

const baseGenConfig = (): PatternGenerationConfig => {
	const patternConfig = generateDefaultGlobulePatternConfig();
	return {
		patternTypeConfig: patternConfig.patternTypeConfig,
		pixelScale: patternConfig.patternConfig.pixelScale,
		showBands: true,
		range: { tubes: undefined, bands: undefined, facets: undefined },
		patternSource: 'projection'
	};
};

const getCutPatternTubes = (result: PatternGenerationResult) => {
	const pattern = result.projectionPattern as SuperGlobuleProjectionCutPattern | undefined;
	if (pattern?.type !== 'SuperGlobuleProjectionCutPattern') {
		throw new Error('expected a SuperGlobuleProjectionCutPattern');
	}
	return pattern.projectionCutPattern.tubes;
};

describe('runPatternGeneration — splits (real generation)', () => {
	it('carries patternConfig.splits from the generation config into the tube pattern', () => {
		const superConfig = buildSuperConfig();
		const superGlobule = generateSuperGlobule(superConfig, gates);

		const genConfig: PatternGenerationConfig = {
			...baseGenConfig(),
			splits: { tubeSplits: [{ tube: 0, quads: [2] }] }
		};

		const result = runPatternGeneration({ superGlobule, superConfig, genConfig, gates });

		const tubes = getCutPatternTubes(result);
		const bandsOfTube0 = tubes[0].bands;
		// Two pieces where there was one band, with the band index stable.
		const band0Pieces = bandsOfTube0.filter((b) => b.address.band === 0);
		expect(band0Pieces).toHaveLength(2);
		expect(band0Pieces.map((b) => (b.address as { piece?: number }).piece)).toEqual([0, 1]);
	});

	it('is a no-op when no splits are configured', () => {
		const superConfig = buildSuperConfig();
		const superGlobule = generateSuperGlobule(superConfig, gates);

		const without = runPatternGeneration({
			superGlobule,
			superConfig,
			genConfig: baseGenConfig(),
			gates
		});
		const withEmpty = runPatternGeneration({
			superGlobule,
			superConfig,
			genConfig: { ...baseGenConfig(), splits: { tubeSplits: [] } },
			gates
		});

		expect(getCutPatternTubes(withEmpty)[0].bands.map((b) => b.address)).toEqual(
			getCutPatternTubes(without)[0].bands.map((b) => b.address)
		);
	});

	// generate-pattern.ts has a SECOND generateTubeCutPattern call site (the
	// referenced-tube stub path, ~:207) used when a band's cross-tube partner is
	// outside the requested tube range. getEndPartnerTransforms resolves partner
	// addresses against those stubs, so if only the first call site were wired, a
	// stub generated without splits would silently disagree with the real tube.
	// This restricts the range to tube 0 only, forcing whichever tube tube 0's
	// first facet actually partners with (real cross-tube geometry, not a mock)
	// to be generated via the stub path, and asserts ITS split still lands.
	it('applies splits to a tube generated via the referenced-tube stub path', () => {
		const superConfig = buildSuperConfig();
		const superGlobule = generateSuperGlobule(superConfig, gates);
		const tubes = superGlobule.projections[0].tubes;

		// Discover tube 0's real cross-tube start/end partners from an
		// unrestricted, splitless generation pass, rather than hardcoding a tube
		// index that would silently go stale if the default projection geometry
		// ever changes shape. `meta` is only populated when BOTH the start and
		// end partner are resolved (generate-tiled-pattern.ts:503).
		const fullRange = { tubes: undefined, bands: undefined, facets: undefined };
		const discovery = generateProjectionPattern(
			tubes,
			'super-1',
			generateDefaultGlobulePatternConfig(),
			fullRange
		) as SuperGlobuleProjectionCutPattern;
		const discoveredBand0 = discovery.projectionCutPattern.tubes[0].bands.find(
			(b) => b.address.band === 0
		);
		const startPartner = discoveredBand0?.meta?.startPartnerBand;
		const endPartner = discoveredBand0?.meta?.endPartnerBand;
		expect(startPartner).toBeDefined();
		expect(endPartner).toBeDefined();
		expect(startPartner?.tube).not.toBe(0);
		expect(endPartner?.tube).not.toBe(0);

		// Restrict generation to tube 0 only, forcing BOTH cross-tube partners to
		// be generated via the referenced-tube stub path (generate-pattern.ts's
		// second generateTubeCutPattern call, ~:207) rather than the main
		// per-tube loop (~:180). getEndPartnerTransforms (generate-pattern.ts:593)
		// then resolves tube 0's own band-0 partner transforms against those
		// stubs — so if the stub call site were not wired, splitting the
		// out-of-range partner tubes could not change tube 0's own output at
		// all: the transform is computed purely from the (identically
		// unsplit-if-unwired) stub's facets.
		const range = { tubes: [0, 1] as [number, number], bands: undefined, facets: undefined };

		const generateWith = (splits?: { tubeSplits: { tube: number; quads: number[] }[] }) => {
			const patternConfig = generateDefaultGlobulePatternConfig();
			patternConfig.patternConfig.splits = splits ?? { tubeSplits: [] };
			patternConfig.patternViewConfig.range = range;
			const pattern = generateProjectionPattern(
				tubes,
				'super-1',
				patternConfig,
				range
			) as SuperGlobuleProjectionCutPattern;
			return pattern.projectionCutPattern.tubes[0].bands.find((b) => b.address.band === 0);
		};

		const without = generateWith(undefined);
		const withSplits = generateWith({
			tubeSplits: [
				{ tube: startPartner!.tube, quads: [1] },
				{ tube: endPartner!.tube, quads: [1] }
			]
		});

		expect(without?.meta?.startPartnerTransform).toBeDefined();
		expect(without?.meta?.endPartnerTransform).toBeDefined();
		// At least one of the two cross-tube seam transforms on tube 0's own
		// band 0 must change once the (out-of-range) partner tubes are split —
		// otherwise the stub path silently ignored the split.
		const startChanged =
			JSON.stringify(without?.meta?.startPartnerTransform) !==
			JSON.stringify(withSplits?.meta?.startPartnerTransform);
		const endChanged =
			JSON.stringify(without?.meta?.endPartnerTransform) !==
			JSON.stringify(withSplits?.meta?.endPartnerTransform);
		expect(startChanged || endChanged).toBe(true);
	});
});
