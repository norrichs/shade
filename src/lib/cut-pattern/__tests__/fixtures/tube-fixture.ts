import { Triangle, Vector3 } from 'three';

import type { Band, Facet, PixelScale, TiledPatternConfig } from '$lib/types';

// A flat-ish strip of `facetCount` triangles zig-zagging up the y axis. This
// mirrors the fixture approach in generate-tiling-subunits.test.ts (facets
// carry `address` so generateTubeCutPattern/generateTiling can derive band
// indices), but built as 3D triangles since generateTubeCutPattern flattens
// bands itself via getFlatStripV2.
//
// Tests use 4 facets per band because getQuadrilaterals pairs facets on
// `i % 2 === 1`, so quad k is built from facets 2k and 2k+1 — 4 facets
// yields exactly 2 whole quads. An odd trailing facet would be silently
// dropped rather than forming a partial quad.
export const buildBand = (bandIndex: number, facetCount: number): Band =>
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

export const pixelScale: PixelScale = { value: 1, unit: 'mm' };

// 'tiledHexPattern-1' is the real default hex spec id registered in
// pattern-definitions.ts (via pattern-registry.ts's `hex` algorithm), with no
// subunitCount (so a quad count of 2 per band is valid). The full `config`
// object shape (dynamicStroke/scaleConfig/etc.) mirrors the fixture in
// generate-tiling-subunits.test.ts, since TiledPatternConfig['config']
// requires all of these fields.
export const tiledPatternConfig: TiledPatternConfig = {
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
