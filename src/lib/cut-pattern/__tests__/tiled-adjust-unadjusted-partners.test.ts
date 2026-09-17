import { describe, it, expect, afterAll } from '@jest/globals';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig,
	tiledPatternConfigs
} from '$lib/shades-config';
import { runPatternGeneration } from '../run-pattern-generation';
import { generateProjectionPattern } from '../generate-pattern';
import { patterns } from '$lib/patterns/pattern-definitions';
import { isGlobuleAddress_BandPiece } from '$lib/util';
import { defaultShieldSpec } from '$lib/patterns/tesselation/shield';
import { evaluateSkipEdge, retarget } from '$lib/patterns/tesselation/shared/helpers';
import type { PatternGenerationConfig } from '$lib/stores/globulePatternStores';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';
import type {
	BandCutPattern,
	PathSegment,
	PipelineGates,
	TiledPatternConfig,
	TubeCutPattern
} from '$lib/types';

/**
 * Task 14: the adjust-after-tiling pass must read every partner from the same,
 * unadjusted tiling. Before the fix `generateProjectionPattern` replaced each
 * tube's patterns with the adjusted ones as it went, so tube t read partners in
 * tubes s < t AFTER their adjustment (including `skipRemove` removals that
 * shorten the path and shift every later index) and partners in tubes s > t
 * before it. Shield with `skipEdges: 'all'` and `endsMatched` crashed; every
 * other end-matched config depended on tube order.
 *
 * Unadjusted is the reference because it is what every other read in the
 * adjuster already uses: within-band (`nextPath`), across-band
 * (`prevBandPaths`) and same-tube partners (seam siblings, tube t's own
 * patterns) are all read from the input tiling, never from `newBands`.
 */

const gates: PipelineGates = {
	globule: false,
	globuleTube: false,
	projection: true,
	voronoi: false
};

type P = { x: number; y: number };
type End = 'start' | 'end';

const TOLERANCE = 1e-6;

const superConfig = generateDefaultSuperGlobuleConfig();
const superGlobule = generateSuperGlobule(superConfig, gates);
const tubeCount = superGlobule.projections[0].tubes.length;

const shield = tiledPatternConfigs.tiledShieldTesselationPattern;
const withConfig = (
	config: TiledPatternConfig,
	overrides: Partial<TiledPatternConfig['config']>
): TiledPatternConfig => ({ ...config, config: { ...config.config, ...overrides } });
const shieldSkipAll = withConfig(shield, { endsMatched: true, skipEdges: 'all' });

const splitAllTubesAt = (quads: number[]) => ({
	tubeSplits: Array.from({ length: tubeCount }, (_, tube) => ({ tube, quads }))
});

const generate = (
	patternTypeConfig: TiledPatternConfig,
	splits?: PatternGenerationConfig['splits'],
	tubes?: number
): TubeCutPattern[] => {
	const { patternConfig } = generateDefaultGlobulePatternConfig();
	const result = runPatternGeneration({
		superGlobule,
		superConfig,
		genConfig: {
			patternTypeConfig,
			pixelScale: patternConfig.pixelScale,
			showBands: true,
			range: { tubes, bands: undefined, facets: undefined },
			patternSource: 'projection',
			splits
		},
		gates
	});
	const pattern = result.projectionPattern as SuperGlobuleProjectionCutPattern | undefined;
	if (pattern?.type !== 'SuperGlobuleProjectionCutPattern') {
		throw new Error('expected a SuperGlobuleProjectionCutPattern');
	}
	return pattern.projectionCutPattern.tubes;
};

