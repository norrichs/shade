import { Triangle, Vector3 } from 'three';
import { collectBandTabs } from '../collect-band-tabs';
import type { Facet, FullTab, TrapTab } from '$lib/types';
import type { GlobuleAddress_Band, GlobuleAddress_FacetEdge } from '$lib/projection-geometry/types';

// Helpers --------------------------------------------------------------------

const tri = (a: [number, number], b: [number, number], c: [number, number]): Triangle =>
	new Triangle(new Vector3(a[0], a[1], 0), new Vector3(b[0], b[1], 0), new Vector3(c[0], c[1], 0));

// Build a minimal 2D Facet with no tab.
const bareFacet = (t: Triangle): Facet => ({
	triangle: t,
	orientation: 'circumferential'
});

// Build a FullTab in 2D. `outer` carries the tab polygon; `footprint.free`
// names the vertex of `outer` that is NOT attached to the band.
const makeFullTab = (
	outer: { a: [number, number]; b: [number, number]; c: [number, number] },
	free: 'a' | 'b' | 'c'
): FullTab => ({
	style: 'full',
	direction: 'both',
	footprint: {
		triangle: tri(outer.a, outer.b, outer.c),
		free
	},
	outer: {
		a: new Vector3(outer.a[0], outer.a[1], 0),
		b: new Vector3(outer.b[0], outer.b[1], 0),
		c: new Vector3(outer.c[0], outer.c[1], 0)
	}
});

// Build a TrapTab in 2D. `outer.a` and `outer.d` are the trapezoid vertices
// attached to the band (see generateTrapTab in generate-shape.ts).
const makeTrapTab = (outer: {
	a: [number, number];
	b: [number, number];
	c: [number, number];
	d: [number, number];
}): TrapTab => ({
	style: 'trapezoid',
	direction: 'both',
	footprint: {
		triangle: tri(outer.a, outer.b, outer.c),
		free: 'b'
	},
	outer: {
		a: new Vector3(outer.a[0], outer.a[1], 0),
		b: new Vector3(outer.b[0], outer.b[1], 0),
		c: new Vector3(outer.c[0], outer.c[1], 0),
		d: new Vector3(outer.d[0], outer.d[1], 0)
	}
});

// Build a Facet whose ab/bc/ac partner addresses can be assigned.
const facetWithMeta = (
	t: Triangle,
	partners: Partial<Record<'ab' | 'bc' | 'ac', GlobuleAddress_FacetEdge>>
): Facet => {
	const blank: GlobuleAddress_FacetEdge = { globule: 0, tube: 0, band: 0, facet: 0, edge: 'ab' };
	return {
		triangle: t,
		orientation: 'circumferential',
		meta: {
			ab: { partner: partners.ab ?? blank },
			bc: { partner: partners.bc ?? blank },
			ac: { partner: partners.ac ?? blank }
		}
	};
};

const addr = (band: number, opts: { tube?: number; globule?: number } = {}): GlobuleAddress_Band => ({
	globule: opts.globule ?? 0,
	tube: opts.tube ?? 0,
	band
});

const facetEdgeAddr = (
	band: number,
	opts: { tube?: number; globule?: number; facet?: number; edge?: 'ab' | 'bc' | 'ac' } = {}
): GlobuleAddress_FacetEdge => ({
	globule: opts.globule ?? 0,
	tube: opts.tube ?? 0,
	band,
	facet: opts.facet ?? 0,
	edge: opts.edge ?? 'ab'
});

// Tests ----------------------------------------------------------------------

