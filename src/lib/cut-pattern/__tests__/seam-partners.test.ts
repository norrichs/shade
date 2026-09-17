import { describe, it, expect } from '@jest/globals';

import { generateTubeCutPattern } from '../generate-tiled-pattern';
import { buildBand, pixelScale, tiledPatternConfig } from './fixtures/tube-fixture';

describe('seam partners', () => {
	it('points each piece at its sibling across the seam', () => {
		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands: [buildBand(0, 8)],
			tiledPatternConfig,
			pixelScale,
			splitQuads: [2]
		});

		const [p0, p1] = result.bands;
		// p0's end meets p1's start.
		expect(p0.meta?.endPartnerBand).toEqual({ globule: 0, tube: 0, band: 0, piece: 1 });
		expect(p1.meta?.startPartnerBand).toEqual({ globule: 0, tube: 0, band: 0, piece: 0 });
	});

	it('is reciprocal, which the facet-index disambiguation relies on', () => {
		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands: [buildBand(0, 12)],
			tiledPatternConfig,
			pixelScale,
			splitQuads: [2, 4]
		});

		const [p0, p1, p2] = result.bands;
		expect(p1.meta?.startPartnerBand).toEqual(p0.address);
		expect(p0.meta?.endPartnerBand).toEqual(p1.address);
		expect(p2.meta?.startPartnerBand).toEqual(p1.address);
		expect(p1.meta?.endPartnerBand).toEqual(p2.address);
	});

	it('sets meta even when the outer end has no partner', () => {
		// The fixture has no cross-band partner meta, so the outer ends are
		// unpartnered. Before this change, meta would have been dropped entirely
		// and the seam would not have matched.
		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands: [buildBand(0, 8)],
			tiledPatternConfig,
			pixelScale,
			splitQuads: [2]
		});
		expect(result.bands[0].meta).toBeDefined();
		expect(result.bands[0].meta?.endPartnerBand).toBeDefined();
	});
});
