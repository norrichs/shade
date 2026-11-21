import { describe, it, expect } from '@jest/globals';
import { get } from 'svelte/store';
import { bandViewerBandClicked, bandViewerSelection } from '../bandViewerStore';
import { DEFAULT_BAND_VIEWER_SELECTION } from '#lib/band-viewer/viewer-selection.js';

describe('bandViewerBandClicked', () => {
	it('does not notify subscribers outside Clicked mode', () => {
		bandViewerSelection.set({ ...DEFAULT_BAND_VIEWER_SELECTION, mode: 'range' });
		let notifications = 0;
		const stop = bandViewerSelection.subscribe(() => notifications++);
		notifications = 0;
		bandViewerBandClicked('voronoi', { globule: 0, tube: 1, band: 2 });
		stop();
		expect(notifications).toBe(0);
	});

	it('toggles in Clicked mode', () => {
		bandViewerSelection.set({ ...DEFAULT_BAND_VIEWER_SELECTION, mode: 'clicked' });
		bandViewerBandClicked('voronoi', { globule: 0, tube: 1, band: 2 });
		expect(get(bandViewerSelection).clicked).toEqual({ source: 'voronoi', keys: ['0:1:2'] });
	});
});
