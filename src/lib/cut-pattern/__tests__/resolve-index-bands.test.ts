import { describe, it, expect } from '@jest/globals';
import type { BandSortIndex, TubeCutPattern } from '$lib/types';
import { concatAddress } from '$lib/util';
import { resolveIndexBands, groupCodeForBand } from '../resolve-index-bands';
import { buildBandCodeMap } from '../band-sort-index';

type Addr = { globule: number; tube: number; band: number; piece?: number };

const band = (address: Addr, facetCount: number) =>
	({
		address,
		facets: Array.from({ length: facetCount }, () => ({}))
	}) as unknown as TubeCutPattern['bands'][number];

const tube = (t: number, bands: TubeCutPattern['bands']): TubeCutPattern =>
	({
		projectionType: 'patterned',
		address: { globule: 0, tube: t },
		bands
	}) as unknown as TubeCutPattern;

// Tube 0: band 0 split into three pieces of unequal length, band 1 uncut.
const splitTubes = (): TubeCutPattern[] => [
	tube(0, [
		band({ globule: 0, tube: 0, band: 0, piece: 0 }, 3),
		band({ globule: 0, tube: 0, band: 0, piece: 1 }, 5),
		band({ globule: 0, tube: 0, band: 0, piece: 2 }, 2),
		band({ globule: 0, tube: 0, band: 1 }, 10)
	])
];

const indexOf = (tubes: TubeCutPattern[]): BandSortIndex => ({
	mode: 'end-connection-tube',
	groups: [{ label: 'Ring 0', code: '0007', bands: tubes[0].bands.map((b) => b.address) }]
});

describe('resolveIndexBands with split bands', () => {
	it('resolves every piece to its own band object', () => {
		const tubes = splitTubes();
		const resolved = resolveIndexBands(tubes, indexOf(tubes));
		expect(resolved.map((r) => r.band)).toEqual(tubes[0].bands);
		resolved.forEach((r, i) => expect(r.band).toBe(tubes[0].bands[i]));
	});

	it('yields unique concatAddress keys', () => {
		const tubes = splitTubes();
		const keys = resolveIndexBands(tubes, indexOf(tubes)).map((r) => concatAddress(r.band.address));
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('does not resolve a plain ref onto a piece', () => {
		const tubes = splitTubes();
		const index: BandSortIndex = {
			mode: 'end-connection-tube',
			groups: [{ label: 'Ring 0', bands: [{ globule: 0, tube: 0, band: 0 }] }]
		};
		expect(resolveIndexBands(tubes, index)).toEqual([]);
	});
});

describe('groupCodeForBand with split bands', () => {
	it("finds a piece's group code", () => {
		const tubes = splitTubes();
		const codeMap = buildBandCodeMap(indexOf(tubes));
		expect(tubes[0].bands.map((b) => groupCodeForBand(codeMap, b.address))).toEqual([
			'0007',
			'0007',
			'0007',
			'0007'
		]);
	});
});
