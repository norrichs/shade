import { describe, it, expect } from '@jest/globals';

import {
	findBandByExactAddress,
	findSideNeighbourBand,
	pieceIndexOf,
	resolveEndPartner
} from '../resolve-partner-band';
import type { BandCutPattern, TubeCutPattern } from '$lib/types';

type Address = BandCutPattern['address'];
type Meta = BandCutPattern['meta'];

const band = (address: Address, meta?: Meta): BandCutPattern =>
	({ address, meta, facets: [], id: `id-${JSON.stringify(address)}` }) as unknown as BandCutPattern;

const tube = (t: number, bands: BandCutPattern[]): TubeCutPattern =>
	({ projectionType: 'patterned', address: { globule: 0, tube: t }, bands }) as TubeCutPattern;

const OTHER = { globule: 0, tube: 9, band: 9 };
const ASKER_PARENT = { globule: 0, tube: 0, band: 0 };
const PARTNER_PARENT = { globule: 0, tube: 1, band: 0 };

/**
 * Pieces of partner band t1b0, wired the way generateTiling wires them: piece 0
 * carries the parent's outer start partner, the last piece its outer end
 * partner, and every cut end names its sibling with a piece-bearing address.
 */
const partnerPieces = (count: number, outer: { start: Address; end: Address }): BandCutPattern[] =>
	Array.from({ length: count }, (_, piece) =>
		band(
			{ ...PARTNER_PARENT, piece },
			{
				startPartnerBand: piece === 0 ? outer.start : { ...PARTNER_PARENT, piece: piece - 1 },
				endPartnerBand: piece === count - 1 ? outer.end : { ...PARTNER_PARENT, piece: piece + 1 }
			}
		)
	);

describe('resolveEndPartner — end partners resolve by which end joins', () => {
	it("resolves to the partner's last piece when the partner's end meets the asker", () => {
		const asker = band(ASKER_PARENT, { startPartnerBand: PARTNER_PARENT });
		const tubes = [
			tube(0, [asker]),
			tube(1, partnerPieces(3, { start: OTHER, end: ASKER_PARENT }))
		];

		const resolved = resolveEndPartner(tubes, asker, 'start');

		expect(resolved?.band.address).toEqual({ ...PARTNER_PARENT, piece: 2 });
		expect(resolved?.partnerEnd).toBe('end');
	});

	it("resolves to the partner's piece 0 when the partner's start meets the asker, whatever the asker's piece", () => {
		// Asker is piece 1 of its band. The same-index rule would pick partner piece 1.
		const asker = band({ ...ASKER_PARENT, piece: 1 }, { endPartnerBand: PARTNER_PARENT });
		const tubes = [
			tube(0, [asker]),
			tube(1, partnerPieces(3, { start: ASKER_PARENT, end: OTHER }))
		];

		const resolved = resolveEndPartner(tubes, asker, 'end');

		expect(resolved?.band.address).toEqual({ ...PARTNER_PARENT, piece: 0 });
		expect(resolved?.partnerEnd).toBe('start');
	});

	it("resolves to the partner's last piece when its end meets the asker, whatever the asker's piece", () => {
		// Asker piece 2, partner has four pieces: same-index would give piece 2,
		// the last piece is 3.
		const asker = band({ ...ASKER_PARENT, piece: 2 }, { endPartnerBand: PARTNER_PARENT });
		const tubes = [
			tube(0, [asker]),
			tube(1, partnerPieces(4, { start: OTHER, end: ASKER_PARENT }))
		];

		const resolved = resolveEndPartner(tubes, asker, 'end');

		expect(resolved?.band.address).toEqual({ ...PARTNER_PARENT, piece: 3 });
		expect(resolved?.partnerEnd).toBe('end');
	});

	it('finds the partner pieces regardless of band array order', () => {
		// Unsplit asker, so the same-index rule would pick piece 0; the partner's
		// end meets the asker, so the answer is the last piece wherever it sits.
		const asker = band(ASKER_PARENT, { startPartnerBand: PARTNER_PARENT });
		const [p0, p1, p2] = partnerPieces(3, { start: OTHER, end: ASKER_PARENT });
		const tubes = [tube(0, [asker]), tube(1, [p2, p0, p1])];

		expect(resolveEndPartner(tubes, asker, 'start')?.band).toBe(p2);
	});

	it('resolves an unsplit partner to itself, detecting its joining end by parent address', () => {
		// The asker is a piece; the partner's stored start partner is the plain
		// parent address. isSameAddress would call these different and pick 'end'.
		const asker = band({ ...ASKER_PARENT, piece: 1 }, { endPartnerBand: PARTNER_PARENT });
		const partner = band(PARTNER_PARENT, { startPartnerBand: ASKER_PARENT, endPartnerBand: OTHER });
		const tubes = [tube(0, [asker]), tube(1, [partner])];

		const resolved = resolveEndPartner(tubes, asker, 'end');

		expect(resolved?.band).toBe(partner);
		expect(resolved?.partnerEnd).toBe('start');
	});

	// Preservation guard, not a RED test: seam resolution is already exact and
	// must stay so once plain addresses resolve by first/last piece.
	it('resolves a seam partner exactly, not by first/last piece', () => {
		// Middle piece 2 of 4: its start seam is piece 1, which is neither piece 0
		// nor the last piece.
		const pieces = partnerPieces(4, { start: OTHER, end: OTHER });
		const tubes = [tube(0, []), tube(1, pieces)];

		const resolved = resolveEndPartner(tubes, pieces[2], 'start');

		expect(resolved?.band).toBe(pieces[1]);
		expect(resolved?.partnerEnd).toBe('end');
		expect(resolveEndPartner(tubes, pieces[1], 'end')).toEqual({
			band: pieces[2],
			partnerEnd: 'start'
		});
	});

	it('returns undefined when the end has no partner or the partner is absent', () => {
		const asker = band(ASKER_PARENT, { startPartnerBand: PARTNER_PARENT });
		expect(resolveEndPartner([tube(0, [asker])], asker, 'end')).toBeUndefined();
		expect(resolveEndPartner([tube(0, [asker])], asker, 'start')).toBeUndefined();
		expect(resolveEndPartner([tube(0, [asker]), tube(1, [])], asker, 'start')).toBeUndefined();
		expect(resolveEndPartner([tube(0, [band(ASKER_PARENT)])], band(ASKER_PARENT), 'start')).toBe(
			undefined
		);
	});
});

