import { resolvePair, pairsEqual, type ResolvedPair } from '../partner-pair-resolver';
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

	it('uses partner facet 0 when partner.meta.startPartnerBand matches main', () => {
		// Partner's start is matched to us, so partner's facet 0 is the matched one
		const partnerBand = makeBand(5, 1, {
			startPartnerBand: { globule: 0, tube: 0, band: 0 }
		});
		const mainBand = makeBand(0, 0, {
			startPartnerBand: { globule: 0, tube: 1, band: 5 }
		});
		const result = resolvePair([mainBand, partnerBand], mainBand.address, 'partnerStart');
		expect(result).not.toBeNull();
		expect(result!.mainAddress).toEqual({ globule: 0, tube: 0, band: 0, facet: 0 });
		expect(result!.ghostAddress).toEqual({ globule: 0, tube: 1, band: 5, facet: 0 });
	});

	it('uses partner last facet when partner.meta.startPartnerBand does NOT match main', () => {
		// Partner's end is matched to us, so partner's last facet is the matched one
		const partnerBand = makeBand(5, 1, {
			startPartnerBand: { globule: 0, tube: 9, band: 9 } // not us
		});
		const mainBand = makeBand(0, 0, {
			startPartnerBand: { globule: 0, tube: 1, band: 5 }
		});
		const result = resolvePair([mainBand, partnerBand], mainBand.address, 'partnerStart');
		expect(result).not.toBeNull();
		expect(result!.ghostAddress).toEqual({
			globule: 0,
			tube: 1,
			band: 5,
			facet: partnerBand.facets.length - 1
		});
	});

	it('partnerEnd: uses last facet of main; partner facet via partner.meta', () => {
		const partnerBand = makeBand(5, 1, {
			startPartnerBand: { globule: 0, tube: 0, band: 0 }
		});
		const mainBand = makeBand(0, 0, {
			endPartnerBand: { globule: 0, tube: 1, band: 5 }
		});
		const result = resolvePair([mainBand, partnerBand], mainBand.address, 'partnerEnd');
		expect(result).not.toBeNull();
		const lastIdx = mainBand.facets.length - 1;
		expect(result!.mainAddress).toEqual({ globule: 0, tube: 0, band: 0, facet: lastIdx });
		expect(result!.ghostAddress).toEqual({ globule: 0, tube: 1, band: 5, facet: 0 });
	});

	it('applies startPartnerTransform to ghost path', () => {
		const partnerBand = makeBand(5, 1, {
			startPartnerBand: { globule: 0, tube: 0, band: 0 }
		});
		const mainBand = makeBand(0, 0, {
			startPartnerBand: { globule: 0, tube: 1, band: 5 },
			startPartnerTransform: {
				translate: { x: 100, y: 200, z: 0 },
				rotate: { z: 0 }
			}
		});
		const result = resolvePair([mainBand, partnerBand], mainBand.address, 'partnerStart');
		expect(result).not.toBeNull();
		// Partner facet 0 is used (because partner.meta.startPartnerBand matches main).
		// Original partner facet[0] path is [['M', 50, 50], ['L', 51, 51]].
		// After translate(100, 200): [['M', 150, 250], ['L', 151, 251]].
		expect(result!.ghostPath).toEqual([
			['M', 150, 250],
			['L', 151, 251]
		]);
	});
});

// Split bands: `allBands` holds pieces carrying `address.piece`. Pieces are of
// UNEQUAL length so a wrong piece shows up in the facet index as well as the path.
type PieceAddress = GlobuleAddress_Band & { piece: number };
const makePiece = (
	address: PieceAddress,
	facetIds: number[],
	meta: {
		startPartnerBand?: GlobuleAddress_Band | PieceAddress;
		endPartnerBand?: GlobuleAddress_Band | PieceAddress;
	}
): BandCutPattern =>
	({
		projectionType: 'patterned',
		address,
		facets: facetIds.map(makeFacet),
		meta
	}) as any;

