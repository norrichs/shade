import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';

import {
	longestParentQuadExtents,
	parentQuadExtents,
	proposeTubeSplits,
	quadYExtent
} from '../auto-split-bands';
import type { BandCutPattern, CutPattern, Quadrilateral, TubeCutPattern } from '$lib/types';

/**
 * A quad spanning `length` along y, starting at `top`. Bands are re-aligned with
 * their long axis on y (`reAlignBand`), so a quad's y-extent IS its length along
 * the band.
 */
const quad = (top: number, length: number): Quadrilateral => ({
	a: new Vector3(0, top, 0),
	b: new Vector3(1, top, 0),
	c: new Vector3(1, top + length, 0),
	d: new Vector3(0, top + length, 0)
});

const quadFacet = (top: number, length: number): CutPattern => ({
	path: [],
	label: 'q',
	quad: quad(top, length)
});
const outlineFacet = (): CutPattern => ({ path: [], label: 'outline' });

/** A band whose quads have the given lengths, optionally a piece at `offset`. */
const band = (
	lengths: number[],
	{
		offset,
		piece,
		bandIndex = 0,
		lead = false
	}: { offset?: number; piece?: number; bandIndex?: number; lead?: boolean } = {}
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
				const facet = quadFacet(top, length);
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

describe('quadYExtent', () => {
	it('is the span of the quad four corners along y', () => {
		expect(quadYExtent(quad(10, 7))).toBe(7);
	});

	it('does not care which corner is highest, so a flipped quad still measures', () => {
		const flipped: Quadrilateral = {
			a: new Vector3(0, 12, 0),
			b: new Vector3(1, 12, 0),
			c: new Vector3(1, 4, 0),
			d: new Vector3(0, 4, 0)
		};
		expect(quadYExtent(flipped)).toBe(8);
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

	it('sizes off the longest band in the tube, so the set is safe for every sibling', () => {
		const tubes = [
			tube([band([10, 10, 10, 10], { bandIndex: 0 }), band([60, 60, 60, 60], { bandIndex: 1 })], 0)
		];
		// The long band needs a cut after every quad at a 100 budget; the short
		// one would have needed none. The tube-wide set follows the long one.
		expect(proposeTubeSplits(tubes, { pieceLengthBudget: 100, subunitCount: 1 })).toEqual([
			{ tube: 0, quads: [1, 2, 3] }
		]);
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

	it('returns tubes in ascending tube order', () => {
		const tubes = [tube([band([60, 60, 60])], 5), tube([band([60, 60, 60])], 1)];
		expect(
			proposeTubeSplits(tubes, { pieceLengthBudget: 100, subunitCount: 1 }).map((t) => t.tube)
		).toEqual([1, 5]);
	});
});
