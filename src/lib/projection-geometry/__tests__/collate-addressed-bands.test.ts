import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';
import { collateAddressedBandGeometry } from '../collate-geometry';
import type { Band } from '$lib/types';

const facet = (band: number, facetIndex: number) => ({
	triangle: new Triangle(
		new Vector3(facetIndex, 0, 0),
		new Vector3(0, band, 0),
		new Vector3(0, 0, 1)
	),
	address: { globule: 0, tube: 2, band, facet: facetIndex },
	orientation: 'lesser' as const
});

const band = (index: number, withAddress: boolean): Band =>
	({
		orientation: 'axial-right',
		visible: true,
		facets: [facet(index, 0), facet(index, 1)],
		...(withAddress ? { address: { globule: 0, tube: 2, band: index } } : {})
	}) as unknown as Band;

describe('collateAddressedBandGeometry', () => {
	it('pairs each band geometry with the band address', () => {
		const out = collateAddressedBandGeometry([band(0, true), band(1, true)]);
		expect(out).toHaveLength(2);
		expect(out.map((b) => b.address)).toEqual([
			{ globule: 0, tube: 2, band: 0 },
			{ globule: 0, tube: 2, band: 1 }
		]);
		// three points per facet, two facets per band
		expect(out[0].geometry.getAttribute('position').count).toBe(6);
	});

	// Globule-tube bands are generated without a `band.address` on the
	// non-lateral code paths, so fall back to the address its facets carry —
	// otherwise those bands cannot be matched against a highlight.
	it('falls back to the facet address when the band has none', () => {
		const out = collateAddressedBandGeometry([band(3, false)]);
		expect(out[0].address).toEqual({ globule: 0, tube: 2, band: 3 });
	});

	it('skips bands with no resolvable address rather than mis-addressing them', () => {
		const orphan = { orientation: 'axial-right', visible: true, facets: [] } as unknown as Band;
		expect(collateAddressedBandGeometry([orphan])).toHaveLength(0);
	});
});
