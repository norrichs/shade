import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import { getEndPartnerTransform } from '../generate-pattern';
import type { BandCutPattern } from '$lib/types';

// Regression test for the crash in getEndPartnerTransform (reached via
// getEndPartnerTransforms) when a tube-end partner band was refused by
// generateTiling: refused bands have `facets: []` and no `meta`, so
// `partnerBand.facets[partnerBand.facets.length - 1].quad` used to throw a
// TypeError ("Cannot read properties of undefined (reading 'quad')").
describe('getEndPartnerTransform with a refused partner band', () => {
	const address = { globule: 0, tube: 0, band: 0 };
	const ends = { originEnd: 'start', partnerEnd: 'end' } as const;

	const patternedOriginBand: BandCutPattern = {
		facets: [
			{
				path: [],
				label: 'origin',
				quad: {
					a: new Vector3(0, 0, 0),
					b: new Vector3(1, 0, 0),
					c: new Vector3(1, 1, 0),
					d: new Vector3(0, 1, 0)
				}
			}
		],
		id: 'origin-band',
		tagAnchorPoint: { x: 0, y: 0 },
		projectionType: 'patterned',
		address: { ...address, band: 0 }
	};

	const refusedPartnerBand: BandCutPattern = {
		facets: [],
		id: 'refused-band',
		tagAnchorPoint: { x: 0, y: 0 },
		projectionType: 'patterned',
		address: { ...address, tube: 1, band: 0 },
		error: 'tiledHexparquetPattern-0 needs a quad count divisible by 3 (got 20)'
	};

	it('does not throw and returns a null-ish transform when the partner band has no facets', () => {
		expect(() =>
			getEndPartnerTransform(patternedOriginBand, refusedPartnerBand, ends)
		).not.toThrow();

		const transform = getEndPartnerTransform(patternedOriginBand, refusedPartnerBand, ends);
		expect(transform).toEqual({
			translate: { x: 0, y: 0, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			rotate: { x: 0, y: 0, z: 0 }
		});
	});

	it('does not throw and returns a null-ish transform when the origin band has no facets', () => {
		expect(() =>
			getEndPartnerTransform(refusedPartnerBand, patternedOriginBand, ends)
		).not.toThrow();
	});
});
