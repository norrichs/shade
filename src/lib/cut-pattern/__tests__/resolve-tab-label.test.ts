import { resolveTabLabel } from '../resolve-tab-label';
import { sliceProjectionCutPattern } from '$lib/projection-geometry/filters';
import type { BandCutPattern, TubeCutPattern } from '$lib/types';
import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';

type BandTab = NonNullable<BandCutPattern['tabs']>[number];

const addr = (tube: number, band: number, globule = 0): GlobuleAddress_Band => ({
	globule,
	tube,
	band
});

const makeBand = (tube: number, band: number, meta?: BandCutPattern['meta']): BandCutPattern =>
	({
		address: addr(tube, band),
		meta
	}) as unknown as BandCutPattern;

const makeTube = (tube: number, bandCount: number): TubeCutPattern => {
	const bands = Array.from({ length: bandCount }, (_, i) => makeBand(tube, i));
	return {
		projectionType: 'patterned',
		address: { globule: 0, tube },
		bands
	} as unknown as TubeCutPattern;
};

const tab = (overrides: Partial<BandTab>): BandTab =>
	({
		outer: [],
		base: [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 }
		],
		position: 'mid',
		...overrides
	}) as unknown as BandTab;

describe('resolveTabLabel', () => {
	it('start tab with startPartner returns partner address (tb-slash)', () => {
		const band = makeBand(1, 2, {
			startPartnerBand: addr(3, 4),
			endPartnerBand: addr(0, 0)
		});
		const tube = makeTube(1, 3);
		const result = resolveTabLabel(tab({ position: 'start' }), band, tube, [tube]);
		expect(result).toBe('t3/b4');
	});

	it('start tab without startPartner returns empty string', () => {
		const band = makeBand(1, 2);
		const tube = makeTube(1, 3);
		const result = resolveTabLabel(tab({ position: 'start' }), band, tube, [tube]);
		expect(result).toBe('');
	});

	it('end tab with endPartner returns partner address (tb-slash)', () => {
		const band = makeBand(1, 2, {
			startPartnerBand: addr(0, 0),
			endPartnerBand: addr(5, 7)
		});
		const tube = makeTube(1, 3);
		const result = resolveTabLabel(tab({ position: 'end' }), band, tube, [tube]);
		expect(result).toBe('t5/b7');
	});

	it('end tab without endPartner returns empty string', () => {
		const band = makeBand(1, 2);
		const tube = makeTube(1, 3);
		const result = resolveTabLabel(tab({ position: 'end' }), band, tube, [tube]);
		expect(result).toBe('');
	});

	it('mid tab at midIndex 0 (normal band) returns next band in tube', () => {
		// band index 2 of a 5-band tube → next is band 3
		const tube = makeTube(1, 5);
		const band = tube.bands[2];
		const result = resolveTabLabel(tab({ position: 'mid', midIndex: 0, midCount: 5 }), band, tube, [
			tube
		]);
		expect(result).toBe('t1/b3');
	});

	it('mid tab at midIndex 0 on last band in tube wraps to band 0', () => {
		const tube = makeTube(1, 4);
		const band = tube.bands[3];
		const result = resolveTabLabel(tab({ position: 'mid', midIndex: 0, midCount: 3 }), band, tube, [
			tube
		]);
		expect(result).toBe('t1/b0');
	});

	it('mid tab at a non-first index returns empty string (self-tag is rendered separately)', () => {
		// Previously the middle index returned the current band; that rule has been
		// removed in favor of an independent `selfTag` external callout.
		const tube = makeTube(2, 6);
		const band = tube.bands[4];
		const result = resolveTabLabel(tab({ position: 'mid', midIndex: 2, midCount: 5 }), band, tube, [
			tube
		]);
		expect(result).toBe('');
	});

	it('mid tab that is not the first mid returns empty string', () => {
		const tube = makeTube(1, 5);
		const band = tube.bands[2];
		const result = resolveTabLabel(tab({ position: 'mid', midIndex: 1, midCount: 5 }), band, tube, [
			tube
		]);
		expect(result).toBe('');
	});

	it('mid tab with only one mid (midCount=1, midIndex=0) still resolves to next band', () => {
		const tube = makeTube(1, 4);
		const band = tube.bands[1];
		const result = resolveTabLabel(tab({ position: 'mid', midIndex: 0, midCount: 1 }), band, tube, [
			tube
		]);
		expect(result).toBe('t1/b2');
	});

	describe('split bands', () => {
		type PieceRef = GlobuleAddress_Band & { piece: number };
		const piece = (tube: number, band: number, p: number): PieceRef => ({
			globule: 0,
			tube,
			band,
			piece: p
		});
		const bandAt = (address: GlobuleAddress_Band | PieceRef): BandCutPattern =>
			({ address }) as unknown as BandCutPattern;
		// Tube 1 split tube-wide: b0 and b1 into two pieces each; b2 too short to cut.
		const splitTube = (): TubeCutPattern =>
			({
				projectionType: 'patterned',
				address: { globule: 0, tube: 1 },
				bands: [
					bandAt(piece(1, 0, 0)),
					bandAt(piece(1, 0, 1)),
					bandAt(piece(1, 1, 0)),
					bandAt(piece(1, 1, 1)),
					bandAt(addr(1, 2))
				]
			}) as unknown as TubeCutPattern;
		const firstMid = tab({ position: 'mid', midIndex: 0, midCount: 3 });

		it('names the next PARENT band, not the seam sibling, as the same-index piece', () => {
			const tube = splitTube();
			expect(resolveTabLabel(firstMid, tube.bands[0], tube, [tube])).toBe('t1/b1p0');
			expect(resolveTabLabel(firstMid, tube.bands[1], tube, [tube])).toBe('t1/b1p1');
		});

		it('resolves an uncut next band exactly and wraps an uncut last band to piece 0', () => {
			const tube = splitTube();
			expect(resolveTabLabel(firstMid, tube.bands[3], tube, [tube])).toBe('t1/b2');
			expect(resolveTabLabel(firstMid, tube.bands[4], tube, [tube])).toBe('t1/b0p0');
		});
	});

	describe('labels name the physical piece', () => {
		type PieceRef = GlobuleAddress_Band & { piece: number };
		const piece = (tube: number, band: number, p: number): PieceRef => ({
			globule: 0,
			tube,
			band,
			piece: p
		});
		// A band of `quads` quads starting at parent quad `offset`. Tiled output has
		// one quad-bearing facet per quad; only `quad`'s presence is read.
		const quadBand = (
			address: GlobuleAddress_Band | PieceRef,
			quads: number,
			offset?: number,
			meta?: BandCutPattern['meta']
		): BandCutPattern =>
			({
				address,
				facets: Array.from({ length: quads }, () => ({ quad: {} })),
				...(offset === undefined ? {} : { parentQuadOffset: offset }),
				meta
			}) as unknown as BandCutPattern;
		const tubeOf = (tube: number, bands: BandCutPattern[]): TubeCutPattern =>
			({
				projectionType: 'patterned',
				address: { globule: 0, tube },
				bands
			}) as unknown as TubeCutPattern;

		// Tube 1's band 2 is cut into UNEQUAL pieces (2 quads, then 3). Its start
		// meets t0/b0; its end meets t2/b0.
		const endPartnerTubes = (): TubeCutPattern[] => [
			tubeOf(0, [quadBand(addr(0, 0), 5, undefined, { startPartnerBand: addr(1, 2) })]),
			tubeOf(1, [
				quadBand(addr(1, 0), 5),
				quadBand(addr(1, 1), 5),
				quadBand(piece(1, 2, 0), 2, 0, {
					startPartnerBand: addr(0, 0),
					endPartnerBand: piece(1, 2, 1)
				}),
				quadBand(piece(1, 2, 1), 3, 2, {
					startPartnerBand: piece(1, 2, 0),
					endPartnerBand: addr(2, 0)
				})
			]),
			tubeOf(2, [quadBand(addr(2, 0), 5, undefined, { endPartnerBand: addr(1, 2) })])
		];

		it('a start tab whose partner START joins names the partner piece 0', () => {
			const tubes = endPartnerTubes();
			const asker = tubes[0].bands[0];
			expect(resolveTabLabel(tab({ position: 'start' }), asker, tubes[0], tubes)).toBe('t1/b2p0');
		});

		it('an end tab whose partner END joins names the partner last piece', () => {
			const tubes = endPartnerTubes();
			const asker = tubes[2].bands[0];
			expect(resolveTabLabel(tab({ position: 'end' }), asker, tubes[2], tubes)).toBe('t1/b2p1');
		});

		it('guard: a seam tab keeps its exact sibling piece', () => {
			const tubes = endPartnerTubes();
			const [p0, p1] = [tubes[1].bands[2], tubes[1].bands[3]];
			expect(resolveTabLabel(tab({ position: 'end' }), p0, tubes[1], tubes)).toBe('t1/b2p1');
			expect(resolveTabLabel(tab({ position: 'start' }), p1, tubes[1], tubes)).toBe('t1/b2p0');
		});

		// Tube 1: uncut b0 (5 quads) beside b1 cut into UNEQUAL pieces (0..1, 2..4),
		// then uncut b2.
		const sideTubes = (): TubeCutPattern[] => [
			tubeOf(0, []),
			tubeOf(1, [
				quadBand(addr(1, 0), 5),
				quadBand(piece(1, 1, 0), 2, 0),
				quadBand(piece(1, 1, 1), 3, 2),
				quadBand(addr(1, 2), 5)
			])
		];

		it("an uncut band's mid tab over a quad in the neighbour's piece 1 names p1", () => {
			const tubes = sideTubes();
			const uncut = tubes[1].bands[0];
			const midAt = (quad: number) => tab({ position: 'mid', midIndex: 0, midCount: 2, quad });
			expect(resolveTabLabel(midAt(3), uncut, tubes[1], tubes)).toBe('t1/b1p1');
			expect(resolveTabLabel(midAt(1), uncut, tubes[1], tubes)).toBe('t1/b1p0');
		});

		it('ranges survive a facet-range view: they come from quadCount, not the sliced facets', () => {
			// Generation stamps `quadCount` on every band of a split tube; a facet
			// range slices `facets` to one entry per band.
			const withCount = (b: BandCutPattern) =>
				({ ...b, quadCount: b.facets.length }) as unknown as BandCutPattern;
			const tubes = sideTubes().map((t) => ({ ...t, bands: t.bands.map(withCount) }));
			const [, view] = sliceProjectionCutPattern(tubes, { facets: [0, 1] });
			const uncut = view.bands[0];
			expect(uncut.facets).toHaveLength(1);
			const midAt3 = tab({ position: 'mid', midIndex: 0, midCount: 2, quad: 3 });
			expect(resolveTabLabel(midAt3, uncut, view, tubes)).toBe('t1/b1p1');
		});

		it('guard: a split piece beside an uncut neighbour names the plain neighbour', () => {
			// b1p1's local quad 0 is parent quad 2; its neighbour b2 is uncut, so the
			// plain band is named whatever the quad.
			const tubes = sideTubes();
			const midAt = (quad: number) => tab({ position: 'mid', midIndex: 0, midCount: 2, quad });
			expect(resolveTabLabel(midAt(0), tubes[1].bands[2], tubes[1], tubes)).toBe('t1/b2');
		});
	});
});
