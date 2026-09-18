import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';

import {
	longestParentQuadExtents,
	parentQuadExtents,
	proposeTubeSplits,
	quadBandExtent
} from '../auto-split-bands';
import type { BandCutPattern, CutPattern, Quadrilateral, TubeCutPattern } from '$lib/types';

/**
 * A quad spanning `length` along the band, starting at `top`, optionally rotated
 * by `angle` radians about the origin.
 *
 * The rotation is the whole point of several tests below: pieces of a split band
 * are aligned INDEPENDENTLY (`generate-tiled-pattern.ts:136-137` splits before
 * aligning, and `alignBands` computes a bounding box and rotation per band), so
 * two pieces of one parent do not share a frame. A frame-dependent measure
 * therefore reads different lengths before and after a split.
 */
const quad = (top: number, length: number, angle = 0): Quadrilateral => {
	const at = (x: number, y: number) =>
		new Vector3(
			x * Math.cos(angle) - y * Math.sin(angle),
			x * Math.sin(angle) + y * Math.cos(angle),
			0
		);
	return {
		a: at(0, top),
		b: at(1, top),
		c: at(1, top + length),
		d: at(0, top + length)
	};
};

const quadFacet = (top: number, length: number, angle = 0): CutPattern => ({
	path: [],
	label: 'q',
	quad: quad(top, length, angle)
});
const outlineFacet = (): CutPattern => ({ path: [], label: 'outline' });

/** A band whose quads have the given lengths, optionally a piece at `offset`. */
const band = (
	lengths: number[],
	{
		offset,
		piece,
		bandIndex = 0,
		lead = false,
		angle = 0
	}: {
		offset?: number;
		piece?: number;
		bandIndex?: number;
		lead?: boolean;
		angle?: number;
	} = {}
): BandCutPattern => {
	let top = 0;
	return {
		id: `b${bandIndex}p${piece ?? 0}`,
		projectionType: 'patterned',
		address:
			piece === undefined
				? { globule: 0, tube: 0, band: bandIndex }
				: { globule: 0, tube: 0, band: bandIndex, piece },
		parentQuadOffset: offset,
		facets: [
			...(lead ? [outlineFacet()] : []),
			...lengths.map((length) => {
				const facet = quadFacet(top, length, angle);
				top += length;
				return facet;
			})
		]
	} as unknown as BandCutPattern;
};

const tube = (bands: BandCutPattern[], tubeIndex = 0): TubeCutPattern =>
	({
		projectionType: 'patterned',
		address: { globule: 0, tube: tubeIndex },
		bands
	}) as unknown as TubeCutPattern;

describe('quadBandExtent', () => {
	it('is the distance between the midpoints of the quad two rung edges', () => {
		expect(quadBandExtent(quad(10, 7))).toBeCloseTo(7, 10);
	});

	it('does not care which end is higher, so a flipped quad still measures', () => {
		const flipped: Quadrilateral = {
			a: new Vector3(0, 12, 0),
			b: new Vector3(1, 12, 0),
			c: new Vector3(1, 4, 0),
			d: new Vector3(0, 4, 0)
		};
		expect(quadBandExtent(flipped)).toBeCloseTo(8, 10);
	});

	it('is ROTATION-INVARIANT, so a piece aligned in its own frame measures the same', () => {
		// The band-axis y-extent of this quad is 7*cos(0.6) + 1*sin(0.6) = 6.34,
		// which is what made the reassembled parent shrink after a split.
		expect(quadBandExtent(quad(10, 7, 0.6))).toBeCloseTo(7, 10);
	});

	it('is translation-invariant, so where a piece sits in its own box does not matter', () => {
		expect(quadBandExtent(quad(0, 5))).toBeCloseTo(quadBandExtent(quad(93, 5)), 10);
	});
});

