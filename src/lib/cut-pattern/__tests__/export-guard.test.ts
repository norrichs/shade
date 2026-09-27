import { describe, it, expect } from '@jest/globals';
import { findUntagged, untaggedMessage } from '../export-guard';

describe('findUntagged', () => {
	it('passes tagged drawables and ignores groups', () => {
		expect(
			findUntagged([
				{ tag: 'g', geometry: null, describe: 'g#a' },
				{ tag: 'path', geometry: 'pattern-outline', describe: 'path' },
				{ tag: 'rect', geometry: 'page-outline', describe: 'rect' }
			])
		).toEqual([]);
	});

	it('flags drawables without a valid tag', () => {
		const bad = findUntagged([
			{ tag: 'path', geometry: null, describe: 'path#x' },
			{ tag: 'circle', geometry: 'bogus', describe: 'circle' }
		]);
		expect(bad.map((b) => b.describe)).toEqual(['path#x', 'circle']);
		expect(untaggedMessage(bad)).toContain('2 untagged');
		expect(untaggedMessage(bad)).toContain('path#x');
	});
});
