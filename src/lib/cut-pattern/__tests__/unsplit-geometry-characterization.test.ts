import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createHash } from 'crypto';
import { writeFileSync } from 'fs';
import { generateSuperGlobule } from '#lib/generate-superglobule.js';
import {
	defaultOutlinedPatternConfig,
	generateDefaultGlobulePatternConfig,
	generateDefaultSuperGlobuleConfig,
	tiledPatternConfigs
} from '#lib/shades-config.js';
import { runPatternGeneration } from '../run-pattern-generation';
import { resolveTabLabel } from '../resolve-tab-label';
import type { SuperGlobuleProjectionCutPattern } from '#lib/stores/superGlobuleStores.js';
import type { PatternGenerationConfig } from '#lib/stores/globulePatternStores.js';
import type {
	PatternTypeConfig,
	PipelineGates,
	TabEdgeOption,
	TiledPatternConfig,
	TubeCutPattern
} from '#lib/types.js';

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
 * at c2c0abb, before it. `rest` hashes re-recorded when svgPath strings started
 * being rounded too (three 0.182 -> 0.186 moved their last bits by <1e-12 px);
 * the new values were recorded identically under both three versions. A deliberate unsplit change updates the value here
 * and records the change under "Deliberate unsplit output changes" in the
 * spec amendments. Re-record with `GUARD_RECORD=<file>`, which writes the
 * actual values as JSON instead of only asserting.
 */

const gates: PipelineGates = {
	globuleTube: false,
	projection: true,
	voronoi: false
};

