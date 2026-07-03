import type { PathSegment } from '$lib/types';
import { expandFacetStroke } from '../expand-stroke';
import { getPaperScope } from '$lib/paper/scope';
import { pathSegmentsToPaper } from '$lib/paper';

const area = (segments: PathSegment[]): number => {
	const item = pathSegmentsToPaper(segments);
	const a = Math.abs(item.area);
	item.remove();
	return a;
};

describe('expandFacetStroke', () => {
	beforeAll(() => {
		getPaperScope();
	});

	test('empty path returns empty array', () => {
		expect(expandFacetStroke({ path: [], strokeWidth: 4, cap: 'round' })).toEqual([]);
	});

	test('a straight line expands into a closed filled outline of its stroke width', () => {
		const path: PathSegment[] = [
			['M', 0, 0],
			['L', 10, 0]
		];
		const outline = expandFacetStroke({ path, strokeWidth: 4, cap: 'round' });

		// Closed contour.
		expect(outline[0][0]).toBe('M');
		expect(outline.some((s) => s[0] === 'Z')).toBe(true);

		// Area traces the width: at least the butt-cap rectangle (length 10 * width 4 = 40),
		// at most the square-cap bounding box (length 14 * width 4 = 56). Exact cap area
		// depends on the engine; this range holds for round/butt/square caps.
		const a = area(outline);
		expect(a).toBeGreaterThan(39);
		expect(a).toBeLessThan(57);
	});
});
