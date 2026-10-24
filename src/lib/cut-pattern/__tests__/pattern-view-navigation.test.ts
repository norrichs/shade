import {
	clampZoom,
	currentPageIndex,
	steppedPageIndex,
	zoomAboutPoint,
	zoomToFitWidth
} from '#lib/cut-pattern/pattern-view-navigation.js';

const pages = [
	{ x: 10, y: 20, width: 100, height: 150 },
	{ x: 120, y: 20, width: 100, height: 150 },
	{ x: 10, y: 180, width: 100, height: 150 }
];

describe('zoomToFitWidth', () => {
	it('solves viewWidth * 10^-zoom = targetWidth * pxPerUnit', () => {
		const zoom = zoomToFitWidth(200, 400, 'mm');
		expect(400 * Math.pow(10, -zoom)).toBeCloseTo(200 * (96 / 25.4));
	});

	it('uses inches when asked', () => {
		const zoom = zoomToFitWidth(8.5, 8.5, 'in');
		expect(Math.pow(10, -zoom)).toBeCloseTo(96);
	});

	it('clamps to the zoom range', () => {
		expect(zoomToFitWidth(1e9, 1, 'mm')).toBe(clampZoom(-100));
	});
});

describe('currentPageIndex', () => {
	it('returns -1 with no pages', () => {
		expect(currentPageIndex([], { x: 0, y: 0 })).toBe(-1);
	});

	it('picks the page holding the view top-left', () => {
		expect(currentPageIndex(pages, { x: 150, y: 50 })).toBe(1);
		expect(currentPageIndex(pages, { x: 10, y: 180 })).toBe(2);
	});

	it('falls back to the nearest page top-left', () => {
		expect(currentPageIndex(pages, { x: 0, y: 0 })).toBe(0);
		expect(currentPageIndex(pages, { x: 300, y: 0 })).toBe(1);
	});
});

describe('steppedPageIndex', () => {
	it('steps forward and back, clamped to the ends', () => {
		expect(steppedPageIndex(pages, { x: 10, y: 20 }, 1)).toBe(1);
		expect(steppedPageIndex(pages, { x: 120, y: 20 }, 1)).toBe(2);
		expect(steppedPageIndex(pages, { x: 10, y: 180 }, 1)).toBe(2);
		expect(steppedPageIndex(pages, { x: 120, y: 20 }, -1)).toBe(0);
		expect(steppedPageIndex(pages, { x: 10, y: 20 }, -1)).toBe(0);
	});
});

describe('zoomAboutPoint', () => {
	it('keeps the anchor fixed in view-relative terms', () => {
		const offset = { x: 0, y: 0 };
		const anchor = { x: 100, y: 50 };
		const next = zoomAboutPoint(offset, anchor, 1);
		// visible extent shrinks 10x, so the anchor is 10x closer to the offset
		expect(next.x).toBeCloseTo(90);
		expect(next.y).toBeCloseTo(45);
	});

	it('is the identity at zero delta', () => {
		expect(zoomAboutPoint({ x: 3, y: 4 }, { x: 9, y: 9 }, 0)).toEqual({ x: 3, y: 4 });
	});
});
