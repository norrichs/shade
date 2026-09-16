import { describe, it, expect } from '@jest/globals';

import { isSameAddress, concatAddress } from '../util';

// These tests lock CURRENT behaviour so the piece-address refactor can prove
// it changed nothing for addresses that carry no `piece`. Several assertions
// below document quirks rather than desirable behaviour — they are here to
// detect accidental change, not to endorse it.
describe('isSameAddress — characterization', () => {
	it('matches identical band addresses', () => {
		const a = { globule: 0, tube: 1, band: 2 };
		const b = { globule: 0, tube: 1, band: 2 };
		expect(isSameAddress(a, b)).toBe(true);
	});

	it('distinguishes different band indices', () => {
		expect(isSameAddress({ globule: 0, tube: 1, band: 2 }, { globule: 0, tube: 1, band: 3 })).toBe(
			false
		);
	});

	it('distinguishes different tubes and globules', () => {
		expect(isSameAddress({ globule: 0, tube: 1, band: 2 }, { globule: 0, tube: 9, band: 2 })).toBe(
			false
		);
		expect(isSameAddress({ globule: 5, tube: 1, band: 2 }, { globule: 0, tube: 1, band: 2 })).toBe(
			false
		);
	});

	it('matches facet addresses including the facet index', () => {
		const a = { globule: 0, tube: 0, band: 0, facet: 3 };
		expect(isSameAddress(a, { globule: 0, tube: 0, band: 0, facet: 3 })).toBe(true);
		expect(isSameAddress(a, { globule: 0, tube: 0, band: 0, facet: 4 })).toBe(false);
	});

	it('QUIRK: strict mode rejects addresses of differing granularity via a key-count test', () => {
		// A band address and a facet address for the "same" band are NOT equal
		// under strict mode, purely because they have different key counts.
		const band = { globule: 0, tube: 0, band: 0 };
		const facet = { globule: 0, tube: 0, band: 0, facet: 0 };
		expect(isSameAddress(band, facet)).toBe(false);
	});

	it('QUIRK: non-strict mode ignores keys the field walk does not know about', () => {
		// The field walk covers globule/tube/band/facet/edge only. An unknown
		// extra key is invisible to it. This is precisely why adding `piece`
		// requires changing this function rather than relying on it.
		const a = { globule: 0, tube: 0, band: 0, somethingElse: 1 };
		const b = { globule: 0, tube: 0, band: 0, somethingElse: 2 };
		expect(isSameAddress(a, b, false)).toBe(true);
	});
});

describe('isSameAddress — piece addresses', () => {
	it('distinguishes sibling pieces of the same band', () => {
		const p0 = { globule: 0, tube: 0, band: 2, piece: 0 };
		const p1 = { globule: 0, tube: 0, band: 2, piece: 1 };
		expect(isSameAddress(p0, p1)).toBe(false);
		expect(isSameAddress(p0, p1, false)).toBe(false);
	});

	it('matches a piece address against itself', () => {
		const p0 = { globule: 0, tube: 0, band: 2, piece: 0 };
		expect(isSameAddress(p0, { globule: 0, tube: 0, band: 2, piece: 0 })).toBe(true);
	});

	it('does not equate a piece with its unsplit parent band', () => {
		// Different granularity, so they are not the same address.
		expect(
			isSameAddress({ globule: 0, tube: 0, band: 2 }, { globule: 0, tube: 0, band: 2, piece: 0 })
		).toBe(false);
	});
});

describe('concatAddress — characterization', () => {
	it('stringifies a facet address at full granularity by default', () => {
		expect(concatAddress({ globule: 1, tube: 2, band: 3, facet: 4 })).toBe('g1t2b3f4');
	});

	it('stringifies a band address, falling back to the band format', () => {
		expect(concatAddress({ globule: 1, tube: 2, band: 3 })).toBe('g1t2b3');
	});

	it('honours explicit formats', () => {
		const a = { globule: 1, tube: 2, band: 3, facet: 4 };
		expect(concatAddress(a, 'tbf')).toBe('t2b3f4');
		expect(concatAddress(a, 'tb')).toBe('t2b3');
		expect(concatAddress(a, 'tb-slash')).toBe('t2/b3');
		expect(concatAddress(a, 'b')).toBe('b3');
	});

	it('returns empty string for undefined', () => {
		expect(concatAddress(undefined)).toBe('');
	});

	it('QUIRK: an address with an unrecognised extra component silently loses it', () => {
		// No `facet` key, so the facet branch does not match and it falls through
		// to the band branch — dropping the extra component entirely. This is the
		// duplicate-Svelte-key bug that Task 4 fixes for `piece`.
		expect(concatAddress({ globule: 1, tube: 2, band: 3, quad: 7 })).toBe('g1t2b3');
	});
});
