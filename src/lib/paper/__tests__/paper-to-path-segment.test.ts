import type { PathSegment } from '$lib/types';
import { pathSegmentsToPaper } from '../path-segment-to-paper';
import { paperToPathSegments } from '../paper-to-path-segment';
import { getPaperScope } from '../scope';

describe('paperToPathSegments', () => {
	beforeAll(() => {
		getPaperScope();
	});

	test('round-trips a closed unit square as M + 3×L + Z', () => {
		const square: PathSegment[] = [
			['M', 0, 0],
			['L', 10, 0],
			['L', 10, 10],
			['L', 0, 10],
			['Z']
		];
		const item = pathSegmentsToPaper(square);
		const out = paperToPathSegments(item);
		item.remove();

		expect(out[0]).toEqual(['M', 0, 0]);
		expect(out[out.length - 1]).toEqual(['Z']);
		// Three line segments back to the start (paper omits the closing L since Z handles it).
		const lineCount = out.filter((s) => s[0] === 'L').length;
		expect(lineCount).toBe(3);
		// No curve segments expected for a pure-line square.
		expect(out.some((s) => s[0] === 'C')).toBe(false);
	});

	test('emits C segments when paper has bezier handles', () => {
		const curved: PathSegment[] = [
			['M', 0, 0],
			['C', 5, 0, 10, 5, 10, 10],
			['L', 0, 10],
			['Z']
		];
		const item = pathSegmentsToPaper(curved);
		const out = paperToPathSegments(item);
		item.remove();

		expect(out.some((s) => s[0] === 'C')).toBe(true);
	});

	test('handles a CompoundPath as multiple M..Z runs', () => {
		const paper = getPaperScope();
		const a = pathSegmentsToPaper([
			['M', 0, 0],
			['L', 10, 0],
			['L', 10, 10],
			['L', 0, 10],
			['Z']
		]);
		const b = pathSegmentsToPaper([
			['M', 20, 0],
			['L', 30, 0],
			['L', 30, 10],
			['L', 20, 10],
			['Z']
		]);
		const compound = new paper.CompoundPath({ children: [a, b] });
		const out = paperToPathSegments(compound);
		compound.remove();

		const mCount = out.filter((s) => s[0] === 'M').length;
		const zCount = out.filter((s) => s[0] === 'Z').length;
		expect(mCount).toBe(2);
		expect(zCount).toBe(2);
	});
});
