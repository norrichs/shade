import { describe, it, expect } from '@jest/globals';
import { buildBandRingLookup } from '../band-ring-lookup';
import type { BandSortIndex } from '$lib/types';
import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';

const band = (tube: number, b: number): GlobuleAddress_Band => ({ globule: 0, tube, band: b });
const piece = (tube: number, b: number, p: number): GlobuleAddress_Band =>
	({ globule: 0, tube, band: b, piece: p }) as GlobuleAddress_Band;

describe('buildBandRingLookup', () => {
	it('returns the ring of an unsplit band', () => {
		const ring = [band(0, 0), band(1, 0)];
		const lookup = buildBandRingLookup({
			mode: 'end-connection-tube',
			groups: [
				{ label: 'a', bands: ring },
				{ label: 'b', bands: [band(0, 1)] }
			]
		});
		expect(lookup(band(1, 0))).toBe(ring);
		expect(lookup(band(9, 9))).toEqual([]);
	});

	// Generation currently puts every piece of a parent in one ring, so this is a
	// contract test: a piece's ring is the ring holding THAT piece, not whichever
	// of its siblings' rings was indexed last.
	it("returns a piece's own ring when its siblings sit in other rings", () => {
		const ringA = [piece(0, 0, 0), band(1, 0)];
		const ringB = [piece(0, 0, 1), band(2, 0)];
		const index: BandSortIndex = {
			mode: 'end-connection-tube',
			groups: [
				{ label: 'a', bands: ringA },
				{ label: 'b', bands: ringB }
			]
		};
		const lookup = buildBandRingLookup(index);
		expect(lookup(piece(0, 0, 0))).toBe(ringA);
		expect(lookup(piece(0, 0, 1))).toBe(ringB);
	});

	// Preservation guard (passes before the fix too): the 3D view has no pieces and
	// sends the plain parent address, which must still find the ring its pieces are
	// in, so clicking a split band there highlights the whole ring.
	it('resolves a plain parent address to its pieces’ ring', () => {
		const ring = [piece(0, 0, 0), piece(0, 0, 1), band(1, 0)];
		const lookup = buildBandRingLookup({
			mode: 'end-connection-tube',
			groups: [{ label: 'a', bands: ring }]
		});
		expect(lookup(band(0, 0))).toBe(ring);
	});
});
