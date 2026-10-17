import { sliceView } from '../capture';

describe('sliceView', () => {
	it('leaves a moderate aspect ratio whole', () => {
		const view = { x: 0, y: 0, width: 300, height: 200 };
		expect(sliceView(view)).toEqual({ rects: [view], across: 1 });
	});

	it('stacks a long strip into equal, overlapping rows that cover it', () => {
		const view = { x: 10, y: 0, width: 1400, height: 100 };
		const { rects, across } = sliceView(view);
		expect(across).toBe(1);
		expect(rects.length).toBe(3);
		expect(new Set(rects.map((r) => r.width)).size).toBe(1);
		expect(rects[0].x).toBe(10);
		expect(rects.at(-1)!.x + rects.at(-1)!.width).toBeGreaterThanOrEqual(1410);
		for (let i = 1; i < rects.length; i++) {
			expect(rects[i].x).toBeLessThan(rects[i - 1].x + rects[i - 1].width);
		}
	});

	it('lays a tall strip out as side-by-side columns', () => {
		const { rects, across } = sliceView({ x: 0, y: 0, width: 100, height: 1400 });
		expect(across).toBe(rects.length);
		expect(rects.length).toBeGreaterThan(1);
	});
});