describe('adjust after tiling: every tube reads the same unadjusted partners', () => {
	const PATTERN_ID = 'test-task14-order-probe';
	afterAll(() => {
		delete patterns[PATTERN_ID];
	});

	it('each adjuster call sees the tubes exactly as tiled, whatever ran before it', () => {
		// The probe adjuster records what it is handed and returns visibly
		// different bands (every coordinate moved). If a later call sees an
		// earlier call's output, the recorded states differ.
		const seen: string[] = [];
		const pathsOf = (tubes: (TubeCutPattern | undefined)[]) =>
			JSON.stringify(tubes.map((tp) => tp?.bands.map((b) => b.facets.map((f) => f.path))));
		patterns[PATTERN_ID] = {
			getPattern: () =>
				[
					['M', 0, 0],
					['L', 1, 1]
				] as PathSegment[],
			adjustAfterTiling: (bands: BandCutPattern[], _config: unknown, tubes: TubeCutPattern[]) => {
				seen.push(pathsOf(tubes));
				return bands.map((band) => ({
					...band,
					facets: band.facets.map((facet) => ({
						...facet,
						path: facet.path.map((seg) =>
							seg[0] === 'M' || seg[0] === 'L'
								? ([seg[0], seg[1] + 1000, seg[2]] as PathSegment)
								: seg
						)
					}))
				}));
			},
			adjustAfterTilingNeedsEndPartners: false
		};
		const patternConfig = generateDefaultGlobulePatternConfig();
		patternConfig.patternTypeConfig = { ...shield, type: PATTERN_ID } as TiledPatternConfig;
		const result = generateProjectionPattern(
			superGlobule.projections[0].tubes,
			'super-1',
			patternConfig,
			{ tubes: undefined, bands: undefined, facets: undefined }
		);

		expect(seen.length).toBe(tubeCount);
		expect(seen.length).toBeGreaterThan(1);
		const different = seen.flatMap((state, t) => (state === seen[0] ? [] : [t]));
		expect(different).toEqual([]);
		// The probe's adjustment did reach the output (the loop still assembles results).
		const out = result as SuperGlobuleProjectionCutPattern;
		const firstSeg = out.projectionCutPattern.tubes[0].bands[0].facets[0].path[0];
		const tiledFirstSeg = JSON.parse(seen[0])[0][0][0][0];
		expect(firstSeg[1]).toBeCloseTo(tiledFirstSeg[1] + 1000, 6);
	});

	// Real geometry: tube t generated alone (range = t; its partner tubes are
	// tiled as unadjusted stubs) must equal tube t of the full run, where every
	// other tube is adjusted too. Before the fix the full run's tube t read its
	// earlier-tube partner already adjusted, so this failed for every t > 0.
	describe.each([
		['Shield default (skipEdges not-last)', shield],
		['Shield skipEdges all', shieldSkipAll],
		[
			'Shield skipEdges not-first, 2 rows × 2 columns',
			withConfig(shield, { skipEdges: 'not-first', rowCount: 2, columnCount: 2 })
		]
	])('%s: tube output is independent of the other tubes’ adjustment', (_, config) => {
		it.each([
			['unsplit', []],
			['split at 1 (1 + 3)', [1]]
		])('%s', (__, quads) => {
			const splits = splitAllTubesAt(quads);
			const full = generate(config, splits);
			const probeTubes = [1, Math.floor(tubeCount / 2), tubeCount - 1];
			const different = probeTubes.filter((t) => {
				const alone = generate(config, splits, t);
				expect(alone.length).toBe(1);
				return JSON.stringify(alone[0]) !== JSON.stringify(full[t]);
			});
			expect(different).toEqual([]);
		});
	});
});

// ---------------------------------------------------------------------------
// Removals that precede the partner source indices (Shield `skipEdges`).
// ---------------------------------------------------------------------------

const pieceOf = (b: BandCutPattern) =>
	isGlobuleAddress_BandPiece(b.address) ? b.address.piece : 0;

const partsOf = (tube: TubeCutPattern, band: number) =>
	tube.bands.filter((b) => b.address.band === band).sort((a, b) => pieceOf(a) - pieceOf(b));

const endFacetIndex = (band: BandCutPattern, end: End) =>
	end === 'start' ? 0 : band.facets.length - 1;

const askerEdge = (band: BandCutPattern, end: End): [P, P] => {
	const q = band.facets[endFacetIndex(band, end)].quad!;
	return end === 'start' ? [q.b, q.a] : [q.d, q.c];
};

const partnerEdge = (band: BandCutPattern, end: End): [P, P] => {
	const q = band.facets[endFacetIndex(band, end)].quad!;
	return end === 'start' ? [q.a, q.b] : [q.c, q.d];
};

const vertexInEdgeFrame = (seg: PathSegment, [o, e]: [P, P]): P => {
	const theta = Math.atan2(e.y - o.y, e.x - o.x);
	const [cos, sin] = [Math.cos(-theta), Math.sin(-theta)];
	const [dx, dy] = [(seg[1] as number) - o.x, (seg[2] as number) - o.y];
	return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
};

