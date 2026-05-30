import { buildPatternCsv } from '../build-pattern-csv';
import type { BandSortIndex, TubeCutPattern, GlobuleAddress_Band } from '$lib/types';

const addr = (tube: number, band: number): GlobuleAddress_Band => ({ globule: 0, tube, band });

// Minimal TubeCutPattern fixtures: only `address`, `bands[].address`, and
// `bands[].meta` matter to buildPatternCsv. Cast through unknown to satisfy
// the wider type without supplying geometry-heavy fields.
const band = (
	a: GlobuleAddress_Band,
	meta?: { startPartnerBand: GlobuleAddress_Band; endPartnerBand: GlobuleAddress_Band }
) => ({ address: a, meta }) as unknown as TubeCutPattern['bands'][number];

const tube = (t: number, bands: TubeCutPattern['bands']): TubeCutPattern =>
	({ projectionType: 'patterned', address: { globule: 0, tube: t }, bands }) as TubeCutPattern;

describe('buildPatternCsv — tube-order', () => {
	test('emits header + one row per band with adjacency and end partners', () => {
		// Tube 0: b0, b1, b2 (b1 is adjacent to b0 and b2).
		// b1 has an end-partner join to t1/b0.
		const tubes: TubeCutPattern[] = [
			tube(0, [
				band(addr(0, 0)),
				band(addr(0, 1), { startPartnerBand: addr(1, 0), endPartnerBand: addr(1, 0) }),
				band(addr(0, 2))
			]),
			tube(1, [band(addr(1, 0))])
		];
		const index: BandSortIndex = { mode: 'tube-order', groups: [] };

		const csv = buildPatternCsv(index, tubes);
		const rows = csv.split('\n');

		expect(rows[0]).toBe('band,adjacent,endPartners');
		// b0: only an "after" neighbor (b1); no end partners.
		expect(rows[1]).toBe('t0/b0,t0/b1,');
		// b1: before+after neighbors quoted as one cell; end partner t1/b0 (deduped to one).
		expect(rows[2]).toBe('t0/b1,"t0/b0 t0/b2",t1/b0');
		// b2: only a "before" neighbor (b1); no end partners.
		expect(rows[3]).toBe('t0/b2,t0/b1,');
		// t1/b0: singleton tube — no adjacency, no end partners.
		expect(rows[4]).toBe('t1/b0,,');
	});

	test('multi-value cell with a space is wrapped in one quoted field', () => {
		const tubes: TubeCutPattern[] = [
			tube(0, [band(addr(0, 0)), band(addr(0, 1)), band(addr(0, 2))])
		];
		const csv = buildPatternCsv({ mode: 'tube-order', groups: [] }, tubes);
		const rows = csv.split('\n');
		// Middle band has two adjacents joined by a space inside ONE quoted field.
		expect(rows[2]).toBe('t0/b1,"t0/b0 t0/b2",');
		// Quoted field => exactly 3 comma-top-level columns (split is naive but
		// the quote keeps the space-list intact for any RFC4180 parser).
		expect(rows[2].split('"').length).toBe(3); // one quoted segment
	});
});
