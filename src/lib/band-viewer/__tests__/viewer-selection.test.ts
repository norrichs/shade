import { describe, it, expect } from '@jest/globals';
import {
	DEFAULT_BAND_VIEWER_SELECTION,
	toggleViewerClick,
	type BandViewerSelection
} from '../viewer-selection';

const clicked: BandViewerSelection = { ...DEFAULT_BAND_VIEWER_SELECTION, mode: 'clicked' };
const b = (tube: number, band: number) => ({ globule: 0, tube, band });

describe('toggleViewerClick', () => {
	it('defaults: selected mode, nothing clicked, full range, auto anchor', () => {
		expect(DEFAULT_BAND_VIEWER_SELECTION).toEqual({
			mode: 'selected',
			clicked: null,
			range: {},
			anchor: 'auto'
		});
	});

	it('toggle only in clicked mode', () => {
		const selected = { ...DEFAULT_BAND_VIEWER_SELECTION };
		expect(toggleViewerClick(selected, 'projection', b(0, 1))).toBe(selected);
		const range = { ...DEFAULT_BAND_VIEWER_SELECTION, mode: 'range' as const };
		expect(toggleViewerClick(range, 'projection', b(0, 1))).toBe(range);
	});

	it('keeps the clicked set across a trip to another mode', () => {
		const one = toggleViewerClick(clicked, 'projection', b(0, 1));
		const away = { ...one, mode: 'range' as const };
		const back = toggleViewerClick({ ...away, mode: 'clicked' }, 'projection', b(0, 2));
		expect(back.clicked?.keys).toEqual(['0:0:1', '0:0:2']);
	});

	it('adds and removes', () => {
		const one = toggleViewerClick(clicked, 'projection', b(0, 1));
		expect(one.clicked).toEqual({ source: 'projection', keys: ['0:0:1'] });
		const two = toggleViewerClick(one, 'projection', b(2, 3));
		expect(two.clicked?.keys).toEqual(['0:0:1', '0:2:3']);
		const back = toggleViewerClick(two, 'projection', b(0, 1));
		expect(back.clicked?.keys).toEqual(['0:2:3']);
	});

	it('ignores a click on another source while the set has bands', () => {
		const one = toggleViewerClick(clicked, 'projection', b(0, 1));
		expect(toggleViewerClick(one, 'voronoi', b(4, 4))).toBe(one);
	});

	it('an empty set adopts the clicked source', () => {
		expect(toggleViewerClick(clicked, 'voronoi', b(4, 4)).clicked).toEqual({
			source: 'voronoi',
			keys: ['0:4:4']
		});
	});

	it('removing the last band empties the set to null', () => {
		const one = toggleViewerClick(clicked, 'projection', b(0, 1));
		expect(toggleViewerClick(one, 'projection', b(0, 1)).clicked).toBeNull();
	});
});
