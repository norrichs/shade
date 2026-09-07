import { describe, it, expect } from '@jest/globals';
import { getBandMaterial, materials } from '../materials';
import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';

const band = (b: number): GlobuleAddress_Band => ({ globule: 0, tube: 0, band: b });

describe('getBandMaterial', () => {
	it('paints the clicked band with the primary assembler highlight', () => {
		const highlight = { band: band(3), ring: [band(3), band(7)] };
		expect(getBandMaterial(band(3), highlight)).toBe(materials.assemblerPrimary);
	});

	it('paints the rest of the ring with the secondary highlight', () => {
		const highlight = { band: band(3), ring: [band(3), band(7)] };
		expect(getBandMaterial(band(7), highlight)).toBe(materials.assemblerSecondary);
	});

	it('leaves unrelated bands and the un-highlighted case at the default material', () => {
		const highlight = { band: band(3), ring: [band(3)] };
		expect(getBandMaterial(band(9), highlight)).toBe(materials.default);
		expect(getBandMaterial(band(3), null)).toBe(materials.default);
	});

	// Each band source has its own resting colour (voronoi rim tubes red, projection
	// bands `selected`, ...). Highlighting must override it without permanently
	// flattening every source to one look.
	it('falls back to the caller-supplied material instead of the default', () => {
		expect(getBandMaterial(band(3), null, materials.numbered[1])).toBe(materials.numbered[1]);
		const highlight = { band: band(3), ring: [band(3)] };
		expect(getBandMaterial(band(9), highlight, materials.selected)).toBe(materials.selected);
	});

	// Bands with no resolvable address still render (see collateAddressedBandGeometry);
	// they simply never match a highlight.
	it('paints an unaddressed band with its fallback even while a highlight is active', () => {
		const highlight = { band: band(3), ring: [band(3)] };
		expect(getBandMaterial(undefined, highlight, materials.selected)).toBe(materials.selected);
	});
});
