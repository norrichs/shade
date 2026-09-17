import { beforeAll, describe, it, expect } from '@jest/globals';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig,
	tiledPatternConfigs
} from '$lib/shades-config';
import { runPatternGeneration } from '../run-pattern-generation';
import { isGlobuleAddress_BandPiece } from '$lib/util';
import type { PatternGenerationResult } from '../run-pattern-generation';
import type { PatternGenerationConfig } from '$lib/stores/globulePatternStores';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';
import type {
	BandCutPattern,
	PathSegment,
	PipelineGates,
	Quadrilateral,
	SuperGlobuleConfig,
	TiledPatternConfig,
	TubeCutPattern
} from '$lib/types';

/**
 * shades-guk: the glue invariant — the property pattern splitting exists for.
 * Pieces glued back together must reproduce the unsplit pattern exactly.
 *
 * Real geometry, real (unmocked) `runPatternGeneration`, adjuster included. The
 * default projection's edge curves are sampled at 8 divisions (8 quads per
 * band) instead of 4, so that pieces have interior facets: with 4 quads an
 * equal split leaves two 2-facet pieces whose facets are all ends.
 *
 * Metric. Every piece is re-aligned into its own frame (`alignBands` runs after
 * `splitFlatBands`), so raw coordinates differ from the unsplit run by a rigid
 * motion per piece. Each facet's path is therefore expressed in its OWN quad's
 * frame — origin at `quad.a`, x axis along a→b — and compared with the unsplit
 * parent facet at `parentQuadOffset + f`, expressed in that facet's quad frame.
 * Tolerance 1e-6 (coordinates are pixels, magnitudes ~1e2–1e3).
 *
 * Excluded: each piece's first and last facet. Every piece end is either a seam
 * (matched against the sibling instead of the next facet, by design, spec
 * Section 3) or an original band end (end matching, trimming, skipEdges), so
 * those facets legitimately differ from the parent's.
 *
 * `parentQuadOffset` is computed here from the sibling pieces' facet counts
 * (one facet per quad in tiled output), independently of the code under test.
 */

const gates: PipelineGates = {
	globule: false,
	globuleTube: false,
	projection: true,
	voronoi: false
};

const QUADS_PER_BAND = 8;
const TOLERANCE = 1e-6;

const buildSuperConfig = (quadsPerBand: number): SuperGlobuleConfig => {
	const config = generateDefaultSuperGlobuleConfig();
	for (const projection of config.projectionConfigs) {
		for (const edgeCurve of projection.projectorConfig.polyhedron.edgeCurves) {
			edgeCurve.sampleMethod = { method: 'divideCurvePath', divisions: quadsPerBand };
		}
	}
	return config;
};

type Geometry = {
	superConfig: SuperGlobuleConfig;
	superGlobule: ReturnType<typeof generateSuperGlobule>;
	tubeCount: number;
};

/**
 * One real geometry per quads-per-band count, built on first use. Called only
 * from `beforeAll`, never at describe-collection time, so `-t` filtering skips
 * the cost and a generation error is reported against the test that needed it.
 */
const geometries = new Map<number, Geometry>();
const geometryFor = (quadsPerBand: number): Geometry => {
	let geometry = geometries.get(quadsPerBand);
	if (!geometry) {
		const superConfig = buildSuperConfig(quadsPerBand);
		const superGlobule = generateSuperGlobule(superConfig, gates);
		geometry = { superConfig, superGlobule, tubeCount: superGlobule.projections[0].tubes.length };
		geometries.set(quadsPerBand, geometry);
	}
	return geometry;
};

const withEndsMatched = (config: TiledPatternConfig, endsMatched: boolean): TiledPatternConfig => ({
	...config,
	config: { ...config.config, endsMatched }
});

const shield = tiledPatternConfigs.tiledShieldTesselationPattern;
const patternCases: [string, TiledPatternConfig][] = [
	['Shield, endsMatched on', withEndsMatched(shield, true)],
	['Shield, endsMatched off', withEndsMatched(shield, false)],
	['Hex', tiledPatternConfigs['tiledHexPattern-1']],
	['Box', tiledPatternConfigs['tiledBoxPattern-0']],
	['Carnation 0', tiledPatternConfigs['tiledCarnationPattern-0']],
	['Carnation 1', tiledPatternConfigs['tiledCarnationPattern-1']]
];

const splitAllTubesAt = (geometry: Geometry, quads: number[]) => ({
	tubeSplits: Array.from({ length: geometry.tubeCount }, (_, tube) => ({ tube, quads }))
});

