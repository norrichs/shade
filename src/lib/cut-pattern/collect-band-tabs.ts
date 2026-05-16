import type {
	BandCutPattern,
	Facet,
	FacetTab,
	Point,
	TriangleSide
} from '$lib/types';
import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';
import {
	isFullTab,
	isMultiFacetFullTab,
	isMultiFacetTrapTab,
	isTrapTab
} from '$lib/tab-guards';

export type BandTabRecord = NonNullable<BandCutPattern['tabs']>[number];

// Meta accepted by collectBandTabs for semantic position classification.
// Mirrors the shape produced at the call site (generate-cut-pattern.ts).
export type BandTabMeta = {
	startPartnerBand?: GlobuleAddress_Band;
	endPartnerBand?: GlobuleAddress_Band;
};

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
		// Multi-facet tabs straddle two facets. By construction in
		// generateMultiFacetFullTab (generate-shape.ts ~681-694), outer.a and
		// outer.d are both vertices of footprint[0].triangle — the band-attached
		// facet — and together name the edge attached to the band.
		const namedOuter = facetTab.outer as Record<'a' | 'b' | 'c' | 'd', { x: number; y: number }>;
		const outer = (['a', 'b', 'c', 'd'] as const).map((k) => v3ToPoint(namedOuter[k]));
		const base: [Point, Point] = [v3ToPoint(namedOuter.a), v3ToPoint(namedOuter.d)];
		return { outer, base };
	}
	return undefined;
};

// Map a tab's footprint to the edge of the band-attached facet that the tab
// sits on (the "tab seam"). For all single- and multi-facet tab styles, the
// band-attached facet is the one whose vertex/side opposite the seam is named
// by footprint.free. Returns undefined if the seam can't be determined.
const getSeamEdge = (facetTab: FacetTab): TriangleSide | undefined => {
	if (isFullTab(facetTab) || isTrapTab(facetTab)) {
		const free = facetTab.footprint.free;
		// Edge opposite the free vertex.
		if (free === 'a') return 'bc';
		if (free === 'b') return 'ac';
		if (free === 'c') return 'ab';
		return undefined;
	}
	if (isMultiFacetFullTab(facetTab) || isMultiFacetTrapTab(facetTab)) {
		// footprint[0] is the band-attached facet with a single-vertex `free`.
		const free = facetTab.footprint[0].free;
		if (free === 'a') return 'bc';
		if (free === 'b') return 'ac';
		if (free === 'c') return 'ab';
		return undefined;
	}
	return undefined;
};

const sameBandAddress = (
	a: GlobuleAddress_Band | undefined,
	b: GlobuleAddress_Band | undefined
): boolean => {
	if (!a || !b) return false;
	return a.globule === b.globule && a.tube === b.tube && a.band === b.band;
};

// Collect structured per-tab records from a flattened band's facets.
//
// `position` is classified semantically when band meta is available:
//   - 'start' = the tab's footprint facet has a partner-across-the-tab-seam
//               matching meta.startPartnerBand
//   - 'end'   = same, matching meta.endPartnerBand
//   - 'mid'   = anything else (or partner address unavailable)
//
// If meta is omitted, OR the facet has no partner metadata at the seam edge,
// we fall back to positional classification (first facet → start, last → end)
// so legacy callers and tests without meta still get sensible records.
export const collectBandTabs = (
	facets: Facet[],
	meta?: BandTabMeta
): BandTabRecord[] | undefined => {
	if (!facets.length) return undefined;
	const lastIndex = facets.length - 1;
	const records: BandTabRecord[] = [];
	let midCount = 0;

	facets.forEach((facet, i) => {
		const facetTab = facet.tab;
		if (!facetTab || Array.isArray(facetTab)) return;
		const geom = extractTabGeometry(facetTab);
		if (!geom) return;

		let position: BandTabRecord['position'] | undefined;

		// Semantic classification: compare the seam-edge partner band against
		// the band's startPartnerBand / endPartnerBand.
		if (meta) {
			const seam = getSeamEdge(facetTab);
			const seamPartner = seam ? facet.meta?.[seam]?.partner : undefined;
			if (seamPartner) {
				const partnerBand: GlobuleAddress_Band = {
					globule: seamPartner.globule,
					tube: seamPartner.tube,
					band: seamPartner.band
				};
				if (sameBandAddress(partnerBand, meta.startPartnerBand)) {
					position = 'start';
				} else if (sameBandAddress(partnerBand, meta.endPartnerBand)) {
					position = 'end';
				} else {
					position = 'mid';
				}
			}
		}

		// Fallback: positional classification when semantic info is unreachable
		// (no meta passed, no facet.meta on the seam edge, or seam undetermined).
		// This preserves behavior for legacy callers / fixtures that don't wire
		// partner metadata through.
		if (!position) {
			if (i === 0) position = 'start';
			else if (i === lastIndex) position = 'end';
			else position = 'mid';
		}

		let midIndex: number | undefined;
		if (position === 'mid') midIndex = midCount++;

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
