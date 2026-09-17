import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	generateDefaultGlobulePatternConfig,
	generateDefaultSuperGlobuleConfig
} from '$lib/shades-config';
import { isGlobuleAddress_BandPiece } from '$lib/util';
import { runPatternGeneration } from '../../run-pattern-generation';
import type { PatternGenerationConfig } from '$lib/stores/globulePatternStores';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';
import type {
	BandCutPattern,
	PathSegment,
	PatternTypeConfig,
	PipelineGates,
	SuperGlobuleConfig,
	TubeCutPattern
} from '$lib/types';

/**
 * Shared setup and end-match oracle for the real-geometry pattern tests.
 *
 * Not a test file (no `.test.ts`). Build geometry from `beforeAll`, never at
 * describe-collection time, so `-t` filtering skips the cost and a generation
 * error is reported against the tests that needed it.
 */

export const projectionGates: PipelineGates = {
	globule: false,
	globuleTube: false,
	projection: true,
	voronoi: false
};

export type P = { x: number; y: number };
export type End = 'start' | 'end';

export type RealGeometry = {
	superConfig: SuperGlobuleConfig;
	superGlobule: ReturnType<typeof generateSuperGlobule>;
	tubeCount: number;
};

/** The default superglobule (30 tubes × 6 bands, 4 quads per band), generated. */
export const buildDefaultGeometry = (
	superConfig: SuperGlobuleConfig = generateDefaultSuperGlobuleConfig()
): RealGeometry => {
	const superGlobule = generateSuperGlobule(superConfig, projectionGates);
	return { superConfig, superGlobule, tubeCount: superGlobule.projections[0].tubes.length };
};

/** Splits every tube of `geometry` at the same quads. */
export const splitAllTubesAt = (geometry: RealGeometry, quads: number[]) => ({
	tubeSplits: Array.from({ length: geometry.tubeCount }, (_, tube) => ({ tube, quads }))
});

/**
 * Real, unmocked `runPatternGeneration` on the projection source. `tubes`
 * narrows the tube range (undefined: every tube).
 */
export const generateProjectionTubes = (
	geometry: RealGeometry,
	patternTypeConfig: PatternTypeConfig,
	splits?: PatternGenerationConfig['splits'],
	tubes?: number
): TubeCutPattern[] => {
	const { patternConfig } = generateDefaultGlobulePatternConfig();
	const result = runPatternGeneration({
		superGlobule: geometry.superGlobule,
		superConfig: geometry.superConfig,
		genConfig: {
			patternTypeConfig,
			pixelScale: patternConfig.pixelScale,
			showBands: true,
			range: { tubes, bands: undefined, facets: undefined },
			patternSource: 'projection',
			splits
		},
		gates: projectionGates
	});
	const pattern = result.projectionPattern as SuperGlobuleProjectionCutPattern | undefined;
	if (pattern?.type !== 'SuperGlobuleProjectionCutPattern') {
		throw new Error('expected a SuperGlobuleProjectionCutPattern');
	}
	return pattern.projectionCutPattern.tubes;
};

export const pieceOf = (b: BandCutPattern) =>
	isGlobuleAddress_BandPiece(b.address) ? b.address.piece : 0;

/** A parent band's parts in `tube`: the band itself, or its pieces in order. */
export const partsOf = (tube: TubeCutPattern, band: number) =>
	tube.bands.filter((b) => b.address.band === band).sort((a, b) => pieceOf(a) - pieceOf(b));

export const endFacetIndex = (band: BandCutPattern, end: End) =>
	end === 'start' ? 0 : band.facets.length - 1;

/**
 * End-match edges. A band end and the partner end joining it share one
 * physical edge: this band's start edge is quad b→a, its end edge quad d→c;
 * the partner's start edge is quad a→b, its end edge quad c→d. So the partner
 * edge maps onto this band's edge endpoint for endpoint.
 */
/** The end's edge as it is ordered when this band is the asker. */
export const askerEdge = (band: BandCutPattern, end: End): [P, P] => {
	const q = band.facets[endFacetIndex(band, end)].quad!;
	return end === 'start' ? [q.b, q.a] : [q.d, q.c];
};

/** The end's edge as it is ordered when this band is the partner. */
export const partnerEdge = (band: BandCutPattern, end: End): [P, P] => {
	const q = band.facets[endFacetIndex(band, end)].quad!;
	return end === 'start' ? [q.a, q.b] : [q.c, q.d];
};

/** A path vertex (the segment's end point) in a frame on `edge`. */
export const vertexInEdgeFrame = (seg: PathSegment, [o, e]: [P, P]): P => {
	const theta = Math.atan2(e.y - o.y, e.x - o.x);
	const [cos, sin] = [Math.cos(-theta), Math.sin(-theta)];
	const [dx, dy] = [(seg[1] as number) - o.x, (seg[2] as number) - o.y];
	return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
};

/**
 * Whether the partner band `partner` (a real band of an unsplit, all-visible
 * `truth` run) joins band `band` of tube `tube` at its START. Otherwise its end
 * joins.
 */
export const truthJoinsAtStart = (
	truth: TubeCutPattern[],
	partner: { tube: number; band: number },
	tube: number,
	band: number
): boolean => {
	const partnerTruth = truth[partner.tube].bands.find((b) => b.address.band === partner.band);
	const start = partnerTruth?.meta?.startPartnerBand;
	return start?.tube === tube && start.band === band;
};

export type Joined = { partner: BandCutPattern; partnerEnd: End; kind: 'seam' | 'outer' };

/**
 * The part joining `band`'s `end`, found without the code under test. A seam
 * partner is the adjacent sibling piece (same tube and band, piece ± 1). An
 * outer partner and its joining end come from `truth`, an unsplit all-visible
 * run's meta, where no piece resolution is involved: the partner's first piece
 * when its start joins, else its last piece.
 */
export const truePartnerOf = (
	truth: TubeCutPattern[],
	tubes: TubeCutPattern[],
	t: number,
	band: BandCutPattern,
	end: End
): Joined | undefined => {
	const parts = partsOf(tubes[t], band.address.band);
	const index = parts.indexOf(band);
	const siblingIndex = end === 'start' ? index - 1 : index + 1;
	if (siblingIndex >= 0 && siblingIndex < parts.length) {
		return {
			partner: parts[siblingIndex],
			partnerEnd: end === 'start' ? 'end' : 'start',
			kind: 'seam'
		};
	}
	const own = truth[t].bands.find((b) => b.address.band === band.address.band)!;
	const address = own.meta?.[`${end}PartnerBand`];
	if (!address) return undefined;
	const partnerParts = partsOf(tubes[address.tube], address.band);
	return truthJoinsAtStart(truth, address, t, band.address.band)
		? { partner: partnerParts[0], partnerEnd: 'start', kind: 'outer' }
		: { partner: partnerParts[partnerParts.length - 1], partnerEnd: 'end', kind: 'outer' };
};
