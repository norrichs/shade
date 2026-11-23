import { describe, it, expect } from '@jest/globals';
import type { Band } from '#lib/types.js';
import type { Tube } from '#lib/projection-geometry/types.js';
import type { BandSpace, PatternBandSpaceOf } from '#lib/cut-pattern/pattern-band-space.js';
import { pickRangeSource, resolveViewerBands } from '../resolve-bands';
import { DEFAULT_BAND_VIEWER_SELECTION, type BandViewerSelection } from '../viewer-selection';

const band = (tube: number, b: number) =>
	({
		facets: [{ address: { globule: 0, tube, band: b, facet: 0 } }],
		visible: true
	}) as unknown as Band;
const tube = (t: number, count: number) =>
	({
		address: { globule: 0, tube: t },
		bands: Array.from({ length: count }, (_, b) => band(t, b))
	}) as unknown as Tube;

// Three tubes of 4 real bands; tube 1 hides real band 0, so its pattern bands
// 0,1,2 are real 1,2,3.
const tubes = [tube(0, 4), tube(1, 4), tube(2, 4)];
const space: BandSpace = {
	toReal: (t, pb) => (t === 1 ? [1, 2, 3][pb] : [0, 1, 2, 3][pb]),
	toPattern: () => undefined
};
const spaces: PatternBandSpaceOf = () => space;
const tubesOf = () => tubes;
const sel = (patch: Partial<BandViewerSelection>): BandViewerSelection => ({
	...DEFAULT_BAND_VIEWER_SELECTION,
	...patch
});
const run = (
	s: BandViewerSelection,
	highlight = null as Parameters<typeof resolveViewerBands>[1]
) => resolveViewerBands(s, highlight, 'projection', tubesOf, spaces);
const labels = (r: ReturnType<typeof run>) => r.map((x) => x.label);

describe('resolveViewerBands', () => {
	it('selected = the highlighted band (or nothing)', () => {
		expect(run(sel({}))).toEqual([]);
		const r = run(sel({}), {
			source: 'projection',
			band: { globule: 0, tube: 1, band: 0 },
			ring: []
		});
		expect(labels(r)).toEqual(['t1/b0']);
		expect(r[0].band).toBe(tubes[1].bands[1]);
	});

	it('clicked maps keys through the band space', () => {
		const r = run(
			sel({ mode: 'clicked', clicked: { source: 'projection', keys: ['0:1:0', '0:2:3'] } })
		);
		expect(labels(r)).toEqual(['t1/b0', 't2/b3']);
		expect(r[0].band).toBe(tubes[1].bands[1]);
	});

	it('clicked skips stale keys', () => {
		const r = run(
			sel({ mode: 'clicked', clicked: { source: 'projection', keys: ['0:1:9', '0:7:0', 'junk'] } })
		);
		expect(r).toEqual([]);
	});

	it('clicked with nothing clicked shows nothing', () => {
		expect(run(sel({ mode: 'clicked', clicked: null }))).toEqual([]);
	});

	it('range all = every pattern band of every tube', () => {
		const r = run(sel({ mode: 'range', range: {} }));
		expect(r).toHaveLength(4 + 3 + 4);
		expect(new Set(r.map((x) => x.key)).size).toBe(r.length);
	});

	it('range tubes [1,1] bands [-1,-1] → last pattern band of tube 1', () => {
		const r = run(sel({ mode: 'range', range: { tubes: [1, 1], bands: [-1, -1] } }));
		expect(labels(r)).toEqual(['t1/b2']);
		expect(r[0].band).toBe(tubes[1].bands[3]);
	});

	it('wrapping band range', () => {
		const r = run(sel({ mode: 'range', range: { tubes: [0, 0], bands: [-1, 0] } }));
		expect(labels(r)).toEqual(['t0/b3', 't0/b0']);
	});

	it('range with no tubes → nothing', () => {
		const r = resolveViewerBands(
			sel({ mode: 'range' }),
			null,
			'projection',
			() => undefined,
			spaces
		);
		expect(r).toEqual([]);
	});
});

describe('pickRangeSource', () => {
	it('keeps the preferred (pattern) source when it has tubes', () => {
		expect(pickRangeSource('projection', (s) => s === 'projection' || s === 'voronoi')).toBe(
			'projection'
		);
	});

	it('falls back to the first source with tubes', () => {
		expect(pickRangeSource('projection', (s) => s === 'globuleTube')).toBe('globuleTube');
		expect(pickRangeSource('projection', (s) => s === 'voronoi' || s === 'globuleTube')).toBe(
			'voronoi'
		);
	});

	it('keeps the preferred source when nothing has tubes', () => {
		expect(pickRangeSource('projection', () => false)).toBe('projection');
	});
});
