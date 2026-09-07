import { describe, it, expect } from '@jest/globals';
import { findBandRow } from '../band-row-lookup';
import type { BandSortIndex } from '$lib/types';
import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';

const band = (tube: number, b: number): GlobuleAddress_Band => ({ globule: 0, tube, band: b });

const endConnectionIndex: BandSortIndex = {
	mode: 'end-connection-tube',
	groups: [
		{ label: 'ring 0', bands: [band(0, 0), band(1, 0)] },
		{ label: 'ring 1', bands: [band(2, 0), band(3, 1)] }
	]
};

describe('findBandRow', () => {
	it('finds the group row containing the band in end-connection mode', () => {
		expect(findBandRow(endConnectionIndex, [], band(3, 1))).toBe(1);
		expect(findBandRow(endConnectionIndex, [], band(0, 0))).toBe(0);
	});

	it('finds the flat row index in tube-order mode', () => {
		const flat = [band(0, 0), band(0, 1), band(1, 0)];
		const index: BandSortIndex = { mode: 'tube-order', groups: [] };
		expect(findBandRow(index, flat, band(1, 0))).toBe(2);
	});

	// A band that is not on screen must not resolve to row 0, which would scroll the
	// grid to an unrelated row on every selection.
	it('returns null for a band that is not in the index', () => {
		expect(findBandRow(endConnectionIndex, [], band(9, 9))).toBeNull();
		expect(findBandRow({ mode: 'tube-order', groups: [] }, [], band(0, 0))).toBeNull();
	});

	it('returns null when there is no index or no band', () => {
		expect(findBandRow(undefined, [], band(0, 0))).toBeNull();
		expect(findBandRow(endConnectionIndex, [], undefined)).toBeNull();
	});

	// Rings can share a band; the first row containing it is the scroll target, so
	// the choice is deterministic rather than dependent on iteration order.
	it('returns the first matching row when a band appears in several rings', () => {
		const shared: BandSortIndex = {
			mode: 'end-connection-tube',
			groups: [
				{ label: 'a', bands: [band(5, 0)] },
				{ label: 'b', bands: [band(1, 0), band(5, 0)] }
			]
		};
		expect(findBandRow(shared, [], band(5, 0))).toBe(0);
	});
});
