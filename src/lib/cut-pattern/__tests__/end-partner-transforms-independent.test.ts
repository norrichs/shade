import { describe, it, expect } from '@jest/globals';

import { getEndPartnerTransforms, findBandByAddress } from '../generate-pattern';
import type { BandCutPattern, TubeCutPattern } from '$lib/types';

// Two quads' worth of path so getEndPartnerTransform has geometry to read.
const band = (address: BandCutPattern['address'], meta: BandCutPattern['meta']): BandCutPattern =>
	({
		address,
		meta,
		id: `id-${JSON.stringify(address)}`,
		facets: [
			{
				path: [
					['M', 0, 0],
					['L', 1, 0]
				],
				label: '0'
			},
			{
				path: [
					['M', 0, 1],
					['L', 1, 1]
				],
				label: '1'
			}
		]
	}) as unknown as BandCutPattern;

const tube = (bands: BandCutPattern[]): TubeCutPattern =>
	({ projectionType: 'patterned', address: { globule: 0, tube: 0 }, bands }) as TubeCutPattern;

describe('getEndPartnerTransforms — each end resolved independently', () => {
	it('sets the seam end transform even when the outer end has no partner', () => {
		// This is the whole point of the widening. Previously both transforms were
		// gated on both addresses, so a piece whose outer end is unpartnered got
		// NEITHER — and its seam silently failed to overlap.
		// The sibling-piece meta addresses below are piece-bearing
		// (GlobuleAddress_BandPiece) — this is the seam-partner shape Task 11
		// produces, not a fixture quirk, and the meta field's type admits it.
		const p0 = band(
			{ globule: 0, tube: 0, band: 0, piece: 0 },
			{
				endPartnerBand: { globule: 0, tube: 0, band: 0, piece: 1 }
			}
		);
		const p1 = band(
			{ globule: 0, tube: 0, band: 0, piece: 1 },
			{
				startPartnerBand: { globule: 0, tube: 0, band: 0, piece: 0 }
			}
		);

		getEndPartnerTransforms([tube([p0, p1])]);

		expect(p0.meta?.endPartnerTransform).toBeDefined();
		expect(p0.meta?.startPartnerTransform).toBeUndefined();
		expect(p1.meta?.startPartnerTransform).toBeDefined();
		expect(p1.meta?.endPartnerTransform).toBeUndefined();
	});

	it('still sets both transforms when both ends resolve', () => {
		// The unsplit case, unchanged.
		const a = band(
			{ globule: 0, tube: 0, band: 0 },
			{
				startPartnerBand: { globule: 0, tube: 0, band: 1 },
				endPartnerBand: { globule: 0, tube: 0, band: 1 }
			}
		);
		const b = band(
			{ globule: 0, tube: 0, band: 1 },
			{
				startPartnerBand: { globule: 0, tube: 0, band: 0 },
				endPartnerBand: { globule: 0, tube: 0, band: 0 }
			}
		);

		getEndPartnerTransforms([tube([a, b])]);

		expect(a.meta?.startPartnerTransform).toBeDefined();
		expect(a.meta?.endPartnerTransform).toBeDefined();
	});

	it('leaves a band with no meta alone', () => {
		const plain = band({ globule: 0, tube: 0, band: 0 }, undefined);
		getEndPartnerTransforms([tube([plain])]);
		expect(plain.meta).toBeUndefined();
	});

	it('resolves a cross-band partner to the piece with the matching index', () => {
		// p1 asking must land on the partner's p1. With fromPiece omitted this
		// returns the partner's LAST piece and the assertion catches it.
		const partner0 = band({ globule: 0, tube: 1, band: 0, piece: 0 }, undefined);
		const partner1 = band({ globule: 0, tube: 1, band: 0, piece: 1 }, undefined);
		const asker = band(
			{ globule: 0, tube: 0, band: 0, piece: 1 },
			{
				startPartnerBand: { globule: 0, tube: 1, band: 0 }
			}
		);

		getEndPartnerTransforms([tube([asker]), tube([partner0, partner1])]);

		expect(
			findBandByAddress(
				[tube([asker]), tube([partner0, partner1])],
				{ globule: 0, tube: 1, band: 0 },
				1
			)?.address
		).toEqual({ globule: 0, tube: 1, band: 0, piece: 1 });
	});
});
