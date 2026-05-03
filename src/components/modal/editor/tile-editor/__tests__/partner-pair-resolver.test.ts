import {
	getEligibleBands,
	resolvePair,
	pairsEqual,
	type ResolvedPair
} from '../partner-pair-resolver';
import type { BandCutPattern } from '$lib/types';
import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';

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
	options: {
		startPartnerBand?: GlobuleAddress_Band;
		endPartnerBand?: GlobuleAddress_Band;
		startPartnerTransform?: {
			translate: { x: number; y: number; z: number };
			rotate: { z: number };
		};
		endPartnerTransform?: { translate: { x: number; y: number; z: number }; rotate: { z: number } };
	} = {}
): BandCutPattern =>
	({
		projectionType: 'patterned',
		address: { globule: 0, tube, band: bandIdx },
		facets: [makeFacet(bandIdx * 10), makeFacet(bandIdx * 10 + 1), makeFacet(bandIdx * 10 + 2)],
		meta:
			options.startPartnerBand || options.endPartnerBand
				? {
						...(options.startPartnerBand ? { startPartnerBand: options.startPartnerBand } : {}),
						...(options.endPartnerBand ? { endPartnerBand: options.endPartnerBand } : {}),
						startPartnerTransform: options.startPartnerTransform,
						endPartnerTransform: options.endPartnerTransform
					}
				: undefined
	}) as any;

describe('getEligibleBands', () => {
	it('returns bands with meta.startPartnerBand for partnerStart mode', () => {
		const bands = [
			makeBand(0, 0, { startPartnerBand: { globule: 0, tube: 1, band: 0 } }),
			makeBand(1, 0),
			makeBand(2, 0, { endPartnerBand: { globule: 0, tube: 1, band: 1 } })
		];
		const result = getEligibleBands(bands, 'partnerStart');
		expect(result.map((b) => b.address.band)).toEqual([0]);
	});

	it('returns bands with meta.endPartnerBand for partnerEnd mode', () => {
		const bands = [
			makeBand(0, 0, { startPartnerBand: { globule: 0, tube: 1, band: 0 } }),
			makeBand(1, 0),
			makeBand(2, 0, { endPartnerBand: { globule: 0, tube: 1, band: 1 } })
		];
		const result = getEligibleBands(bands, 'partnerEnd');
		expect(result.map((b) => b.address.band)).toEqual([2]);
	});

	it('returns empty array if no bands have meta', () => {
		const bands = [makeBand(0, 0), makeBand(1, 0)];
		expect(getEligibleBands(bands, 'partnerStart')).toEqual([]);
		expect(getEligibleBands(bands, 'partnerEnd')).toEqual([]);
	});
});

