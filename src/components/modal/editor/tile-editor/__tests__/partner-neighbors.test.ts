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
