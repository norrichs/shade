import {
	applyPatternFilterClick,
	describePatternFilter,
	filterPatternTubes,
	patternFilterIncludes,
	patternFilterShows,
	type PatternFilterSet,
	type PatternFilterSettings
} from '../pattern-filter';
import type { TubeCutPattern } from '#lib/types.js';

const b = (tube: number, band: number, globule = 0) => ({ globule, tube, band });

const settings = (
	mode: PatternFilterSettings['mode'],
	combine: PatternFilterSettings['combine'] = 'exclusive'
): PatternFilterSettings => ({ mode, combine });

const click = (
	set: PatternFilterSet,
	s: PatternFilterSettings,
	band: ReturnType<typeof b>,
	source: 'voronoi' | 'projection' = 'voronoi'
) => applyPatternFilterClick(set, s, source, band);

const tubes = (): TubeCutPattern[] =>
	[0, 1, 2].map(
		(t) =>
			({
				projectionType: 'patterned',
				address: { globule: 0, tube: t },
				bands: [0, 1, 2].map((band) => ({ address: b(t, band), id: `${t}-${band}` }))
			}) as unknown as TubeCutPattern
	);

describe('applyPatternFilterClick', () => {
	it('leaves the set alone in off and focus modes', () => {
		const set: PatternFilterSet = { source: 'voronoi', kind: 'band', keys: ['0:1:1'] };
		expect(click(set, settings('off'), b(2, 2))).toBe(set);
		expect(click(set, settings('focus'), b(2, 2))).toBe(set);
		expect(click(null, settings('focus'), b(2, 2))).toBeNull();
	});

	it('exclusive band mode replaces the shown band, re-click clears', () => {
		const s = settings('band');
		const one = click(null, s, b(1, 1));
		expect(one).toEqual({ source: 'voronoi', kind: 'band', keys: ['0:1:1'] });
		const two = click(one, s, b(2, 0));
		expect(two?.keys).toEqual(['0:2:0']);
		expect(click(two, s, b(2, 0))).toBeNull();
	});

	it('exclusive tube mode keys by tube, so another band of the same tube clears', () => {
		const s = settings('tube');
		const one = click(null, s, b(1, 1));
		expect(one).toEqual({ source: 'voronoi', kind: 'tube', keys: ['0:1'] });
		expect(click(one, s, b(1, 2))).toBeNull();
		expect(click(one, s, b(2, 2))?.keys).toEqual(['0:2']);
	});

	it('additive mode toggles bands in and out without limit', () => {
		const s = settings('band', 'additive');
		let set = click(null, s, b(0, 0));
		set = click(set, s, b(1, 1));
		set = click(set, s, b(2, 2));
		expect(set?.keys).toEqual(['0:0:0', '0:1:1', '0:2:2']);
		set = click(set, s, b(1, 1));
		expect(set?.keys).toEqual(['0:0:0', '0:2:2']);
		set = click(click(set, s, b(0, 0)), s, b(2, 2));
		expect(set).toBeNull();
	});

	it('additive tube mode subtracts the tube when any of its bands is clicked', () => {
		const s = settings('tube', 'additive');
		let set = click(click(null, s, b(0, 0)), s, b(1, 0));
		expect(set?.keys).toEqual(['0:0', '0:1']);
		set = click(set, s, b(0, 2));
		expect(set?.keys).toEqual(['0:1']);
	});

	it('starts fresh on a source or kind change', () => {
		const set = click(null, settings('band', 'additive'), b(0, 0));
		expect(click(set, settings('band', 'additive'), b(1, 1), 'projection')).toEqual({
			source: 'projection',
			kind: 'band',
			keys: ['0:1:1']
		});
		expect(click(set, settings('tube', 'additive'), b(1, 1))).toEqual({
			source: 'voronoi',
			kind: 'tube',
			keys: ['0:1']
		});
	});
});

describe('patternFilterShows / patternFilterIncludes', () => {
	const set: PatternFilterSet = { source: 'voronoi', kind: 'tube', keys: ['0:1'] };
	it('shows everything without a filter or for another source', () => {
		expect(patternFilterShows(null, 'voronoi', b(0, 0))).toBe(true);
		expect(patternFilterShows(set, 'projection', b(0, 0))).toBe(true);
		expect(patternFilterIncludes(null, 'voronoi', b(0, 0))).toBe(false);
		expect(patternFilterIncludes(set, 'projection', b(1, 0))).toBe(false);
	});
	it('matches every band of a filtered tube', () => {
		expect(patternFilterShows(set, 'voronoi', b(1, 2))).toBe(true);
		expect(patternFilterShows(set, 'voronoi', b(0, 2))).toBe(false);
		expect(patternFilterIncludes(set, 'voronoi', b(1, 0))).toBe(true);
	});
});

describe('filterPatternTubes', () => {
	it('returns the same array when unfiltered', () => {
		const t = tubes();
		expect(filterPatternTubes(t, null, 'voronoi')).toBe(t);
		expect(
			filterPatternTubes(t, { source: 'projection', kind: 'band', keys: ['0:0:0'] }, 'voronoi')
		).toBe(t);
	});

	it('keeps only filtered bands and drops emptied tubes', () => {
		const t = tubes();
		const out = filterPatternTubes(
			t,
			{ source: 'voronoi', kind: 'band', keys: ['0:0:1', '0:2:0', '0:2:2'] },
			'voronoi'
		);
		expect(out.map((tube) => tube.address.tube)).toEqual([0, 2]);
		expect(out[1].bands.map((band) => band.id)).toEqual(['2-0', '2-2']);
	});

	it('keeps whole tube objects in tube mode', () => {
		const t = tubes();
		const out = filterPatternTubes(
			t,
			{ source: 'voronoi', kind: 'tube', keys: ['0:1'] },
			'voronoi'
		);
		expect(out).toEqual([t[1]]);
		expect(out[0]).toBe(t[1]);
	});

	it('keeps every piece of a split band', () => {
		const t = tubes();
		t[0].bands.push({ address: { ...b(0, 1), piece: 1 }, id: '0-1-p1' } as never);
		const out = filterPatternTubes(
			t,
			{ source: 'voronoi', kind: 'band', keys: ['0:0:1'] },
			'voronoi'
		);
		expect(out[0].bands.map((band) => band.id)).toEqual(['0-1', '0-1-p1']);
	});
});

describe('describePatternFilter', () => {
	it('summarises the set', () => {
		expect(describePatternFilter(null)).toBe('showing all');
		expect(describePatternFilter({ source: 'voronoi', kind: 'band', keys: ['a'] })).toBe('1 band');
		expect(describePatternFilter({ source: 'voronoi', kind: 'tube', keys: ['a', 'b'] })).toBe(
			'2 tubes'
		);
	});
});