const PRECISION = 1e4;
const roundNumber = (n: number) => Math.round(n * PRECISION) / PRECISION;
// `svgPath` serializes coordinates into a string, which the number branch never
// sees; round those too, or last-bit noise (e.g. a three.js upgrade) flakes the guard.
const round = (key: string, value: unknown) =>
	typeof value === 'number'
		? roundNumber(value)
		: key === 'svgPath' && typeof value === 'string'
			? value.replace(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g, (n) => String(roundNumber(Number(n))))
			: value;
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
		rest: 'af45023d2c752996'
	},
	'tiled tiledGridPattern-0': {
		paths: 'b28fb957d808e003',
		meta: '492a0cbff818b41d',
		rest: '3429053699d61d68'
	},
	'tiled tiledPanelPattern-0': {
		error: "Cannot read properties of undefined (reading 'tubes')"
	},
	'tiled tiledShieldTesselationPattern': {
		paths: 'a637bc0253604303',
		meta: '790b7260abc57ac4',
		rest: 'f62c12b17cbcebec'
	},
	'tiled tiledAsanohaPattern-1': {
		paths: '56898577b87c9e85',
		meta: '492a0cbff818b41d',
		rest: '185b9a01550c6983'
	},
	'tiled tiledHexparquetPattern-0': {
		paths: '282371e2288834a2',
		meta: '254679a5394a9dfb',
		rest: '1513b5345d416630'
	},
	'tiled tiledAsanohaSplitPattern-0': {
		paths: '3acf77b9ad2553f0',
		meta: '492a0cbff818b41d',
		rest: 'd580db70f30d37cd'
	},
	'tiled tiledBoxPattern-0': {
		paths: '18db8164d916dee7',
		meta: '492a0cbff818b41d',
		rest: 'ed0dcb5403171801'
	},
	'tiled tiledBowtiePattern-0': {
		paths: '532254deb8d27d56',
		meta: '492a0cbff818b41d',
		rest: '39bc10ca3ee5ccbe'
	},
	'tiled tiledCarnationPattern-0': {
		paths: 'cd4c857717b83533',
		meta: '492a0cbff818b41d',
		rest: '2f236f5d96dbde17'
	},
	'tiled tiledCarnationPattern-1': {
		paths: 'e5584664f65b59cd',
		meta: '492a0cbff818b41d',
		rest: 'efae29f104b37a02'
	},
	'tiled bandedBranchedPattern-0': {
		error: 'segments.push is not a function'
	},
	'tiled Shield skipEdges none, endsMatched true': {
		paths: '820a5e788d6a4929',
		meta: '790b7260abc57ac4',
		rest: '591be31081803102'
	},
	'tiled Shield skipEdges none, endsMatched false': {
		paths: '68b76d73674e44ba',
		meta: '492a0cbff818b41d',
		rest: 'db957c5f68e54ca7'
	},
	'tiled Shield skipEdges not-first, endsMatched true': {
		paths: '605fa90333390e59',
		meta: '790b7260abc57ac4',
		rest: '1f2fd2502a4b6a5d'
	},
	'tiled Shield skipEdges not-first, endsMatched false': {
		paths: 'b948ac6e8c40a977',
		meta: '492a0cbff818b41d',
		rest: 'fbba5e66035d027c'
	},
	'tiled Shield skipEdges not-last, endsMatched true': {
		paths: 'a637bc0253604303',
		meta: '790b7260abc57ac4',
		rest: 'f62c12b17cbcebec'
	},
	'tiled Shield skipEdges not-last, endsMatched false': {
		paths: '68a1d13541d8108b',
		meta: '492a0cbff818b41d',
		rest: '2e6aec75f2f7b290'
	},
	'tiled Shield skipEdges not-both, endsMatched true': {
		paths: '25e9a7efd113b7ca',
		meta: '790b7260abc57ac4',
		rest: '00868ae953bcd0d4'
	},
	'tiled Shield skipEdges not-both, endsMatched false': {
		paths: '7f1cb819f9209be9',
		meta: '492a0cbff818b41d',
		rest: '6dec9a63d33b2cfc'
	},
	'tiled Shield skipEdges all, endsMatched true': {
		paths: '3ccc3220ab89088e',
		meta: '790b7260abc57ac4',
		rest: '66b6329b270213e9'
	},
	'tiled Shield skipEdges all, endsMatched false': {
		paths: '19425f0388ad1998',
		meta: '492a0cbff818b41d',
		rest: '57441f3339383aaa'
	},
	'tiled Shield 1×2': {
		paths: 'ed558296059f44aa',
		meta: 'ee589b555997ad7d',
		rest: '7ac17ff49bd20894'
	},
	'tiled Shield 2×1': {
		paths: 'f029588d4d7f70cf',
		meta: '320979e09a601135',
		rest: 'ed135b3cd48a34e9'
	},
	'tiled Hex 2×1': {
		paths: '6af0b90ee2d8938e',
		meta: '492a0cbff818b41d',
		rest: '5f530e14964ca4ec'
	},
	'tiled tiledHexPattern-1 1×2': {
		paths: '7f2465688173bdcf',
		meta: '492a0cbff818b41d',
		rest: 'e780b53dc4cc7234'
	},
	'tiled tiledBoxPattern-0 1×2': {
		paths: 'c4d4e6a101ca434e',
		meta: '492a0cbff818b41d',
		rest: 'e85012b274fe101b'
	},
	'tiled tiledCarnationPattern-0 1×2': {
		paths: '3c9e317a5b4162ff',
		meta: '492a0cbff818b41d',
		rest: '4c6c7207d50fc3d2'
	},
	'tiled tiledCarnationPattern-1 1×2': {
		paths: '19ac78abb3a642a4',
		meta: '492a0cbff818b41d',
		rest: 'acf34c85b89248bc'
	},
	'outlined after': {
		tabs: 'aa476785a943ea68',
		rest: 'f502abcf9f6ca229',
		labels: 'a9b67b2586a46371'
	},
	'outlined before': {
		tabs: 'd09a89f6e87c0beb',
		rest: 'e2411342bb0e7aa2',
		labels: '4ee69bb9c146c80d'
	},
	'outlined beforeAndAfter': {
		tabs: 'fd4a15e196bf4713',
		rest: '9374777683ace75b',
		labels: 'a4f88ca146ed83c3'
	}
};
