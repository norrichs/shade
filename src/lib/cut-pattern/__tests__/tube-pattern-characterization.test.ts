import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';

import { generateTubeCutPattern } from '../generate-tiled-pattern';
import type { Band, Facet, PixelScale, TiledPatternConfig } from '$lib/types';

// A flat-ish strip of `facetCount` triangles zig-zagging up the y axis. This
// mirrors the fixture approach in generate-tiling-subunits.test.ts (facets
// carry `address` so generateTubeCutPattern/generateTiling can derive band
// indices), but built as 3D triangles since generateTubeCutPattern flattens
// bands itself via getFlatStripV2.
const buildBand = (bandIndex: number, facetCount: number): Band =>
	({
		orientation: 'axial-right',
		visible: true,
		facets: Array.from({ length: facetCount }, (_, i) => {
			const y = i;
			const triangle =
				i % 2 === 0
					? new Triangle(new Vector3(0, y, 0), new Vector3(1, y, 0), new Vector3(0, y + 1, 0))
					: new Triangle(new Vector3(1, y, 0), new Vector3(1, y + 1, 0), new Vector3(0, y + 1, 0));
			return {
				triangle,
				orientation: 'axial-right',
				address: { globule: 0, tube: 0, band: bandIndex, facet: i }
			} satisfies Facet;
		})
	}) as unknown as Band;

const pixelScale: PixelScale = { value: 1, unit: 'mm' };

// 'tiledHexPattern-1' is the real default hex spec id registered in
// pattern-definitions.ts (via pattern-registry.ts's `hex` algorithm), with no
// subunitCount (so a quad count of 2 per band is valid). The full `config`
// object shape (dynamicStroke/scaleConfig/etc.) mirrors the fixture in
// generate-tiling-subunits.test.ts, since TiledPatternConfig['config']
// requires all of these fields.
const tiledPatternConfig: TiledPatternConfig = {
	type: 'tiledHexPattern-1',
	tiling: 'quadrilateral',
	config: {
		rowCount: 1,
		columnCount: 1,
		dynamicStroke: 'quadWidth',
		dynamicStrokeEasing: 'linear',
		dynamicStrokeMin: 1,
		dynamicStrokeMax: 3,
		endsMatched: false,
		endsTrimmed: false,
		endLooped: 0,
		scaleConfig: { unit: 'px', unitPerSvgUnit: 1, quantity: 1 }
	}
};

describe('generateTubeCutPattern — characterization (no splits)', () => {
	it('produces a stable band pattern for a 2-band tube', () => {
		const bands = [buildBand(0, 4), buildBand(1, 4)];

		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands,
			tiledPatternConfig,
			pixelScale
		});

		// Structural invariants that must survive the piece refactor untouched.
		expect(result.bands).toHaveLength(2);
		expect(result.bands.map((b) => b.address)).toEqual([
			{ globule: 0, tube: 0, band: 0 },
			{ globule: 0, tube: 0, band: 1 }
		]);
		expect(result.bands.every((b) => b.address.piece === undefined)).toBe(true);
		expect(result.bands.map((b) => b.id)).toMatchSnapshot('band ids');
		expect(result.bands.map((b) => b.facets.length)).toMatchSnapshot('facet counts');
		expect(result.bands.map((b) => b.error)).toMatchSnapshot('errors');
	});
});
