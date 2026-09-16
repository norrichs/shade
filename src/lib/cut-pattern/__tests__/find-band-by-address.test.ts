import { describe, it, expect } from '@jest/globals';

import { findBandByAddress } from '../generate-pattern';
import type { BandCutPattern, TubeCutPattern } from '$lib/types';

const band = (address: BandCutPattern['address']): BandCutPattern =>
	({ address, facets: [], id: `id-${JSON.stringify(address)}` }) as unknown as BandCutPattern;

const tube = (bands: BandCutPattern[]): TubeCutPattern =>
	({ projectionType: 'patterned', address: { globule: 0, tube: 0 }, bands }) as TubeCutPattern;

describe('findBandByAddress', () => {
	it('finds an unsplit band by its band index', () => {
		const tubes = [
			tube([band({ globule: 0, tube: 0, band: 0 }), band({ globule: 0, tube: 0, band: 1 })])
		];
		expect(findBandByAddress(tubes, { globule: 0, tube: 0, band: 1 })?.address).toEqual({
			globule: 0,
			tube: 0,
			band: 1
		});
	});

	it('distinguishes sibling pieces rather than returning the first match', () => {
		// The previous implementation matched on `band` alone, so it always
		// returned piece 0 and seam partner transforms resolved to the wrong piece.
		const tubes = [
			tube([
				band({ globule: 0, tube: 0, band: 0, piece: 0 }),
				band({ globule: 0, tube: 0, band: 0, piece: 1 })
			])
		];
		const found = findBandByAddress(tubes, { globule: 0, tube: 0, band: 0, piece: 1 });
		expect(found?.address).toEqual({ globule: 0, tube: 0, band: 0, piece: 1 });
	});

	it('resolves a plain band address to the same piece index as the asker', () => {
		// Load-bearing. Every cross-band partner address in the codebase is built
		// as a plain {globule, tube, band} triple — generate-tiled-pattern.ts:375-384,
		// generate-outlined-pattern.ts:549-554, generate-cut-pattern.ts:282-295 —
		// while a split band's pieces carry `piece`. `isSameAddress` reports a piece
		// and a non-piece address as never equal in either mode (util.ts:331,
		// granularity 3 vs 3.5), so an exact-match-only lookup returns undefined
		// here and every cross-band end partner transform silently disappears for a
		// split tube, while the seam transforms keep working.
		const tubes = [
			tube([
				band({ globule: 0, tube: 0, band: 0, piece: 0 }),
				band({ globule: 0, tube: 0, band: 0, piece: 1 })
			])
		];
		// Piece 1 asking resolves onto piece 1, not piece 0: tube-wide splits at
		// identical quad indices mean corresponding pieces physically abut.
		const found = findBandByAddress(tubes, { globule: 0, tube: 0, band: 0 }, 1);
		expect(found?.address).toEqual({ globule: 0, tube: 0, band: 0, piece: 1 });
	});

	it('matches the asking piece index regardless of band array order', () => {
		const tubes = [
			tube([
				band({ globule: 0, tube: 0, band: 0, piece: 2 }),
				band({ globule: 0, tube: 0, band: 0, piece: 0 }),
				band({ globule: 0, tube: 0, band: 0, piece: 1 })
			])
		];
		const found = findBandByAddress(tubes, { globule: 0, tube: 0, band: 0 }, 1);
		expect(found?.address).toEqual({ globule: 0, tube: 0, band: 0, piece: 1 });
	});

	it('falls back to the last piece when the partner has fewer pieces', () => {
		// A band with fewer quads than the split index is never cut there, so it
		// has one piece and every querying piece must land on it.
		const tubes = [tube([band({ globule: 0, tube: 0, band: 0, piece: 0 })])];
		const found = findBandByAddress(tubes, { globule: 0, tube: 0, band: 0 }, 3);
		expect(found?.address).toEqual({ globule: 0, tube: 0, band: 0, piece: 0 });
	});

	it('resolves to piece 0 when the asker is unsplit', () => {
		const tubes = [
			tube([
				band({ globule: 0, tube: 0, band: 0, piece: 0 }),
				band({ globule: 0, tube: 0, band: 0, piece: 1 })
			])
		];
		const found = findBandByAddress(tubes, { globule: 0, tube: 0, band: 0 }, 0);
		expect(found?.address).toEqual({ globule: 0, tube: 0, band: 0, piece: 0 });
	});

	it('does not resolve a piece query onto an unsplit band', () => {
		// The reverse direction stays strict: asking for piece 1 of a band that was
		// never split is a miss, not a silent hit on the whole band.
		const tubes = [tube([band({ globule: 0, tube: 0, band: 0 })])];
		expect(findBandByAddress(tubes, { globule: 0, tube: 0, band: 0, piece: 1 })).toBeUndefined();
	});

	it('returns undefined for a missing tube', () => {
		expect(findBandByAddress([], { globule: 0, tube: 3, band: 0 })).toBeUndefined();
	});
});