describe('parentQuadExtents — reconstructing a parent from its pieces', () => {
	it('measures an uncut band directly, in its own (parent) index space', () => {
		expect(parentQuadExtents([band([3, 4, 5])])).toEqual([3, 4, 5]);
	});

	it('ignores facets that carry no quad, so an outlined band is not off by one', () => {
		expect(parentQuadExtents([band([3, 4, 5], { lead: true })])).toEqual([3, 4, 5]);
	});

	it('reassembles two pieces into the parent extents, placed by parentQuadOffset', () => {
		// The parent was [3, 4, 5, 6], split at quad 2.
		const pieces = [band([3, 4], { offset: 0, piece: 0 }), band([5, 6], { offset: 2, piece: 1 })];
		expect(parentQuadExtents(pieces)).toEqual([3, 4, 5, 6]);
	});

	it('places pieces by their offset, not by their position in the array', () => {
		const pieces = [band([5, 6], { offset: 2, piece: 1 }), band([3, 4], { offset: 0, piece: 0 })];
		expect(parentQuadExtents(pieces)).toEqual([3, 4, 5, 6]);
	});

	it('reassembles pieces that were aligned in DIFFERENT frames', () => {
		// Each piece is aligned independently after a split, so piece 1 arrives
		// rotated relative to piece 0. The parent length must not change because
		// of that: it is the same physical band.
		const pieces = [
			band([3, 4], { offset: 0, piece: 0 }),
			band([5, 6], { offset: 2, piece: 1, angle: 0.7 })
		];
		const extents = parentQuadExtents(pieces)!;
		expect(extents).toHaveLength(4);
		extents.forEach((e, i) => expect(e).toBeCloseTo([3, 4, 5, 6][i], 10));
	});

	it('refuses to guess when the pieces leave a hole in the parent range', () => {
		const pieces = [
			band([3, 4], { offset: 0, piece: 0 }),
			band([6], { offset: 3, piece: 1 }) // quad 2 is missing
		];
		expect(parentQuadExtents(pieces)).toBeUndefined();
	});

	it('returns undefined for a band with no quad-bearing facet (DynamicPathCollection)', () => {
		expect(parentQuadExtents([band([])])).toBeUndefined();
	});
});

describe('longestParentQuadExtents', () => {
	it('picks the longest parent by total length, not by quad count', () => {
		const bands = [
			band([10, 10, 10, 10], { bandIndex: 0 }), // 4 quads, 40 long
			band([30, 30], { bandIndex: 1 }) // 2 quads, 60 long
		];
		expect(longestParentQuadExtents(bands)).toEqual([30, 30]);
	});

	it('measures a split parent as one whole band, so it can out-length an uncut sibling', () => {
		const bands = [
			band([10, 10], { bandIndex: 0 }),
			band([20, 20], { bandIndex: 1, offset: 0, piece: 0 }),
			band([20, 20], { bandIndex: 1, offset: 2, piece: 1 })
		];
		expect(longestParentQuadExtents(bands)).toEqual([20, 20, 20, 20]);
	});

	it('skips parents it cannot measure and still answers from the rest', () => {
		const bands = [band([], { bandIndex: 0 }), band([7, 7], { bandIndex: 1 })];
		expect(longestParentQuadExtents(bands)).toEqual([7, 7]);
	});

	it('returns an empty list when no parent can be measured', () => {
		expect(longestParentQuadExtents([band([], { bandIndex: 0 })])).toEqual([]);
	});
});