describe('resolvePair — split bands', () => {
	const plain = (tube: number, band: number): GlobuleAddress_Band => ({ globule: 0, tube, band });
	const piece = (tube: number, band: number, p: number): PieceAddress => ({
		globule: 0,
		tube,
		band,
		piece: p
	});

	it("end partner: a split partner whose END meets us resolves to its last piece's last facet", () => {
		const main = makeBand(0, 0, { startPartnerBand: plain(1, 5) });
		// Partner t1/b5 cut into p0 (2 facets) and p1 (3 facets); its end meets t0/b0.
		const p0 = makePiece(piece(1, 5, 0), [500, 501], {
			startPartnerBand: plain(9, 9),
			endPartnerBand: piece(1, 5, 1)
		});
		const p1 = makePiece(piece(1, 5, 1), [510, 511, 512], {
			startPartnerBand: piece(1, 5, 0),
			endPartnerBand: plain(0, 0)
		});
		const result = resolvePair([main, p0, p1], main.address, 'partnerStart');
		expect(result).not.toBeNull();
		expect(result!.ghostAddress).toEqual({ ...piece(1, 5, 1), facet: 2 });
		expect(result!.ghostPath).toEqual(p1.facets[2].path);
	});

	it("end partner: a piece asker's outer end resolves to the partner's piece 0 when the partner's start meets it", () => {
		// Asker t0/b0 cut into p0 (3 facets) and p1 (2 facets); p1 carries the outer end.
		const m0 = makePiece(piece(0, 0, 0), [0, 1, 2], {
			startPartnerBand: plain(2, 2),
			endPartnerBand: piece(0, 0, 1)
		});
		const m1 = makePiece(piece(0, 0, 1), [3, 4], {
			startPartnerBand: piece(0, 0, 0),
			endPartnerBand: plain(1, 5)
		});
		// Partner t1/b5 cut into p0 (1 facet) and p1 (4 facets); its start meets t0/b0.
		const q0 = makePiece(piece(1, 5, 0), [500], {
			startPartnerBand: plain(0, 0),
			endPartnerBand: piece(1, 5, 1)
		});
		const q1 = makePiece(piece(1, 5, 1), [510, 511, 512, 513], {
			startPartnerBand: piece(1, 5, 0),
			endPartnerBand: plain(8, 8)
		});
		const result = resolvePair([m0, m1, q0, q1], m1.address, 'partnerEnd');
		expect(result).not.toBeNull();
		expect(result!.mainAddress).toEqual({ ...piece(0, 0, 1), facet: 1 });
		expect(result!.mainPath).toEqual(m1.facets[1].path);
		expect(result!.ghostAddress).toEqual({ ...piece(1, 5, 0), facet: 0 });
		expect(result!.ghostPath).toEqual(q0.facets[0].path);
	});

	it('seam: a piece end resolves exactly to its sibling piece', () => {
		const m0 = makePiece(piece(0, 0, 0), [0, 1, 2], {
			startPartnerBand: plain(2, 2),
			endPartnerBand: piece(0, 0, 1)
		});
		const m1 = makePiece(piece(0, 0, 1), [3, 4], {
			startPartnerBand: piece(0, 0, 0),
			endPartnerBand: plain(1, 5)
		});
		const result = resolvePair([m0, m1], m0.address, 'partnerEnd');
		expect(result).not.toBeNull();
		expect(result!.mainAddress).toEqual({ ...piece(0, 0, 0), facet: 2 });
		expect(result!.ghostAddress).toEqual({ ...piece(0, 0, 1), facet: 0 });
		expect(result!.ghostPath).toEqual(m1.facets[0].path);
	});

	it('a plain address for a split band takes the end from the piece that carries it', () => {
		const m0 = makePiece(piece(0, 0, 0), [0, 1, 2], {
			startPartnerBand: plain(2, 2),
			endPartnerBand: piece(0, 0, 1)
		});
		const m1 = makePiece(piece(0, 0, 1), [3, 4], {
			startPartnerBand: piece(0, 0, 0),
			endPartnerBand: plain(1, 5)
		});
		const partner = makeBand(5, 1, { endPartnerBand: plain(0, 0) });
		const result = resolvePair([m0, m1, partner], plain(0, 0), 'partnerEnd');
		expect(result).not.toBeNull();
		expect(result!.mainAddress).toEqual({ ...piece(0, 0, 1), facet: 1 });
		expect(result!.ghostAddress).toEqual({ ...plain(1, 5), facet: 2 });
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
