import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createHash } from 'crypto';
import { writeFileSync } from 'fs';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	defaultOutlinedPatternConfig,
	generateDefaultGlobulePatternConfig,
	generateDefaultSuperGlobuleConfig,
	tiledPatternConfigs
} from '$lib/shades-config';
import { runPatternGeneration } from '../run-pattern-generation';
import { resolveTabLabel } from '../resolve-tab-label';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';
import type { PatternGenerationConfig } from '$lib/stores/globulePatternStores';
import type {
	PatternTypeConfig,
	PipelineGates,
	TabEdgeOption,
	TiledPatternConfig,
	TubeCutPattern
} from '$lib/types';

/**
 * GUARD (final review): unsplit GEOMETRY must not change unnoticed.
 *
 * The Phase 0 snapshot (`tube-pattern-characterization.test.ts`) runs on a
 * synthetic tube and cannot see the tube-level adjusters; the label/CSV guard
 * (`unsplit-labels-csv-characterization.test.ts`) hashes label text only. This
 * guard hashes real output on the default superglobule (30 tubes × 6 bands),
 * unsplit, all bands visible:
 *
 * - tiled, for every registered tiled pattern config plus variants the fix
 *   work touched (Shield skipEdges × endsMatched, Shield 1×2 and 2×1, Hex 2×1,
 *   Hex / Box / Carnation 1×2): every facet path and addenda path, the band
 *   `meta` (partner addresses, partner transforms, debug partner facets), and
 *   the rest of each band (address, bounds, leftPartnerBand, tag anchor …);
 * - outlined, with rectangle tabs on the after, before and beforeAndAfter
 *   edges: the tab geometry itself (every tab field), the rest of each band, and
 *   the resolved tab labels.
 * A config that throws records its error message instead.
 *
 * Numbers are rounded to 1e-4 (pixels, magnitudes ~1e2–1e3) before hashing, so
 * floating-point noise in the last bits cannot flake the guard while any real
 * geometry change (far above 1e-4 px) still moves the hash.
 *
 * Recorded at fbee4c0 (after the hexparquet split fix), and checked identical
 * at c2c0abb, before it. A deliberate unsplit change updates the value here
 * and records the change under "Deliberate unsplit output changes" in the
 * spec amendments. Re-record with `GUARD_RECORD=<file>`, which writes the
 * actual values as JSON instead of only asserting.
 */

const gates: PipelineGates = {
	globule: false,
	globuleTube: false,
	projection: true,
	voronoi: false
};

const PRECISION = 1e4;
const round = (_key: string, value: unknown) =>
	typeof value === 'number' ? Math.round(value * PRECISION) / PRECISION : value;
const sha = (value: unknown) =>
	createHash('sha256')
		.update(JSON.stringify(value, round) ?? 'undefined')
		.digest('hex')
		.slice(0, 16);

const superConfig = generateDefaultSuperGlobuleConfig();
let superGlobule: ReturnType<typeof generateSuperGlobule>;

const generate = (patternTypeConfig: PatternTypeConfig): TubeCutPattern[] => {
	const genConfig: PatternGenerationConfig = {
		patternTypeConfig,
		pixelScale: generateDefaultGlobulePatternConfig().patternConfig.pixelScale,
		showBands: true,
		range: { tubes: undefined, bands: undefined, facets: undefined },
		patternSource: 'projection'
	};
	const result = runPatternGeneration({ superGlobule, superConfig, genConfig, gates });
	return (result.projectionPattern as SuperGlobuleProjectionCutPattern).projectionCutPattern.tubes;
};

const errorOf = (e: unknown) => ({ error: String((e as Error)?.message ?? e).slice(0, 80) });

const withConfig = (
	config: TiledPatternConfig,
	overrides: Partial<TiledPatternConfig['config']>
): TiledPatternConfig => ({ ...config, config: { ...config.config, ...overrides } });

const shield = tiledPatternConfigs.tiledShieldTesselationPattern;
const tiledCases: [string, TiledPatternConfig][] = [
	...Object.entries(tiledPatternConfigs),
	...(['none', 'not-first', 'not-last', 'not-both', 'all'] as const).flatMap((skipEdges) =>
		[true, false].map((endsMatched): [string, TiledPatternConfig] => [
			`Shield skipEdges ${skipEdges}, endsMatched ${endsMatched}`,
			withConfig(shield, { skipEdges, endsMatched })
		])
	),
	['Shield 1×2', withConfig(shield, { rowCount: 1, columnCount: 2 })],
	['Shield 2×1', withConfig(shield, { rowCount: 2, columnCount: 1 })],
	['Hex 2×1', withConfig(tiledPatternConfigs['tiledHexPattern-1'], { rowCount: 2 })],
	...(
		[
			'tiledHexPattern-1',
			'tiledBoxPattern-0',
			'tiledCarnationPattern-0',
			'tiledCarnationPattern-1'
		] as const
	).map((key): [string, TiledPatternConfig] => [
		`${key} 1×2`,
		withConfig(tiledPatternConfigs[key], { columnCount: 2 })
	])
];

