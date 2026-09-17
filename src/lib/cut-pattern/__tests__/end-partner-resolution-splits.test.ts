import { describe, it, expect } from '@jest/globals';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig
} from '$lib/shades-config';
import { generateTubeCutPattern } from '../generate-tiled-pattern';
import { getEndPartnerTransforms } from '../generate-pattern';
import { isGlobuleAddress_BandPiece, isSameAddress } from '$lib/util';
import type { TransformConfig } from '$lib/projection-geometry/types';
import type { BandCutPattern, PipelineGates, TiledPatternConfig, TubeCutPattern } from '$lib/types';

/**
 * shades-umy: end partners must resolve by WHICH END JOINS, not by the asking
 * band's piece index. Real geometry: the default super globule with its default
 * pattern (shield tesselation, `endsMatched: true`).
 *
 * Harness: every tube is generated with `generateTubeCutPattern` and then
 * `getEndPartnerTransforms` runs over the whole set — exactly the two steps
 * `generateProjectionPattern` performs before `adjustAfterTiling`. The adjuster
 * is deliberately left out: with a split tube in range it currently crashes on
 * positional neighbour lookup (Task 3, shades-at0), which is a separate defect.
 * The transforms under test are fully determined before it runs.
 *
 * Comparison method. Each piece is re-aligned into its own frame
 * (`alignBands` runs after `splitFlatBands`), so a transform whose PARTNER is a
 * piece legitimately differs from the unsplit run's raw transform even when it
 * is correct. Such ends are therefore checked by mapped end-edge geometry: map
 * the partner's joining edge through the computed transform and measure its
 * distance to this band's end edge. The joining partner edge is chosen by the
 * test itself from the UNSPLIT run's ground truth (which of the partner's ends
 * names this band), never by the code under test — otherwise a wrong-end
 * resolution would align the wrong edge and still measure zero.
 * Ends whose asker and partner are both unsplit keep their frames, so those are
 * compared as raw transforms.
 *
 * Measured, not assumed: with tube 6 split at quad 1, tube 0 band 0's correct
 * start transform is rotated ~6° from the unsplit run's (5.75° vs -0.25°),
 * while mapping its partner edge to within 1e-9.
 */

const gates: PipelineGates = {
	globule: false,
	globuleTube: false,
	projection: true,
	voronoi: false
};

type Splits = { tube: number; quads: number[] }[];
type End = 'start' | 'end';
type P = { x: number; y: number };

const superGlobule = generateSuperGlobule(generateDefaultSuperGlobuleConfig(), gates);
const geometryTubes = superGlobule.projections[0].tubes;

const buildAll = (tubeSplits: Splits): TubeCutPattern[] => {
	const { patternTypeConfig, patternConfig } = generateDefaultGlobulePatternConfig();
	const tubePatterns = geometryTubes.map(({ address, bands }) =>
		generateTubeCutPattern({
			address,
			bands: bands.filter((b) => !b.isFill),
			tiledPatternConfig: patternTypeConfig as TiledPatternConfig,
			pixelScale: patternConfig.pixelScale,
			splitQuads: tubeSplits.find((s) => s.tube === address.tube)?.quads ?? []
		})
	);
	getEndPartnerTransforms(tubePatterns);
	return tubePatterns;
};

const pieceOf = (b: BandCutPattern) =>
	isGlobuleAddress_BandPiece(b.address) ? b.address.piece : 0;
const parentBands = (tubes: TubeCutPattern[], tube: number, band: number) =>
	tubes[tube].bands.filter((b) => b.address.band === band).sort((a, b) => pieceOf(a) - pieceOf(b));
const unsplitBand = (tubes: TubeCutPattern[], tube: number, band: number) => {
	const [only, ...rest] = parentBands(tubes, tube, band);
	if (!only || rest.length) throw new Error(`expected t${tube}b${band} unsplit`);
	return only;
};

const partnerAddressOf = (b: BandCutPattern, end: End) =>
	end === 'start' ? b.meta?.startPartnerBand : b.meta?.endPartnerBand;
const transformOf = (b: BandCutPattern, end: End) =>
	end === 'start' ? b.meta?.startPartnerTransform : b.meta?.endPartnerTransform;

/** The band's own end edge, in its own frame (as getEndPartnerTransform reads it). */
const endEdge = (b: BandCutPattern, end: End): [P, P] => {
	const first = b.facets[0].quad!;
	const last = b.facets[b.facets.length - 1].quad!;
	return end === 'start' ? [first.a, first.b] : [last.d, last.c];
};

const apply = (t: TransformConfig, p: P): P => {
	const r = (t.rotate.z * Math.PI) / 180;
	return {
		x: p.x * Math.cos(r) - p.y * Math.sin(r) + t.translate.x,
		y: p.x * Math.sin(r) + p.y * Math.cos(r) + t.translate.y
	};
};
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
/** Distance between two segments as unordered endpoint pairs. */
const edgeDistance = ([a0, a1]: [P, P], [b0, b1]: [P, P]) =>
	Math.min(Math.max(dist(a0, b0), dist(a1, b1)), Math.max(dist(a0, b1), dist(a1, b0)));

const expectTransformsEqual = (actual?: TransformConfig, expected?: TransformConfig) => {
	expect(actual).toBeDefined();
	expect(expected).toBeDefined();
	const flat = (t: TransformConfig) => [
		t.translate.x,
		t.translate.y,
		t.rotate.z,
		t.scale.x,
		t.scale.y
	];
	flat(actual!).forEach((v, i) => expect(Math.abs(v - flat(expected!)[i])).toBeLessThan(1e-9));
};

/**
 * Ground truth from the unsplit run: which end of the partner meets `asker`'s
 * `end`. Both bands are unsplit there, so plain `isSameAddress` is exact.
 */
