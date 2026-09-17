import { describe, it, expect } from '@jest/globals';
import { findPreviousBandFacets } from '../resolve-partner-band';

/**
 * shades-guk: the previous (left-hand) band of a band or piece is found by
 * ADDRESS — parent band `band - 1`, wrapping in the tube's band order — and its
 * facets are paired through parent quad coordinates (`parentQuadOffset + f`),
 * never by array position. Facets are labelled `t<tube>b<band>q<parentQuad>` so
 * a wrong pairing names itself.
 */

const facetsFor = (band: number, offset: number, count: number) =>
	Array.from({ length: count }, (_, f) => `b${band}q${offset + f}`);

const unsplit = (band: number, count: number) => ({
	address: { globule: 0, tube: 0, band },
	facets: facetsFor(band, 0, count)
});

const piece = (band: number, pieceIndex: number, offset: number, count: number) => ({
	address: { globule: 0, tube: 0, band, piece: pieceIndex },
	parentQuadOffset: offset,
	facets: facetsFor(band, offset, count)
});

describe('findPreviousBandFacets', () => {
	it('unsplit tube: pairs facet f with the positionally previous band, wrapping', () => {
		const bands = [unsplit(0, 3), unsplit(1, 3), unsplit(2, 3)];
		expect(findPreviousBandFacets(bands, 0)).toEqual(['b2q0', 'b2q1', 'b2q2']);
		expect(findPreviousBandFacets(bands, 2)).toEqual(['b1q0', 'b1q1', 'b1q2']);
	});

	it('interleaved pieces of UNEQUAL length: same piece index of band - 1, facet by facet', () => {
		// Split at quad 1: pieces of 1 and 3 quads, interleaved in the array.
		const bands = [piece(0, 0, 0, 1), piece(0, 1, 1, 3), piece(1, 0, 0, 1), piece(1, 1, 1, 3)];
		// b0p1's array predecessor is its own sibling; its true neighbour is b1p1 (wrap).
		expect(findPreviousBandFacets(bands, 1)).toEqual(['b1q1', 'b1q2', 'b1q3']);
		// b1p0's array predecessor is b0p1 (3 facets); its neighbour is b0p0.
		expect(findPreviousBandFacets(bands, 2)).toEqual(['b0q0']);
		// b0p0 wraps to the last PARENT's same piece, not the last array entry.
		expect(findPreviousBandFacets(bands, 0)).toEqual(['b1q0']);
		expect(findPreviousBandFacets(bands, 3)).toEqual(['b0q1', 'b0q2', 'b0q3']);
	});

	it('uncut band whose previous band IS split: maps through parent quad coordinates', () => {
		// b0 (4 quads) was cut at quad 2; b1 (2 quads) was too short to cut there.
		const bands = [piece(0, 0, 0, 2), piece(0, 1, 2, 2), unsplit(1, 2)];
		expect(findPreviousBandFacets(bands, 2)).toEqual(['b0q0', 'b0q1']);
	});

	it('piece whose previous band is uncut and shorter: no counterpart, and no throw', () => {
		// b1 (4 quads) cut at quad 2; b0 (2 quads) uncut. b1p1 covers parent quads
		// 2–3, which b0 does not have.
		const bands = [unsplit(0, 2), piece(1, 0, 0, 2), piece(1, 1, 2, 2)];
		expect(findPreviousBandFacets(bands, 1)).toEqual(['b0q0', 'b0q1']);
		expect(findPreviousBandFacets(bands, 2)).toEqual([undefined, undefined]);
	});

	it('neighbour with fewer pieces: falls back to its last piece, mapped by parent quad', () => {
		// Cuts at quads 2 and 4. b0 has 6 quads → 3 pieces; b1 has 5 quads → 3
		// pieces; b2 has 3 quads → 2 pieces (quad 4 is past its end).
		const bands = [
			piece(0, 0, 0, 2),
			piece(0, 1, 2, 2),
			piece(0, 2, 4, 2),
			piece(1, 0, 0, 2),
			piece(1, 1, 2, 2),
			piece(1, 2, 4, 1),
			piece(2, 0, 0, 2),
			piece(2, 1, 2, 1)
		];
		// b0p2 (quads 4–5) → b2 has no piece 2 → last piece b2p1 (quad 2 only): none overlap.
		expect(findPreviousBandFacets(bands, 2)).toEqual([undefined, undefined]);
		// b2p1 (quad 2) → b1p1 (quads 2–3).
		expect(findPreviousBandFacets(bands, 7)).toEqual(['b1q2']);
		// b1p2 (quad 4) → b0p2 (quads 4–5).
		expect(findPreviousBandFacets(bands, 5)).toEqual(['b0q4']);
	});

	it('the order of bands in the array does not matter beyond parent order', () => {
		const bands = [piece(0, 1, 1, 3), piece(0, 0, 0, 1), piece(1, 1, 1, 3), piece(1, 0, 0, 1)];
		expect(findPreviousBandFacets(bands, 2)).toEqual(['b0q1', 'b0q2', 'b0q3']);
		expect(findPreviousBandFacets(bands, 1)).toEqual(['b1q0']);
	});
});
