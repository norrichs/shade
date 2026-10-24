import { Vector3 } from 'three';
import type { BandCutPattern, PathSegment, Quadrilateral, TiledPatternConfig } from '#lib/types.js';
import { transformPatternByQuad } from '../quadrilateral';
import {
	ASANOHA_SUBUNIT_COUNT,
	adjustAsanohaAfterTiling,
	generateAsanohaPreview,
	generateAsanohaSubunits,
	getAsanohaDropIndices
} from '../tiled-asanoha-pattern';

const config = (
	columnCount = 1,
	overrides: Partial<TiledPatternConfig['config']> = {}
): TiledPatternConfig => ({
	type: 'tiledAsanohaPattern-1',
	tiling: 'quadrilateral',
	config: {
		rowCount: 1,
		columnCount,
		dynamicStroke: 'quadWidth',
		dynamicStrokeEasing: 'linear',
		dynamicStrokeMin: 1,
		dynamicStrokeMax: 3,
		endsMatched: false,
		endsTrimmed: false,
		endLooped: 0,
		scaleConfig: { unit: 'px', unitPerSvgUnit: 1, quantity: 1 },
		...overrides
	}
});

const mapBand = (qs: Quadrilateral[], columns = 1): PathSegment[][] => {
	const subunits = generateAsanohaSubunits(columns);
	return qs.map((q, i) => transformPatternByQuad(subunits[i % 2], q));
};

type Line = [number, number, number, number];
const lines = (path: PathSegment[]): Line[] => {
	const out: Line[] = [];
	for (let i = 0; i < path.length; i += 2) {
		const [, x0, y0] = path[i] as [string, number, number];
		const [, x1, y1] = path[i + 1] as [string, number, number];
		out.push([x0, y0, x1, y1]);
	}
	return out;
};
const r = (v: number) => Math.round(v * 1e6) / 1e6;
// Undirected, rounded: identifies a drawn line regardless of direction.
const key = ([x0, y0, x1, y1]: Line) => {
	const a = `${r(x0)},${r(y0)}`;
	const b = `${r(x1)},${r(y1)}`;
	return a < b ? `${a}|${b}` : `${b}|${a}`;
};
const isVerticalAt = (x: number) => (l: Line) =>
	Math.abs(l[0] - x) < 1e-9 && Math.abs(l[2] - x) < 1e-9;

describe('generateAsanohaSubunits', () => {
	it('emits two subunits made only of M/L pairs', () => {
		const subunits = generateAsanohaSubunits(2);
		expect(subunits).toHaveLength(ASANOHA_SUBUNIT_COUNT);
		for (const path of subunits) {
			path.forEach((seg, i) => expect(seg[0]).toBe(i % 2 === 0 ? 'M' : 'L'));
		}
	});

	it('B is A mirrored top-to-bottom, less the shared middle line', () => {
		const [a, b] = generateAsanohaSubunits(1).map(lines);
		const mirroredA = new Set(a.map(([x0, y0, x1, y1]) => key([x0, 1 - y0, x1, 1 - y1])));
		const bKeys = b.map(key);
		bKeys.forEach((k) => expect(mirroredA.has(k)).toBe(true));
		// A owns the shared line (its top); B has no line along its bottom.
		expect(b.some(([, y0, , y1]) => y0 === 0 && y1 === 0)).toBe(false);
		expect(a.some(([, y0, , y1]) => y0 === 1 && y1 === 1)).toBe(true);
	});

	it('reproduces the legacy unit when four strips are stacked', () => {
		// A, B, A, B stacked into one unit square = one legacy row; every
		// non-vertical legacy line appears (split at the strip boundaries).
		const stacked = generateAsanohaPreview(1);
		const keys = new Set(lines(stacked).map(key));
		const legacyDiagonals: Line[] = [
			[1 / 3, 1 / 4, 1 / 2, 0], // blue 1
			[1 / 2, 0, 2 / 3, 1 / 4],
			[1 / 6, 0, 0, 1 / 4], // red left
			[5 / 6, 2 / 4, 1, 3 / 4], // red right
			[0, 3 / 4, 1 / 2, 2 / 4], // pink 2
			[1 / 6, 2 / 4, 5 / 6, 2 / 4], // brown middle
			[2 / 3, 3 / 4, 1, 3 / 4] // purple
		];
		legacyDiagonals.forEach((l) => expect(keys.has(key(l))).toBe(true));
	});
});