const tiledHashes = (tubes: TubeCutPattern[]) => ({
	paths: sha(
		tubes.map((t) =>
			t.bands.map((b) =>
				b.facets.map((f) => [f.path, (f.addenda ?? []).map((a: { path: unknown }) => a.path)])
			)
		)
	),
	meta: sha(tubes.map((t) => t.bands.map((b) => b.meta))),
	rest: sha(
		tubes.map((t) =>
			t.bands.map((b) => {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { facets, meta, ...rest } = b;
				return rest;
			})
		)
	)
});

const outlinedWithTabs = (bandEdge: TabEdgeOption): PatternTypeConfig => {
	const config = defaultOutlinedPatternConfig();
	config.tabConfig = {
		...config.tabConfig!,
		shape: 'rectangle',
		bandEdge,
		bandEnd: 'beforeAndAfter'
	};
	return config;
};

const outlinedHashes = (tubes: TubeCutPattern[]) => ({
	tabs: sha(tubes.map((t) => t.bands.map((b) => b.tabs ?? []))),
	rest: sha(
		tubes.map((t) =>
			t.bands.map((b) => {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { tabs, ...rest } = b;
				return rest;
			})
		)
	),
	labels: sha(
		tubes.flatMap((tube) =>
			tube.bands.flatMap((band) =>
				(band.tabs ?? []).map((tab) => resolveTabLabel(tab, band, tube, tubes))
			)
		)
	)
});

const recorded: Record<string, unknown> = {};
const check = (name: string, actual: unknown) => {
	recorded[name] = actual;
	if (!process.env.GUARD_RECORD) expect(actual).toEqual(EXPECTED[name]);
};

describe('GUARD: unsplit tiled paths and outlined tab geometry are unchanged (real default geometry)', () => {
	beforeAll(() => {
		superGlobule = generateSuperGlobule(superConfig, gates);
	});
	afterAll(() => {
		if (process.env.GUARD_RECORD) {
			writeFileSync(process.env.GUARD_RECORD, JSON.stringify(recorded, null, '\t'));
		}
	});

	it.each(tiledCases)('tiled %s', (name, config) => {
		let actual: unknown;
		try {
			actual = tiledHashes(generate(config));
		} catch (e) {
			actual = errorOf(e);
		}
		check(`tiled ${name}`, actual);
	});

	it.each(['after', 'before', 'beforeAndAfter'] as TabEdgeOption[])(
		'outlined, bandEdge %s',
		(bandEdge) => {
			check(`outlined ${bandEdge}`, outlinedHashes(generate(outlinedWithTabs(bandEdge))));
		}
	);
});

