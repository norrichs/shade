import { describe, it, expect } from '@jest/globals';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig,
	tiledPatternConfigs
} from '$lib/shades-config';
import { runPatternGeneration } from '../run-pattern-generation';
import { patterns } from '$lib/patterns/pattern-definitions';
import type { BandCutPattern, PipelineGates, TiledPatternConfig, TubeCutPattern } from '$lib/types';

/**
 * GUARDS (Task 17, from the Task 14 review). Task 14 hands every tube's
 * `adjustAfterTiling` call the same un-copied tiling snapshot, which is only
 * sound if no adjuster mutates its inputs. For every registered adjuster
 * family, the bands and tubes it is handed must be deep-equal before and after
 * each call. These pass at the time of writing: they guard the invariant, they
 * do not reproduce a bug.
 */

const gates: PipelineGates = {
	globule: false,
	globuleTube: false,
	projection: true,
	voronoi: false
};

const superConfig = generateDefaultSuperGlobuleConfig();
const superGlobule = generateSuperGlobule(superConfig, gates);
const tubeCount = superGlobule.projections[0].tubes.length;

const configs = tiledPatternConfigs as Record<string, TiledPatternConfig>;
const withConfig = (
	config: TiledPatternConfig,
	overrides: Partial<TiledPatternConfig['config']>
): TiledPatternConfig => ({ ...config, config: { ...config.config, ...overrides } });

const registered = Object.entries(patterns)
	.filter(([, entry]) => !!entry.adjustAfterTiling)
	.map(([type]) => type)
	.sort();

/** Configurations per family: the default, plus variants exercising more rules. */
const variantsFor = (type: string): [string, TiledPatternConfig][] => {
	const base = configs[type];
	if (!base) throw new Error(`no tiledPatternConfigs entry for registered adjuster ${type}`);
	const variants: [string, TiledPatternConfig][] = [['default', base]];
	if (type === 'tiledShieldTesselationPattern') {
		variants.push([
			'endsMatched, skipEdges all, 2 rows × 2 columns',
			withConfig(base, { endsMatched: true, skipEdges: 'all', rowCount: 2, columnCount: 2 })
		]);
	}
	if (type === 'tiledHexPattern-1') {
		variants.push(['endsTrimmed, 2 rows', withConfig(base, { endsTrimmed: true, rowCount: 2 })]);
	}
	return variants;
};

describe('guard: adjustAfterTiling never mutates its inputs', () => {
	it('fixture: the registered adjuster families', () => {
		expect(registered).toEqual([
			'bandedBranchedPattern-0',
			'tiledBoxPattern-0',
			'tiledCarnationPattern-0',
			'tiledCarnationPattern-1',
			'tiledHexPattern-1',
			'tiledHexparquetPattern-0',
			'tiledShieldTesselationPattern'
		]);
	});

	const cases = registered.flatMap((type) =>
		variantsFor(type).map(([label, config]) => [`${type}: ${label}`, type, config] as const)
	);

	it.each(cases)('%s', (_, type, config) => {
		const entry = patterns[type];
		const original = entry.adjustAfterTiling!;
		const mutated: string[] = [];
		let calls = 0;
		entry.adjustAfterTiling = (
			bands: BandCutPattern[],
			tiledPatternConfig: TiledPatternConfig,
			tubes: TubeCutPattern[]
		) => {
			const before = JSON.stringify({ bands, tubes });
			const result = original(bands, tiledPatternConfig, tubes);
			calls++;
			if (JSON.stringify({ bands, tubes }) !== before) mutated.push(`call ${calls}`);
			return result;
		};
		try {
			const { patternConfig } = generateDefaultGlobulePatternConfig();
			runPatternGeneration({
				superGlobule,
				superConfig,
				genConfig: {
					patternTypeConfig: config,
					pixelScale: patternConfig.pixelScale,
					showBands: true,
					range: { tubes: undefined, bands: undefined, facets: undefined },
					patternSource: 'projection',
					splits: {
						tubeSplits: Array.from({ length: tubeCount }, (_, tube) => ({ tube, quads: [1] }))
					}
				},
				gates
			});
		} catch (error) {
			// Pre-existing and outside this guard: the band-tiled branched pattern
			// crashes in projection post-processing (`facet.path` is not an array of
			// segments), after every adjuster call has returned.
			const knownDownstream =
				type === 'bandedBranchedPattern-0' &&
				error instanceof TypeError &&
				error.message === 'segments.push is not a function';
			if (!knownDownstream) throw error;
		} finally {
			entry.adjustAfterTiling = original;
		}
		expect(calls).toBeGreaterThan(0);
		expect(mutated).toEqual([]);
	});
});
