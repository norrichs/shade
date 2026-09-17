import { describe, it, expect } from '@jest/globals';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig,
	tiledPatternConfigs
} from '$lib/shades-config';
import { runPatternGeneration } from '../run-pattern-generation';
import { isGlobuleAddress_BandPiece } from '$lib/util';
import { defaultShieldSpec } from '$lib/patterns/tesselation/shield';
import { defaultHexSpec } from '$lib/patterns/tesselation/hex';
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
 * Task 11: a piece one quad long has ONE facet, so its start and its end live
 * on the same facet. Before the fix the adjuster only ran the start branch for
 * that facet: the piece's end was never matched (a seam end got no glue
 * overlap) and, with `endsTrimmed`, the end group was removed at indices that
 * the start removal had already shifted.
 *
 * Real geometry (default super globule, 4 quads per band), real unmocked
 * `runPatternGeneration`. Every tube is split at the same quads, so every tube
 * has 1-quad pieces: [1] gives 1 + 3 (seam at the 1-quad piece's end), [3]
 * gives 3 + 1 (outer end on the 1-quad piece), [1, 2] gives 1 + 1 + 2 (a middle
 * 1-quad piece with a seam at both ends).
 *
 * End-match metric, independent of the stored transforms and of the resolver.
 * A band end and the partner end joining it share one physical edge:
 * - this band's start edge is quad b→a, its end edge quad d→c;
 * - the partner's start edge is quad a→b, its end edge quad c→d;
 * so the partner edge maps onto this band's edge endpoint for endpoint (the
 * same correspondence the Task 8 hidden-band test checks for transforms).
 * Expressing each path in a frame on its own edge (origin at the first
 * endpoint, x along the edge) makes the two directly comparable. End matching
 * snaps this end's partner TARGET vertices onto the partner's SOURCE vertices
 * (spec `adjustments.partner`: the target list is picked by this end, the
 * source list by the partner's joining end), so each pair must coincide.
 *
 * Partners are found without the code under test: a seam partner is the
 * adjacent sibling piece (same tube and band, piece ± 1); an outer partner and
 * its joining end come from an unsplit run's meta, where no piece resolution is
 * involved (all bands visible, so pattern and real band indices coincide).
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

const withConfig = (
	config: TiledPatternConfig,
	overrides: Partial<TiledPatternConfig['config']>
): TiledPatternConfig => ({ ...config, config: { ...config.config, ...overrides } });

const splitAllTubesAt = (quads: number[]) => ({
	tubeSplits: Array.from({ length: tubeCount }, (_, tube) => ({ tube, quads }))
});

const generate = (
	patternTypeConfig: TiledPatternConfig,
	splits?: PatternGenerationConfig['splits']
): TubeCutPattern[] => {
	const { patternConfig } = generateDefaultGlobulePatternConfig();
	const result = runPatternGeneration({
		superGlobule,
		superConfig,
		genConfig: {
			patternTypeConfig,
			pixelScale: patternConfig.pixelScale,
			showBands: true,
			range: { tubes: undefined, bands: undefined, facets: undefined },
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

const pieceOf = (b: BandCutPattern) =>
	isGlobuleAddress_BandPiece(b.address) ? b.address.piece : 0;

const partsOf = (tube: TubeCutPattern, band: number) =>
	tube.bands.filter((b) => b.address.band === band).sort((a, b) => pieceOf(a) - pieceOf(b));

const endFacet = (band: BandCutPattern, end: End) =>
	end === 'start' ? band.facets[0] : band.facets[band.facets.length - 1];

/** The end's edge as it is ordered when this band is the asker. */
const askerEdge = (band: BandCutPattern, end: End): [P, P] => {
	const q = endFacet(band, end).quad!;
	return end === 'start' ? [q.b, q.a] : [q.d, q.c];
};

/** The end's edge as it is ordered when this band is the partner. */
const partnerEdge = (band: BandCutPattern, end: End): [P, P] => {
	const q = endFacet(band, end).quad!;
	return end === 'start' ? [q.a, q.b] : [q.c, q.d];
};

/** A path vertex (the segment's end point) in a frame on `edge`. */
const vertexInEdgeFrame = (seg: PathSegment, [o, e]: [P, P]): P => {
	const theta = Math.atan2(e.y - o.y, e.x - o.x);
	const [cos, sin] = [Math.cos(-theta), Math.sin(-theta)];
	const [x, y] = [seg[1] as number, seg[2] as number];
	const [dx, dy] = [x - o.x, y - o.y];
	return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
};

type Joined = { partner: BandCutPattern; partnerEnd: End; kind: 'seam' | 'outer' };

const unsplitShield = generate(tiledPatternConfigs.tiledShieldTesselationPattern);

const partnerOf = (tubes: TubeCutPattern[], t: number, band: BandCutPattern, end: End) => {
	const parts = partsOf(tubes[t], band.address.band);
	const index = parts.indexOf(band);
	const siblingIndex = end === 'start' ? index - 1 : index + 1;
	if (siblingIndex >= 0 && siblingIndex < parts.length) {
		return {
			partner: parts[siblingIndex],
			partnerEnd: end === 'start' ? 'end' : 'start',
			kind: 'seam'
		} as Joined;
	}
	const truth = unsplitShield[t].bands.find((b) => b.address.band === band.address.band)!;
	const address = truth.meta?.[`${end}PartnerBand`];
	if (!address) return undefined;
	const partnerTruth = unsplitShield[address.tube].bands.find(
		(b) => b.address.band === address.band
	)!;
	const joinsAtStart =
		partnerTruth.meta?.startPartnerBand?.tube === t &&
		partnerTruth.meta.startPartnerBand.band === band.address.band;
	const partnerParts = partsOf(tubes[address.tube], address.band);
	return joinsAtStart
		? ({ partner: partnerParts[0], partnerEnd: 'start', kind: 'outer' } as Joined)
		: ({
				partner: partnerParts[partnerParts.length - 1],
				partnerEnd: 'end',
				kind: 'outer'
			} as Joined);
};

const pairsFor = (end: End) =>
	end === 'start'
		? defaultShieldSpec.adjustments.partner.startEnd
		: defaultShieldSpec.adjustments.partner.endEnd;

/**
 * Every band end with a partner, judged by the end-match metric. Returns the
 * failures and how many ends of one-facet pieces were judged, by kind.
 */
const judgeEndMatching = (tubes: TubeCutPattern[]) => {
	const failures: string[] = [];
	const singleFacetEnds = { seam: 0, outer: 0 };
	let judged = 0;
	tubes.forEach((tube, t) => {
		for (const band of tube.bands) {
			for (const end of ['start', 'end'] as End[]) {
				const joined = partnerOf(tubes, t, band, end);
				if (!joined) continue;
				const { partner, partnerEnd, kind } = joined;
				const targets = pairsFor(end).map((p) => p.target);
				const sources = pairsFor(partnerEnd).map((p) => p.source);
				const ownPath = endFacet(band, end).path;
				const partnerPath = endFacet(partner, partnerEnd).path;
				const ownFrame = askerEdge(band, end);
				const partnerFrame = partnerEdge(partner, partnerEnd);
				const deviation = Math.max(
					...targets.map((target, i) => {
						const a = vertexInEdgeFrame(ownPath[target], ownFrame);
						const b = vertexInEdgeFrame(partnerPath[sources[i]], partnerFrame);
						return Math.hypot(a.x - b.x, a.y - b.y);
					})
				);
				judged++;
				if (band.facets.length === 1) singleFacetEnds[kind]++;
				if (!(deviation < TOLERANCE)) {
					failures.push(
						`t${t} b${band.address.band} p${pieceOf(band)} (${band.facets.length} facet) ${end} ` +
							`vs ${kind} partner's ${partnerEnd}: ${deviation.toFixed(3)}px`
					);
				}
			}
		}
	});
	return { failures, singleFacetEnds, judged };
};

describe('one-facet pieces: both ends are end matched (Shield, real geometry)', () => {
	const shield = tiledPatternConfigs.tiledShieldTesselationPattern;
	const configs: [string, TiledPatternConfig][] = [
		['endsTrimmed on', withConfig(shield, { endsMatched: true, endsTrimmed: true })],
		['endsTrimmed off', withConfig(shield, { endsMatched: true, endsTrimmed: false })]
	];
	const splitCases: [string, number[], number[]][] = [
		['split at 1 (1 + 3): seam at the 1-quad piece’s end', [1], [1, 3]],
		['split at 3 (3 + 1): outer end on the 1-quad piece', [3], [3, 1]],
		['split at 1 and 2 (1 + 1 + 2): seams at both ends', [1, 2], [1, 1, 2]]
	];

	it('unsplit, every end is matched (the metric holds without splits)', () => {
		const { failures, judged } = judgeEndMatching(unsplitShield);
		expect(failures).toEqual([]);
		expect(judged).toBeGreaterThan(100);
	});

	describe.each(configs)('%s', (_, config) => {
		it.each(splitCases)('%s', (__, quads, expectedLengths) => {
			const tubes = generate(config, splitAllTubesAt(quads));
			// Fixture guard: every tube really has the unequal pieces named.
			for (const tube of tubes) {
				expect(partsOf(tube, 0).map((b) => b.facets.length)).toEqual(expectedLengths);
			}
			const { failures, singleFacetEnds, judged } = judgeEndMatching(tubes);
			expect(failures).toEqual([]);
			// Guards against a vacuous pass: one-facet seam ends were judged, and
			// (except where both ends are seams) one-facet outer ends too.
			expect(judged).toBeGreaterThan(100);
			expect(singleFacetEnds.seam).toBeGreaterThan(0);
			if (quads.length === 1) expect(singleFacetEnds.outer).toBeGreaterThan(0);
		});
	});
});

describe('one-facet pieces: endsTrimmed removes both end groups (Hex, real geometry)', () => {
	// Hex opts in to trimming (`trimsEnds`), has no partner pairs, and every
	// facet path is [start, middle, end, lastColumn]. The oracle: the trimmed
	// run's facet equals the untrimmed run's facet with the start group removed
	// from the first facet and the end group removed from the last — both from
	// the same facet when there is only one.
	const hex = tiledPatternConfigs['tiledHexPattern-1'];
	const { start, middle, end } = defaultHexSpec.unit;
	const startIndices = start.map((_, i) => i);
	const endIndices = end.map((_, i) => start.length + middle.length + i);

	it.each([
		['split at 1 (1 + 3)', [1]],
		['split at 3 (3 + 1)', [3]],
		['split at 1 and 2 (1 + 1 + 2)', [1, 2]]
	])('%s', (_, quads) => {
		expect(hex.config.rowCount).toBe(1);
		expect(hex.config.columnCount).toBe(1);
		const trimmed = generate(withConfig(hex, { endsTrimmed: true }), splitAllTubesAt(quads));
		const untrimmed = generate(withConfig(hex, { endsTrimmed: false }), splitAllTubesAt(quads));
		const failures: string[] = [];
		let singleFacetBands = 0;
		trimmed.forEach((tube, t) => {
			tube.bands.forEach((band, b) => {
				const reference = untrimmed[t].bands[b];
				if (band.facets.length === 1) singleFacetBands++;
				band.facets.forEach((facet, f) => {
					const removed = new Set([
						...(f === 0 ? startIndices : []),
						...(f === band.facets.length - 1 ? endIndices : [])
					]);
					const expected = reference.facets[f].path.filter((_, i) => !removed.has(i));
					if (JSON.stringify(facet.path) !== JSON.stringify(expected)) {
						failures.push(`t${t} b${band.address.band} p${pieceOf(band)} f${f}`);
					}
				});
			});
		});
		expect(failures).toEqual([]);
		expect(singleFacetBands).toBeGreaterThan(0);
	});
});
