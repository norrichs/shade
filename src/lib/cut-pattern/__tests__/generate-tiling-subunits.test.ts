import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';
import type { Band, PathSegment, Quadrilateral, TiledPatternConfig } from '$lib/types';
import { patterns } from '$lib/patterns/pattern-definitions';
import { generateTiling, getLeftPartnerBandIndex } from '../generate-tiled-pattern';

// Rectangular quads stacked along +y: quad[i+1].a === quad[i].d (real band convention).
const makeQuads = (count: number): Quadrilateral[] =>
	Array.from({ length: count }, (_, i) => ({
		a: new Vector3(0, i, 0),
		b: new Vector3(1, i, 0),
		c: new Vector3(1, i + 1, 0),
		d: new Vector3(0, i + 1, 0)
	}));

type PartnerRef = { tube: number; band: number };

// Two facets per quad; `partners` puts a partner on each facet's `ac` edge.
const makeBand = (quadCount: number, bandIndex: number, partners: PartnerRef[] = []): Band =>
	({
		orientation: 'axial-right',
		visible: true,
		facets: makeQuads(quadCount).flatMap((q, i) =>
			[0, 1].map((k) => ({
				triangle: k === 0 ? new Triangle(q.a, q.b, q.c) : new Triangle(q.c, q.d, q.a),
				orientation: 'axial-right',
				address: { globule: 0, tube: 0, band: bandIndex, facet: 2 * i + k },
				meta: partners.length
					? {
							ac: {
								partner: {
									globule: 0,
									...partners[(2 * i + k) % partners.length],
									facet: 0,
									edge: 'ac'
								}
							}
						}
					: undefined
			}))
		)
	}) as unknown as Band;

const config = (type: string): TiledPatternConfig => ({
	type,
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
});

const LOW: PathSegment[] = [
	['M', 0, 0],
	['L', 1, 0]
];
const HIGH: PathSegment[] = [
	['M', 0, 1],
	['L', 1, 1]
];

patterns['test-subunits'] = {
	subunitCount: 2,
	getPattern: () => LOW,
	getSubunitPatterns: () => [LOW, HIGH]
};
patterns['test-legacy'] = { getPattern: () => HIGH };

const tile = (type: string, quadCount: number, band = makeBand(quadCount, 0)) =>
	generateTiling({
		quadBands: [makeQuads(quadCount)],
		bands: [band],
		tiledPatternConfig: config(type),
		address: { globule: 0, tube: 0 }
	})[0];

describe('generateTiling subunits', () => {
	it('cycles subunit patterns across quads by index', () => {
		const band = tile('test-subunits', 4);
		expect(band.error).toBeUndefined();
		expect(band.facets.map((f) => f.path[0])).toEqual([
			['M', 0, 0], // quad 0, LOW
			['M', 0, 2], // quad 1, HIGH (unit y = 1 → quad1.d)
			['M', 0, 2], // quad 2, LOW (unit y = 0 → quad2.a)
			['M', 0, 4] //  quad 3, HIGH
		]);
	});

	it('refuses a band whose quad count is not divisible by subunitCount', () => {
		const band = tile('test-subunits', 3);
		expect(band.facets).toEqual([]);
		expect(band.error).toBe('test-subunits needs a quad count divisible by 2 (got 3)');
		expect(band.address.band).toBe(0);
	});

	it('maps legacy single-pattern entries onto every quad', () => {
		const band = tile('test-legacy', 3);
		expect(band.facets.map((f) => f.path[0])).toEqual([
			['M', 0, 1],
			['M', 0, 2],
			['M', 0, 3]
		]);
	});

	it('records the left partner band', () => {
		const band = tile(
			'test-legacy',
			2,
			makeBand(2, 3, [
				{ tube: 0, band: 2 },
				{ tube: 0, band: 4 }
			])
		);
		expect(band.leftPartnerBand).toBe(2);
	});
});

describe('getLeftPartnerBandIndex', () => {
	it('is the band one index lower', () => {
		expect(
			getLeftPartnerBandIndex(
				makeBand(1, 3, [
					{ tube: 0, band: 2 },
					{ tube: 0, band: 4 }
				])
			)
		).toBe(2);
	});

	it('is undefined for band 0 of an open tube', () => {
		expect(getLeftPartnerBandIndex(makeBand(1, 0, [{ tube: 0, band: 1 }]))).toBeUndefined();
	});

	it("is the tube's last band for band 0 of a wrapping tube", () => {
		expect(
			getLeftPartnerBandIndex(
				makeBand(1, 0, [
					{ tube: 0, band: 1 },
					{ tube: 0, band: 5 }
				])
			)
		).toBe(5);
	});

	it('ignores partners in other tubes and within the band', () => {
		expect(
			getLeftPartnerBandIndex(
				makeBand(1, 3, [
					{ tube: 1, band: 2 },
					{ tube: 0, band: 3 }
				])
			)
		).toBeUndefined();
	});

	it('is undefined when facets carry no address', () => {
		const band = makeBand(1, 3, [{ tube: 0, band: 2 }]);
		band.facets.forEach((f) => delete f.address);
		expect(getLeftPartnerBandIndex(band)).toBeUndefined();
	});
});
