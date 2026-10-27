import { Vector3 } from 'three';
import type { BandCutPattern, PathSegment, Quadrilateral, TiledPatternConfig } from '#lib/types.js';
import { transformPatternByQuad } from '../quadrilateral';
import {
	adjustHexparquet2bAfterTiling,
	generateHexparquet2bPreview,
	generateHexparquet2bSubunits
} from '../tiled-hexparquet2b-pattern';
import { tiledPatternConfigs } from '#lib/shades-config.js';

const config = (
	columnCount = 1,
	overrides: Partial<TiledPatternConfig['config']> = {}
): TiledPatternConfig => ({
	type: 'tiledHexparquet2bPattern-0',
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
const interlock = (columns = 1) => config(columns, { keepPartnerSeam: true });

// Unit-square quads stacked along +y, starting at x = x0: band b of a tube sits at x0 = b.
const quads = (count: number, x0: number): Quadrilateral[] =>
	Array.from({ length: count }, (_, i) => ({
		a: new Vector3(x0, i, 0),
		b: new Vector3(x0 + 1, i, 0),
		c: new Vector3(x0 + 1, i + 1, 0),
		d: new Vector3(x0, i + 1, 0)
	}));

const cutBand = (
	band: number,
	quadCount: number,
	leftPartnerBand?: number,
	columns = 1
): BandCutPattern => {
	const subunits = generateHexparquet2bSubunits(columns);
	return {
		id: `b${band}`,
		projectionType: 'patterned',
		tagAnchorPoint: { x: 0, y: 0 },
		address: { globule: 0, tube: 0, band },
		leftPartnerBand,
		facets: quads(quadCount, band).map((q, i) => ({
			path: transformPatternByQuad(subunits[i % 2], q),
			quad: q,
			label: `${i}`
		}))
	} as BandCutPattern;
};

/** A wrapping tube: band b's left partner is b − 1, band 0's is the last band. */
const wrappingTube = (bandCount: number, quadCount: number, columns = 1) =>
	Array.from({ length: bandCount }, (_, b) =>
		cutBand(b, quadCount, (b + bandCount - 1) % bandCount, columns)
	);

/** An open tube: band 0 has no left partner, the last band no right partner. */
const openTube = (bandCount: number, quadCount: number) =>
	Array.from({ length: bandCount }, (_, b) => cutBand(b, quadCount, b > 0 ? b - 1 : undefined));

type Line = [number, number, number, number];
type G = [number, number];
const lines = (path: PathSegment[]): Line[] => {
	const out: Line[] = [];
	for (let i = 0; i < path.length; i += 2) {
		const [, x0, y0] = path[i] as ['M', number, number];
		const [, x1, y1] = path[i + 1] as ['L', number, number];
		out.push([x0, y0, x1, y1]);
	}
	return out;
};

/** An undirected, rounded key; `wrap` folds x around a tube of that circumference. */
const key = ([x0, y0, x1, y1]: Line, wrap?: number) => {
	const fold = (x: number) => (wrap ? ((x % wrap) + wrap) % wrap : x);
	const r = (v: number) => (Math.round(v * 1e6) / 1e6).toFixed(6);
	const shift = wrap ? fold((x0 + x1) / 2) - (x0 + x1) / 2 : 0;
	const a = `${r(x0 + shift)},${r(y0)}`;
	const b = `${r(x1 + shift)},${r(y1)}`;
	return a < b ? `${a}|${b}` : `${b}|${a}`;
};

const countKeys = (paths: PathSegment[][], wrap?: number) => {
	const counts = new Map<string, number>();
	for (const path of paths)
		for (const line of lines(path)) {
			const k = key(line, wrap);
			counts.set(k, (counts.get(k) ?? 0) + 1);
		}
	return counts;
};

const has = (path: PathSegment[], line: Line) => lines(path).some((l) => key(l) === key(line));
const allPaths = (bands: BandCutPattern[]) => bands.flatMap((b) => b.facets.map((f) => f.path));

/** A design-grid line of band `b` (one column), unit `u`: x in quarters, row in twelfths down the unit. */
const line = (b: number, [x0, r0]: G, [x1, r1]: G, u = 0): Line => [
	b + x0 / 4,
	2 * u + (12 - r0) / 6,
	b + x1 / 4,
	2 * u + (12 - r1) / 6
];
const polyline = (b: number, points: G[], u = 0) =>
	points.slice(1).map((p, i) => line(b, points[i], p, u));

describe('HexParquet2b subunits', () => {
	it('keeps every node inside its quad', () => {
		for (const path of generateHexparquet2bSubunits(2))
			for (const seg of path) {
				const [, x, y] = seg as ['M' | 'L', number, number];
				expect(x).toBeGreaterThanOrEqual(0);
				expect(x).toBeLessThanOrEqual(1);
				expect(y).toBeGreaterThanOrEqual(0);
				expect(y).toBeLessThanOrEqual(1);
			}
	});

	it('draws every line the same length on a √3 grid, bar the split stem', () => {
		// Columns √3 rows wide: a diagonal across one column is two rows long.
		const lengths = generateHexparquet2bSubunits(1).flatMap((path) =>
			lines(path).map(([x0, y0, x1, y1]) => Math.hypot((x1 - x0) * 4 * Math.sqrt(3), (y1 - y0) * 6))
		);
		// The x = 1 and x = 3 stems are four rows long, drawn whole or in two.
		expect(lengths.every((l) => Math.abs(l - 2) < 1e-9 || Math.abs(l - 4) < 1e-9)).toBe(true);
	});

	it('stacks the two subunits into the preview', () => {
		const subunits = generateHexparquet2bSubunits(1);
		expect(generateHexparquet2bPreview(1)).toHaveLength(
			subunits.reduce((n, path) => n + path.length, 0)
		);
	});
});

describe('adjustHexparquet2bAfterTiling', () => {
	it.each([1, 2])(
		'covers the tiling of a wrapping tube once, seams twice, plus the start caps (%i columns)',
		(columns) => {
			const bandCount = 3;
			const units = 3;
			const tube = wrappingTube(bandCount, 2 * units, columns);
			const counts = countKeys(
				allPaths(adjustHexparquet2bAfterTiling(tube, interlock(columns))),
				bandCount
			);
			const tiling = countKeys(allPaths(tube), bandCount);

			expect([...tiling.keys()].every((k) => counts.has(k))).toBe(true);
			expect(Math.max(...counts.values())).toBe(2);
			// Per band and unit, 7 seam lines are drawn by both bands: in subunit 1
			// the x = 3 stem and its two chevron arms, in subunit 0 the three bump
			// lines and the band-edge vertical. The top arm of each band's last
			// unit is the dropped end spur, drawn by the right partner alone.
			const twice = [...counts.values()].filter((n) => n === 2).length;
			expect(twice).toBe(7 * bandCount * units - bandCount);
			// Four zigzag lines per column at each band's start, below y = 0.
			const caps = [...counts.keys()].filter((k) => !tiling.has(k));
			expect(caps).toHaveLength(4 * columns * bandCount);
			caps.forEach((k) => expect(k).toMatch(/-0\.166667/));
		}
	);

	it("gains the left partner's half hexagon in subunit 1", () => {
		const [, band1] = adjustHexparquet2bAfterTiling(wrappingTube(3, 2), interlock());
		const top = band1.facets[1].path;
		for (const l of [
			...polyline(1, [
				[0, 0],
				[-1, 1],
				[-1, 5],
				[0, 6]
			]),
			line(1, [-1, 3], [0, 2])
		])
			expect(has(top, l)).toBe(true);
	});

	it("gains the right partner's bump in subunit 0", () => {
		const [, band1] = adjustHexparquet2bAfterTiling(wrappingTube(3, 2), interlock());
		const bottom = band1.facets[0].path;
		for (const l of polyline(1, [
			[4, 6],
			[5, 7],
			[5, 9],
			[4, 10]
		]))
			expect(has(bottom, l)).toBe(true);
	});

	it('gives the diagonal right of the stem to the right partner', () => {
		// Two units, so facet 1 is not the band's end.
		const [, band1, band2] = adjustHexparquet2bAfterTiling(wrappingTube(3, 4), interlock());
		const diagonal = line(1, [3, 3], [4, 2]);
		expect(has(band1.facets[1].path, diagonal)).toBe(false);
		expect(has(band2.facets[1].path, diagonal)).toBe(true);
		// Its chevron arms stay: they are this band's outline.
		expect(has(band1.facets[1].path, line(1, [3, 1], [4, 0]))).toBe(true);
		expect(has(band1.facets[1].path, line(1, [3, 5], [4, 6]))).toBe(true);
	});

	it('keeps that diagonal between columns of one band', () => {
		const [band] = adjustHexparquet2bAfterTiling([cutBand(0, 2, undefined, 2)], interlock(2));
		// Column 0's (3,3)→(4,2): x 3/8 → 1/2 of the band, y 1 + 3/6 → 1 + 4/6.
		expect(has(band.facets[1].path, [3 / 8, 1.5, 0.5, 1 + 4 / 6])).toBe(true);
	});

	it('drops the end spur, which the right partner still draws', () => {
		const [, band1, band2] = adjustHexparquet2bAfterTiling(wrappingTube(3, 4), interlock());
		const spur = (u: number) => line(1, [3, 1], [4, 0], u);
		expect(has(band1.facets[3].path, spur(1))).toBe(false);
		expect(has(band2.facets[3].path, spur(1))).toBe(true);
		// Below the end it joins the next unit's zigzag, so it stays.
		expect(has(band1.facets[1].path, spur(0))).toBe(true);
	});

	it('closes the outline of a middle unit with the default config', () => {
		const keep = tiledPatternConfigs['tiledHexparquet2bPattern-0'];
		const [, band1] = adjustHexparquet2bAfterTiling(wrappingTube(3, 6), keep);
		const all = band1.facets.flatMap((f) => f.path);
		const left = polyline(
			1,
			[
				[0, 0],
				[-1, 1],
				[-1, 5],
				[0, 6],
				[1, 7],
				[1, 9],
				[0, 10],
				[0, 12]
			],
			1
		);
		const right = polyline(
			1,
			[
				[4, 0],
				[3, 1],
				[3, 5],
				[4, 6],
				[5, 7],
				[5, 9],
				[4, 10],
				[4, 12]
			],
			1
		);
		for (const l of [...left, ...right]) expect([key(l), has(all, l)]).toEqual([key(l), true]);
	});

	it('extrapolates the gains on open sides', () => {
		const [band0, , last] = adjustHexparquet2bAfterTiling(openTube(3, 2), interlock());
		expect(has(band0.facets[1].path, line(0, [-1, 1], [-1, 5]))).toBe(true);
		expect(has(last.facets[0].path, line(2, [5, 7], [5, 9]))).toBe(true);
		// The open right side still gives the diagonal away.
		expect(has(last.facets[1].path, line(2, [3, 3], [4, 2]))).toBe(false);
	});

	it('caps the band start with the zigzag of the unit below, and nothing past the end', () => {
		const [band] = adjustHexparquet2bAfterTiling([cutBand(0, 2)], config());
		for (const l of polyline(0, [
			[0, 12],
			[1, 13],
			[2, 12],
			[3, 13],
			[4, 12]
		]))
			expect(has(band.facets[0].path, l)).toBe(true);
		expect(lines(band.facets[1].path).every(([, y0, , y1]) => y0 <= 2 && y1 <= 2)).toBe(true);
	});

	it('without keepPartnerSeam, leaves each band as tiled, plus the start cap', () => {
		const tube = wrappingTube(3, 4, 2);
		const adjusted = adjustHexparquet2bAfterTiling(tube, config(2));
		adjusted.forEach((band, b) => {
			const own = countKeys(tube[b].facets.map((f) => f.path));
			const counts = countKeys(band.facets.map((f) => f.path));
			expect([...own.keys()].every((k) => counts.get(k) === 1)).toBe(true);
			expect([...counts.keys()].filter((k) => !own.has(k))).toHaveLength(8);
		});
	});

	it('leaves refused bands untouched', () => {
		const refused = { ...cutBand(0, 0), error: 'nope' } as BandCutPattern;
		expect(adjustHexparquet2bAfterTiling([refused], config())[0]).toEqual(refused);
	});
});
