import { describe, it, expect } from '@jest/globals';

import { deriveAutoSplits } from '../auto-split';

describe('deriveAutoSplits', () => {
	it('returns no splits when the band already fits', () => {
		expect(
			deriveAutoSplits({ quadLengths: [10, 10, 10], pieceLengthBudget: 100, subunitCount: 1 })
		).toEqual([]);
	});

	it('splits greedily at the last boundary that still fits', () => {
		// 6 quads of 10 each, page fits 25 => 2 quads per piece.
		expect(
			deriveAutoSplits({
				quadLengths: [10, 10, 10, 10, 10, 10],
				pieceLengthBudget: 25,
				subunitCount: 1
			})
		).toEqual([2, 4]);
	});

	it('snaps splits to multiples of subunitCount', () => {
		// Nine quads of 10 in subunit groups of 3 => three groups of 30 each.
		// pieceLengthBudget 35 fits exactly one group but not two, so the only legal
		// boundaries — 3 and 6 — are both taken.
		//
		// Do NOT use pieceLengthBudget 25 here: a 30-unit group would not fit the page
		// on its own, the unsplittable check fires on the first iteration, and the
		// function correctly returns []. That fixture is self-contradictory, not a
		// snapping test.
		expect(
			deriveAutoSplits({
				quadLengths: [10, 10, 10, 10, 10, 10, 10, 10, 10],
				pieceLengthBudget: 35,
				subunitCount: 3
			})
		).toEqual([3, 6]);
	});

	it('handles uneven quad lengths', () => {
		// Greedy first-fit, traced by hand against the implementation:
		//   g0: run 30            (30 <= 40)
		//   g1: run 35            (30 + 5)
		//   g2: run 40            (35 + 5)
		//   g3: 40 + 30 = 70 > 40 => split at 3, run 30
		// => [3]. The previous expectation of [1, 3] describes a balanced/best-fit
		// partition, which is neither what the implementation does nor what the
		// doc comment promises.
		expect(
			deriveAutoSplits({ quadLengths: [30, 5, 5, 30], pieceLengthBudget: 40, subunitCount: 1 })
		).toEqual([3]);
	});

	it('returns no splits when a single quad already exceeds the page', () => {
		// Nothing can be done by splitting along the band; the caller should
		// surface the existing overflow warning instead.
		expect(
			deriveAutoSplits({ quadLengths: [200, 200], pieceLengthBudget: 100, subunitCount: 1 })
		).toEqual([]);
	});

	it('returns no splits for an empty band', () => {
		expect(deriveAutoSplits({ quadLengths: [], pieceLengthBudget: 100, subunitCount: 1 })).toEqual(
			[]
		);
	});

	// Beyond the brief: properties Task 16 relies on, and the degenerate inputs a
	// UI caller can reach.

	it('only ever proposes positions generation accepts as legal', () => {
		// Legality, as classifySplitQuads judges it: a multiple of subunitCount and
		// strictly inside the band. Every proposal must satisfy both, so nothing
		// auto-split writes can come back as a rejectedSplit.
		const quadLengths = [7, 3, 9, 4, 6, 8, 5, 2, 9, 4, 7, 3];
		const subunitCount = 2;
		const splits = deriveAutoSplits({ quadLengths, pieceLengthBudget: 20, subunitCount });

		expect(splits.length).toBeGreaterThan(0);
		splits.forEach((quad) => {
			expect(quad % subunitCount).toBe(0);
			expect(quad).toBeGreaterThan(0);
			expect(quad).toBeLessThan(quadLengths.length);
		});
	});

	it('returns strictly ascending, unique positions', () => {
		const splits = deriveAutoSplits({
			quadLengths: [10, 10, 10, 10, 10, 10, 10, 10],
			pieceLengthBudget: 15,
			subunitCount: 1
		});
		expect(splits).toEqual([1, 2, 3, 4, 5, 6, 7]);
		expect([...splits].sort((a, b) => a - b)).toEqual(splits);
		expect(new Set(splits).size).toBe(splits.length);
	});

	it('is deterministic: the same input yields an equal, freshly built array', () => {
		const input = {
			quadLengths: [12, 4, 9, 13, 6, 2, 11, 5, 8, 3],
			pieceLengthBudget: 30,
			subunitCount: 1
		};
		const first = deriveAutoSplits(input);
		const second = deriveAutoSplits(input);
		expect(second).toEqual(first);
		expect(second).not.toBe(first);
	});

	it('reports the whole band unsplittable when a later group is oversized', () => {
		// The oversized group is checked before any push, so the whole band is
		// reported unsplittable rather than handing back a set that still overflows.
		expect(
			deriveAutoSplits({
				quadLengths: [10, 10, 10, 10, 500],
				pieceLengthBudget: 25,
				subunitCount: 1
			})
		).toEqual([]);
	});

	it('returns no splits for a non-positive budget', () => {
		expect(
			deriveAutoSplits({ quadLengths: [10, 10, 10], pieceLengthBudget: 0, subunitCount: 1 })
		).toEqual([]);
	});

	it('returns no splits for a non-positive, non-finite or fractional subunitCount', () => {
		// A zero or negative group stride would never advance the walk. Guarded so a
		// bad config value cannot hang the UI thread. A fractional stride would
		// advance, but would propose fractional "quad indices", which are not quad
		// boundaries and could never be legal.
		expect(
			deriveAutoSplits({ quadLengths: [10, 10, 10, 10], pieceLengthBudget: 15, subunitCount: 0 })
		).toEqual([]);
		expect(
			deriveAutoSplits({ quadLengths: [10, 10, 10, 10], pieceLengthBudget: 15, subunitCount: -2 })
		).toEqual([]);
		expect(
			deriveAutoSplits({ quadLengths: [10, 10, 10, 10], pieceLengthBudget: 15, subunitCount: NaN })
		).toEqual([]);
		expect(
			deriveAutoSplits({ quadLengths: [10, 10, 10, 10], pieceLengthBudget: 15, subunitCount: 1.5 })
		).toEqual([]);
	});

	it('terminates and returns no splits for a NaN or infinite budget', () => {
		// Without an explicit guard these terminate only by accident: every `>`
		// against NaN is false, so the band is silently declared fitting. An
		// infinite budget would say the same thing for a different wrong reason.
		expect(
			deriveAutoSplits({ quadLengths: [10, 10, 10, 10], pieceLengthBudget: NaN, subunitCount: 1 })
		).toEqual([]);
		expect(
			deriveAutoSplits({
				quadLengths: [10, 10, 10, 10],
				pieceLengthBudget: Infinity,
				subunitCount: 1
			})
		).toEqual([]);
	});

	it('terminates and returns no splits when a quad length is not finite', () => {
		// One unmeasurable quad poisons every accumulation it takes part in, so no
		// proposal derived from it could be trusted.
		expect(
			deriveAutoSplits({ quadLengths: [10, NaN, 10, 10], pieceLengthBudget: 15, subunitCount: 1 })
		).toEqual([]);
		expect(
			deriveAutoSplits({
				quadLengths: [10, 10, Infinity, 10],
				pieceLengthBudget: 15,
				subunitCount: 1
			})
		).toEqual([]);
	});

	it('measures a trailing partial subunit group', () => {
		// Five quads of 10 in groups of two: g0 = 20, g1 = 20, g2 = 10 (partial).
		//   g0: run 20; g1: 20 + 20 > 25 => split at 2, run 20;
		//   g2: 20 + 10 > 25 => split at 4, run 10.
		// The last group is short, but 4 is still a legal boundary: a multiple of 2
		// and strictly inside a 5-quad band.
		expect(
			deriveAutoSplits({
				quadLengths: [10, 10, 10, 10, 10],
				pieceLengthBudget: 25,
				subunitCount: 2
			})
		).toEqual([2, 4]);
	});
});
