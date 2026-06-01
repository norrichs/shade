import { getBandPartnerInfo, formatBandAddress } from '../band-partner-info';
import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';

// Minimal tube/band/facet shapes mirroring the 3D voronoiSurface structure:
// a band is a strip of facets; each end facet carries up to three edge partners
// (ab/bc/ac). An edge whose partner lives in a different tube is an "end
// connection". `getBandPartnerInfo` reads BOTH end facets and reports each end.

type Partner = { globule: number; tube: number; band: number; facet: number; edge: string };
const p = (tube: number, band: number, edge = 'ab'): Partner => ({
	globule: 0,
	tube,
	band,
	facet: 0,
	edge
});

const facet = (edges: { ab?: Partner; bc?: Partner; ac?: Partner }) => ({
	meta: {
		ab: edges.ab ? { partner: edges.ab } : undefined,
		bc: edges.bc ? { partner: edges.bc } : undefined,
		ac: edges.ac ? { partner: edges.ac } : undefined
	}
});

const band = (facets: ReturnType<typeof facet>[]) => ({ facets });
const tubes = (bandsByTube: ReturnType<typeof band>[][]) =>
	bandsByTube.map((bands) => ({ bands }));

const addr = (tube: number, b: number): GlobuleAddress_Band => ({ globule: 0, tube, band: b });

describe('getBandPartnerInfo', () => {
	test('reads cross-tube partners at both ends, ignoring within-tube edges', () => {
		// t0/b0: first facet joins t28/b0 (ab), last facet joins t40/b0 (ab).
		// Within-tube bc edges (to its own neighbour facets) must be ignored.
		const t = tubes([
			// tube 0
			[
				band([
					facet({ ab: p(28, 0), bc: p(0, 0) /* within-tube, ignored */ }),
					facet({}),
					facet({ ab: p(40, 0), bc: p(0, 0) /* within-tube, ignored */ })
				])
			]
		]);
		const info = getBandPartnerInfo(t as never, addr(0, 0));
		expect(info.found).toBe(true);
		expect(info.facetCount).toBe(3);
		expect(info.startPartners.map(formatBandAddress)).toEqual(['t28/b0']);
		expect(info.endPartners.map(formatBandAddress)).toEqual(['t40/b0']);
	});

	test('reports an end with no cross-tube partner as empty (true boundary)', () => {
		// t28/b0: start facet is interior to the tube (no cross-tube edge) — a
		// genuine geometric boundary at the voronoi cell center. End joins t0/b0.
		const t = tubes([
			[band([facet({ bc: p(28, 0) })])], // tube 0 placeholder (band 0)
			...Array.from({ length: 27 }, () => [band([facet({})])]), // tubes 1..27 fillers
			// tube 28
			[band([facet({ bc: p(28, 0) /* within-tube only -> boundary */ }), facet({ ab: p(0, 0) })])]
		]);
		const info = getBandPartnerInfo(t as never, addr(28, 0));
		expect(info.found).toBe(true);
		expect(info.startPartners).toEqual([]); // true boundary
		expect(info.endPartners.map(formatBandAddress)).toEqual(['t0/b0']);
	});

	test('dedupes repeated partner bands across a facet’s edges', () => {
		const t = tubes([
			[band([facet({ ab: p(5, 1), ac: p(5, 1) /* same partner band twice */ }), facet({})])]
		]);
		const info = getBandPartnerInfo(t as never, addr(0, 0));
		expect(info.startPartners.map(formatBandAddress)).toEqual(['t5/b1']);
	});

	test('returns found=false for a missing band', () => {
		const t = tubes([[band([facet({})])]]);
		const info = getBandPartnerInfo(t as never, addr(9, 9));
		expect(info.found).toBe(false);
		expect(info.startPartners).toEqual([]);
		expect(info.endPartners).toEqual([]);
	});

	test('handles undefined tubes safely', () => {
		const info = getBandPartnerInfo(undefined, addr(0, 0));
		expect(info.found).toBe(false);
	});
});