const EXPECTED: Record<string, unknown> = {
	'tiled tiledHexPattern-1': {
		paths: '864d11aa9441b16f',
		meta: '492a0cbff818b41d',
		rest: 'f39fece9802a1f44'
	},
	'tiled tiledGridPattern-0': {
		paths: 'b28fb957d808e003',
		meta: '492a0cbff818b41d',
		rest: '2d9bfeb53eed767c'
	},
	'tiled tiledPanelPattern-0': {
		error: "Cannot read properties of undefined (reading 'tubes')"
	},
	'tiled tiledShieldTesselationPattern': {
		paths: 'a637bc0253604303',
		meta: '790b7260abc57ac4',
		rest: '91dbde406d271d7b'
	},
	'tiled tiledAsanohaPattern-1': {
		paths: '56898577b87c9e85',
		meta: '492a0cbff818b41d',
		rest: 'f8b753da79d486eb'
	},
	'tiled tiledHexparquetPattern-0': {
		paths: '282371e2288834a2',
		meta: '254679a5394a9dfb',
		rest: '1513b5345d416630'
	},
	'tiled tiledBoxPattern-0': {
		paths: '18db8164d916dee7',
		meta: '492a0cbff818b41d',
		rest: '385c45de31f40dcd'
	},
	'tiled tiledBowtiePattern-0': {
		paths: '532254deb8d27d56',
		meta: '492a0cbff818b41d',
		rest: 'ad9cc2c2c8da2404'
	},
	'tiled tiledCarnationPattern-0': {
		paths: 'cd4c857717b83533',
		meta: '492a0cbff818b41d',
		rest: '1de0e387cf1d0833'
	},
	'tiled tiledCarnationPattern-1': {
		paths: 'e5584664f65b59cd',
		meta: '492a0cbff818b41d',
		rest: 'b6ab40d9f4700a5e'
	},
	'tiled bandedBranchedPattern-0': {
		error: 'segments.push is not a function'
	},
	'tiled Shield skipEdges none, endsMatched true': {
		paths: '820a5e788d6a4929',
		meta: '790b7260abc57ac4',
		rest: 'f02204244653e0fa'
	},
	'tiled Shield skipEdges none, endsMatched false': {
		paths: '68b76d73674e44ba',
		meta: '492a0cbff818b41d',
		rest: '87166eae8bb3ea32'
	},
	'tiled Shield skipEdges not-first, endsMatched true': {
		paths: '605fa90333390e59',
		meta: '790b7260abc57ac4',
		rest: '5568f3016adacab6'
	},
	'tiled Shield skipEdges not-first, endsMatched false': {
		paths: 'b948ac6e8c40a977',
		meta: '492a0cbff818b41d',
		rest: '68e294b9b9195e48'
	},
	'tiled Shield skipEdges not-last, endsMatched true': {
		paths: 'a637bc0253604303',
		meta: '790b7260abc57ac4',
		rest: '91dbde406d271d7b'
	},
	'tiled Shield skipEdges not-last, endsMatched false': {
		paths: '68a1d13541d8108b',
		meta: '492a0cbff818b41d',
		rest: '5ab3ba5c45f8c064'
	},
	'tiled Shield skipEdges not-both, endsMatched true': {
		paths: '25e9a7efd113b7ca',
		meta: '790b7260abc57ac4',
		rest: 'bce76dbb299b5d11'
	},
	'tiled Shield skipEdges not-both, endsMatched false': {
		paths: '7f1cb819f9209be9',
		meta: '492a0cbff818b41d',
		rest: 'f9c7b24172cca877'
	},
	'tiled Shield skipEdges all, endsMatched true': {
		paths: '3ccc3220ab89088e',
		meta: '790b7260abc57ac4',
		rest: '3c0d87f40b0db4e2'
	},
	'tiled Shield skipEdges all, endsMatched false': {
		paths: '19425f0388ad1998',
		meta: '492a0cbff818b41d',
		rest: '9b5434e044821d4b'
	},
	'tiled Shield 1×2': {
		paths: 'ed558296059f44aa',
		meta: 'ee589b555997ad7d',
		rest: '44b7230a34d153ca'
	},
	'tiled Shield 2×1': {
		paths: 'f029588d4d7f70cf',
		meta: '320979e09a601135',
		rest: 'ce3d7f9f002cc699'
	},
	'tiled Hex 2×1': {
		paths: '6af0b90ee2d8938e',
		meta: '492a0cbff818b41d',
		rest: '2d8b7573182645a4'
	},
	'tiled tiledHexPattern-1 1×2': {
		paths: '7f2465688173bdcf',
		meta: '492a0cbff818b41d',
		rest: '6bd0804aafc0da01'
	},
	'tiled tiledBoxPattern-0 1×2': {
		paths: 'c4d4e6a101ca434e',
		meta: '492a0cbff818b41d',
		rest: 'd074faf80dd3c0a2'
	},
	'tiled tiledCarnationPattern-0 1×2': {
		paths: '3c9e317a5b4162ff',
		meta: '492a0cbff818b41d',
		rest: '902d3a154236073f'
	},
	'tiled tiledCarnationPattern-1 1×2': {
		paths: '19ac78abb3a642a4',
		meta: '492a0cbff818b41d',
		rest: 'b9b8ea4f9a86d99d'
	},
	'outlined after': {
		tabs: 'aa476785a943ea68',
		rest: '311a64dbd18d7f2c',
		labels: 'a9b67b2586a46371'
	},
	'outlined before': {
		tabs: 'd09a89f6e87c0beb',
		rest: '1c9be18819ccff15',
		labels: '4ee69bb9c146c80d'
	},
	'outlined beforeAndAfter': {
		tabs: 'fd4a15e196bf4713',
		rest: 'c57c9c507880c4a1',
		labels: 'a4f88ca146ed83c3'
	}
};
