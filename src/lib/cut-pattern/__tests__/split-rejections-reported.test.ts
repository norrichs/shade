import { describe, it, expect } from '@jest/globals';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	defaultOutlinedPatternConfig,
	generateDefaultGlobulePatternConfig,
	generateDefaultSuperGlobuleConfig,
	tiledPatternConfigs
} from '$lib/shades-config';
import { collectSplitRejections, runPatternGeneration } from '../run-pattern-generation';
import { rehydratePatternResult } from '$lib/workers/rehydrate-pattern';
import type { PatternGenerationConfig } from '$lib/stores/globulePatternStores';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';
import type { PatternTypeConfig, PipelineGates, SuperGlobuleConfig } from '$lib/types';

/**
 * Task 7 (spec amendment "Dropped splits are reported, data is untouched"):
 * generation drops illegal / out-of-range splits and the rejection travels back
 * on the pattern result so the page can show it. Real geometry, unmocked
 * generation, both the tiled and the outlined path.
 */

const gates: PipelineGates = {
	globule: false,
	globuleTube: false,
	projection: true,
	voronoi: false
};

// Default projection bands have 4 quads. Six edge divisions give 6 quads per
// band, which hexparquet (subunitCount 3) accepts, so quad 3 is a legal split
// and quad 2 is not.
const sixQuadConfig = (): SuperGlobuleConfig => {
	// Cloned: the default config shares nested objects between calls, so
	// mutating it in place would change every later test's geometry.
	const config = structuredClone(generateDefaultSuperGlobuleConfig());
	const projectionConfig = config.projectionConfigs[0] as unknown as {
		projectorConfig: { polyhedron: { edgeCurves: { sampleMethod: unknown }[] } };
	};
	projectionConfig.projectorConfig.polyhedron.edgeCurves[0].sampleMethod = {
		method: 'divideCurvePath',
		divisions: 6
	};
	return config;
};

const genConfigFor = (
	patternTypeConfig: PatternTypeConfig,
	splits: PatternGenerationConfig['splits'],
	range: PatternGenerationConfig['range'] = { tubes: [0, 1], bands: undefined, facets: undefined }
): PatternGenerationConfig => ({
	patternTypeConfig,
	pixelScale: generateDefaultGlobulePatternConfig().patternConfig.pixelScale,
	showBands: true,
	range,
	patternSource: 'projection',
	splits
});

describe('dropped splits are reported on the pattern result', () => {
	it('tiled (hexparquet): reports a non-multiple and an out-of-range split, keeps the legal one', () => {
		const superConfig = sixQuadConfig();
		const superGlobule = generateSuperGlobule(superConfig, gates);
		const genConfig = genConfigFor(
			{ ...tiledPatternConfigs['tiledHexparquetPattern-0'] } as PatternTypeConfig,
			{ tubeSplits: [{ tube: 0, quads: [9, 2, 3, 2] }] }
		);

		const result = runPatternGeneration({ superGlobule, superConfig, genConfig, gates });

		expect(result.rejectedSplits).toEqual([
			{ tube: 0, quad: 2, reason: 'not a multiple of subunitCount 3' },
			{ tube: 0, quad: 9, reason: 'out of range for 6 quads' }
		]);
		// The legal split still cuts.
		const tube0 = (result.projectionPattern as SuperGlobuleProjectionCutPattern)
			.projectionCutPattern.tubes[0];
		expect(tube0.bands.filter((b) => b.address.band === 0)).toHaveLength(2);
	});

	it('outlined: reports an out-of-range split', () => {
		const superConfig = generateDefaultSuperGlobuleConfig();
		const superGlobule = generateSuperGlobule(superConfig, gates);
		const genConfig = genConfigFor(defaultOutlinedPatternConfig() as PatternTypeConfig, {
			tubeSplits: [{ tube: 0, quads: [2, 9] }]
		});

		const result = runPatternGeneration({ superGlobule, superConfig, genConfig, gates });

		expect(result.rejectedSplits).toEqual([
			{ tube: 0, quad: 9, reason: 'out of range for 4 quads' }
		]);
	});

	it('survives the worker round-trip (structured clone + rehydration)', () => {
		const superConfig = generateDefaultSuperGlobuleConfig();
		const superGlobule = generateSuperGlobule(superConfig, gates);
		const genConfig = genConfigFor(
			{ ...tiledPatternConfigs['tiledGridPattern-0'] } as PatternTypeConfig,
			{ tubeSplits: [{ tube: 0, quads: [9] }] }
		);

		const result = runPatternGeneration({ superGlobule, superConfig, genConfig, gates });
		// postMessage uses the structured clone algorithm.
		const received = rehydratePatternResult(structuredClone(result));

		expect(received.rejectedSplits).toEqual([
			{ tube: 0, quad: 9, reason: 'out of range for 4 quads' }
		]);
	});

	it('never prunes the persisted splits', () => {
		const superConfig = generateDefaultSuperGlobuleConfig();
		const superGlobule = generateSuperGlobule(superConfig, gates);
		const splits = { tubeSplits: [{ tube: 0, quads: [9, 2, 2] }] };
		const genConfig = genConfigFor(
			{ ...tiledPatternConfigs['tiledGridPattern-0'] } as PatternTypeConfig,
			splits
		);

		const result = runPatternGeneration({ superGlobule, superConfig, genConfig, gates });

		expect(result.rejectedSplits).toHaveLength(1);
		expect(genConfig.splits).toBe(splits);
		expect(splits).toEqual({ tubeSplits: [{ tube: 0, quads: [9, 2, 2] }] });
	});
});