const generate = (
	geometry: Geometry,
	patternTypeConfig: TiledPatternConfig,
	splits?: PatternGenerationConfig['splits']
): TubeCutPattern[] => {
	const { patternConfig } = generateDefaultGlobulePatternConfig();
	const genConfig: PatternGenerationConfig = {
		patternTypeConfig,
		pixelScale: patternConfig.pixelScale,
		showBands: true,
		range: { tubes: undefined, bands: undefined, facets: undefined },
		patternSource: 'projection',
		splits
	};
	const result: PatternGenerationResult = runPatternGeneration({
		superGlobule: geometry.superGlobule,
		superConfig: geometry.superConfig,
		genConfig,
		gates
	});
	const pattern = result.projectionPattern as SuperGlobuleProjectionCutPattern | undefined;
	if (pattern?.type !== 'SuperGlobuleProjectionCutPattern') {
		throw new Error('expected a SuperGlobuleProjectionCutPattern');
	}
	return pattern.projectionCutPattern.tubes;
};

/** Every coordinate pair of a path, expressed in `quad`'s frame. */
const inQuadFrame = (path: PathSegment[], quad: Quadrilateral): number[] => {
	const theta = Math.atan2(quad.b.y - quad.a.y, quad.b.x - quad.a.x);
	const cos = Math.cos(-theta);
	const sin = Math.sin(-theta);
	const local = (x: number, y: number): number[] => {
		const dx = x - quad.a.x;
		const dy = y - quad.a.y;
		return [dx * cos - dy * sin, dx * sin + dy * cos];
	};
	return path.flatMap((seg): number[] => {
		switch (seg[0]) {
			case 'M':
			case 'L':
				return local(seg[1], seg[2]);
			case 'Q':
				return [...local(seg[1], seg[2]), ...local(seg[3], seg[4])];
			case 'C':
				return [...local(seg[1], seg[2]), ...local(seg[3], seg[4]), ...local(seg[5], seg[6])];
			case 'A':
				return [seg[1], seg[2], ...local(seg[6], seg[7])];
			default:
				return [];
		}
	});
};

const quadInOwnFrame = (quad: Quadrilateral): number[] =>
	inQuadFrame(
		(['a', 'b', 'c', 'd'] as const).map((k) => ['L', quad[k].x, quad[k].y] as PathSegment),
		quad
	);

/**
 * Largest coordinate difference. NaN must not slip through (`NaN > x` is false,
 * so a naive max would report 0): NaN on both sides is equal (carnation 0's
 * addenda prototype reads missing indices, identically in both runs), NaN on
 * one side is a mismatch.
 */
const maxDifference = (a: number[], b: number[]) => {
	if (a.length !== b.length) return Infinity;
	return Math.max(
		0,
		...a.map((v, i) => {
			if (Number.isNaN(v) || Number.isNaN(b[i])) {
				return Number.isNaN(v) && Number.isNaN(b[i]) ? 0 : Infinity;
			}
			return Math.abs(v - b[i]);
		})
	);
};

const pieceOf = (b: BandCutPattern) =>
	isGlobuleAddress_BandPiece(b.address) ? b.address.piece : 0;

/**
 * Max deviation of any interior piece facet from its unsplit parent facet, each
 * in its own quad frame, plus how many facets were compared.
 */
const measureGlue = (unsplit: TubeCutPattern[], split: TubeCutPattern[]) => {
	let maxDeviation = 0;
	let maxQuadDeviation = 0;
	let compared = 0;
	let worst = '';
	split.forEach((tube, t) => {
		const bandIndices = [...new Set(tube.bands.map((b) => b.address.band))];
		for (const bandIndex of bandIndices) {
			const parent = unsplit[t].bands.find((b) => b.address.band === bandIndex)!;
			const pieces = tube.bands
				.filter((b) => b.address.band === bandIndex)
				.sort((a, b) => pieceOf(a) - pieceOf(b));
			let offset = 0;
			for (const piece of pieces) {
				for (let f = 1; f < piece.facets.length - 1; f++) {
					const facet = piece.facets[f];
					const parentFacet = parent.facets[offset + f];
					maxQuadDeviation = Math.max(
						maxQuadDeviation,
						maxDifference(quadInOwnFrame(facet.quad!), quadInOwnFrame(parentFacet.quad!))
					);
					const deviation = maxDifference(
						inQuadFrame(facet.path, facet.quad!),
						inQuadFrame(parentFacet.path, parentFacet.quad!)
					);
					compared++;
					if (deviation > maxDeviation) {
						maxDeviation = deviation;
						worst = `t${t}b${bandIndex}p${pieceOf(piece)}f${f}`;
					}
				}
				offset += piece.facets.length;
			}
		}
	});
	return { maxDeviation, maxQuadDeviation, compared, worst };
};

