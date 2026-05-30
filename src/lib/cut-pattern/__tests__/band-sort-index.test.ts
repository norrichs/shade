import type { BandSortGroup, TubeCutPattern } from '$lib/types';
import { formatGroupCode, buildBandSortIndex, buildBandCodeMap, sliceBandSortIndex } from '../band-sort-index';

describe('BandSortGroup type', () => {
	test('accepts an optional code string', () => {
		const withCode: BandSortGroup = { label: 'Ring 0', code: '0000', bands: [] };
		const withoutCode: BandSortGroup = { label: 'Tube 0', bands: [] };
		expect(withCode.code).toBe('0000');
		expect(withoutCode.code).toBeUndefined();
	});
});

describe('formatGroupCode', () => {
	test('pads single digit to 4 wide', () => {
		expect(formatGroupCode(0)).toBe('0000');
		expect(formatGroupCode(1)).toBe('0001');
	});

	test('pads two digits to 4 wide', () => {
		expect(formatGroupCode(42)).toBe('0042');
	});

	test('does not truncate numbers wider than 4 digits', () => {
		expect(formatGroupCode(10000)).toBe('10000');
	});
});

const band = (
	globule: number,
	tube: number,
	bandIndex: number,
	endPartner?: { globule: number; tube: number; band: number }
) =>
	({
		address: { globule, tube, band: bandIndex },
		...(endPartner ? { meta: { endPartnerBand: endPartner } } : {})
	}) as unknown as TubeCutPattern['bands'][number];

const tube = (globule: number, tubeIndex: number, bands: TubeCutPattern['bands']): TubeCutPattern =>
	({
		projectionType: 'patterned',
		address: { globule, tube: tubeIndex },
		bands
	}) as unknown as TubeCutPattern;

// Two rings, each a 2-band cycle linked via endPartnerBand.
const twoRingTubes = (): TubeCutPattern[] => [
	tube(0, 0, [
		band(0, 0, 0, { globule: 0, tube: 0, band: 1 }),
		band(0, 0, 1, { globule: 0, tube: 0, band: 0 })
	]),
	tube(0, 1, [
		band(0, 1, 0, { globule: 0, tube: 1, band: 1 }),
		band(0, 1, 1, { globule: 0, tube: 1, band: 0 })
	])
];

describe('buildBandSortIndex code assignment', () => {
	test('end-connection mode assigns sequential 4-wide codes per ring', () => {
		const index = buildBandSortIndex(twoRingTubes(), 'end-connection-tube');
		expect(index.mode).toBe('end-connection-tube');
		expect(index.groups.map((g) => g.code)).toEqual(['0000', '0001']);
	});

	test('end-connection codes match ring iteration order', () => {
		const index = buildBandSortIndex(twoRingTubes(), 'end-connection-tube');
		// Ring 0 starts at the first band (0,0,0); ring 1 at (0,1,0).
		expect(index.groups[0].bands[0]).toEqual({ globule: 0, tube: 0, band: 0 });
		expect(index.groups[0].code).toBe('0000');
		expect(index.groups[1].bands[0]).toEqual({ globule: 0, tube: 1, band: 0 });
		expect(index.groups[1].code).toBe('0001');
	});

	test('tube-order mode leaves code undefined on every group', () => {
		const index = buildBandSortIndex(twoRingTubes(), 'tube-order');
		expect(index.mode).toBe('tube-order');
		expect(index.groups.length).toBe(2);
		for (const group of index.groups) {
			expect(group.code).toBeUndefined();
		}
	});
});

// A band addressed (0,0,1) connected to a different neighbour at EACH end:
// startPartnerBand -> (0,20,1), endPartnerBand -> (0,19,1). All three belong to
// one ring. (Regression: the old walk followed only endPartnerBand and dropped
// the start-side partner.)
const bandWithPartners = (
	globule: number,
	tubeIdx: number,
	bandIndex: number,
	partners: {
		start?: { globule: number; tube: number; band: number };
		end?: { globule: number; tube: number; band: number };
	}
) =>
	({
		address: { globule, tube: tubeIdx, band: bandIndex },
		meta: {
			...(partners.start ? { startPartnerBand: partners.start } : {}),
			...(partners.end ? { endPartnerBand: partners.end } : {})
		}
	}) as unknown as TubeCutPattern['bands'][number];

const twoEndPartnerTubes = (): TubeCutPattern[] => [
	tube(0, 0, [
		bandWithPartners(0, 0, 1, {
			start: { globule: 0, tube: 20, band: 1 },
			end: { globule: 0, tube: 19, band: 1 }
		})
	]),
	tube(0, 19, [bandWithPartners(0, 19, 1, { start: { globule: 0, tube: 0, band: 1 } })]),
	tube(0, 20, [bandWithPartners(0, 20, 1, { end: { globule: 0, tube: 0, band: 1 } })])
];

describe('buildEndConnectionIndex with both start and end partners', () => {
	test('groups a band with two end partners into a single ring', () => {
		const index = buildBandSortIndex(twoEndPartnerTubes(), 'end-connection-tube');
		expect(index.groups.length).toBe(1);
		const memberKeys = index.groups[0].bands.map((b) => `${b.globule}-${b.tube}-${b.band}`);
		expect(new Set(memberKeys)).toEqual(new Set(['0-0-1', '0-19-1', '0-20-1']));
	});

	test('the central band sits between its two partners in ring order', () => {
		const index = buildBandSortIndex(twoEndPartnerTubes(), 'end-connection-tube');
		const keys = index.groups[0].bands.map((b) => `${b.globule}-${b.tube}-${b.band}`);
		const centerIdx = keys.indexOf('0-0-1');
		const neighbourKeys = [keys[centerIdx - 1], keys[centerIdx + 1]];
		expect(new Set(neighbourKeys)).toEqual(new Set(['0-19-1', '0-20-1']));
	});
});

describe('buildBandCodeMap', () => {
	test('maps every band in coded groups keyed by bandKey', () => {
		const index = buildBandSortIndex(twoRingTubes(), 'end-connection-tube');
		const map = buildBandCodeMap(index);
		expect(map.get('0-0-0')).toBe('0000');
		expect(map.get('0-0-1')).toBe('0000');
		expect(map.get('0-1-0')).toBe('0001');
		expect(map.get('0-1-1')).toBe('0001');
		expect(map.size).toBe(4);
	});

	test('omits bands in uncoded groups (tube-order)', () => {
		const index = buildBandSortIndex(twoRingTubes(), 'tube-order');
		const map = buildBandCodeMap(index);
		expect(map.size).toBe(0);
	});
});

describe('sliceBandSortIndex preserves code', () => {
	test('group-only slice keeps the original code (no renumbering)', () => {
		const index = buildBandSortIndex(twoRingTubes(), 'end-connection-tube');
		const sliced = sliceBandSortIndex(index, { groups: [1, 2] });
		expect(sliced.groups.length).toBe(1);
		// The kept group is the original ring 1, so its code stays '0001' (not re-zeroed).
		expect(sliced.groups[0].code).toBe('0001');
	});

	test('bandsInGroup slice keeps the code while trimming bands', () => {
		const index = buildBandSortIndex(twoRingTubes(), 'end-connection-tube');
		const sliced = sliceBandSortIndex(index, { groups: [0, 1], bandsInGroup: [0, 1] });
		expect(sliced.groups[0].code).toBe('0000');
		expect(sliced.groups[0].bands).toHaveLength(1);
	});
});