describe('getAsanohaDropIndices', () => {
	const dropped = (
		facetIndex: number,
		columns: number,
		opts: Parameters<typeof getAsanohaDropIndices>[2]
	) => {
		const path = generateAsanohaSubunits(columns)[facetIndex % 2];
		const all = lines(path);
		const indices = new Set(getAsanohaDropIndices(facetIndex, columns, opts));
		return all.filter((_, s) => indices.has(2 * s));
	};

	it('keeps everything on the first facet of a band with no left partner', () => {
		expect(dropped(0, 1, { hasLeftPartner: false })).toEqual([]);
	});

	it("drops A's bottom line after the first facet", () => {
		expect(dropped(2, 1, { hasLeftPartner: false }).map(key)).toEqual([key([1 / 6, 0, 5 / 6, 0])]);
		expect(dropped(1, 1, { hasLeftPartner: false })).toEqual([]);
	});

	it('drops the left edge of every column after the first', () => {
		const d = dropped(1, 2, { hasLeftPartner: false });
		expect(d.map(key)).toEqual([key([0.5, 0, 0.5, 1])]);
	});

	it('drops the seam when there is a left partner, unless the seam is kept', () => {
		expect(dropped(1, 1, { hasLeftPartner: true }).map(key)).toEqual([key([0, 0, 0, 1])]);
		expect(dropped(1, 1, { hasLeftPartner: true, keepPartnerSeam: true })).toEqual([]);
	});
});

type Xform = (x: number, y: number) => [number, number];
const identity: Xform = (x, y) => [x, y];
// A different page frame: rotated a quarter turn and moved, as a re-aligned piece would be.
const turned: Xform = (x, y) => [10 - y, x + 3];

// Unit-width rectangular quads for band rows [from, from + count), in frame `t`.
const rows = (from: number, count: number, t: Xform = identity): Quadrilateral[] =>
	Array.from({ length: count }, (_, k) => {
		const i = from + k;
		const v = (x: number, y: number) => new Vector3(...t(x, y), 0);
		return { a: v(0, i), b: v(1, i), c: v(1, i + 1), d: v(0, i + 1) };
	});

const cutBand = (
	qs: Quadrilateral[],
	{
		piece,
		leftPartnerBand,
		columns = 1
	}: { piece?: number; leftPartnerBand?: number; columns?: number } = {}
): BandCutPattern =>
	({
		id: `b0p${piece}`,
		projectionType: 'patterned',
		tagAnchorPoint: { x: 0, y: 0 },
		address:
			piece === undefined
				? { globule: 0, tube: 0, band: 0 }
				: { globule: 0, tube: 0, band: 0, piece },
		leftPartnerBand,
		facets: mapBand(qs, columns).map((path, i) => ({ path, quad: qs[i], label: `${i}` }))
	}) as BandCutPattern;

const keysOf = (path: PathSegment[]) => new Set(lines(path).map(key));
const keyIn =
	(t: Xform) =>
	(x0: number, y0: number, x1: number, y1: number): string =>
		key([...t(x0, y0), ...t(x1, y1)] as Line);

