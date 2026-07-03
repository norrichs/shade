import type { BandCutPattern, PathSegment } from '$lib/types';
import { buildBandUnionPath } from '../build-band-union-path';
import type { StrokeInput } from '../expand-stroke';
import { getPaperScope } from '$lib/paper/scope';
import { pathSegmentsToPaper } from '$lib/paper';

const contourCount = (segs: PathSegment[]): number => segs.filter((s) => s[0] === 'M').length;

describe('buildBandUnionPath hole preservation', () => {
	beforeAll(() => getPaperScope());

	// Regression guard for the root cause: handing a whole multi-edge subpath to
	// the expander lets svg-path-outline turn a closed loop into a ring (or merge
	// pieces at shared vertices), corrupting the union. buildBandUnionPath must
	// expand each individual EDGE separately so paper's union does the merging.
	test('expands each individual edge separately, not whole subpaths', () => {
		// One facet whose single subpath is a closed quad loop = 4 edges (3 L + Z).
		const facetPath: PathSegment[] = [
			['M', 0, 0],
			['L', 10, 0],
			['L', 10, 10],
			['L', 0, 10],
			['Z']
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

		// 4 edges (including the Z closing edge) → 4 expander calls, each a
		// two-point single segment (exactly one 'M' and one draw command).
		expect(seenPaths.length).toBe(4);
		seenPaths.forEach((p) => {
			expect(contourCount(p)).toBe(1);
			expect(p.length).toBe(2);
		});
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

	// Real tristar facet whose subpaths include multi-edge CLOSED LOOPS (cells)
	// plus crossing spokes. Expanding whole subpaths collapsed this to 11 contours
	// (cells filled / wrongly merged); per-edge expansion recovers the full
	// tessellation (~23 contours).
	test('recovers all cells of a tristar facet with closed-loop subpaths', () => {
		// prettier-ignore
		const facet0: PathSegment[] = [["M",70.05,238.72],["L",67.31,227.12],["M",52.16,238.92],["L",47.91,258.66],["L",37.01,250.73],["L",41.26,230.99],["L",52.16,238.92],["M",45.90,212.75],["L",41.26,230.99],["L",29.97,221.58],["L",34.62,203.33],["L",45.90,212.75],["M",62.67,245.37],["L",67.31,227.12],["L",56.80,220.67],["L",61.83,203.91],["L",50.93,195.98],["M",33.14,271.95],["L",21.86,262.54],["L",25.72,241.32],["L",14.04,230.42],["L",18.30,210.69],["M",67.31,227.12],["L",47.91,258.66],["L",21.86,262.54],["L",41.26,230.99],["L",67.31,227.12],["M",61.83,203.91],["L",41.26,230.99],["L",14.04,230.42],["L",34.62,203.33],["L",61.83,203.91],["M",67.31,227.12],["L",52.16,238.92],["M",37.01,250.73],["L",21.86,262.54],["M",61.83,203.91],["L",45.90,212.75],["M",29.97,221.58],["L",14.04,230.42],["M",67.31,227.12],["L",61.83,203.91],["M",47.91,258.66],["L",41.26,230.99],["M",41.26,230.99],["L",34.62,203.33],["M",21.86,262.54],["L",14.04,230.42],["M",62.67,245.37],["L",33.14,271.95],["M",56.80,220.67],["L",25.72,241.32],["M",50.93,195.98],["L",18.30,210.69],["M",61.83,203.91],["L",57.87,177.43]];
		const band = {
			id: 'tristar',
			facets: [{ path: facet0, strokeWidth: 3 }]
		} as unknown as BandCutPattern;

		const union = buildBandUnionPath(band);
		// Whole-subpath expansion yielded only 11 contours here; per-edge recovers ~23.
		expect(contourCount(union)).toBeGreaterThanOrEqual(20);
	});
});
