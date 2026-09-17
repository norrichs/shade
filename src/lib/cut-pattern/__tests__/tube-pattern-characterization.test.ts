import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';

import { generateTubeCutPattern } from '../generate-tiled-pattern';
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

describe('generateTubeCutPattern — with splits', () => {
	it('keeps band indices stable and distinguishes pieces', () => {
		// TWO bands, and the split is asserted on the SECOND one. A one-band
		// fixture cannot tell a parent band index from a piece index — both
		// start at 0 — which is exactly the bug this assertion exists to catch.
		const bands = [buildBand(0, 8), buildBand(1, 8)]; // 8 facets = 4 quads each

		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands,
			tiledPatternConfig,
			pixelScale,
			splitQuads: [2]
		});

		expect(result.bands).toHaveLength(4);
		// The band component is the PARENT band index, unchanged by splitting.
		// If it were the piece index this would read [0, 1, 2, 3] and Task 11's
		// seam partners could never resolve a sibling.
		expect(result.bands.map((b) => b.address.band)).toEqual([0, 0, 1, 1]);
		expect(result.bands.map((b) => b.address.piece)).toEqual([0, 1, 0, 1]);
		// Ids must differ or mergedBandPaths hands a piece the wrong geometry
		// (collate-tubes.ts:34-38).
		expect(new Set(result.bands.map((b) => b.id)).size).toBe(4);
		// Neither piece may be refused.
		expect(result.bands.map((b) => b.error)).toEqual([undefined, undefined, undefined, undefined]);
	});

	it('leaves output identical to the baseline when splitQuads is empty', () => {
		const bands = [buildBand(0, 4), buildBand(1, 4)];
		const args = {
			address: { globule: 0, tube: 0 } as const,
			bands,
			tiledPatternConfig,
			pixelScale
		};

		const withoutProp = generateTubeCutPattern(args);
		const withEmpty = generateTubeCutPattern({ ...args, splitQuads: [] });
		expect(withEmpty.bands.map((b) => b.id)).toEqual(withoutProp.bands.map((b) => b.id));
		expect(withEmpty.bands.map((b) => b.facets.length)).toEqual(
			withoutProp.bands.map((b) => b.facets.length)
		);
		// Compare addresses too: comparing only id and facet count would pass even
		// if the piece plumbing perturbed every address or dropped `meta`.
		expect(withEmpty.bands.map((b) => b.address)).toEqual(withoutProp.bands.map((b) => b.address));
		expect(withEmpty.bands.map((b) => b.meta)).toEqual(withoutProp.bands.map((b) => b.meta));
	});
});
