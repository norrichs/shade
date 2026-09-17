import { resolveBaseAndPartners, partnerHighlightAddresses } from '../partner-neighbors';
import type { BandCutPattern } from '$lib/types';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';

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
			quad: {
				a: { x: 0, y: 0, z: 0 },
				b: { x: 5, y: 0, z: 0 },
				c: { x: 5, y: 5, z: 0 },
				d: { x: 0, y: 5, z: 0 }
			},
			label: '0'
		} as any;
		const rightFacet = {
			path: [
				['M', 100, 0],
				['L', 105, 0]
			],
			quad: {
				a: { x: 100, y: 0, z: 0 },
				b: { x: 105, y: 0, z: 0 },
				c: { x: 105, y: 5, z: 0 },
				d: { x: 100, y: 5, z: 0 }
			},
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

describe('split tubes', () => {
	type Addr = { globule: number; tube: number; band: number; piece?: number };
	const plain = (tube: number, band: number): Addr => ({ globule: 0, tube, band });
	const piece = (tube: number, band: number, p: number): Addr => ({
		globule: 0,
		tube,
		band,
		piece: p
	});

	// Facet ids are unique per band/piece so paths identify where a facet came from.
	const makePiece = (
		address: Addr,
		facetIds: number[],
		parentQuadOffset: number | undefined,
		meta?: Record<string, unknown>
	): BandCutPattern =>
		({
			projectionType: 'patterned',
			address,
			facets: facetIds.map(makeFacet),
			...(parentQuadOffset === undefined ? {} : { parentQuadOffset }),
			meta
		}) as unknown as BandCutPattern;

	// Tube 0: b0 cut into p0 (3 quads) and p1 (2 quads); b1 the same (splits are
	// tube-wide); b2 uncut (5 quads). Unequal pieces, so piece 0 and piece 1 never
	// coincide by length or offset.
	const tube0 = () => [
		makePiece(piece(0, 0, 0), [0, 1, 2], 0, {
			startPartnerBand: plain(1, 0),
			endPartnerBand: piece(0, 0, 1)
		}),
		makePiece(piece(0, 0, 1), [10, 11], 3, {
			startPartnerBand: piece(0, 0, 0),
			endPartnerBand: plain(1, 0)
		}),
		makePiece(piece(0, 1, 0), [100, 101, 102], 0),
		makePiece(piece(0, 1, 1), [110, 111], 3),
		makePiece(plain(0, 2), [200, 201, 202, 203, 204], undefined)
	];
	// Tube 1: b0 uncut; its start meets t0/b0's end, its end meets t0/b0's start.
	const tube1 = () => [
		makePiece(plain(1, 0), [1000, 1001, 1002, 1003, 1004], undefined, {
			startPartnerBand: plain(0, 0),
			endPartnerBand: plain(0, 0)
		})
	];
	const all = () => [...tube0(), ...tube1()];

	it("resolves the base band by its piece address, not the parent's first piece", () => {
		const bands = all();
		const result = resolveBaseAndPartners(bands, {
			...piece(0, 0, 1),
			facet: 0
		} as GlobuleAddress_Facet);
		expect(result).not.toBeNull();
		expect(result!.base.path).toEqual(bands[1].facets[0].path);
		expect(result!.base.address).toEqual({ ...piece(0, 0, 1), facet: 0 });
	});

	it("end ghost: the last piece's last quad gets the outer end partner", () => {
		const bands = all();
		// b0p1 facet 1 is the end of parent b0 (piece 0 has 3 facets, so facet 1 is
		// not its last).
		const result = resolveBaseAndPartners(bands, {
			...piece(0, 0, 1),
			facet: 1
		} as GlobuleAddress_Facet);
		expect(result?.top?.ruleSet).toBe('partner.endEnd');
		expect(result?.top?.address).toEqual({ ...plain(1, 0), facet: 0 });
	});

	it("seam ghost: piece 0's last quad gets its sibling piece's first quad", () => {
		const bands = all();
		const result = resolveBaseAndPartners(bands, {
			...piece(0, 0, 0),
			facet: 2
		} as GlobuleAddress_Facet);
		expect(result?.top?.ruleSet).toBe('partner.endEnd');
		expect(result?.top?.address).toEqual({ ...piece(0, 0, 1), facet: 0 });
	});

	it('left neighbour: the same-index piece of the previous band, same parent quad', () => {
		const bands = all();
		const result = resolveBaseAndPartners(bands, {
			...piece(0, 1, 1),
			facet: 1
		} as GlobuleAddress_Facet);
		expect(result?.left?.address).toEqual({ ...piece(0, 0, 1), facet: 1 });
	});

	it('right neighbour: the band whose left neighbour at that parent quad is the base', () => {
		const bands = all();
		// Base b0p1 facet 1 = parent quad 4; right is b1p1 facet 1.
		const fromPiece = resolveBaseAndPartners(bands, {
			...piece(0, 0, 1),
			facet: 1
		} as GlobuleAddress_Facet);
		expect(fromPiece?.right?.address).toEqual({ ...piece(0, 1, 1), facet: 1 });
	});

	it('right neighbour of an uncut band beside a split band is the piece covering that quad', () => {
		// Tube: b0 uncut (5 quads), b1 cut into p0 (3) and p1 (2). The adjuster pairs
		// b1p1 facet f with b0 facet 3 + f, so b0 facet 4's right partner is b1p1 facet 1.
		const bands = [
			makePiece(plain(0, 0), [0, 1, 2, 3, 4], undefined),
			makePiece(piece(0, 1, 0), [100, 101, 102], 0),
			makePiece(piece(0, 1, 1), [110, 111], 3)
		];
		const result = resolveBaseAndPartners(bands, {
			...plain(0, 0),
			facet: 4
		} as GlobuleAddress_Facet);
		expect(result?.right?.address).toEqual({ ...piece(0, 1, 1), facet: 1 });
	});

	it("guard: no left neighbour where the adjuster has none (uncut band past a split neighbour's piece 0)", () => {
		const bands = all();
		const result = resolveBaseAndPartners(bands, {
			...plain(0, 2),
			facet: 4
		} as GlobuleAddress_Facet);
		expect(result?.left).toBeNull();
	});

	it("3D highlight maps a later piece's facet to parentQuadOffset + facet on the parent band", () => {
		const bands = all();
		const bundle = resolveBaseAndPartners(bands, {
			...piece(0, 0, 1),
			facet: 1
		} as GlobuleAddress_Facet);
		const highlight = partnerHighlightAddresses(bands, bundle);
		expect(highlight.base).toEqual({ ...plain(0, 0), facet: 4 });
		expect(highlight.right).toEqual({ ...plain(0, 1), facet: 4 });
		expect(highlight.top).toEqual({ ...plain(1, 0), facet: 0 });
		expect(highlight.left).toBeNull();
	});

	it('3D highlight leaves unsplit addresses unchanged', () => {
		const bands = [makeBand(0, 0), makeBand(1, 0)];
		const bundle = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 1, facet: 1 });
		const highlight = partnerHighlightAddresses(bands, bundle);
		expect(highlight.base).toEqual({ globule: 0, tube: 0, band: 1, facet: 1 });
		expect(highlight.left).toEqual({ globule: 0, tube: 0, band: 0, facet: 1 });
		expect(highlight.top).toEqual({ globule: 0, tube: 0, band: 1, facet: 2 });
		expect(highlight.bottom).toEqual({ globule: 0, tube: 0, band: 1, facet: 0 });
		expect(highlight.right).toBeNull();
	});
});
