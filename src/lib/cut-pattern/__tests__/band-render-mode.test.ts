import { resolveBandRenderMode } from '../band-render-mode';

/**
 * Which path a prepared band draws is not cosmetic: `PatternLabel` suppresses
 * its own tag outline as soon as the band appears in `mergedBandPaths`, on the
 * understanding that the outline is now part of the band's merged path. If the
 * renderer then draws anything other than that merged path, the label outline
 * is gone from the cut file entirely.
 */
describe('resolveBandRenderMode', () => {
	test('draws per-facet paths before a merge is prepared', () => {
		// The working view must keep each facet at its own dynamic stroke width.
		expect(resolveBandRenderMode({ hasMerged: false, patternType: 'outlined' })).toBe('per-facet');
		expect(resolveBandRenderMode({ hasMerged: false, patternType: 'tiled' })).toBe('per-facet');
	});

	test('draws the tiled union as a filled silhouette once prepared', () => {
		expect(resolveBandRenderMode({ hasMerged: true, patternType: 'tiled' })).toBe('merged-tiled');
	});

	test('draws the merged outline+label path for a prepared outlined band', () => {
		// The regression: outlined fell through to 'per-facet', so the merged
		// path — the only thing carrying the label outline — was computed and
		// then never rendered, and the band kept its working-view stroke colour.
		expect(resolveBandRenderMode({ hasMerged: true, patternType: 'outlined' })).toBe(
			'merged-outlined'
		);
	});

	test('never returns per-facet for a band that has a prepared merge', () => {
		// Stated as an invariant rather than a case list, because this is the
		// property PatternLabel's suppression depends on.
		for (const patternType of ['outlined', 'tiled', 'hexparquet', 'anything-else']) {
			expect(resolveBandRenderMode({ hasMerged: true, patternType })).not.toBe('per-facet');
		}
	});
});
