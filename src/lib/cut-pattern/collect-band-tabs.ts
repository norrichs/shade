import type {
	BandCutPattern,
	Facet,
	FacetTab,
	FullTab,
	MultiFacetFullTab,
	MultiFacetTrapTab,
	Point,
	TrapTab
} from '$lib/types';

export type BandTabRecord = NonNullable<BandCutPattern['tabs']>[number];

// Local type guards — duplicated from generate-shape.ts to keep this module
// import-light (importing from generate-shape pulls in cut-pattern code that
// transitively reaches three/src submodules, which Jest's transform pipeline
// doesn't handle).
const isFullTab = (t: FacetTab | undefined): t is FullTab => t?.style === 'full';
const isTrapTab = (t: FacetTab | undefined): t is TrapTab => t?.style === 'trapezoid';
const isMultiFacetFullTab = (t: FacetTab | undefined): t is MultiFacetFullTab =>
	t?.style === 'multi-facet-full';
const isMultiFacetTrapTab = (t: FacetTab | undefined): t is MultiFacetTrapTab =>
	t?.style === 'multi-facet-trapezoid';

// Extract a 2D outer-vertex list and base edge for a single FacetTab.
// The returned points are in pattern-flatten (2D) space — the same coordinate
// frame consumed by getPathFromPoints when baking svgPath.
export const extractTabGeometry = (
	facetTab: FacetTab
): { outer: Point[]; base: [Point, Point] } | undefined => {
	const v3ToPoint = (v: { x: number; y: number }): Point => ({ x: v.x, y: v.y });

	if (isFullTab(facetTab)) {
		// outer is { a, b, c }; the vertex named by footprint.free is NOT on the band.
		const free = facetTab.footprint.free;
		const namedOuter = facetTab.outer as Record<'a' | 'b' | 'c', { x: number; y: number }>;
		const baseKeys = (['a', 'b', 'c'] as const).filter((k) => k !== free);
		const outer = (['a', 'b', 'c'] as const).map((k) => v3ToPoint(namedOuter[k]));
		const base: [Point, Point] = [
			v3ToPoint(namedOuter[baseKeys[0]]),
			v3ToPoint(namedOuter[baseKeys[1]])
		];
		return { outer, base };
	}
	if (isTrapTab(facetTab)) {
		// outer is { a, b, c, d }; a and d are the trapezoid vertices on the band.
		const namedOuter = facetTab.outer as Record<'a' | 'b' | 'c' | 'd', { x: number; y: number }>;
		const outer = (['a', 'b', 'c', 'd'] as const).map((k) => v3ToPoint(namedOuter[k]));
		const base: [Point, Point] = [v3ToPoint(namedOuter.a), v3ToPoint(namedOuter.d)];
		return { outer, base };
	}
	if (isMultiFacetFullTab(facetTab) || isMultiFacetTrapTab(facetTab)) {
		// Multi-facet tabs straddle two facets; the "base" concept is less
		// straightforward. Best-effort: outer is the full 4-point polygon,
		// base is (outer.a, outer.d) — the edge produced by the matching
		// generators (see generateMultiFacetFullTab in generate-shape.ts).
		const namedOuter = facetTab.outer as Record<'a' | 'b' | 'c' | 'd', { x: number; y: number }>;
		const outer = (['a', 'b', 'c', 'd'] as const).map((k) => v3ToPoint(namedOuter[k]));
		const base: [Point, Point] = [v3ToPoint(namedOuter.a), v3ToPoint(namedOuter.d)];
		return { outer, base };
	}
	return undefined;
};

// Collect structured per-tab records from a flattened band's facets.
// `position` is assigned by iteration order:
//   - the tab on the first facet (if any) → 'start'
//   - the tab on the last facet (if any) → 'end'
//   - every other tab → 'mid', with midIndex/midCount populated
// Bands with no tabs return undefined.
export const collectBandTabs = (facets: Facet[]): BandTabRecord[] | undefined => {
	if (!facets.length) return undefined;
	const lastIndex = facets.length - 1;
	const records: BandTabRecord[] = [];
	let midCount = 0;

	facets.forEach((facet, i) => {
		const facetTab = facet.tab;
		if (!facetTab || Array.isArray(facetTab)) return;
		const geom = extractTabGeometry(facetTab);
		if (!geom) return;

		let position: BandTabRecord['position'];
		let midIndex: number | undefined;
		if (i === 0) {
			position = 'start';
		} else if (i === lastIndex) {
			position = 'end';
		} else {
			position = 'mid';
			midIndex = midCount++;
		}

		const record: BandTabRecord = {
			outer: geom.outer,
			base: geom.base,
			position
		};
		if (position === 'mid') record.midIndex = midIndex;
		records.push(record);
	});

	if (!records.length) return undefined;

	// Fill in midCount on every mid record now that we know the total.
	for (const r of records) {
		if (r.position === 'mid') r.midCount = midCount;
	}

	return records;
};
