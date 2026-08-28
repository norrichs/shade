import { describe, it, expect } from '@jest/globals';

import { applyStrokeWidth } from '../generate-cut-pattern';
import type { BandCutPattern, CutPattern } from '$lib/types';

const facet = (quadWidth: number): CutPattern => ({ path: [], quadWidth }) as unknown as CutPattern;

const band = (quadWidths: number[]): BandCutPattern =>
	({ facets: quadWidths.map(facet) }) as unknown as BandCutPattern;

/**
 * The renderer draws one path PER FACET at that facet's own width, so the whole
 * dynamic-stroke feature rests on every facet getting its own value spanning the
 * configured range. (Drawing the band as a single path collapsed all of this to
 * facets[0]'s width and made the configured min/max look inert — see
 * BandCutPatternComponent.)
 */
describe('applyStrokeWidth', () => {
	const config = {
		dynamicStroke: 'quadWidth' as const,
		dynamicStrokeEasing: 'linear' as const,
		dynamicStrokeMin: 0.1,
		dynamicStrokeMax: 4.9
	};

	it('maps quad widths across the full configured min..max range', () => {
		const [out] = applyStrokeWidth([band([1, 2, 3, 4, 5])], config);
		const widths = out.facets.map((f) => f.strokeWidth as number);

		expect(widths[0]).toBeCloseTo(0.1);
		expect(widths[widths.length - 1]).toBeCloseTo(4.9);
		widths.forEach((w) => {
			expect(w).toBeGreaterThanOrEqual(0.1);
			expect(w).toBeLessThanOrEqual(4.9);
		});
	});

	it('gives distinct facets distinct widths, not one width for the whole band', () => {
		const [out] = applyStrokeWidth([band([1, 3, 5])], config);
		const widths = out.facets.map((f) => f.strokeWidth);
		expect(new Set(widths).size).toBe(3);
	});

	// Min/max are taken across every band, so a narrow band stays narrow relative
	// to a wide one instead of each band re-normalising to its own extremes.
	it('normalises across all bands, not per band', () => {
		const [narrow, wide] = applyStrokeWidth([band([1, 2]), band([4, 5])], config);
		expect(narrow.facets[0].strokeWidth).toBeCloseTo(0.1);
		expect(wide.facets[1].strokeWidth).toBeCloseTo(4.9);
		expect(narrow.facets[1].strokeWidth as number).toBeLessThan(
			wide.facets[0].strokeWidth as number
		);
	});
});
