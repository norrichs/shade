import { pageOrigin } from '../page-grid';
import type { PageGeom } from '../types';

const geom = (over: Partial<PageGeom> = {}): PageGeom => ({
	pageScale: 1,
	pageWidth: 100,
	pageHeight: 200,
	contentWidth: 100,
	contentHeight: 200,
	marginPx: 0,
	pageGap: 20,
	gap: 0,
	reorderWindow: 1,
	allowRotation: false,
	...over
});

const origins = (n: number, g: PageGeom) =>
	Array.from({ length: n }, (_, i) => pageOrigin(i, g)).map(({ x, y }) => [x, y]);

describe('pageOrigin', () => {
	it('stacks a single column without a wrap width', () => {
		expect(origins(3, geom())).toEqual([
			[0, 0],
			[0, 220],
			[0, 440]
		]);
	});

	it('fills a row left to right, then wraps', () => {
		// Three pages need 100 + 20 + 100 + 20 + 100 = 340.
		expect(origins(4, geom({ wrapWidth: 340 }))).toEqual([
			[0, 0],
			[120, 0],
			[240, 0],
			[0, 220]
		]);
	});

	it('wraps before a page that would pass the wrap width', () => {
		expect(origins(3, geom({ wrapWidth: 339 }))).toEqual([
			[0, 0],
			[120, 0],
			[0, 220]
		]);
	});

	it('keeps at least one page per row when the wrap width is narrower than a page', () => {
		expect(origins(2, geom({ wrapWidth: 10 }))).toEqual([
			[0, 0],
			[0, 220]
		]);
	});
});
