import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';

import { classifySplitQuads, splitFlatBands } from '../split-flat-bands';
import type { Band, Facet } from '$lib/types';

// facetCount facets => facetCount/2 quads.
const buildBand = (facetCount: number): Band => {
	const facets: Facet[] = [];
	for (let i = 0; i < facetCount; i++) {
		facets.push({
			triangle: new Triangle(new Vector3(0, i, 0), new Vector3(1, i, 0), new Vector3(0, i + 1, 0)),
			orientation: 'axial-right'
		});
	}
	return { facets, orientation: 'axial-right', sideOrientation: 'outside', visible: true };
};

describe('splitFlatBands', () => {
	it('returns the input untouched when there are no splits', () => {
		const bands = [buildBand(8)];
		const result = splitFlatBands(bands, [], 1);
		expect(result.bands).toBe(bands);
		expect(result.rejected).toEqual([]);
	});

	it('partitions one band into two pieces at a quad boundary', () => {
		// 8 facets = 4 quads; split at quad 2 => facet 4.
		const result = splitFlatBands([buildBand(8)], [2], 1);
		expect(result.bands).toHaveLength(2);
		expect(result.bands[0].facets).toHaveLength(4);
		expect(result.bands[1].facets).toHaveLength(4);
	});

	it('conserves every facet, in order', () => {
		const parent = buildBand(12);
		const result = splitFlatBands([parent], [2, 4], 1);
		const rejoined = result.bands.flatMap((b) => b.facets);
		expect(rejoined).toHaveLength(12);
		rejoined.forEach((facet, i) => {
			expect(facet.triangle.a.y).toBe(parent.facets[i].triangle.a.y);
			expect(rejoined[i]).toBe(parent.facets[i]);
		});
	});

	it('assigns sequential piece indices and parent quad offsets', () => {
		const result = splitFlatBands([buildBand(12)], [2, 4], 1);
		expect(result.bands.map((b) => b.pieceIndex)).toEqual([0, 1, 2]);
		expect(result.bands.map((b) => b.parentQuadOffset)).toEqual([0, 2, 4]);
	});

	it("records each piece's parent index, not a fabricated address", () => {
		// Two parents, so a piece index and a parent index cannot be confused.
		// Pieces must NOT invent an address: bands built by
		// generate-projection.ts:714/:732 have none, and a fabricated g0t0b0
		// would send every seam partner in the model to one wrong band.
		const result = splitFlatBands([buildBand(8), buildBand(8)], [2], 1);
		expect(result.bands.map((b) => b.parentIndex)).toEqual([0, 0, 1, 1]);
		expect(result.bands.map((b) => b.pieceIndex)).toEqual([0, 1, 0, 1]);
		expect(result.bands.every((b) => b.address === undefined)).toBe(true);
	});

	it('leaves an existing parent address untouched on every piece', () => {
		// The parent's address is inherited verbatim by the spread; the piece
		// component is added later, when the BandCutPattern address is built
		// (Task 9 Step 4), so nothing here has to know the address shape.
		const parent = buildBand(8);
		parent.address = { globule: 1, tube: 2, band: 3 };
		const result = splitFlatBands([parent], [2], 1);
		expect(result.bands.map((b) => b.address)).toEqual([
			{ globule: 1, tube: 2, band: 3 },
			{ globule: 1, tube: 2, band: 3 }
		]);
	});

	it('returns the input untouched for an empty band array', () => {
		// Math.max of an empty array is -Infinity, which would otherwise reject
		// every split with "out of range for -Infinity quads".
		const result = splitFlatBands([], [2], 1);
		expect(result.bands).toEqual([]);
		expect(result.rejected).toEqual([]);
	});

	it('marks seam ends but not the parent outer ends', () => {
		const result = splitFlatBands([buildBand(12)], [2, 4], 1);
		expect(result.bands[0].seamAt).toEqual({ end: true });
		expect(result.bands[1].seamAt).toEqual({ start: true, end: true });
		expect(result.bands[2].seamAt).toEqual({ start: true });
	});

	it("does not set parentAscending — that is the caller's job", () => {
		// The flip test reads POST-rotation coordinates (reAlignBand runs after
		// the minimal-bounding-box rotation), so it cannot be computed here from
		// the pre-align flat band; and the bbox helpers live in a module that
		// imports generate-pattern.ts, which this pure module must not pull in.
		// Task 9 Step 5 stamps it via computeBandAscending.
		const result = splitFlatBands([buildBand(8)], [2], 1);
		expect(result.bands.every((b) => b.parentAscending === undefined)).toBe(true);
	});

	it('rejects a split that is not a multiple of subunitCount', () => {
		// hexparquet maps a subunit across 3 quads, so only every third boundary
		// is legal.
		const result = splitFlatBands([buildBand(24)], [2, 3], 3);
		expect(result.bands.map((b) => b.parentQuadOffset)).toEqual([0, 3]);
		expect(result.rejected).toEqual([{ quad: 2, reason: 'not a multiple of subunitCount 3' }]);
	});

	it('leaves both pieces divisible by subunitCount', () => {
		// 24 facets = 12 quads, split at 3 => 3 and 9 quads, both divisible by 3.
		const result = splitFlatBands([buildBand(24)], [3], 3);
		const quadCounts = result.bands.map((b) => b.facets.length / 2);
		expect(quadCounts).toEqual([3, 9]);
		quadCounts.forEach((c) => expect(c % 3).toBe(0));
	});

	it('rejects an out-of-range split', () => {
		const result = splitFlatBands([buildBand(8)], [9], 1);
		expect(result.bands).toHaveLength(1);
		expect(result.rejected).toEqual([{ quad: 9, reason: 'out of range for 4 quads' }]);
	});

	it('does not split a band with fewer quads than the index', () => {
		// Splits are tube-wide; a short band simply is not cut. The uncut band
		// carries no pieceIndex, but it DOES carry parentIndex: its position in
		// the returned array is not stable (siblings can split while it does
		// not), so downstream consumers need parentIndex to recover its true
		// pre-split index rather than trusting array position.
		const result = splitFlatBands([buildBand(12), buildBand(4)], [4], 1);
		expect(result.bands).toHaveLength(3);
		expect(result.bands.filter((b) => b.pieceIndex !== undefined)).toHaveLength(2);
		expect(result.bands.map((b) => b.parentIndex)).toEqual([0, 0, 1]);
	});

	describe('tubeQuadCount (range judged against the whole tube)', () => {
		it('keeps a split valid for the tube even when the given bands are all shorter', () => {
			// The selected range holds only 2-quad bands; the tube's longest band has 4.
			const result = splitFlatBands([buildBand(4), buildBand(4)], [3], 1, 4);
			expect(result.rejected).toEqual([]);
			// Neither short band is cut, but both are stamped as bands of a split tube.
			expect(result.bands.map((b) => [b.parentIndex, b.pieceIndex])).toEqual([
				[0, undefined],
				[1, undefined]
			]);
		});

		it('reports out of range against the tube, not the given bands', () => {
			const result = splitFlatBands([buildBand(12)], [9], 1, 8);
			expect(result.rejected).toEqual([{ quad: 9, reason: 'out of range for 8 quads' }]);
		});

		it('still reports rejections when the selected range is empty', () => {
			const result = splitFlatBands([], [2, 9], 1, 6);
			expect(result.rejected).toEqual([{ quad: 9, reason: 'out of range for 6 quads' }]);
		});
	});
});

// The legality rules formerly duplicated (range only) in validators.ts
// validateSplitConfig, which was deleted in favour of this single source.
describe('classifySplitQuads', () => {
	it('collapses duplicates and sorts the legal splits', () => {
		expect(classifySplitQuads([6, 2, 2, 4], 10, 1)).toEqual({ legal: [2, 4, 6], rejected: [] });
	});

	it('rejects zero, negative, non-integer and at-or-beyond-count splits as out of range', () => {
		const { legal, rejected } = classifySplitQuads([0, -1, 2.5, 3, 6, 99], 6, 1);
		expect(legal).toEqual([3]);
		expect(rejected.map((r) => r.quad)).toEqual([-1, 0, 2.5, 6, 99]);
		expect(new Set(rejected.map((r) => r.reason))).toEqual(new Set(['out of range for 6 quads']));
	});

	it('rejects an in-range non-multiple of subunitCount', () => {
		expect(classifySplitQuads([2, 3], 6, 3)).toEqual({
			legal: [3],
			rejected: [{ quad: 2, reason: 'not a multiple of subunitCount 3' }]
		});
	});
});