describe('collectBandTabs', () => {
	it('returns undefined for a band with no tabs', () => {
		const facets: Facet[] = [
			bareFacet(tri([0, 0], [1, 0], [0, 1])),
			bareFacet(tri([1, 0], [1, 1], [0, 1])),
			bareFacet(tri([1, 0], [2, 0], [1, 1]))
		];
		expect(collectBandTabs(facets)).toBeUndefined();
	});

	// Positional (fallback) behavior — no meta passed -------------------------

	it('classifies tabs as start / mid / end by facet position when meta absent', () => {
		// 5 facets, all with full tabs. Expect: start, mid(0), mid(1), mid(2), end.
		const fullTabOuter = { a: [0, 0] as [number, number], b: [1, 0] as [number, number], c: [0.5, 1] as [number, number] };
		const facets: Facet[] = [0, 1, 2, 3, 4].map((i) => ({
			...bareFacet(tri([i, 0], [i + 1, 0], [i, 1])),
			tab: makeFullTab(fullTabOuter, 'c')
		}));

		const tabs = collectBandTabs(facets);
		expect(tabs).toBeDefined();
		expect(tabs!.length).toBe(5);

		expect(tabs![0].position).toBe('start');
		expect(tabs![1].position).toBe('mid');
		expect(tabs![2].position).toBe('mid');
		expect(tabs![3].position).toBe('mid');
		expect(tabs![4].position).toBe('end');

		// midIndex assigned 0..2 in iteration order
		expect(tabs![1].midIndex).toBe(0);
		expect(tabs![2].midIndex).toBe(1);
		expect(tabs![3].midIndex).toBe(2);

		// midCount populated on every mid tab
		expect(tabs![1].midCount).toBe(3);
		expect(tabs![2].midCount).toBe(3);
		expect(tabs![3].midCount).toBe(3);

		// start/end should not have midIndex/midCount
		expect(tabs![0].midIndex).toBeUndefined();
		expect(tabs![0].midCount).toBeUndefined();
		expect(tabs![4].midIndex).toBeUndefined();
		expect(tabs![4].midCount).toBeUndefined();
	});

	it('FullTab: base edge endpoints match the two non-free outer vertices', () => {
		// outer = { a: (0,0), b: (2,0), c: (1,2) }, free = 'c'
		// So base should be (a, b) = [(0,0), (2,0)].
		const facets: Facet[] = [
			{
				...bareFacet(tri([0, 0], [2, 0], [1, 2])),
				tab: makeFullTab({ a: [0, 0], b: [2, 0], c: [1, 2] }, 'c')
			}
		];

		const tabs = collectBandTabs(facets);
		expect(tabs).toBeDefined();
		const tab = tabs![0];

		expect(tab.outer).toEqual([
			{ x: 0, y: 0 },
			{ x: 2, y: 0 },
			{ x: 1, y: 2 }
		]);
		expect(tab.base[0]).toEqual({ x: 0, y: 0 });
		expect(tab.base[1]).toEqual({ x: 2, y: 0 });

		// Both base endpoints exist in the outer vertex list.
		const outerSet = new Set(tab.outer.map((p) => `${p.x},${p.y}`));
		expect(outerSet.has(`${tab.base[0].x},${tab.base[0].y}`)).toBe(true);
		expect(outerSet.has(`${tab.base[1].x},${tab.base[1].y}`)).toBe(true);
	});

	it('TrapTab: base edge is (outer.a, outer.d) and both endpoints appear in outer', () => {
		// Trapezoid outer in flatten order: a-b-c-d, with a/d on the band.
		const facets: Facet[] = [
			{
				...bareFacet(tri([0, 0], [3, 0], [1.5, 2])),
				tab: makeTrapTab({ a: [0, 0], b: [1, 1], c: [2, 1], d: [3, 0] })
			}
		];

		const tabs = collectBandTabs(facets);
		expect(tabs).toBeDefined();
		const tab = tabs![0];

		expect(tab.outer.length).toBe(4);
		expect(tab.base[0]).toEqual({ x: 0, y: 0 });
		expect(tab.base[1]).toEqual({ x: 3, y: 0 });

		const outerSet = new Set(tab.outer.map((p) => `${p.x},${p.y}`));
		expect(outerSet.has(`${tab.base[0].x},${tab.base[0].y}`)).toBe(true);
		expect(outerSet.has(`${tab.base[1].x},${tab.base[1].y}`)).toBe(true);
	});

	it('skips facets without tabs but still classifies present tabs by index (no meta)', () => {
		// 3 facets, only the middle one has a tab → it must be 'mid'.
		const fullTabOuter = { a: [0, 0] as [number, number], b: [1, 0] as [number, number], c: [0.5, 1] as [number, number] };
		const facets: Facet[] = [
			bareFacet(tri([0, 0], [1, 0], [0, 1])),
			{ ...bareFacet(tri([1, 0], [1, 1], [0, 1])), tab: makeFullTab(fullTabOuter, 'c') },
			bareFacet(tri([1, 0], [2, 0], [1, 1]))
		];

		const tabs = collectBandTabs(facets);
		expect(tabs).toBeDefined();
		expect(tabs!.length).toBe(1);
		expect(tabs![0].position).toBe('mid');
		expect(tabs![0].midIndex).toBe(0);
		expect(tabs![0].midCount).toBe(1);
	});

	// Semantic classification — meta + facet partners -------------------------

	it('semantic: facet whose seam partner matches startPartnerBand is classified start', () => {
		// FullTab with free='c' → seam edge = 'ab'.
		// We wire the facet's meta.ab.partner to band 7 and pass startPartnerBand={band:7}.
		const fullTab = makeFullTab({ a: [0, 0], b: [1, 0], c: [0.5, 1] }, 'c');
		const facets: Facet[] = [
			{
				...facetWithMeta(tri([0, 0], [1, 0], [0, 1]), { ab: facetEdgeAddr(7) }),
				tab: fullTab
			},
			{
				...facetWithMeta(tri([1, 0], [2, 0], [1, 1]), { ab: facetEdgeAddr(99) }),
				tab: makeFullTab({ a: [1, 0], b: [2, 0], c: [1.5, 1] }, 'c')
			}
		];

		const tabs = collectBandTabs(facets, {
			startPartnerBand: addr(7),
			endPartnerBand: addr(8)
		});
		expect(tabs).toBeDefined();
		expect(tabs![0].position).toBe('start');
		// Second facet's partner (band 99) matches neither → 'mid'.
		expect(tabs![1].position).toBe('mid');
	});

	it('semantic: facet whose seam partner matches endPartnerBand is classified end', () => {
		const fullTab = makeFullTab({ a: [0, 0], b: [1, 0], c: [0.5, 1] }, 'c');
		const facets: Facet[] = [
			{
				...facetWithMeta(tri([0, 0], [1, 0], [0, 1]), { ab: facetEdgeAddr(99) }),
				tab: fullTab
			},
			{
				...facetWithMeta(tri([1, 0], [2, 0], [1, 1]), { ab: facetEdgeAddr(8) }),
				tab: makeFullTab({ a: [1, 0], b: [2, 0], c: [1.5, 1] }, 'c')
			}
		];

		const tabs = collectBandTabs(facets, {
			startPartnerBand: addr(7),
			endPartnerBand: addr(8)
		});
		expect(tabs).toBeDefined();
		// First facet's partner band (99) matches neither → 'mid'.
		expect(tabs![0].position).toBe('mid');
		expect(tabs![1].position).toBe('end');
	});

	it('semantic: facet whose seam partner matches neither is classified mid', () => {
		const fullTab = makeFullTab({ a: [0, 0], b: [1, 0], c: [0.5, 1] }, 'c');
		const facets: Facet[] = [
			{
				...facetWithMeta(tri([0, 0], [1, 0], [0, 1]), { ab: facetEdgeAddr(42) }),
				tab: fullTab
			}
		];

		const tabs = collectBandTabs(facets, {
			startPartnerBand: addr(7),
			endPartnerBand: addr(8)
		});
		expect(tabs).toBeDefined();
		// Single facet but partner address doesn't match either → 'mid', not
		// positional 'start'.
		expect(tabs![0].position).toBe('mid');
		expect(tabs![0].midIndex).toBe(0);
		expect(tabs![0].midCount).toBe(1);
	});

	it('semantic: TrapTab seam classification uses footprint.free → edge mapping', () => {
		// TrapTab footprint.free = 'b' → seam edge = 'ac'.
		const trapTab = makeTrapTab({ a: [0, 0], b: [1, 1], c: [2, 1], d: [3, 0] });
		const facets: Facet[] = [
			{
				...facetWithMeta(tri([0, 0], [3, 0], [1.5, 2]), { ac: facetEdgeAddr(7) }),
				tab: trapTab
			}
		];

		const tabs = collectBandTabs(facets, {
			startPartnerBand: addr(7),
			endPartnerBand: addr(8)
		});
		expect(tabs).toBeDefined();
		expect(tabs![0].position).toBe('start');
	});

	it('semantic: tube/globule must also match (not just band index)', () => {
		// Same band index 7 but different tube → no match → 'mid'.
		const fullTab = makeFullTab({ a: [0, 0], b: [1, 0], c: [0.5, 1] }, 'c');
		const facets: Facet[] = [
			{
				...facetWithMeta(tri([0, 0], [1, 0], [0, 1]), {
					ab: facetEdgeAddr(7, { tube: 1 })
				}),
				tab: fullTab
			}
		];

		const tabs = collectBandTabs(facets, {
			startPartnerBand: addr(7, { tube: 0 }),
			endPartnerBand: addr(8, { tube: 0 })
		});
		expect(tabs).toBeDefined();
		expect(tabs![0].position).toBe('mid');
	});

	it('semantic: falls back to positional when meta is passed but partner metadata is missing on the facet', () => {
		// Meta provided but facet has no .meta — fallback should kick in so we
		// still get a sensible (positional) classification.
		const fullTabOuter = { a: [0, 0] as [number, number], b: [1, 0] as [number, number], c: [0.5, 1] as [number, number] };
		const facets: Facet[] = [0, 1, 2].map((i) => ({
			...bareFacet(tri([i, 0], [i + 1, 0], [i, 1])),
			tab: makeFullTab(fullTabOuter, 'c')
		}));

		const tabs = collectBandTabs(facets, {
			startPartnerBand: addr(7),
			endPartnerBand: addr(8)
		});
		expect(tabs).toBeDefined();
		expect(tabs!.length).toBe(3);
		expect(tabs![0].position).toBe('start');
		expect(tabs![1].position).toBe('mid');
		expect(tabs![2].position).toBe('end');
	});
});
