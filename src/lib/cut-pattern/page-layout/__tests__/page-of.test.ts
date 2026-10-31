import { pageOfPoint } from '../page-of';

const pages = [
	{ x: 0, y: 0, width: 100, height: 100 },
	{ x: 110, y: 0, width: 100, height: 100 }
];

describe('pageOfPoint', () => {
	test('returns the page containing the point', () => {
		expect(pageOfPoint({ x: 50, y: 50 }, pages)).toBe(0);
		expect(pageOfPoint({ x: 150, y: 20 }, pages)).toBe(1);
	});

	test('falls back to the nearest page for a point in a gap', () => {
		expect(pageOfPoint({ x: 102, y: 50 }, pages)).toBe(0);
		expect(pageOfPoint({ x: 108, y: 50 }, pages)).toBe(1);
	});

	test('returns -1 with no pages', () => {
		expect(pageOfPoint({ x: 0, y: 0 }, [])).toBe(-1);
	});
});
