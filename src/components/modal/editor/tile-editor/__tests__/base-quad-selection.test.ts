import { describe, it, expect } from '@jest/globals';
import type { BandCutPattern } from '$lib/types';
import type { GlobuleAddress_Band, GlobuleAddress_BandPiece } from '$lib/projection-geometry/types';
import { bandOptionsForTube, facetAddressOf } from '../base-quad-selection';

const band = (address: GlobuleAddress_Band | GlobuleAddress_BandPiece, facets: number) =>
	({
		projectionType: 'patterned',
		address,
		facets: Array.from({ length: facets }, () => ({ path: [], label: '' }))
	}) as unknown as BandCutPattern;

describe('bandOptionsForTube', () => {
	it('unsplit tube: one row per band, labelled b{band}, keyed by address', () => {
		// Band range starting at 2: array position and band index differ.
		const bands = [
			band({ globule: 0, tube: 3, band: 2 }, 4),
			band({ globule: 0, tube: 3, band: 3 }, 5)
		];
		expect(bandOptionsForTube(bands)).toEqual([
			{ key: 'b2', label: 'b2', address: { globule: 0, tube: 3, band: 2 }, facetCount: 4 },
			{ key: 'b3', label: 'b3', address: { globule: 0, tube: 3, band: 3 }, facetCount: 5 }
		]);
	});

	it('split tube: each piece is its own row with its piece-bearing address and length', () => {
		// b0 cut into p0 (3 quads) and p1 (2 quads); b1 short and uncut.
		const bands = [
			band({ globule: 0, tube: 1, band: 0, piece: 0 }, 3),
			band({ globule: 0, tube: 1, band: 0, piece: 1 }, 2),
			band({ globule: 0, tube: 1, band: 1 }, 2)
		];
		expect(bandOptionsForTube(bands)).toEqual([
			{
				key: 'b0p0',
				label: 'b0p0',
				address: { globule: 0, tube: 1, band: 0, piece: 0 },
				facetCount: 3
			},
			{
				key: 'b0p1',
				label: 'b0p1',
				address: { globule: 0, tube: 1, band: 0, piece: 1 },
				facetCount: 2
			},
			{ key: 'b1', label: 'b1', address: { globule: 0, tube: 1, band: 1 }, facetCount: 2 }
		]);
	});
});

describe('facetAddressOf', () => {
	it('keeps the piece of a piece selection', () => {
		expect(
			facetAddressOf({ source: 'projection', globule: 0, tube: 1, band: 0, piece: 1, facet: 1 })
		).toEqual({ globule: 0, tube: 1, band: 0, piece: 1, facet: 1 });
	});

	it('adds no piece key to an unsplit selection', () => {
		const address = facetAddressOf({
			source: 'projection',
			globule: 0,
			tube: 1,
			band: 2,
			facet: 3
		});
		expect(address).toEqual({ globule: 0, tube: 1, band: 2, facet: 3 });
		expect(Object.hasOwn(address, 'piece')).toBe(false);
	});
});