describe('out of range is judged against the whole tube, not the selected band range', () => {
	// Default projection bands all have 4 quads. Shorten tube 0's bands 0 and 1
	// to 2 quads, so a band range of [0, 1] selects only short bands — even the
	// tiled path's one-band neighbour expansion to [0, 2] stays short — while
	// the tube as a whole still has 4-quad bands. Quad 3 is valid for the tube.
	const shortenedGeometry = () => {
		const superConfig = generateDefaultSuperGlobuleConfig();
		const superGlobule = generateSuperGlobule(superConfig, gates);
		// Rebuilt rather than mutated, so no cached geometry leaks into other tests.
		const [projection, ...otherProjections] = superGlobule.projections;
		const [tube0, ...otherTubes] = projection.tubes;
		const shortTube0 = {
			...tube0,
			bands: tube0.bands.map((band, i) =>
				i < 2 ? { ...band, facets: band.facets.slice(0, 4) } : band
			)
		};
		return {
			superConfig,
			superGlobule: {
				...superGlobule,
				projections: [{ ...projection, tubes: [shortTube0, ...otherTubes] }, ...otherProjections]
			}
		};
	};
	const narrowed = {
		tubes: [0, 1],
		bands: [0, 1],
		facets: undefined
	} as unknown as PatternGenerationConfig['range'];
	const splits = { tubeSplits: [{ tube: 0, quads: [3] }] };

	it('tiled: a narrowed range does not reject a split valid for the tube', () => {
		const { superConfig, superGlobule } = shortenedGeometry();
		const whole = runPatternGeneration({
			superConfig,
			superGlobule,
			gates,
			genConfig: genConfigFor(
				{ ...tiledPatternConfigs['tiledGridPattern-0'] } as PatternTypeConfig,
				splits
			)
		});
		// Control: the split is valid for the tube and cuts a 4-quad band.
		expect(whole.rejectedSplits).toEqual([]);

		const result = runPatternGeneration({
			superConfig,
			superGlobule,
			gates,
			genConfig: genConfigFor(
				{ ...tiledPatternConfigs['tiledGridPattern-0'] } as PatternTypeConfig,
				splits,
				narrowed
			)
		});
		expect(result.rejectedSplits).toEqual([]);
	});

	it('outlined: a narrowed range does not reject a split valid for the tube', () => {
		const { superConfig, superGlobule } = shortenedGeometry();
		const result = runPatternGeneration({
			superConfig,
			superGlobule,
			gates,
			genConfig: genConfigFor(defaultOutlinedPatternConfig() as PatternTypeConfig, splits, narrowed)
		});
		expect(result.rejectedSplits).toEqual([]);
	});
});

describe('collectSplitRejections', () => {
	const cutPattern = (tubes: { tube: number; quad: number; reason: string }[][]) =>
		({
			type: 'SuperGlobuleProjectionCutPattern',
			superGlobuleConfigId: 'x',
			projectionCutPattern: {
				address: { globule: 0 },
				tubes: tubes.map((rejectedSplits, t) => ({
					projectionType: 'patterned',
					address: { globule: 0, tube: t },
					bands: [],
					...(rejectedSplits.length ? { rejectedSplits } : {})
				}))
			}
		}) as unknown as SuperGlobuleProjectionCutPattern;

	it('reports a split once per tube across pattern variants, sorted by tube then quad', () => {
		const a = cutPattern([
			[
				{ tube: 0, quad: 9, reason: 'out of range for 4 quads' },
				{ tube: 0, quad: 5, reason: 'out of range for 4 quads' }
			],
			[]
		]);
		const b = cutPattern([[{ tube: 0, quad: 9, reason: 'out of range for 4 quads' }], []]);

		expect(collectSplitRejections([a, undefined, null, b])).toEqual([
			{ tube: 0, quad: 5, reason: 'out of range for 4 quads' },
			{ tube: 0, quad: 9, reason: 'out of range for 4 quads' }
		]);
	});

	it('keeps the same quad on different tubes apart', () => {
		const a = cutPattern([
			[{ tube: 0, quad: 9, reason: 'r' }],
			[{ tube: 1, quad: 9, reason: 'r' }]
		]);
		expect(collectSplitRejections([a])).toEqual([
			{ tube: 0, quad: 9, reason: 'r' },
			{ tube: 1, quad: 9, reason: 'r' }
		]);
	});
});
