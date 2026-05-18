import type { PathSegment } from '$lib/types';
import { mergeOutlineWithLabel } from '../merge-outline-with-label';

const rect = (x: number, y: number, w: number, h: number): PathSegment[] => [
	['M', x, y],
	['L', x + w, y],
	['L', x + w, y + h],
	['L', x, y + h],
	['Z']
];

describe('mergeOutlineWithLabel', () => {
	test('two overlapping rectangles produce a single closed contour', () => {
		// Pattern outline 0..10 × 0..10; label outline 8..18 × 2..8 (overlaps on the right edge).
		const outline = rect(0, 0, 10, 10);
		const label = rect(8, 2, 10, 6);
		const merged = mergeOutlineWithLabel(outline, label);

		expect(merged.filter((s) => s[0] === 'M').length).toBe(1);
		expect(merged.filter((s) => s[0] === 'Z').length).toBe(1);
		expect(merged[0][0]).toBe('M');
		expect(merged[merged.length - 1][0]).toBe('Z');
	});

	test('disjoint outline and label produce a compound path (two contours)', () => {
		const outline = rect(0, 0, 10, 10);
		const label = rect(20, 0, 10, 10);
		const merged = mergeOutlineWithLabel(outline, label);

		expect(merged.filter((s) => s[0] === 'M').length).toBe(2);
		expect(merged.filter((s) => s[0] === 'Z').length).toBe(2);
	});

	test("throws when either input doesn't start with 'M'", () => {
		const outline = rect(0, 0, 10, 10);
		const bad: PathSegment[] = [['L', 1, 1], ['Z']];
		expect(() => mergeOutlineWithLabel(outline, bad)).toThrow();
		expect(() => mergeOutlineWithLabel(bad, outline)).toThrow();
	});
});
