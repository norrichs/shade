import { describe, it, expect, beforeAll } from '@jest/globals';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig
} from '$lib/shades-config';
import { generateProjectionPattern } from '../generate-pattern';
import { isGlobuleAddress_BandPiece } from '$lib/util';
import {
	buildDefaultGeometry,
	pieceOf,
	projectionGates,
	truthJoinsAtStart,
	type End,
	type P
} from './helpers/real-geometry';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';
import type { TransformConfig } from '$lib/projection-geometry/types';
import type { TubeCutPattern } from '$lib/types';

/**
 * Task 8: hidden bands. A hidden band (`visible: false`) is dropped before
 * tiling, so `BandCutPattern.address.band` counts VISIBLE bands, while the
 * partner addresses read from 3D facet meta carry REAL tube band indices.
 * Before the fix, `meta.startPartnerBand` / `endPartnerBand` were stored in the
 * real space and resolved against visible-space addresses, so with any hidden
 * band an end partner resolved to the wrong band (the one after the hidden
 * one), or to nothing (the last band), or to a band standing in for a hidden
 * partner.
 *
 * Real geometry, full pipeline (`generateProjectionPattern`, adjuster
 * included), default pattern (shield tesselation, `endsMatched: true`).
 *
 * Ground truth comes from an all-visible, unsplit run, where the two index
 * spaces coincide: which real band each band end meets, and which of the
 * partner's ends joins it. It is never taken from the run under test.
 *
 * Every outer end of every visible band (or piece) is judged:
 * - partner hidden: the end must not be matched and must name no partner;
 * - partner visible: `meta` must name the partner's pattern address, and the
 *   partner's joining edge (its first piece's start, or its last piece's end),
 *   mapped through the stored transform, must land on this end's edge; and the
 *   adjuster must have matched this end against the partner's joining facet.
 *
 * Each fixture hides one band of every tube and splits two tubes into unequal
 * pieces (4 quads per band: 1+3 and 3+1), so piece resolution runs across the
 * visible-index gap too. Band 1 opens a gap mid-tube. Band 5 is the last band,
 * and hides BOTH end partners of tube 0 band 0, the band the pipeline reads to
 * decide whether to run the adjuster at all. Tube 0 is left unsplit on purpose:
 * a seam would give that band a partner of its own and mask the decision.
 */

const SPLITS = [
	{ tube: 3, quads: [1] },
	{ tube: 6, quads: [3] }
];

const generate = (
	hiddenBand: number | undefined,
	splits: { tube: number; quads: number[] }[]
): TubeCutPattern[] => {
	// Fresh geometry per run: hiding a band mutates the tubes.
	const tubes = buildDefaultGeometry().superGlobule.projections[0].tubes;
	if (hiddenBand !== undefined) tubes.forEach((tube) => (tube.bands[hiddenBand].visible = false));
	const config = generateDefaultGlobulePatternConfig();
	config.patternConfig.splits = { tubeSplits: splits };
	const pattern = generateProjectionPattern(tubes, 'sg', config, {
		tubes: undefined,
		bands: undefined,
		facets: undefined
	}) as SuperGlobuleProjectionCutPattern;
	return pattern.projectionCutPattern.tubes;
};

const apply = (t: TransformConfig | undefined, p: P): P => {
	if (!t) return p;
	const th = (t.rotate.z * Math.PI) / 180;
	const [c, s] = [Math.cos(th), Math.sin(th)];
	return { x: c * p.x - s * p.y + t.translate.x, y: s * p.x + c * p.y + t.translate.y };
};
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

let truth: TubeCutPattern[];
beforeAll(() => {
	truth = generate(undefined, []);
});
const truthMeta = (tube: number, realBand: number) =>
	truth[tube].bands.find((b) => b.address.band === realBand)?.meta;