describe('tiled splits reach the adjuster without crashing (real geometry)', () => {
	let geometry: Geometry;
	beforeAll(() => {
		geometry = geometryFor(QUADS_PER_BAND);
	});

	it.each(patternCases)('%s: an unequal split (3 + 5 quads) generates every piece', (_, config) => {
		let tubes: TubeCutPattern[] = [];
		expect(() => {
			tubes = generate(geometry, config, splitAllTubesAt(geometry, [3]));
		}).not.toThrow();
		expect(tubes).toHaveLength(geometry.tubeCount);
		for (const tube of tubes) {
			expect(tube.bands.length).toBeGreaterThan(0);
			for (const band of tube.bands) {
				expect(band.error).toBeUndefined();
				expect(isGlobuleAddress_BandPiece(band.address)).toBe(true);
				expect(band.facets.length).toBeGreaterThan(0);
			}
			const lengths = new Set(tube.bands.map((b) => b.facets.length));
			expect([...lengths].sort()).toEqual([3, 5]);
		}
	});
});

type SplitCase = [string, number[]];

/**
 * Hexparquet cycles three subunits along a band, so a band needs a quad count
 * divisible by 3 and splits must fall on multiples of 3: it runs on its own
 * 12-quads-per-band geometry. [3] gives unequal pieces (3 + 9), [6] equal ones
 * (6 + 6). Its tube-level adjuster snaps each band's left apexes onto the left
 * partner band, which is where splits went wrong (shades final review).
 */
const HEXPARQUET_QUADS_PER_BAND = 12;
const hexparquet = tiledPatternConfigs['tiledHexparquetPattern-0'];
const withColumns = (config: TiledPatternConfig, columnCount: number): TiledPatternConfig => ({
	...config,
	config: { ...config.config, columnCount }
});
const eightQuadSplits: SplitCase[] = [
	['unequal split (3 + 5 quads)', [3]],
	['equal split (4 + 4 quads)', [4]]
];
const hexparquetSplits: SplitCase[] = [
	['unequal split (3 + 9 quads)', [3]],
	['equal split (6 + 6 quads)', [6]]
];
const glueCases: [string, TiledPatternConfig, number, SplitCase[]][] = [
	...patternCases.map(([name, config]): [string, TiledPatternConfig, number, SplitCase[]] => [
		name,
		config,
		QUADS_PER_BAND,
		eightQuadSplits
	]),
	['Hexparquet, 1 column', withColumns(hexparquet, 1), HEXPARQUET_QUADS_PER_BAND, hexparquetSplits],
	['Hexparquet, 2 columns', withColumns(hexparquet, 2), HEXPARQUET_QUADS_PER_BAND, hexparquetSplits]
];

describe('glue invariant: pieces reproduce the unsplit pattern (real geometry)', () => {
	describe.each(glueCases)('%s', (_, config, quadsPerBand, splitCases) => {
		let geometry: Geometry;
		let unsplit: TubeCutPattern[];
		beforeAll(() => {
			geometry = geometryFor(quadsPerBand);
			unsplit = generate(geometry, config);
		});

		it(`has the expected geometry (${quadsPerBand} quads per band, unsplit)`, () => {
			for (const tube of unsplit) {
				for (const band of tube.bands) {
					expect(isGlobuleAddress_BandPiece(band.address)).toBe(false);
					expect(band.error).toBeUndefined();
					expect(band.facets).toHaveLength(quadsPerBand);
				}
			}
		});

		it.each(splitCases)('%s: every interior piece facet matches its parent facet', (__, quads) => {
			const split = generate(geometry, config, splitAllTubesAt(geometry, quads));
			const { maxDeviation, maxQuadDeviation, compared, worst } = measureGlue(unsplit, split);
			// Guards on the metric itself: facets were compared, and the quads are
			// congruent (the partition is rigid before any pattern adjustment).
			expect(compared).toBeGreaterThan(0);
			expect(maxQuadDeviation).toBeLessThan(TOLERANCE);
			expect({ worst, maxDeviation: maxDeviation < TOLERANCE ? 0 : maxDeviation }).toEqual({
				worst,
				maxDeviation: 0
			});
		});
	});
});
