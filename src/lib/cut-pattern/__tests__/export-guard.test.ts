import { describe, it, expect } from '@jest/globals';
import {
	findUntagged,
	untaggedMessage,
	describeExportElement,
	SCREEN_ONLY_SELECTOR,
	type ExportElementLike
} from '../export-guard';

/**
 * A minimal fake DOM element satisfying `ExportElementLike`. Jest here runs in
 * node (no jsdom), so `.screen-only` exclusion is exercised through this fake
 * rather than a real DOM — `insideScreenOnly` stands in for what
 * `el.closest(SCREEN_ONLY_SELECTOR)` would return on a real element nested
 * under a `.screen-only` ancestor.
 */
const fakeElement = (opts: {
	tag: string;
	geometry?: string | null;
	id?: string | null;
	insideScreenOnly?: boolean;
}): ExportElementLike => ({
	tagName: opts.tag,
	getAttribute: (name: string) => (name === 'data-geometry' ? (opts.geometry ?? null) : null),
	closest: (selector: string) => {
		if (selector === SCREEN_ONLY_SELECTOR) return opts.insideScreenOnly ? {} : null;
		if (selector === '[id]') return opts.id ? { id: opts.id } : null;
		return null;
	}
});

describe('describeExportElement', () => {
	it('describes a tagged element outside any screen-only subtree', () => {
		const node = describeExportElement(
			fakeElement({ tag: 'PATH', geometry: 'pattern-outline', id: 'band-1' })
		);
		expect(node).toEqual({ tag: 'path', geometry: 'pattern-outline', describe: 'path in #band-1' });
	});

	it('excludes an element nested under a screen-only ancestor', () => {
		const node = describeExportElement(
			fakeElement({ tag: 'rect', geometry: null, insideScreenOnly: true })
		);
		expect(node).toBeNull();
	});
});

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