const joiningPartnerEnd = (
	unsplit: TubeCutPattern[],
	askerTube: number,
	askerBand: number,
	end: End
): { tube: number; band: number; partnerEnd: End } => {
	const asker = unsplitBand(unsplit, askerTube, askerBand);
	const partnerAddress = partnerAddressOf(asker, end)!;
	const partner = unsplitBand(unsplit, partnerAddress.tube, partnerAddress.band);
	const partnerEnd: End =
		partner.meta?.startPartnerBand && isSameAddress(partner.meta.startPartnerBand, asker.address)
			? 'start'
			: 'end';
	return { tube: partnerAddress.tube, band: partnerAddress.band, partnerEnd };
};

/**
 * How far this outer end's transform leaves the partner's true joining edge from
 * this band's end edge. The partner's piece is chosen from ground truth: its
 * start lives on its piece 0, its end on its last piece.
 */
const outerEndMisalignment = (
	split: TubeCutPattern[],
	unsplit: TubeCutPattern[],
	asker: BandCutPattern,
	end: End
) => {
	const truth = joiningPartnerEnd(unsplit, asker.address.tube, asker.address.band, end);
	const partnerPieces = parentBands(split, truth.tube, truth.band);
	const partner =
		truth.partnerEnd === 'start' ? partnerPieces[0] : partnerPieces[partnerPieces.length - 1];
	const transform = transformOf(asker, end);
	expect(transform).toBeDefined();
	const mapped = endEdge(partner, truth.partnerEnd).map((p) => apply(transform!, p)) as [P, P];
	return edgeDistance(mapped, endEdge(asker, end));
};

const TOLERANCE = 1e-9;

describe('end partner transforms with split tubes (real geometry)', () => {
	const unsplit = buildAll([]);
	const partnerTube = unsplit[0].bands[0].meta!.startPartnerBand!.tube;

	it('uses the tube the reviewer named as tube 0 band 0’s start partner', () => {
		// Verified, not assumed: tube 0 band 0 starts against tube 6 band 5's END.
		expect(partnerTube).toBe(6);
		expect(joiningPartnerEnd(unsplit, 0, 0, 'start')).toEqual({
			tube: 6,
			band: 5,
			partnerEnd: 'end'
		});
	});

	it('unsplit baseline: every outer end transform maps the partner edge onto this end', () => {
		// Sanity for the measurement itself.
		for (const band of unsplit[0].bands) {
			for (const end of ['start', 'end'] as End[]) {
				expect(outerEndMisalignment(unsplit, unsplit, band, end)).toBeLessThan(TOLERANCE);
			}
		}
	});

	it('splitting only a partner tube leaves the unsplit tube 0 correctly joined', () => {
		// Quad 1 of 4: pieces of 1 and 3 quads, so piece 0 and the last piece differ
		// in length and in frame.
		const split = buildAll([{ tube: partnerTube, quads: [1] }]);

		// Tube 0 itself is not split, so its own frames are unchanged.
		expect(split[0].bands.map((b) => b.address)).toEqual(unsplit[0].bands.map((b) => b.address));
		split[0].bands.forEach((band, i) => {
			band.facets.forEach((facet, f) => {
				expect(facet.quad).toEqual(unsplit[0].bands[i].facets[f].quad);
			});
		});

		let checkedPartnerEnds = 0;
		for (const band of split[0].bands) {
			for (const end of ['start', 'end'] as End[]) {
				const partnerAddress = partnerAddressOf(band, end)!;
				if (partnerAddress.tube === partnerTube) {
					// Partner is split, so its frame moved: compare mapped edge geometry.
					checkedPartnerEnds++;
					expect(outerEndMisalignment(split, unsplit, band, end)).toBeLessThan(TOLERANCE);
				} else {
					// Both frames unchanged: raw transforms must be identical.
					const before = unsplit[0].bands.find((b) => isSameAddress(b.address, band.address))!;
					expectTransformsEqual(transformOf(band, end), transformOf(before, end));
				}
			}
		}
		expect(checkedPartnerEnds).toBeGreaterThan(0);
	});

	it('splitting both tube 0 and its partner tube keeps every outer end joined to the right edge', () => {
		// Different indices, unequal pieces on both sides: tube 0 → 3 + 1 quads,
		// the partner tube → 1 + 3 quads.
		const split = buildAll([
			{ tube: 0, quads: [3] },
			{ tube: partnerTube, quads: [1] }
		]);

		let outerEnds = 0;
		let seamEnds = 0;
		for (const tube of [0, partnerTube]) {
			for (const band of split[tube].bands) {
				expect(isGlobuleAddress_BandPiece(band.address)).toBe(true);
				for (const end of ['start', 'end'] as End[]) {
					const partnerAddress = partnerAddressOf(band, end);
					if (!partnerAddress) continue;
					if (isGlobuleAddress_BandPiece(partnerAddress)) {
						// Seam: the sibling's opposite end, resolved exactly.
						seamEnds++;
						const sibling = split[tube].bands.find((b) =>
							isSameAddress(b.address, partnerAddress)
						)!;
						const mapped = endEdge(sibling, end === 'end' ? 'start' : 'end').map((p) =>
							apply(transformOf(band, end)!, p)
						) as [P, P];
						expect(edgeDistance(mapped, endEdge(band, end))).toBeLessThan(TOLERANCE);
					} else {
						outerEnds++;
						expect(outerEndMisalignment(split, unsplit, band, end)).toBeLessThan(TOLERANCE);
					}
				}
			}
		}
		// 6 bands × 2 outer ends in each of two tubes, and one seam per band.
		expect(outerEnds).toBe(24);
		expect(seamEnds).toBe(24);
	});
});
