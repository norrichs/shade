import { flexWrapPageLayout } from '../flex-wrap';
import type { LayoutItem, PageGeom } from '../types';

const item = (width: number, height: number): LayoutItem => ({
	width,
	height,
	left: 0,
	top: 0,
	alignedYOffset: 0
});

const geom = (over: Partial<PageGeom> = {}): PageGeom => ({
	pageScale: 1,
	pageWidth: 300,
	pageHeight: 1000,
	contentWidth: 300,
	contentHeight: 1000,
	marginPx: 0,
	pageGap: 50,
	gap: 0,
	...over
});

describe('flexWrapPageLayout', () => {
	it('lays a single row left-to-right, top-aligned, one page', () => {
		const r = flexWrapPageLayout([item(100, 50), item(120, 40)], geom());
		expect(r.origins.map((o) => o.x)).toEqual([0, 100]);
		expect(r.origins.map((o) => o.y)).toEqual([0, 0]);
		expect(r.pages).toHaveLength(1);
		expect(r.overflow).toBeUndefined();
	});

	it('wraps to a new row when an item exceeds content width', () => {
		const r = flexWrapPageLayout([item(150, 40), item(150, 100), item(150, 50)], geom());
		expect(r.origins.map((o) => o.x)).toEqual([0, 150, 0]);
		expect(r.origins.map((o) => o.y)).toEqual([0, 0, 75]);
	});

	it('limits push-up so the item midpoint never rises above the row top', () => {
		const r = flexWrapPageLayout([item(150, 10), item(150, 100), item(150, 80)], geom());
		expect(r.origins[2].y).toBe(60);
	});

	it('breaks to a new stacked page when a row exceeds content height', () => {
		const g = geom({ contentWidth: 100, contentHeight: 150, pageHeight: 150, pageGap: 50 });
		const r = flexWrapPageLayout([item(100, 100), item(100, 100)], g);
		expect(r.pages).toHaveLength(2);
		expect(r.origins[0].y).toBe(0);
		expect(r.origins[1].y).toBe(200);
	});

	it('offsets origins by margin and page index', () => {
		const g = geom({ marginPx: 10 });
		const r = flexWrapPageLayout([item(50, 50)], g);
		expect(r.origins[0].x).toBe(10);
		expect(r.origins[0].y).toBe(10);
		expect(r.pages[0]).toEqual({ x: 0, y: 0, width: 300, height: 1000 });
	});

	it('reports overflow with the required (larger) pageScale', () => {
		const g = geom({ pageScale: 2, contentWidth: 300, contentHeight: 1000 });
		const r = flexWrapPageLayout([item(500, 50)], g);
		expect(r.overflow?.itemIndex).toBe(0);
		expect(r.overflow?.requiredScale).toBeCloseTo(3.333, 2);
		expect(r.origins).toHaveLength(0);
	});
});
