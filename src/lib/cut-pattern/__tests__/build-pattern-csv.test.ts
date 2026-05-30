import { buildPatternCsv } from '../build-pattern-csv';
import { buildBandCodeMap } from '../band-sort-index';
import type { BandSortIndex, TubeCutPattern, BandRef as GlobuleAddress_Band } from '$lib/types';

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

describe('buildPatternCsv — end-connection-tube', () => {
	test('row per ring: code, deduped partner codes (self excluded), member columns', () => {
		// Three tubes, each a single band; the three bands form one ring via
		// end-partner joins. Each band's within-tube adjacency is empty (singleton
		// tubes), so to exercise partner-code collection we give each tube TWO bands
		// where the ring member is adjacent to a sibling that belongs to another ring.
		//
		// Layout:
		//   tube0: b0 (ringA member), b1 (ringB member)  -> b0 adj b1
		//   tube1: b0 (ringA member), b1 (ringB member)  -> b0 adj b1
		//   tube2: b0 (ringA member), b1 (ringB member)  -> b0 adj b1
		// ringA = {t0/b0, t1/b0, t2/b0}, ringB = {t0/b1, t1/b1, t2/b1}
		const a = (t: number, b: number): GlobuleAddress_Band => ({ globule: 0, tube: t, band: b });
		const mkBand = (
			adr: GlobuleAddress_Band,
			meta?: { startPartnerBand: GlobuleAddress_Band; endPartnerBand: GlobuleAddress_Band }
		) => ({ address: adr, meta }) as unknown as TubeCutPattern['bands'][number];
		const mkTube = (t: number, bands: TubeCutPattern['bands']): TubeCutPattern =>
			({ projectionType: 'patterned', address: { globule: 0, tube: t }, bands }) as TubeCutPattern;

		const tubes: TubeCutPattern[] = [
			mkTube(0, [
				mkBand(a(0, 0), { startPartnerBand: a(2, 0), endPartnerBand: a(1, 0) }),
				mkBand(a(0, 1), { startPartnerBand: a(2, 1), endPartnerBand: a(1, 1) })
			]),
			mkTube(1, [
				mkBand(a(1, 0), { startPartnerBand: a(0, 0), endPartnerBand: a(2, 0) }),
				mkBand(a(1, 1), { startPartnerBand: a(0, 1), endPartnerBand: a(2, 1) })
			]),
			mkTube(2, [
				mkBand(a(2, 0), { startPartnerBand: a(1, 0), endPartnerBand: a(0, 0) }),
				mkBand(a(2, 1), { startPartnerBand: a(1, 1), endPartnerBand: a(0, 1) })
			])
		];

		// Construct an end-connection index with WS-B codes assigned.
		const index: BandSortIndex = {
			mode: 'end-connection-tube',
			groups: [
				{ label: 'Ring 0', code: '0000', bands: [a(0, 0), a(1, 0), a(2, 0)] },
				{ label: 'Ring 1', code: '0001', bands: [a(0, 1), a(1, 1), a(2, 1)] }
			]
		};

		const codeMap = buildBandCodeMap(index); // sanity: WS-B contract present
		expect(codeMap.get('0-0-0')).toBe('0000');

		const csv = buildPatternCsv(index, tubes);
		const rows = csv.split('\n');

		expect(rows[0]).toBe('ringCode,partnerRingCodes,members');
		// Ring 0 members each adjacent to a Ring 1 member => partner code 0001
		// (deduped across 3 members; self 0000 excluded). Members in group order.
		expect(rows[1]).toBe('0000,0001,t0/b0,t1/b0,t2/b0');
		// Ring 1 symmetric: partner code 0000.
		expect(rows[2]).toBe('0001,0000,t0/b1,t1/b1,t2/b1');
	});

	test('ring with no cross-ring adjacency emits empty partner cell', () => {
		const a = (t: number, b: number): GlobuleAddress_Band => ({ globule: 0, tube: t, band: b });
		const mkBand = (adr: GlobuleAddress_Band) =>
			({ address: adr, meta: undefined }) as unknown as TubeCutPattern['bands'][number];
		const mkTube = (t: number, bands: TubeCutPattern['bands']): TubeCutPattern =>
			({ projectionType: 'patterned', address: { globule: 0, tube: t }, bands }) as TubeCutPattern;
		const tubes: TubeCutPattern[] = [mkTube(0, [mkBand(a(0, 0))])];
		const index: BandSortIndex = {
			mode: 'end-connection-tube',
			groups: [{ label: 'Ring 0', code: '0000', bands: [a(0, 0)] }]
		};
		const csv = buildPatternCsv(index, tubes);
		const rows = csv.split('\n');
		expect(rows[1]).toBe('0000,,t0/b0');
	});
});
