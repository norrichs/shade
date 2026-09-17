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

describe('buildPatternCsv — split bands', () => {
	type PieceRef = GlobuleAddress_Band & { piece: number };
	const p = (t: number, b: number, piece: number): PieceRef => ({
		globule: 0,
		tube: t,
		band: b,
		piece
	});
	const pieceBand = (
		a: GlobuleAddress_Band | PieceRef,
		meta?: {
			startPartnerBand: GlobuleAddress_Band | PieceRef;
			endPartnerBand: GlobuleAddress_Band | PieceRef;
		}
	) => ({ address: a, meta }) as unknown as TubeCutPattern['bands'][number];

	// Tube 0 is split tube-wide: b0 and b1 into two pieces each; b2 was too short
	// to cut and stays whole. The array interleaves pieces, so array position no
	// longer identifies the band alongside.
	const splitTubes = (): TubeCutPattern[] => [
		tube(0, [
			pieceBand(p(0, 0, 0), { startPartnerBand: addr(1, 0), endPartnerBand: p(0, 0, 1) }),
			pieceBand(p(0, 0, 1), { startPartnerBand: p(0, 0, 0), endPartnerBand: addr(2, 0) }),
			pieceBand(p(0, 1, 0)),
			pieceBand(p(0, 1, 1)),
			pieceBand(addr(0, 2))
		])
	];

	test('tube-order: adjacency is the side neighbour at parent band ± 1; a seam sibling is an end partner', () => {
		const rows = buildPatternCsv({ mode: 'tube-order', groups: [] }, splitTubes()).split('\n');
		expect(rows.slice(1)).toEqual([
			// First parent: no band before it (no wrap), piece 0 of b1 alongside.
			't0/b0p0,t0/b1p0,"t1/b0 t0/b0p1"',
			't0/b0p1,t0/b1p1,"t0/b0p0 t2/b0"',
			// The uncut b2 is alongside both pieces of b1.
			't0/b1p0,"t0/b0p0 t0/b2",',
			't0/b1p1,"t0/b0p1 t0/b2",',
			// An uncut band resolves a split neighbour to its piece 0.
			't0/b2,t0/b1p0,'
		]);
	});

	test('end-connection: members print their piece', () => {
		const index: BandSortIndex = {
			mode: 'end-connection-tube',
			groups: [
				{ label: 'Ring 0', code: '0000', bands: [p(0, 0, 0), p(0, 0, 1)] },
				{ label: 'Ring 1', code: '0001', bands: [p(0, 1, 0), p(0, 1, 1)] },
				{ label: 'Ring 2', code: '0002', bands: [addr(0, 2)] }
			]
		};
		const rows = buildPatternCsv(index, splitTubes()).split('\n');
		expect(rows.slice(1)).toEqual([
			'0000,0001,t0/b0p0,t0/b0p1',
			'0001,"0000 0002",t0/b1p0,t0/b1p1',
			'0002,0001,t0/b2'
		]);
	});
});

describe('buildPatternCsv — labels name the physical piece', () => {
	type PieceRef = GlobuleAddress_Band & { piece: number };
	type Meta = {
		startPartnerBand?: GlobuleAddress_Band | PieceRef;
		endPartnerBand?: GlobuleAddress_Band | PieceRef;
	};
	const p = (t: number, b: number, piece: number): PieceRef => ({
		globule: 0,
		tube: t,
		band: b,
		piece
	});
	// A band of `quads` quads from parent quad `offset`: one quad-bearing facet
	// per quad, as in tiled output.
	const quadBand = (
		a: GlobuleAddress_Band | PieceRef,
		quads: number,
		offset?: number,
		meta?: Meta
	) =>
		({
			address: a,
			facets: Array.from({ length: quads }, () => ({ quad: {} })),
			...(offset === undefined ? {} : { parentQuadOffset: offset }),
			meta
		}) as unknown as TubeCutPattern['bands'][number];

	// Tube 0: uncut b0 (5 quads) beside b1 cut into UNEQUAL pieces (0..1, 2..4).
	// b0's start meets t1/b0's start; its end meets t1/b1's end.
	// Tube 1: b0 and b1 both cut into UNEQUAL pieces (0..1, 2..5).
	const tubes = (): TubeCutPattern[] => [
		tube(0, [
			quadBand(addr(0, 0), 5, undefined, {
				startPartnerBand: addr(1, 0),
				endPartnerBand: addr(1, 1)
			}),
			quadBand(p(0, 1, 0), 2, 0),
			quadBand(p(0, 1, 1), 3, 2)
		]),
		tube(1, [
			quadBand(p(1, 0, 0), 2, 0, { startPartnerBand: addr(0, 0), endPartnerBand: p(1, 0, 1) }),
			quadBand(p(1, 0, 1), 4, 2, { startPartnerBand: p(1, 0, 0) }),
			quadBand(p(1, 1, 0), 2, 0, { startPartnerBand: addr(9, 9) }),
			quadBand(p(1, 1, 1), 4, 2)
		])
	];

	const rows = () => buildPatternCsv({ mode: 'tube-order', groups: [] }, tubes()).split('\n');

	test('end partners name the joining piece: p0 for a start join, the last piece for an end join', () => {
		expect(rows()[1].split(',').slice(-1)[0]).toBe('"t1/b0p0 t1/b1p1"');
	});

	test('an uncut band beside a split neighbour lists every piece it borders, in piece order', () => {
		expect(rows()[1]).toBe('t0/b0,"t0/b1p0 t0/b1p1","t1/b0p0 t1/b1p1"');
	});

	test('guard: pieces list only the neighbour pieces their own range overlaps', () => {
		const r = rows();
		expect(r[4]).toBe('t1/b0p0,t1/b1p0,"t0/b0 t1/b0p1"');
		expect(r[5]).toBe('t1/b0p1,t1/b1p1,t1/b0p0');
	});

	test('guard: a split band beside an uncut neighbour names the plain neighbour', () => {
		const r = rows();
		expect(r[2]).toBe('t0/b1p0,t0/b0,');
		expect(r[3]).toBe('t0/b1p1,t0/b0,');
	});
});
