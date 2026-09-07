import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';
import { collateAddressedBandGeometry, collateVoronoiGeometry } from '../collate-geometry';
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

	// This feeds ordinary band rendering, not just highlighting, so a band with no
	// resolvable address must still produce geometry — dropping it would make the
	// mesh disappear from the 3D view. It just carries no address, so it can never
	// match a highlight (guessing an index would highlight the wrong band).
	it('emits geometry without an address rather than mis-addressing or dropping it', () => {
		const orphan = {
			orientation: 'axial-right',
			visible: true,
			facets: [{ triangle: new Triangle(new Vector3(), new Vector3(), new Vector3()) }]
		} as unknown as Band;
		const out = collateAddressedBandGeometry([orphan]);
		expect(out).toHaveLength(1);
		expect(out[0].address).toBeUndefined();
		expect(out[0].geometry.getAttribute('position').count).toBe(3);
	});
});

describe('collateVoronoiGeometry', () => {
	// Voronoi is normally viewed bands-only (facets off), so unaddressed band
	// meshes left that view with nothing the Assembler highlight could match.
	const tube = (tubeIndex: number, bandCount: number) => ({
		sections: [],
		address: { globule: 0, tube: tubeIndex },
		bands: Array.from({ length: bandCount }, (_, b) => ({
			orientation: 'axial-right',
			visible: true,
			address: { globule: 0, tube: tubeIndex, band: b },
			facets: [facet(b, 0)]
		}))
	});

	const show = {
		any: true,
		sections: false,
		bands: true,
		facets: false,
		surfaceProjection: false
	};

	it('addresses both the main bands and the one-sided rim bands', () => {
		// A single-band tube is the rim discriminator; two-band tubes are main tubes.
		const out = collateVoronoiGeometry([tube(0, 2), tube(1, 1)] as never, [], show as never);
		expect(out.bands?.map((b) => b.address)).toEqual([
			{ globule: 0, tube: 0, band: 0 },
			{ globule: 0, tube: 0, band: 1 }
		]);
		expect(out.rimBands?.map((b) => b.address)).toEqual([{ globule: 0, tube: 1, band: 0 }]);
	});
});