describe.each([1, 5])(
	'end partners hiding band %i of every tube (real geometry)',
	(HIDDEN_BAND) => {
		const visibleIndexOf = (real: number) =>
			real === HIDDEN_BAND ? undefined : real > HIDDEN_BAND ? real - 1 : real;
		const realIndexOf = (visible: number) => (visible >= HIDDEN_BAND ? visible + 1 : visible);

		let tubes: TubeCutPattern[];
		beforeAll(() => {
			tubes = generate(HIDDEN_BAND, SPLITS);
		});

		it('the fixture has unequal pieces and hides a band that is some end partner', () => {
			const pieceLengths = (t: number) =>
				tubes[t].bands.filter((b) => b.address.band === 0).map((b) => b.facets.length);
			expect(pieceLengths(3)).toEqual([1, 3]);
			expect(pieceLengths(6)).toEqual([3, 1]);
			const hiddenIsAPartner = truth.some((tube) =>
				tube.bands.some(
					(b) =>
						b.meta?.startPartnerBand?.band === HIDDEN_BAND ||
						b.meta?.endPartnerBand?.band === HIDDEN_BAND
				)
			);
			expect(hiddenIsAPartner).toBe(true);
		});

		it('every band end matches its true partner, or is unmatched when that partner is hidden', () => {
			const failures: string[] = [];
			let matchedEnds = 0;
			let hiddenPartnerEnds = 0;

			tubes.forEach((tube, t) => {
				tube.bands.forEach((band) => {
					if (band.error) return;
					const realBand = realIndexOf(band.address.band);
					const parts = tube.bands
						.filter((b) => b.address.band === band.address.band)
						.sort((a, b) => pieceOf(a) - pieceOf(b));
					const name = `t${t} real b${realBand} p${pieceOf(band)}`;

					for (const end of ['start', 'end'] as End[]) {
						// Only the first piece carries the outer start, the last the outer end.
						if (band !== (end === 'start' ? parts[0] : parts[parts.length - 1])) continue;
						const trueAddress = truthMeta(t, realBand)?.[`${end}PartnerBand`];
						if (!trueAddress) continue;
						const stored = band.meta?.[`${end}PartnerBand`];
						const translated =
							band.meta?.[
								end === 'start' ? 'translatedStartPartnerFacet' : 'translatedEndPartnerFacet'
							];
						const partnerVisible = visibleIndexOf(trueAddress.band);

						if (partnerVisible === undefined) {
							hiddenPartnerEnds++;
							if (translated)
								failures.push(`${name} ${end}: matched although its partner is hidden`);
							if (stored)
								failures.push(
									`${name} ${end}: names ${JSON.stringify(stored)} for a hidden partner`
								);
							continue;
						}

						if (stored?.tube !== trueAddress.tube || stored?.band !== partnerVisible) {
							failures.push(
								`${name} ${end}: names ${JSON.stringify(stored)}, partner is t${trueAddress.tube} visible b${partnerVisible}`
							);
							continue;
						}

						const partnerEnd: End = truthJoinsAtStart(truth, trueAddress, t, realBand)
							? 'start'
							: 'end';
						const partnerParts = tubes[trueAddress.tube].bands
							.filter((b) => b.address.band === partnerVisible)
							.sort((a, b) => pieceOf(a) - pieceOf(b));
						const partner =
							partnerEnd === 'start' ? partnerParts[0] : partnerParts[partnerParts.length - 1];
						const pf =
							partnerEnd === 'start'
								? partner.facets[0]
								: partner.facets[partner.facets.length - 1];
						const bf = end === 'start' ? band.facets[0] : band.facets[band.facets.length - 1];
						const origin = end === 'start' ? [bf.quad!.b, bf.quad!.a] : [bf.quad!.d, bf.quad!.c];
						const joining =
							partnerEnd === 'start' ? [pf.quad!.a, pf.quad!.b] : [pf.quad!.c, pf.quad!.d];
						const transform = band.meta?.[`${end}PartnerTransform`];
						const gap = Math.max(
							dist(apply(transform, joining[0]), origin[0]),
							dist(apply(transform, joining[1]), origin[1])
						);
						if (!transform || gap > 1e-6) {
							failures.push(`${name} ${end}: partner edge lands ${gap.toFixed(2)}px away`);
							continue;
						}
						const expectedLabel = partnerEnd === 'start' ? 0 : partner.facets.length - 1;
						if (!translated || Number(translated.label) !== expectedLabel) {
							failures.push(
								`${name} ${end}: adjuster did not match the partner's ${partnerEnd} facet`
							);
							continue;
						}
						matchedEnds++;
					}
				});
			});

			expect(failures).toEqual([]);
			// Guards against a vacuous pass: both kinds of end were actually exercised.
			expect(matchedEnds).toBeGreaterThan(100);
			expect(hiddenPartnerEnds).toBeGreaterThan(0);
		});
	}
);

/**
 * The production path into the same index gap: with `fillAll`, a surface
 * projection prepends and appends a fill band to every tube and renumbers, so
 * facet partner meta counts the fill bands. Tiled patterns drop fill bands
 * before tiling (`generateProjectionPattern`), so every pattern address is one
 * lower than the real index. Before the fix, 280 of 360 stored end partner
 * addresses named a band that did not name this band back.
 */
describe('end partners on a fillAll surface projection (tiled drops the fill bands)', () => {
	it('every stored end partner names a band that names this band back', () => {
		const superConfig = generateDefaultSuperGlobuleConfig();
		superConfig.projectionConfigs[0].surfaceProjectionConfig = { divisions: 2, fillAll: true };
		const geometry = generateSuperGlobule(superConfig, projectionGates).projections[0];
		const surfaceTubes = geometry.surfaceProjectionTubes ?? [];
		expect(surfaceTubes.flatMap((t) => t.bands).filter((b) => b.isFill).length).toBeGreaterThan(0);

		const pattern = generateProjectionPattern(
			surfaceTubes,
			'sg',
			generateDefaultGlobulePatternConfig(),
			{ tubes: undefined, bands: undefined, facets: undefined }
		) as SuperGlobuleProjectionCutPattern;
		const tubes = pattern.projectionCutPattern.tubes;

		const sameBand = (a?: { tube: number; band: number }, b?: { tube: number; band: number }) =>
			!!a && !!b && a.tube === b.tube && a.band === b.band;
		const failures: string[] = [];
		let ends = 0;
		tubes.forEach((tube) =>
			tube.bands.forEach((band) => {
				for (const key of ['startPartnerBand', 'endPartnerBand'] as const) {
					const address = band.meta?.[key];
					if (!address || isGlobuleAddress_BandPiece(address)) continue;
					ends++;
					const partner = tubes[address.tube]?.bands.find((b) => b.address.band === address.band);
					const pointsBack =
						sameBand(partner?.meta?.startPartnerBand, band.address) ||
						sameBand(partner?.meta?.endPartnerBand, band.address);
					if (!pointsBack) {
						failures.push(
							`t${band.address.tube}b${band.address.band} ${key} -> t${address.tube}b${address.band}`
						);
					}
				}
			})
		);

		expect(ends).toBeGreaterThan(0);
		expect(failures).toEqual([]);
	});
});
