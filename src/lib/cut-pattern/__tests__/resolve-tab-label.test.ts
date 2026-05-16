import { resolveTabLabel } from '../resolve-tab-label';
import type { BandCutPattern, TubeCutPattern } from '$lib/types';
import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';

type BandTab = NonNullable<BandCutPattern['tabs']>[number];

const addr = (tube: number, band: number, globule = 0): GlobuleAddress_Band => ({
	globule,
	tube,
	band
});

const makeBand = (
	tube: number,
	band: number,
	meta?: BandCutPattern['meta']
): BandCutPattern =>
	({
		address: addr(tube, band),
		meta
	}) as unknown as BandCutPattern;

const makeTube = (tube: number, bandCount: number): TubeCutPattern => {
	const bands = Array.from({ length: bandCount }, (_, i) => makeBand(tube, i));
	return {
		projectionType: 'patterned',
		address: { globule: 0, tube },
		bands
	} as unknown as TubeCutPattern;
};

const tab = (overrides: Partial<BandTab>): BandTab =>
	({
		outer: [],
		base: [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 }
		],
		position: 'mid',
		...overrides
	}) as unknown as BandTab;

describe('resolveTabLabel', () => {
	it('start tab with startPartner returns partner address (tb-slash)', () => {
		const band = makeBand(1, 2, {
			startPartnerBand: addr(3, 4),
			endPartnerBand: addr(0, 0)
		});
		const tube = makeTube(1, 3);
		const result = resolveTabLabel(tab({ position: 'start' }), band, tube);
		expect(result).toBe('t3/b4');
	});

	it('start tab without startPartner returns empty string', () => {
		const band = makeBand(1, 2);
		const tube = makeTube(1, 3);
		const result = resolveTabLabel(tab({ position: 'start' }), band, tube);
		expect(result).toBe('');
	});

	it('end tab with endPartner returns partner address (tb-slash)', () => {
		const band = makeBand(1, 2, {
			startPartnerBand: addr(0, 0),
			endPartnerBand: addr(5, 7)
		});
		const tube = makeTube(1, 3);
		const result = resolveTabLabel(tab({ position: 'end' }), band, tube);
		expect(result).toBe('t5/b7');
	});

	it('end tab without endPartner returns empty string', () => {
		const band = makeBand(1, 2);
		const tube = makeTube(1, 3);
		const result = resolveTabLabel(tab({ position: 'end' }), band, tube);
		expect(result).toBe('');
	});

	it('mid tab at midIndex 0 (normal band) returns next band in tube', () => {
		// band index 2 of a 5-band tube → next is band 3
		const tube = makeTube(1, 5);
		const band = tube.bands[2];
		const result = resolveTabLabel(
			tab({ position: 'mid', midIndex: 0, midCount: 5 }),
			band,
			tube
		);
		expect(result).toBe('t1/b3');
	});

	it('mid tab at midIndex 0 on last band in tube wraps to band 0', () => {
		const tube = makeTube(1, 4);
		const band = tube.bands[3];
		const result = resolveTabLabel(
			tab({ position: 'mid', midIndex: 0, midCount: 3 }),
			band,
			tube
		);
		expect(result).toBe('t1/b0');
	});

	it('mid tab at middle index returns current band address', () => {
		// midCount=5 → floor(5/2)=2 → midIndex 2 is the middle
		const tube = makeTube(2, 6);
		const band = tube.bands[4];
		const result = resolveTabLabel(
			tab({ position: 'mid', midIndex: 2, midCount: 5 }),
			band,
			tube
		);
		expect(result).toBe('t2/b4');
	});

	it('mid tab that is neither first nor middle returns empty string', () => {
		// midCount=5 → middle is index 2. index 1 is neither first nor middle.
		const tube = makeTube(1, 5);
		const band = tube.bands[2];
		const result = resolveTabLabel(
			tab({ position: 'mid', midIndex: 1, midCount: 5 }),
			band,
			tube
		);
		expect(result).toBe('');
	});

	it('mid tab with only one mid (midCount=1, midIndex=0): first-tab rule wins, returns next band', () => {
		// floor(1/2) === 0, so both rules match. First-tab rule must win.
		const tube = makeTube(1, 4);
		const band = tube.bands[1];
		const result = resolveTabLabel(
			tab({ position: 'mid', midIndex: 0, midCount: 1 }),
			band,
			tube
		);
		expect(result).toBe('t1/b2');
	});
});