describe('findSideNeighbourBand — same piece index, else last piece', () => {
	it('finds an unsplit band by its band index', () => {
		const tubes = [
			tube(0, [band({ ...ASKER_PARENT, band: 0 }), band({ ...ASKER_PARENT, band: 1 })])
		];
		expect(findSideNeighbourBand(tubes, { ...ASKER_PARENT, band: 1 }, 0)?.address).toEqual({
			...ASKER_PARENT,
			band: 1
		});
	});

	it('resolves a plain band address to the same piece index as the asker', () => {
		// Three pieces so same-index (1) and the last-piece fallback (2) diverge.
		const tubes = [
			tube(0, [
				band({ ...ASKER_PARENT, piece: 0 }),
				band({ ...ASKER_PARENT, piece: 1 }),
				band({ ...ASKER_PARENT, piece: 2 })
			])
		];
		expect(findSideNeighbourBand(tubes, ASKER_PARENT, 1)?.address).toEqual({
			...ASKER_PARENT,
			piece: 1
		});
	});

	it('matches the asking piece index regardless of band array order', () => {
		const tubes = [
			tube(0, [
				band({ ...ASKER_PARENT, piece: 2 }),
				band({ ...ASKER_PARENT, piece: 0 }),
				band({ ...ASKER_PARENT, piece: 1 })
			])
		];
		expect(findSideNeighbourBand(tubes, ASKER_PARENT, 1)?.address).toEqual({
			...ASKER_PARENT,
			piece: 1
		});
	});

	it('falls back to the last piece when the neighbour has fewer pieces', () => {
		const tubes = [
			tube(0, [band({ ...ASKER_PARENT, piece: 0 }), band({ ...ASKER_PARENT, piece: 1 })])
		];
		expect(findSideNeighbourBand(tubes, ASKER_PARENT, 3)?.address).toEqual({
			...ASKER_PARENT,
			piece: 1
		});
	});

	it('resolves to piece 0 for an unsplit asker (piece index 0)', () => {
		const tubes = [
			tube(0, [band({ ...ASKER_PARENT, piece: 0 }), band({ ...ASKER_PARENT, piece: 1 })])
		];
		expect(findSideNeighbourBand(tubes, ASKER_PARENT, 0)?.address).toEqual({
			...ASKER_PARENT,
			piece: 0
		});
	});

	it('does not resolve a piece query onto an unsplit band', () => {
		const tubes = [tube(0, [band(ASKER_PARENT)])];
		expect(findSideNeighbourBand(tubes, { ...ASKER_PARENT, piece: 1 }, 1)).toBeUndefined();
	});

	it('returns undefined for a missing tube', () => {
		expect(findSideNeighbourBand([], { ...ASKER_PARENT, tube: 3 }, 0)).toBeUndefined();
	});
});

describe('findBandByExactAddress', () => {
	it('distinguishes sibling pieces rather than returning the first match', () => {
		const tubes = [
			tube(0, [band({ ...ASKER_PARENT, piece: 0 }), band({ ...ASKER_PARENT, piece: 1 })])
		];
		expect(findBandByExactAddress(tubes, { ...ASKER_PARENT, piece: 1 })?.address).toEqual({
			...ASKER_PARENT,
			piece: 1
		});
	});

	it('never resolves across the piece boundary in either direction', () => {
		expect(
			findBandByExactAddress([tube(0, [band(ASKER_PARENT)])], { ...ASKER_PARENT, piece: 1 })
		).toBeUndefined();
		expect(
			findBandByExactAddress([tube(0, [band({ ...ASKER_PARENT, piece: 0 })])], ASKER_PARENT)
		).toBeUndefined();
	});
});

describe('pieceIndexOf', () => {
	it('is the piece index for a piece and 0 for an unsplit band', () => {
		expect(pieceIndexOf({ ...ASKER_PARENT, piece: 2 })).toBe(2);
		expect(pieceIndexOf(ASKER_PARENT)).toBe(0);
	});
});
