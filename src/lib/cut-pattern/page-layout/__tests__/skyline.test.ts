import { skylinePageLayout } from '../skyline';
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
	reorderWindow: 8,
	allowRotation: false,
	...over
});

// origin.x/y target the CENTER of the placed slot minus the item's bounds-center.
// With left=top=0, bounds-center = (width/2, height/2), so for an unrotated item
// placed at slot top-left (sx, sy): origin = (sx, sy).
describe('skylinePageLayout', () => {
	it('places the first item at content origin (top-left slot)', () => {
		const r = skylinePageLayout([item(100, 50)], geom());
		expect(r.origins[0].x).toBeCloseTo(0);
		expect(r.origins[0].y).toBeCloseTo(0);
		expect(r.rotations[0]).toBe(0);
		expect(r.pages).toHaveLength(1);
	});

	it('lays two equal items side by side, left to right', () => {
		// Equal scores → tie-break by x then original index, so item 0 lands at
		// x=0 and item 1 to its right at x=100, both at the top.
		const r = skylinePageLayout([item(100, 50), item(100, 50)], geom());
		expect(r.origins.map((o) => o.x)).toEqual([0, 100]);
		expect(r.origins.map((o) => o.y)).toEqual([0, 0]);
	});

	it('drops a following item onto the lowest ledge (unbounded push-up)', () => {
		// contentWidth 200, strict order (reorderWindow 1):
		//   item0 100×100 at x=0 (raises left column to 100),
		//   item1 100×20 at x=100 (raises right column to 20),
		//   item2 100×80 rests on the right ledge at top=20 — rising 20 above the
		//   baseline, which the flex-wrap midpoint clamp would have forbidden.
		const r = skylinePageLayout(
			[item(100, 100), item(100, 20), item(100, 80)],
			geom({ contentWidth: 200, reorderWindow: 1 })
		);
		expect(r.origins[2].x).toBeCloseTo(100);
		expect(r.origins[2].y).toBeCloseTo(20);
	});

	it('reorders within the window to place the best fit first (dense stacking)', () => {
		// Full-width (100) items of decreasing height. With a wide window the
		// packer places them shortest-first (lowest resulting top), so they stack
		// item2 (30) at y=0, item1 (50) at y=30, item0 (100) at y=80.
		const items = [item(100, 100), item(100, 50), item(100, 30)];
		const r = skylinePageLayout(items, geom({ contentWidth: 100, reorderWindow: 8 }));
		expect(r.origins[2].y).toBeCloseTo(0);
		expect(r.origins[1].y).toBeCloseTo(30);
		expect(r.origins[0].y).toBeCloseTo(80);
	});

	it('reorderWindow=1 keeps strict input order', () => {
		// Same items, window of 1 → placed in input order, stacking downward:
		// item0 at y=0, item1 at y=100, item2 at y=150.
		const items = [item(100, 100), item(100, 50), item(100, 30)];
		const r = skylinePageLayout(items, geom({ contentWidth: 100, reorderWindow: 1 }));
		expect(r.origins[0].y).toBeCloseTo(0);
		expect(r.origins[1].y).toBeCloseTo(100);
		expect(r.origins[2].y).toBeCloseTo(150);
	});

	it('rotates a tall-narrow item to fit when allowRotation is on', () => {
		const g = geom({ contentWidth: 100, contentHeight: 50, pageHeight: 50, allowRotation: true });
		const r = skylinePageLayout([item(30, 80)], g);
		expect(r.rotations[0]).toBe(90);
		expect(r.pages).toHaveLength(1);
		expect(r.overflow).toBeUndefined();
	});

	it('breaks to a new page and places the front item when the window is stuck', () => {
		const g = geom({ contentWidth: 100, contentHeight: 150, pageHeight: 150, pageGap: 50 });
		const r = skylinePageLayout([item(100, 100), item(100, 100)], g);
		expect(r.pages).toHaveLength(2);
		expect(r.origins[0].y).toBeCloseTo(0);
		// second item on page 2: pageOffsetY = 1*(150+50) = 200, top 0
		expect(r.origins[1].y).toBeCloseTo(200);
	});

	it('reports overflow with the required scale when an item exceeds the content box', () => {
		const g = geom({ pageScale: 2, contentWidth: 300, contentHeight: 1000 });
		const r = skylinePageLayout([item(500, 50)], g);
		expect(r.overflow?.itemIndex).toBe(0);
		expect(r.overflow?.requiredScale).toBeCloseTo(3.333, 2);
		expect(r.origins).toHaveLength(0);
	});

	it('rotation can rescue an item that would otherwise overflow', () => {
		// content 100 wide, 400 tall. Item 300×80 overflows width upright, but
		// rotated (80×300) fits. No overflow expected.
		const g = geom({ contentWidth: 100, contentHeight: 400, pageHeight: 400, allowRotation: true });
		const r = skylinePageLayout([item(300, 80)], g);
		expect(r.overflow).toBeUndefined();
		expect(r.rotations[0]).toBe(90);
	});
});
