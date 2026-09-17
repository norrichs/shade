import { describe, it, expect } from '@jest/globals';

import { getTransformedPartnerCutPattern } from '../helpers';
import type { BandCutPattern, TubeCutPattern } from '$lib/types';

// A cross-band partner address is always stored as a plain
// {globule, tube, band} triple (see generate-pattern.ts's findBandByAddress
// doc comment), so resolving it against a split partner tube must go through
// findBandByAddress's pass 2 same-piece-index rule. That rule only bites when
// the asking piece and the "last piece" fallback would give different
// answers, so this uses three partner pieces (0, 1, 2) and an asker at piece
// 1: same-index resolution picks piece 1, but a dropped `fromPiece` falls
// through to the last-piece fallback and silently picks piece 2 instead.
const partnerPiece = (piece: number, x: number): BandCutPattern =>
	({
		facets: [{ path: [['M', x, x]], label: `piece-${piece}` }],
		id: `partner-piece-${piece}`,
		tagAnchorPoint: { x: 0, y: 0 },
		projectionType: 'patterned',
		address: { globule: 0, tube: 1, band: 0, piece },
		meta: {
			startPartnerBand: { globule: 9, tube: 9, band: 9 },
			endPartnerBand: { globule: 9, tube: 9, band: 9 }
		}
	}) as unknown as BandCutPattern;

describe('getTransformedPartnerCutPattern', () => {
	it('resolves a cross-band partner to the same piece index as the asking band, not the last piece', () => {
		const askingBand = {
			facets: [{ path: [], label: 'origin', quad: undefined }],
			id: 'asking-band',
			tagAnchorPoint: { x: 0, y: 0 },
			projectionType: 'patterned',
			// The asker is piece 1 of its own band.
			address: { globule: 0, tube: 0, band: 0, piece: 1 },
			meta: {
				// Plain triple: this is how every cross-band partner address in the
				// codebase is actually constructed.
				startPartnerBand: { globule: 0, tube: 1, band: 0 },
				endPartnerBand: { globule: 0, tube: 1, band: 0 }
			}
		} as unknown as BandCutPattern;

		const partnerTube: TubeCutPattern = {
			projectionType: 'patterned',
			address: { globule: 0, tube: 1 },
			bands: [partnerPiece(0, 0), partnerPiece(1, 1), partnerPiece(2, 2)]
		};
		const originTube: TubeCutPattern = {
			projectionType: 'patterned',
			address: { globule: 0, tube: 0 },
			bands: [askingBand]
		};

		const result = getTransformedPartnerCutPattern(askingBand, 0, [originTube, partnerTube], true);

		// Piece 1's facet path is [['M', 1, 1]]. If `fromPiece` were dropped at
		// the call site, pass 2 would fall back to the partner's last piece
		// (piece 2, path [['M', 2, 2]]) instead.
		expect(result?.path).toEqual([['M', 1, 1]]);
	});
});
