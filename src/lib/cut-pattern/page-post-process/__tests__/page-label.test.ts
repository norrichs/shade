import { describe, it, expect } from '@jest/globals';
import {
	composePageLabel,
	sanitizeLabelText,
	measureText,
	placeBox,
	buildPageLabels,
	type GlyphDict
} from '../page-label';
import type { PlacedBand } from '../../post-process-types';
import type { PathSegment } from '$lib/types';

const glyphPath: PathSegment[] = [['M', 0, 0], ['L', 1, 0], ['L', 1, 1]];
const glyph = { path: glyphPath, width: 1 };
const dict: GlyphDict = {
	a: glyph, b: glyph, '?': glyph, o: glyph, f: glyph, '1': glyph, '2': glyph,
	' ': { path: [], width: 0.5 }
};
const rectPoly = (x0: number, y0: number, x1: number, y1: number) => [
	{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }
];

describe('composePageLabel', () => {
	it('joins the enabled parts', () => {
		expect(composePageLabel({ text: 'hello', configName: true, pageNumber: true }, 'shade', 0, 3)).toBe('hello - shade - 1 of 3');
		expect(composePageLabel({ text: '', configName: false, pageNumber: true }, 'shade', 1, 3)).toBe('2 of 3');
		expect(composePageLabel({ text: '', configName: true, pageNumber: false }, undefined, 0, 1)).toBe('');
		expect(composePageLabel(undefined, 'x', 0, 1)).toBe('');
	});
});

describe('sanitizeLabelText', () => {
	it('replaces glyphs the font lacks with ?', () => {
		expect(sanitizeLabelText('ab🙂é', dict)).toBe('ab??');
	});
});

describe('measureText', () => {
	it('spans every glyph at its offset', () => {
		const box = measureText('ab', dict);
		expect(box.minY).toBe(0);
		expect(box.maxY).toBe(1);
		expect(box.maxX - box.minX).toBeGreaterThan(1.5);
	});
});

describe('placeBox', () => {
	const content = { x: 10, y: 10, width: 80, height: 80 };
	it('sits in the bottom-right corner of an empty page', () => {
		const p = placeBox({ content, width: 20, height: 5, obstacles: [], solids: [] })!;
		expect(p.x + 20).toBeCloseTo(90, 6);
		expect(p.y + 5).toBeCloseTo(90, 6);
	});
	it('avoids a band covering the corner', () => {
		const p = placeBox({ content, width: 20, height: 5, obstacles: [], solids: [rectPoly(40, 60, 95, 95)] })!;
		expect(p.x + 20 > 40 && p.y + 5 > 60).toBe(false);
	});
	it('returns null when nothing fits', () => {
		expect(placeBox({ content, width: 20, height: 5, obstacles: [], solids: [rectPoly(0, 0, 100, 100)] })).toBeNull();
	});
});

describe('buildPageLabels', () => {
	it('numbers pages and flags unplaceable ones', () => {
		const pages = [{ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 110, width: 100, height: 100 }];
		const full: PlacedBand = { bandId: 'f', page: 1, outlines: [rectPoly(0, 110, 100, 210)], holes: [] };
		const labels = buildPageLabels({
			pages, marginPx: 5, pageScale: 1, bands: [full], disconnects: [],
			config: { text: '', configName: false, pageNumber: true }, configName: undefined, dict
		});
		expect(labels.map((l) => l.text)).toEqual(['1 of 2', '2 of 2']);
		expect(labels[0].unplaced).toBeUndefined();
		expect(labels[1].unplaced).toBe(true);
	});
	it('returns nothing when the label is empty', () => {
		expect(
			buildPageLabels({
				pages: [{ x: 0, y: 0, width: 100, height: 100 }], marginPx: 5, pageScale: 1, bands: [],
				disconnects: [], config: undefined, configName: 'x', dict
			})
		).toEqual([]);
	});
});
