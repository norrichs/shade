import type { BandCutPattern, PathSegment } from '$lib/types';
import { buildBandUnionPath } from '../build-band-union-path';
import type { StrokeInput } from '../expand-stroke';
import { getPaperScope } from '$lib/paper/scope';
import { pathSegmentsToPaper } from '$lib/paper';

const contourCount = (segs: PathSegment[]): number => segs.filter((s) => s[0] === 'M').length;

describe('buildBandUnionPath hole preservation', () => {
	beforeAll(() => getPaperScope());

	// Regression guard for the root cause: handing a whole multi-subpath facet to
	// the expander lets IT merge the pieces, which drops interior holes at shared
	// vertices. buildBandUnionPath must expand each subpath separately so paper's
	// union (proven hole-preserving) does the merging.
	test('expands each subpath separately, not the whole facet at once', () => {
		// One facet whose path has three separate subpaths.
		const facetPath: PathSegment[] = [
			['M', 0, 0],
			['L', 1, 0],
			['M', 2, 0],
			['L', 3, 0],
			['M', 4, 0],
			['L', 5, 0]
		];
		const band = {
			id: 'b',
			facets: [{ path: facetPath, strokeWidth: 2 }]
		} as unknown as BandCutPattern;

		const seenPaths: PathSegment[][] = [];
		const spy = (s: StrokeInput): PathSegment[] => {
			seenPaths.push(s.path);
			return [
				['M', 0, 0],
				['L', 1, 0],
				['L', 1, 1],
				['Z']
			];
		};

		buildBandUnionPath(band, spy);

		// 3 subpaths → 3 expander calls, each with a single-subpath (exactly one 'M').
		expect(seenPaths.length).toBe(3);
		seenPaths.forEach((p) => expect(contourCount(p)).toBe(1));
	});

	// Outcome check: a dense lattice supplied as ONE multi-subpath facet must keep
	// its holes through the real expand-per-subpath + union pipeline.
	test('preserves the holes of a dense lattice facet', () => {
		const strokeW = 2; // thin vs 10 spacing → ~8x8 cells stay open
		const lattice: PathSegment[] = [];
		for (let i = 0; i <= 10; i++) {
			lattice.push(['M', 0, i * 10], ['L', 100, i * 10]); // horizontal
			lattice.push(['M', i * 10, 0], ['L', i * 10, 100]); // vertical
		}
		const band = {
			id: 'grid',
			facets: [{ path: lattice, strokeWidth: strokeW }]
		} as unknown as BandCutPattern;

		const union = buildBandUnionPath(band);
		// 10x10 grid → 100 interior holes + 1 outer boundary.
		expect(contourCount(union)).toBe(101);
		// And the signed area is positive material with the holes subtracted out.
		const item = pathSegmentsToPaper(union);
		const area = Math.abs(item.area);
		item.remove();
		expect(area).toBeGreaterThan(0);
	});
});
