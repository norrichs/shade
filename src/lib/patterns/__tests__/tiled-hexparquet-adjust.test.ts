import { Vector3 } from 'three';
import type { BandCutPattern, PathSegment, Quadrilateral, TiledPatternConfig } from '$lib/types';
import { transformPatternByQuad } from '../quadrilateral';
import {
	adjustHexparquetAfterMapping,
	adjustHexparquetAfterTiling,
	generateHexparquetSubunits
} from '../tiled-hexparquet-pattern';

const config = (columnCount = 1): TiledPatternConfig => ({
	type: 'tiledHexparquetPattern-0',
	tiling: 'quadrilateral',
	config: {
		rowCount: 1,
		columnCount,
		dynamicStroke: 'quadWidth',
		dynamicStrokeEasing: 'linear',
		dynamicStrokeMin: 1,
		dynamicStrokeMax: 3,
		endsMatched: false,
		endsTrimmed: false,
		endLooped: 0,
		scaleConfig: { unit: 'px', unitPerSvgUnit: 1, quantity: 1 }
	}
});

// Rectangular quads of the given width, stacked along +y, starting at x = x0.
const quads = (count: number, x0: number, width: number): Quadrilateral[] =>
	Array.from({ length: count }, (_, i) => ({
		a: new Vector3(x0, i, 0),
		b: new Vector3(x0 + width, i, 0),
		c: new Vector3(x0 + width, i + 1, 0),
		d: new Vector3(x0, i + 1, 0)
	}));

const mapBand = (qs: Quadrilateral[], columns = 1): PathSegment[][] => {
	const subunits = generateHexparquetSubunits(columns);
	return qs.map((q, i) => transformPatternByQuad(subunits[i % 3], q));
};

const cutBand = (band: number, qs: Quadrilateral[], leftPartnerBand?: number): BandCutPattern =>
	({
		id: `b${band}`,
		projectionType: 'patterned',
		tagAnchorPoint: { x: 0, y: 0 },
		address: { globule: 0, tube: 0, band },
		leftPartnerBand,
		facets: mapBand(qs).map((path, i) => ({ path, quad: qs[i], label: `${i}` }))
	}) as BandCutPattern;

describe('adjustHexparquetAfterMapping', () => {
	it("moves green's up node onto the next red facet's right apex", () => {
		const qs = quads(3, 0, 1);
		const mapped = mapBand(qs);
		const adjusted = adjustHexparquetAfterMapping(mapped, qs, config());
		// green segment 5 `from` (index 10) ← red right apex: red quad (0..1, 2..3) → (5/6, 2.5)
		expect(adjusted[1][10][1]).toBeCloseTo(5 / 6);
		expect(adjusted[1][10][2]).toBeCloseTo(2.5);
		// green segment 4 `to` (index 9) ← blue right apex (5/6, 0.5)
		expect(adjusted[1][9][1]).toBeCloseTo(5 / 6);
		expect(adjusted[1][9][2]).toBeCloseTo(0.5);
	});
});

describe('adjustHexparquetAfterTiling', () => {
	it("snaps the left apex onto the partner band's right apex, in this band's frame", () => {
		// Partner band 0 is twice as wide, so its right apex (5/3) lands 1/3 left of
		// band 1's left edge — distinguishable from band 1's own extrapolation (-1/6).
		const band0 = cutBand(0, quads(3, 0, 2));
		const band1 = cutBand(1, quads(3, 10, 1), 0);
		const [, adjusted] = adjustHexparquetAfterTiling([band0, band1], config());
		// green facet 1, segment 2 `from` (◀, index 4), after the partner drop removed
		// indices 2 and 3 → now index 2
		const apex = adjusted.facets[1].path[2];
		expect(apex[0]).toBe('M');
		expect(apex[1]).toBeCloseTo(10 - 1 / 3);
		expect(apex[2]).toBeCloseTo(1.5);
	});

	it('drops the partner segment only on bands with a left partner', () => {
		const band0 = cutBand(0, quads(3, 0, 1));
		const band1 = cutBand(1, quads(3, 0, 1), 0);
		const [a, b] = adjustHexparquetAfterTiling([band0, band1], config());
		expect(a.facets[1].path).toHaveLength(18);
		expect(b.facets[1].path).toHaveLength(16);
	});

	it("drops blue's bottom line on every blue facet but the first", () => {
		const band = cutBand(0, quads(6, 0, 1));
		const [adjusted] = adjustHexparquetAfterTiling([band], config());
		expect(adjusted.facets[0].path).toHaveLength(20);
		expect(adjusted.facets[3].path).toHaveLength(18);
	});

	it('keeps the extrapolated apex when the partner band is not in range', () => {
		const band1 = cutBand(1, quads(3, 10, 1), 0);
		const [adjusted] = adjustHexparquetAfterTiling([band1], config());
		expect(adjusted.facets[1].path[2][1]).toBeCloseTo(10 - 1 / 6);
	});

	it('leaves refused bands untouched', () => {
		const refused = { ...cutBand(0, []), error: 'nope' } as BandCutPattern;
		expect(adjustHexparquetAfterTiling([refused], config())[0]).toEqual(refused);
	});
});