describe('proposeTubeSplits', () => {
	it('keys proposals by the tube ADDRESS, never by position in the collated list', () => {
		// collateTubes concatenates variants, so position is not the tube number
		// splitFlatBands is selected by at generation time.
		const tubes = [tube([band([60, 60, 60])], 7)];
		expect(proposeTubeSplits(tubes, { pieceLengthBudget: 100, subunitCount: 1 })).toEqual([
			{ tube: 7, quads: [1, 2] }
		]);
	});

	it('proposes nothing for a tube whose longest parent already fits', () => {
		const tubes = [tube([band([10, 10, 10])], 0)];
		expect(proposeTubeSplits(tubes, { pieceLengthBudget: 100, subunitCount: 1 })).toEqual([]);
	});

	it('sizes off the longest band in the tube, the heuristic the tube-wide set follows', () => {
		const tubes = [
			tube([band([10, 10, 10, 10], { bandIndex: 0 }), band([60, 60, 60, 60], { bandIndex: 1 })], 0)
		];
		// The long band needs a cut after every quad at a 100 budget; the short
		// one would have needed none. The tube-wide set follows the long one.
		expect(proposeTubeSplits(tubes, { pieceLengthBudget: 100, subunitCount: 1 })).toEqual([
			{ tube: 0, quads: [1, 2, 3] }
		]);
	});

	it('KNOWN LIMIT: the longest band does not dominate every quad range, so a sibling can still overflow', () => {
		// Budget 50. Band A totals 90 and is chosen; band B totals 63, but its
		// first half is the dense one. The set cut for A leaves B's first piece at
		// 45 x 1.2 = 54, still over. Characterizing the spec's heuristic, not
		// endorsing it: the leftover overflow is reported, never silently shipped.
		const tubes = [
			tube(
				[
					band(
						Array.from({ length: 90 }, () => 1.0),
						{ bandIndex: 0 }
					),
					band(
						Array.from({ length: 90 }, (_, i) => (i < 45 ? 1.2 : 0.2)),
						{ bandIndex: 1 }
					)
				],
				0
			)
		];
		const [proposal] = proposeTubeSplits(tubes, { pieceLengthBudget: 50, subunitCount: 1 });
		expect(proposal.quads).toEqual([50]);
		// B's first piece under that set: quads 0-49 at 1.2 = 60 > 50.
		expect(50 * 1.2).toBeGreaterThan(50);
	});

	it('derives positions from the PARENT, so a second run on a split tube is idempotent', () => {
		const whole = tube([band([60, 60, 60], { bandIndex: 0 })], 0);
		const first = proposeTubeSplits([whole], { pieceLengthBudget: 100, subunitCount: 1 });
		// The same tube after those splits were applied: two pieces, parent-offset.
		const split = tube(
			[
				band([60], { bandIndex: 0, offset: 0, piece: 0 }),
				band([60], { bandIndex: 0, offset: 1, piece: 1 }),
				band([60], { bandIndex: 0, offset: 2, piece: 2 })
			],
			0
		);
		expect(proposeTubeSplits([split], { pieceLengthBudget: 100, subunitCount: 1 })).toEqual(first);
	});

	it('is idempotent even when the pieces came back ROTATED relative to each other', () => {
		const whole = tube([band([60, 60, 60], { bandIndex: 0 })], 0);
		const first = proposeTubeSplits([whole], { pieceLengthBudget: 100, subunitCount: 1 });
		// The same tube after those splits, each piece aligned in its own frame.
		const split = tube(
			[
				band([60], { bandIndex: 0, offset: 0, piece: 0 }),
				band([60], { bandIndex: 0, offset: 1, piece: 1, angle: 0.9 }),
				band([60], { bandIndex: 0, offset: 2, piece: 2, angle: -0.4 })
			],
			0
		);
		expect(proposeTubeSplits([split], { pieceLengthBudget: 100, subunitCount: 1 })).toEqual(first);
	});

	it('honours subunitCount, so nothing it proposes can be rejected as illegal', () => {
		const tubes = [tube([band([20, 20, 20, 20, 20, 20])], 0)];
		// Budget 70 holds one 3-quad group (60) but not two, so the only cut is at
		// quad 3 — a multiple of subunitCount, which is the rule generation applies.
		const proposals = proposeTubeSplits(tubes, { pieceLengthBudget: 70, subunitCount: 3 });
		expect(proposals).toEqual([{ tube: 0, quads: [3] }]);
	});

	it('proposes nothing for a tube it cannot measure, rather than proposing zero', () => {
		const tubes = [tube([band([])], 0)];
		expect(proposeTubeSplits(tubes, { pieceLengthBudget: 10, subunitCount: 1 })).toEqual([]);
	});

	it('merges tubes that share a tube number instead of emitting two entries', () => {
		const tubes = [tube([band([60, 60, 60])], 2), tube([band([300, 300])], 2)];
		const proposals = proposeTubeSplits(tubes, { pieceLengthBudget: 100, subunitCount: 1 });
		expect(proposals).toHaveLength(1);
		expect(proposals[0].tube).toBe(2);
		expect(proposals[0].quads).toEqual([1, 2]);
	});

	it('skips a tube with no usable address rather than throwing', () => {
		const broken = {
			projectionType: 'patterned',
			bands: [band([60, 60, 60])]
		} as unknown as TubeCutPattern;
		expect(proposeTubeSplits([broken], { pieceLengthBudget: 100, subunitCount: 1 })).toEqual([]);
	});

	it('returns tubes in ascending tube order', () => {
		const tubes = [tube([band([60, 60, 60])], 5), tube([band([60, 60, 60])], 1)];
		expect(
			proposeTubeSplits(tubes, { pieceLengthBudget: 100, subunitCount: 1 }).map((t) => t.tube)
		).toEqual([1, 5]);
	});
});