describe('resolvePair', () => {
	it('returns null when band has no meta for the mode', () => {
		const bands = [makeBand(0, 0)];
		const result = resolvePair(bands, { globule: 0, tube: 0, band: 0 }, 'partnerStart');
		expect(result).toBeNull();
	});

	it('returns null when partner band cannot be resolved', () => {
		const bands = [makeBand(0, 0, { startPartnerBand: { globule: 0, tube: 99, band: 99 } })];
		const result = resolvePair(bands, { globule: 0, tube: 0, band: 0 }, 'partnerStart');
		expect(result).toBeNull();
	});

	it('resolves partner pair for partnerStart with no transform (identity)', () => {
		const partnerBand = makeBand(5, 1);
		const mainBand = makeBand(0, 0, {
			startPartnerBand: { globule: 0, tube: 1, band: 5 }
		});
		const result = resolvePair([mainBand, partnerBand], mainBand.address, 'partnerStart');
		expect(result).not.toBeNull();
		expect(result!.mainAddress).toEqual({ globule: 0, tube: 0, band: 0, facet: 0 });
		expect(result!.ghostAddress).toEqual({ globule: 0, tube: 1, band: 5, facet: 0 });
		expect(result!.mainPath).toEqual(mainBand.facets[0].path);
		expect(result!.ghostPath).toEqual(partnerBand.facets[0].path);
	});

	it('resolves partner pair for partnerEnd at last facet index', () => {
		const partnerBand = makeBand(5, 1);
		const mainBand = makeBand(0, 0, {
			endPartnerBand: { globule: 0, tube: 1, band: 5 }
		});
		const result = resolvePair([mainBand, partnerBand], mainBand.address, 'partnerEnd');
		expect(result).not.toBeNull();
		const lastIdx = mainBand.facets.length - 1;
		expect(result!.mainAddress).toEqual({ globule: 0, tube: 0, band: 0, facet: lastIdx });
		expect(result!.ghostAddress).toEqual({
			globule: 0,
			tube: 1,
			band: 5,
			facet: partnerBand.facets.length - 1
		});
	});

	it('applies startPartnerTransform to ghost path', () => {
		const partnerBand = makeBand(5, 1);
		const mainBand = makeBand(0, 0, {
			startPartnerBand: { globule: 0, tube: 1, band: 5 },
			startPartnerTransform: {
				translate: { x: 100, y: 200, z: 0 },
				rotate: { z: 0 }
			}
		});
		const result = resolvePair([mainBand, partnerBand], mainBand.address, 'partnerStart');
		expect(result).not.toBeNull();
		// Original partner facet[0] path is [['M', 50, 50], ['L', 51, 51]]
		// After translate(100, 200): [['M', 150, 250], ['L', 151, 251]]
		expect(result!.ghostPath).toEqual([
			['M', 150, 250],
			['L', 151, 251]
		]);
	});
});

describe('pairsEqual', () => {
	it('returns true for two null pairs', () => {
		expect(pairsEqual(null, null)).toBe(true);
	});

	it('returns false when one is null and the other is not', () => {
		const pair: ResolvedPair = {
			mainAddress: { globule: 0, tube: 0, band: 0, facet: 0 },
			ghostAddress: { globule: 0, tube: 1, band: 0, facet: 0 },
			mainQuad: makeQuad(0),
			ghostQuad: makeQuad(1),
			mainPath: [['M', 0, 0]],
			ghostPath: [['M', 1, 1]]
		};
		expect(pairsEqual(pair, null)).toBe(false);
		expect(pairsEqual(null, pair)).toBe(false);
	});

	it('returns true when paths and quads are deep-equal', () => {
		const a: ResolvedPair = {
			mainAddress: { globule: 0, tube: 0, band: 0, facet: 0 },
			ghostAddress: { globule: 0, tube: 1, band: 0, facet: 0 },
			mainQuad: makeQuad(0),
			ghostQuad: makeQuad(1),
			mainPath: [['M', 0, 0]],
			ghostPath: [['M', 1, 1]]
		};
		const b: ResolvedPair = {
			mainAddress: { globule: 0, tube: 0, band: 0, facet: 0 },
			ghostAddress: { globule: 0, tube: 1, band: 0, facet: 0 },
			mainQuad: makeQuad(0),
			ghostQuad: makeQuad(1),
			mainPath: [['M', 0, 0]],
			ghostPath: [['M', 1, 1]]
		};
		expect(pairsEqual(a, b)).toBe(true);
	});

	it('returns false when paths differ', () => {
		const a: ResolvedPair = {
			mainAddress: { globule: 0, tube: 0, band: 0, facet: 0 },
			ghostAddress: { globule: 0, tube: 1, band: 0, facet: 0 },
			mainQuad: makeQuad(0),
			ghostQuad: makeQuad(1),
			mainPath: [['M', 0, 0]],
			ghostPath: [['M', 1, 1]]
		};
		const b: ResolvedPair = { ...a, ghostPath: [['M', 999, 999]] };
		expect(pairsEqual(a, b)).toBe(false);
	});
});
