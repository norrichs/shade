import { resolveBaseAndPartners } from '../partner-neighbors';
import type { BandCutPattern } from '$lib/types';

const makeQuad = (id: number) => ({
	a: { x: id * 10, y: 0, z: 0 } as any,
	b: { x: id * 10 + 5, y: 0, z: 0 } as any,
	c: { x: id * 10 + 5, y: 5, z: 0 } as any,
	d: { x: id * 10, y: 5, z: 0 } as any
});

const makeFacet = (id: number) => ({
	path: [
		['M', id, id],
		['L', id + 1, id + 1]
	] as any,
	quad: makeQuad(id),
	label: `${id}`
});

const makeBand = (
	bandIdx: number,
	tube: number,
	facetCount = 3,
	options: any = {}
): BandCutPattern =>
	({
		projectionType: 'patterned',
		address: { globule: 0, tube, band: bandIdx },
		facets: Array.from({ length: facetCount }, (_, i) => makeFacet(bandIdx * 100 + i)),
		meta: options.meta
	}) as any;

describe('resolveBaseAndPartners', () => {
	it('returns null base when address is invalid', () => {
		const bands = [makeBand(0, 0)];
		const result = resolveBaseAndPartners(bands, {
			globule: 0,
			tube: 0,
			band: 99,
			facet: 0
		});
		expect(result).toBeNull();
	});
});

describe('same-band top/bottom resolution', () => {
	it('resolves top as facet+1 within same band when not at end', () => {
		const bands = [makeBand(0, 0, 3)];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 1 });
		expect(result?.top?.role).toBe('top');
		expect(result?.top?.ruleSet).toBe('withinBand');
		expect(result?.top?.address.facet).toBe(2);
	});

	it('resolves bottom as facet-1 within same band when not at start', () => {
		const bands = [makeBand(0, 0, 3)];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 1 });
		expect(result?.bottom?.role).toBe('bottom');
		expect(result?.bottom?.ruleSet).toBe('withinBand');
		expect(result?.bottom?.address.facet).toBe(0);
	});

	it('omits top when base is the last facet (no cross-tube partner band)', () => {
		const bands = [makeBand(0, 0, 3)];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 2 });
		expect(result?.top).toBeNull();
	});

	it('omits bottom when base is facet 0 (no cross-tube partner band)', () => {
		const bands = [makeBand(0, 0, 3)];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 0 });
		expect(result?.bottom).toBeNull();
	});
});

describe('cross-tube partner resolution', () => {
	it('resolves bottom as cross-tube partnerStart when base.facet === 0', () => {
		const bands = [
			makeBand(0, 0, 3, {
				meta: {
					startPartnerBand: { globule: 0, tube: 1, band: 0 }
				}
			}),
			makeBand(0, 1, 3, {
				meta: {
					endPartnerBand: { globule: 0, tube: 0, band: 0 }
				}
			})
		];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 0 });
		expect(result?.bottom?.role).toBe('bottom');
		expect(result?.bottom?.ruleSet).toBe('partner.startEnd');
		expect(result?.bottom?.address.tube).toBe(1);
		expect(result?.bottom?.address.band).toBe(0);
	});

	it('resolves top as cross-tube partnerEnd when base is the last facet', () => {
		const bands = [
			makeBand(0, 0, 3, {
				meta: {
					endPartnerBand: { globule: 0, tube: 1, band: 0 }
				}
			}),
			makeBand(0, 1, 3, {
				meta: {
					startPartnerBand: { globule: 0, tube: 0, band: 0 }
				}
			})
		];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 2 });
		expect(result?.top?.role).toBe('top');
		expect(result?.top?.ruleSet).toBe('partner.endEnd');
		expect(result?.top?.address.tube).toBe(1);
	});
});

describe('left/right partner resolution', () => {
	it('resolves right partner from band+1 same tube', () => {
		const bands = [makeBand(0, 0), makeBand(1, 0)];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 1 });
		expect(result?.right?.role).toBe('right');
		expect(result?.right?.ruleSet).toBe('acrossBands');
		expect(result?.right?.address.band).toBe(1);
		expect(result?.right?.address.facet).toBe(1);
	});

	it('resolves left partner from band-1 same tube', () => {
		const bands = [makeBand(0, 0), makeBand(1, 0)];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 1, facet: 1 });
		expect(result?.left?.role).toBe('left');
		expect(result?.left?.ruleSet).toBe('acrossBands');
		expect(result?.left?.address.band).toBe(0);
	});

	it('omits left/right when adjacent band missing', () => {
		const bands = [makeBand(0, 0)]; // only one band in the tube
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 1 });
		expect(result?.left).toBeNull();
		expect(result?.right).toBeNull();
	});

	it('positions right partner so its left edge coincides with base right edge', () => {
		// base quad: a=(0,0), b=(5,0), c=(5,5), d=(0,5) — width 5, height 5
		// right partner pre-transform: a=(100,0), b=(105,0), c=(105,5), d=(100,5)
		// after rigid transform: partner.a should land on base.b=(5,0), partner.d on base.c=(5,5)
		const baseFacet = {
			path: [
				['M', 0, 0],
				['L', 5, 0]
			],
			quad: { a: { x: 0, y: 0, z: 0 }, b: { x: 5, y: 0, z: 0 }, c: { x: 5, y: 5, z: 0 }, d: { x: 0, y: 5, z: 0 } },
			label: '0'
		} as any;
		const rightFacet = {
			path: [
				['M', 100, 0],
				['L', 105, 0]
			],
			quad: { a: { x: 100, y: 0, z: 0 }, b: { x: 105, y: 0, z: 0 }, c: { x: 105, y: 5, z: 0 }, d: { x: 100, y: 5, z: 0 } },
			label: '0'
		} as any;
		const baseBand = {
			projectionType: 'patterned',
			address: { globule: 0, tube: 0, band: 0 },
			facets: [baseFacet]
		} as any;
		const rightBand = {
			projectionType: 'patterned',
			address: { globule: 0, tube: 0, band: 1 },
			facets: [rightFacet]
		} as any;
		const result = resolveBaseAndPartners([baseBand, rightBand], {
			globule: 0,
			tube: 0,
			band: 0,
			facet: 0
		});
		const r = result?.right;
		expect(r).not.toBeNull();
		expect(r!.quad.a.x).toBeCloseTo(5);
		expect(r!.quad.a.y).toBeCloseTo(0);
		expect(r!.quad.d.x).toBeCloseTo(5);
		expect(r!.quad.d.y).toBeCloseTo(5);
	});
});
