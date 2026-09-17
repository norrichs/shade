import { describe, it, expect } from '@jest/globals';

import { getTransformedPartnerCutPattern } from '../helpers';
import type { BandCutPattern, TubeCutPattern } from '$lib/types';

// A cross-band (outer) partner address is stored as a plain {globule, tube,
// band} triple. When the partner band is split, the partner facet to match is
// chosen by WHICH END of the partner joins this band (spec amendment
// 2026-09-16): its start lives on piece 0, facet 0; its end on the last piece,
// last facet. The asker's own piece index plays no part.
//
// Each partner piece has two facets with distinct paths, so a wrong piece AND a
// wrong end are both visible in the returned path and label.
const ASKER = { globule: 0, tube: 0, band: 0 };
const PARTNER = { globule: 0, tube: 1, band: 0 };
const OTHER = { globule: 0, tube: 9, band: 9 };

const partnerPieces = (
	count: number,
	outer: { start: BandCutPattern['address']; end: BandCutPattern['address'] }
): BandCutPattern[] =>
	Array.from(
		{ length: count },
		(_, piece) =>
			({
				facets: [
					{ path: [['M', piece, 0]], label: `p${piece}f0` },
					{ path: [['M', piece, 1]], label: `p${piece}f1` }
				],
				id: `partner-piece-${piece}`,
				tagAnchorPoint: { x: 0, y: 0 },
				projectionType: 'patterned',
				address: { ...PARTNER, piece },
				meta: {
					startPartnerBand: piece === 0 ? outer.start : { ...PARTNER, piece: piece - 1 },
					endPartnerBand: piece === count - 1 ? outer.end : { ...PARTNER, piece: piece + 1 }
				}
			}) as unknown as BandCutPattern
	);

const askingPiece = (piece: number): BandCutPattern =>
	({
		facets: [
			{ path: [], label: 'origin-0' },
			{ path: [], label: 'origin-1' }
		],
		id: 'asking-band',
		tagAnchorPoint: { x: 0, y: 0 },
		projectionType: 'patterned',
		address: { ...ASKER, piece },
		meta: { startPartnerBand: PARTNER, endPartnerBand: PARTNER }
	}) as unknown as BandCutPattern;

const tubes = (asker: BandCutPattern, partner: BandCutPattern[]): TubeCutPattern[] => [
	{ projectionType: 'patterned', address: { globule: 0, tube: 0 }, bands: [asker] },
	{ projectionType: 'patterned', address: { globule: 0, tube: 1 }, bands: partner }
];

describe('getTransformedPartnerCutPattern', () => {
	it("matches the partner's piece 0, facet 0 when the partner's start meets this end", () => {
		// Asker is piece 1: the old same-index rule picked partner piece 1, and the
		// isSameAddress end test (piece vs plain) picked its last facet.
		const asker = askingPiece(1);
		const result = getTransformedPartnerCutPattern(
			asker,
			'start',
			tubes(asker, partnerPieces(3, { start: ASKER, end: OTHER })),
			true
		);
		expect(result?.facet.path).toEqual([['M', 0, 0]]);
		expect(result?.facet.label).toBe('0');
		expect(result?.partnerEnd).toBe('start');
	});

	it("matches the partner's last piece, last facet when the partner's end meets this end", () => {
		// Asker is piece 1 of its band, asking from its last facet; partner has 3
		// pieces, so same-index (1) and last (2) differ.
		const asker = askingPiece(1);
		const result = getTransformedPartnerCutPattern(
			asker,
			'end',
			tubes(asker, partnerPieces(3, { start: OTHER, end: ASKER })),
			true
		);
		expect(result?.facet.path).toEqual([['M', 2, 1]]);
		expect(result?.facet.label).toBe('1');
		expect(result?.partnerEnd).toBe('end');
	});

	// A one-facet band's facet 0 is both its start and its end, so a facet index
	// cannot name the end; the caller names it. And a one-facet partner's facet
	// label is '0' for either of its ends, so `partnerEnd` says which one joins.
	const onePieceAsker = (): BandCutPattern =>
		({
			facets: [{ path: [], label: 'only' }],
			id: 'one-facet-asker',
			tagAnchorPoint: { x: 0, y: 0 },
			projectionType: 'patterned',
			address: { ...ASKER },
			meta: { startPartnerBand: PARTNER, endPartnerBand: OTHER }
		}) as unknown as BandCutPattern;
	const onePiecePartner = (outer: {
		start: BandCutPattern['address'];
		end: BandCutPattern['address'];
	}): BandCutPattern =>
		({
			facets: [{ path: [['M', 7, 7]], label: 'only' }],
			id: 'one-facet-partner',
			tagAnchorPoint: { x: 0, y: 0 },
			projectionType: 'patterned',
			address: { ...PARTNER },
			meta: { startPartnerBand: outer.start, endPartnerBand: outer.end }
		}) as unknown as BandCutPattern;

	it("resolves a one-facet band's start and end independently", () => {
		const asker = onePieceAsker();
		// Start partner (tube 1) joins at its start; end partner (tube 9) at its end.
		const all: TubeCutPattern[] = Array.from({ length: 10 }, (_, tube) => ({
			projectionType: 'patterned',
			address: { globule: 0, tube },
			bands: []
		}));
		all[0].bands = [asker];
		all[1].bands = [onePiecePartner({ start: ASKER, end: OTHER })];
		all[9].bands = [{ ...onePiecePartner({ start: PARTNER, end: ASKER }), address: OTHER }];
		expect(getTransformedPartnerCutPattern(asker, 'start', all, true)?.partnerEnd).toBe('start');
		expect(getTransformedPartnerCutPattern(asker, 'end', all, true)?.partnerEnd).toBe('end');
	});

	it("reports that a one-facet partner's END joins, although its facet label is 0", () => {
		const asker = askingPiece(0);
		const result = getTransformedPartnerCutPattern(
			asker,
			'end',
			tubes(asker, [onePiecePartner({ start: OTHER, end: ASKER })]),
			true
		);
		expect(result?.facet.label).toBe('0');
		expect(result?.partnerEnd).toBe('end');
	});
});