describe('adjustAsanohaAfterTiling: drops', () => {
	it('leaves one seam line along x = 0 per facet without a partner', () => {
		const [band] = adjustAsanohaAfterTiling([cutBand(rows(0, 4))], config());
		band.facets.forEach(({ path }) => {
			expect(lines(path).filter(isVerticalAt(0))).toHaveLength(1);
			expect(lines(path).filter(isVerticalAt(1))).toHaveLength(1);
		});
	});

	it('drops the x = 0 seam for a band with a left partner', () => {
		const [band] = adjustAsanohaAfterTiling(
			[cutBand(rows(0, 4), { leftPartnerBand: 0 })],
			config()
		);
		band.facets.forEach(({ path }) => expect(lines(path).filter(isVerticalAt(0))).toHaveLength(0));
	});

	it('keeps the x = 0 seam when keepPartnerSeam is on', () => {
		const [band] = adjustAsanohaAfterTiling(
			[cutBand(rows(0, 4), { leftPartnerBand: 0 })],
			config(1, { keepPartnerSeam: true })
		);
		band.facets.forEach(({ path }) => expect(lines(path).filter(isVerticalAt(0))).toHaveLength(1));
	});

	it('never draws a line twice within a band', () => {
		const [band] = adjustAsanohaAfterTiling([cutBand(rows(0, 6), { columns: 3 })], config(3));
		const keys = band.facets.flatMap(({ path }) => lines(path).map(key));
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('leaves error bands untouched', () => {
		const errored = { ...cutBand(rows(0, 3)), facets: [], error: 'odd' } as BandCutPattern;
		expect(adjustAsanohaAfterTiling([errored], config())).toEqual([errored]);
	});
});

describe('adjustAsanohaAfterTiling: closed ends', () => {
	it('extends the brown line to the band edges at both physical ends', () => {
		const [band] = adjustAsanohaAfterTiling([cutBand(rows(0, 4))], config());
		const first = keysOf(band.facets[0].path);
		const last = keysOf(band.facets[3].path);
		expect(first.has(key([0, 0, 1 / 6, 0]))).toBe(true);
		expect(first.has(key([5 / 6, 0, 1, 0]))).toBe(true);
		expect(last.has(key([0, 4, 1 / 6, 4]))).toBe(true);
		expect(last.has(key([5 / 6, 4, 1, 4]))).toBe(true);
	});

	it('caps every column', () => {
		const [band] = adjustAsanohaAfterTiling([cutBand(rows(0, 2), { columns: 2 })], config(2));
		const first = keysOf(band.facets[0].path);
		[
			[0, 1 / 12],
			[5 / 12, 0.5],
			[0.5, 7 / 12],
			[11 / 12, 1]
		].forEach(([x0, x1]) => expect(first.has(key([x0, 0, x1, 0]))).toBe(true));
	});
});

describe('adjustAsanohaAfterTiling: split seams', () => {
	const expectSpike = (path: PathSegment[], t: Xform, { seam = true } = {}) => {
		const k = keysOf(path);
		const at = keyIn(t);
		// the previous piece's last strip (rows 1..2): edge verticals + red zigzags
		expect(k.has(at(0, 1, 0, 2))).toBe(seam);
		expect(k.has(at(1, 1, 1, 2))).toBe(true);
		expect(k.has(at(0, 1, 1 / 6, 2))).toBe(true);
		expect(k.has(at(1, 1, 5 / 6, 2))).toBe(true);
	};

	it('the lower piece drops its end-strip edge verticals and is not capped there', () => {
		const pieces = [cutBand(rows(0, 2), { piece: 0 }), cutBand(rows(2, 2), { piece: 1 })];
		const [lower] = adjustAsanohaAfterTiling(pieces, config());
		const end = lower.facets[1].path;
		expect(lines(end).filter(isVerticalAt(0))).toHaveLength(0);
		expect(lines(end).filter(isVerticalAt(1))).toHaveLength(0);
		expect(keysOf(end).has(key([0, 2, 1 / 6, 2]))).toBe(false);
		// its zigzags stay: they outline the hexagonal end
		expect(keysOf(end).has(key([0, 1, 1 / 6, 2]))).toBe(true);
		// its physical start is still capped
		expect(keysOf(lower.facets[0].path).has(key([0, 0, 1 / 6, 0]))).toBe(true);
	});

	it('the higher piece takes them on, and is capped only at its physical end', () => {
		const pieces = [cutBand(rows(0, 2), { piece: 0 }), cutBand(rows(2, 2), { piece: 1 })];
		const [, higher] = adjustAsanohaAfterTiling(pieces, config());
		expectSpike(higher.facets[0].path, identity);
		expect(keysOf(higher.facets[0].path).has(key([0, 2, 1 / 6, 2]))).toBe(false);
		expect(keysOf(higher.facets[1].path).has(key([0, 4, 1 / 6, 4]))).toBe(true);
	});

	it("maps the borrowed segments through the lower piece's quad into the higher piece's frame", () => {
		const pieces = [cutBand(rows(0, 2), { piece: 0 }), cutBand(rows(2, 2, turned), { piece: 1 })];
		const [, higher] = adjustAsanohaAfterTiling(pieces, config());
		expectSpike(higher.facets[0].path, turned);
	});

	it('extrapolates from its own first quad when the lower piece is absent', () => {
		const [higher] = adjustAsanohaAfterTiling(
			[cutBand(rows(2, 2, turned), { piece: 1 })],
			config()
		);
		expectSpike(higher.facets[0].path, turned);
	});

	it('does not borrow the ceded seam when the band has a left partner', () => {
		const pieces = [
			cutBand(rows(0, 2), { piece: 0, leftPartnerBand: 0 }),
			cutBand(rows(2, 2), { piece: 1, leftPartnerBand: 0 })
		];
		const [, higher] = adjustAsanohaAfterTiling(pieces, config());
		expectSpike(higher.facets[0].path, identity, { seam: false });
	});

	it('treats every column boundary like a band edge', () => {
		const pieces = [
			cutBand(rows(0, 2), { piece: 0, columns: 2 }),
			cutBand(rows(2, 2), { piece: 1, columns: 2 })
		];
		const [lower, higher] = adjustAsanohaAfterTiling(pieces, config(2));
		[0, 0.5, 1].forEach((x) =>
			expect(lines(lower.facets[1].path).filter(isVerticalAt(x))).toHaveLength(0)
		);
		const spike = lines(higher.facets[0].path).filter(([, y0, , y1]) => y0 < 2 || y1 < 2);
		[0, 0.5, 1].forEach((x) => expect(spike.filter(isVerticalAt(x))).toHaveLength(1));
		expect(spike).toHaveLength(7); // 3 verticals + 2 zigzags per column
	});
});
