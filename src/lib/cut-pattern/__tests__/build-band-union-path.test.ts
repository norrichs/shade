import type { BandCutPattern, PathSegment } from '$lib/types';
import { buildBandUnionPath } from '../build-band-union-path';
import { getPaperScope } from '$lib/paper/scope';
import { pathSegmentsToPaper } from '$lib/paper';

const rect = (x: number, y: number, w: number, h: number): PathSegment[] => [
	['M', x, y],
	['L', x + w, y],
	['L', x + w, y + h],
	['L', x, y + h],
	['Z']
];

const area = (segments: PathSegment[]): number => {
	const item = pathSegmentsToPaper(segments);
	const a = Math.abs(item.area);
	item.remove();
	return a;
};

const bandWithFacets = (count: number): BandCutPattern =>
	({
		id: 'band-test',
		facets: Array.from({ length: count }, () => ({
			path: [['M', 0, 0] as PathSegment],
			strokeWidth: 4
		}))
	}) as unknown as BandCutPattern;

describe('buildBandUnionPath', () => {
	beforeAll(() => {
		getPaperScope();
	});

	test('unions each facet outline via the injected expander', () => {
		const band = bandWithFacets(2);
		let call = 0;
		// Two overlapping 10x10 rects -> union spans 0..15 wide = 150 area.
		const stub = () => (call++ === 0 ? rect(0, 0, 10, 10) : rect(5, 0, 10, 10));

		const union = buildBandUnionPath(band, stub);

		expect(union.filter((s) => s[0] === 'M').length).toBe(1);
		expect(area(union)).toBeCloseTo(150, 1);
	});

	test('empty band yields empty path', () => {
		const band = bandWithFacets(0);
		expect(buildBandUnionPath(band, () => [])).toEqual([]);
	});

	test('end-to-end with the real expander produces a closed union', () => {
		const band = {
			id: 'band-real',
			facets: [
				{ path: [['M', 0, 0], ['L', 10, 0]] as PathSegment[], strokeWidth: 4 },
				{ path: [['M', 0, 0], ['L', 0, 10]] as PathSegment[], strokeWidth: 4 }
			]
		} as unknown as BandCutPattern;

		const union = buildBandUnionPath(band);
		expect(union.length).toBeGreaterThan(0);
		expect(union[0][0]).toBe('M');
		expect(union.some((s) => s[0] === 'Z')).toBe(true);
	});
});