describe('Shield skipEdges + endsMatched: ends snap to the partner’s true vertices', () => {
	// Partner identities (not geometry) from the default config's unsplit run:
	// skipEdges, rows and columns do not change which bands meet.
	const unsplitTruth = generate(shield);

	const partnerOf = (tubes: TubeCutPattern[], t: number, band: BandCutPattern, end: End) => {
		const parts = partsOf(tubes[t], band.address.band);
		const index = parts.indexOf(band);
		const siblingIndex = end === 'start' ? index - 1 : index + 1;
		if (siblingIndex >= 0 && siblingIndex < parts.length) {
			return {
				partner: parts[siblingIndex],
				partnerEnd: (end === 'start' ? 'end' : 'start') as End
			};
		}
		const truth = unsplitTruth[t].bands.find((b) => b.address.band === band.address.band)!;
		const address = truth.meta?.[`${end}PartnerBand`];
		if (!address) return undefined;
		const partnerTruth = unsplitTruth[address.tube].bands.find(
			(b) => b.address.band === address.band
		)!;
		const joinsAtStart =
			partnerTruth.meta?.startPartnerBand?.tube === t &&
			partnerTruth.meta.startPartnerBand.band === band.address.band;
		const partnerParts = partsOf(tubes[address.tube], address.band);
		return joinsAtStart
			? { partner: partnerParts[0], partnerEnd: 'start' as End }
			: { partner: partnerParts[partnerParts.length - 1], partnerEnd: 'end' as End };
	};

	it('fixture: shield trims nothing and skipRemove precedes the end-group partner indices', () => {
		expect(defaultShieldSpec.adjustments.trimsEnds).toBeFalsy();
		const firstRemoved = Math.min(...defaultShieldSpec.adjustments.skipRemove);
		const endSources = defaultShieldSpec.adjustments.partner.endEnd.map((p) => p.source);
		expect(Math.min(...endSources)).toBeGreaterThan(firstRemoved);
	});

	type Case = [string, Partial<TiledPatternConfig['config']>, number[] | undefined, number[]];
	const cases: Case[] = [
		// Before the fix these threw: the partner path was already shortened.
		['skipEdges all, unsplit', { skipEdges: 'all' }, undefined, [4]],
		['skipEdges all, split at 1 (1 + 3)', { skipEdges: 'all' }, [1], [1, 3]],
		['skipEdges all, split at 3 (3 + 1)', { skipEdges: 'all' }, [3], [3, 1]],
		// Before the fix these did NOT throw: ends silently snapped onto shifted
		// vertices of already-adjusted partners in earlier tubes.
		[
			'skipEdges not-first, 2 rows × 2 columns, unsplit',
			{ skipEdges: 'not-first', rowCount: 2, columnCount: 2 },
			undefined,
			[4]
		],
		[
			'skipEdges not-first, 2 rows × 2 columns, split at 1 (1 + 3)',
			{ skipEdges: 'not-first', rowCount: 2, columnCount: 2 },
			[1],
			[1, 3]
		]
	];

	it.each(cases)('%s', (_, overrides, quads, expectedLengths) => {
		const config = withConfig(shield, { endsMatched: true, ...overrides });
		const { rowCount: rows = 1, columnCount: columns = 1, skipEdges = 'none' } = config.config;
		const { start, middle, end: endUnit } = defaultShieldSpec.unit;
		// Spec indices expand per row/column exactly as the spec defines them.
		const expand = (indices: number[]) =>
			retarget(indices, rows, columns, start.length, middle.length, endUnit.length);
		const removedAt = (band: BandCutPattern, facet: number) =>
			evaluateSkipEdge(skipEdges, facet, band.facets.length - 1)
				? expand(defaultShieldSpec.adjustments.skipRemove)
				: [];
		/** Where a pre-removal index sits in the final path, or undefined if removed. */
		const finalIndex = (band: BandCutPattern, facet: number, index: number) => {
			const removed = removedAt(band, facet);
			if (removed.includes(index)) return undefined;
			return index - removed.filter((r) => r < index).length;
		};
		const pairsFor = (end: End) =>
			end === 'start'
				? defaultShieldSpec.adjustments.partner.startEnd
				: defaultShieldSpec.adjustments.partner.endEnd;

		const tubes = generate(config, quads ? splitAllTubesAt(quads) : undefined);
		// Fixture guard: every tube really has the (unequal) pieces named.
		for (const tube of tubes) {
			expect(partsOf(tube, 0).map((b) => b.facets.length)).toEqual(expectedLengths);
		}
		const failures: string[] = [];
		let judged = 0;
		let shiftedSources = 0;
		tubes.forEach((tube, t) => {
			for (const band of tube.bands) {
				for (const end of ['start', 'end'] as End[]) {
					const joined = partnerOf(tubes, t, band, end);
					if (!joined) continue;
					const { partner, partnerEnd } = joined;
					const ownF = endFacetIndex(band, end);
					const partnerF = endFacetIndex(partner, partnerEnd);
					const ownPath = band.facets[ownF].path;
					const partnerPath = partner.facets[partnerF].path;
					const targets = expand(pairsFor(end).map((p) => p.target));
					const sources = expand(pairsFor(partnerEnd).map((p) => p.source));
					expect(targets.length).toBe(sources.length);
					let deviation = 0;
					targets.forEach((target, i) => {
						const ti = finalIndex(band, ownF, target);
						const si = finalIndex(partner, partnerF, sources[i]);
						if (ti === undefined || si === undefined) return;
						if (si !== sources[i]) shiftedSources++;
						const a = vertexInEdgeFrame(ownPath[ti], askerEdge(band, end));
						const b = vertexInEdgeFrame(partnerPath[si], partnerEdge(partner, partnerEnd));
						deviation = Math.max(deviation, Math.hypot(a.x - b.x, a.y - b.y));
					});
					judged++;
					if (!(deviation < TOLERANCE)) {
						failures.push(
							`t${t} b${band.address.band} p${pieceOf(band)} ${end} vs partner ${partnerEnd}: ${deviation.toFixed(3)}px`
						);
					}
				}
			}
		});
		expect(failures).toEqual([]);
		expect(judged).toBeGreaterThan(100);
		// The removal-shifted case really was judged: partner sources that sit
		// after removed indices in the partner's final path.
		expect(shiftedSources).toBeGreaterThan(0);
	});
});
