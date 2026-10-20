import { Vector3 } from 'three';
import type { PathSegment, Quadrilateral, TiledPatternConfig } from '#lib/types.js';
import { transformPatternByQuad } from '../quadrilateral';
import {
	ASANOHA_SPLIT_SUBUNIT_COUNT,
	adjustAsanohaSplitAfterMapping,
	generateAsanohaSplitPreview,
	generateAsanohaSplitSubunits,
	getAsanohaSplitDropIndices
} from '../tiled-asanoha-split-pattern';

const config = (
	columnCount = 1,
	overrides: Partial<TiledPatternConfig['config']> = {}
): TiledPatternConfig => ({
	type: 'tiledAsanohaSplitPattern-0',
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

// Unit-width rectangular quads stacked along +y.
const quads = (count: number): Quadrilateral[] =>
	Array.from({ length: count }, (_, i) => ({
		a: new Vector3(0, i, 0),
		b: new Vector3(1, i, 0),
		c: new Vector3(1, i + 1, 0),
		d: new Vector3(0, i + 1, 0)
	}));

const mapBand = (qs: Quadrilateral[], columns = 1): PathSegment[][] => {
	const subunits = generateAsanohaSplitSubunits(columns);
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

describe('generateAsanohaSplitSubunits', () => {
	it('emits two subunits made only of M/L pairs', () => {
		const subunits = generateAsanohaSplitSubunits(2);
		expect(subunits).toHaveLength(ASANOHA_SPLIT_SUBUNIT_COUNT);
		for (const path of subunits) {
			path.forEach((seg, i) => expect(seg[0]).toBe(i % 2 === 0 ? 'M' : 'L'));
		}
	});

	it('B is A mirrored top-to-bottom, less the shared middle line', () => {
		const [a, b] = generateAsanohaSplitSubunits(1).map(lines);
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
		const stacked = generateAsanohaSplitPreview(1);
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

describe('getAsanohaSplitDropIndices', () => {
	const dropped = (
		facetIndex: number,
		columns: number,
		opts: Parameters<typeof getAsanohaSplitDropIndices>[2]
	) => {
		const path = generateAsanohaSplitSubunits(columns)[facetIndex % 2];
		const all = lines(path);
		const indices = new Set(getAsanohaSplitDropIndices(facetIndex, columns, opts));
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

describe('adjustAsanohaSplitAfterMapping', () => {
	it('leaves one seam line along x = 0 per facet without a partner', () => {
		const qs = quads(4);
		const adjusted = adjustAsanohaSplitAfterMapping(mapBand(qs), qs, config(), {
			hasOuterPartner: false,
			bandIndex: 0
		});
		adjusted.forEach((path) => expect(lines(path).filter(isVerticalAt(0))).toHaveLength(1));
		adjusted.forEach((path) => expect(lines(path).filter(isVerticalAt(1))).toHaveLength(1));
	});

	it('drops the x = 0 seam for a band with a left partner', () => {
		const qs = quads(4);
		const adjusted = adjustAsanohaSplitAfterMapping(mapBand(qs), qs, config(), {
			hasOuterPartner: true,
			bandIndex: 1,
			leftPartnerBand: 0
		});
		adjusted.forEach((path) => expect(lines(path).filter(isVerticalAt(0))).toHaveLength(0));
	});

	it('keeps the x = 0 seam when keepPartnerSeam is on', () => {
		const qs = quads(4);
		const adjusted = adjustAsanohaSplitAfterMapping(
			mapBand(qs),
			qs,
			config(1, { keepPartnerSeam: true }),
			{ hasOuterPartner: true, bandIndex: 1, leftPartnerBand: 0 }
		);
		adjusted.forEach((path) => expect(lines(path).filter(isVerticalAt(0))).toHaveLength(1));
	});

	it('never draws a line twice within a band', () => {
		const qs = quads(6);
		const adjusted = adjustAsanohaSplitAfterMapping(mapBand(qs, 3), qs, config(3), {
			hasOuterPartner: false,
			bandIndex: 0
		});
		const keys = adjusted.flatMap((path) => lines(path).map(key));
		expect(new Set(keys).size).toBe(keys.length);
	});
});
