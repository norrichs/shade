import { Vector3 } from 'three';
import type { BandCutPattern, PathSegment, Quadrilateral, TiledPatternConfig } from '#lib/types.js';
import { transformPatternByQuad } from '../quadrilateral';
import {
	adjustHexparquet2AfterTiling,
	generateHexparquet2Preview,
	generateHexparquet2Subunits
} from '../tiled-hexparquet2-pattern';
import { tiledPatternConfigs } from '#lib/shades-config.js';

const config = (
	columnCount = 1,
	overrides: Partial<TiledPatternConfig['config']> = {}
): TiledPatternConfig => ({
	type: 'tiledHexparquet2Pattern-0',
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
	const qs = quads(quadCount, band);
	const subunits = generateHexparquet2Subunits(columns);
	return {
		id: `b${band}`,
		projectionType: 'patterned',
		tagAnchorPoint: { x: 0, y: 0 },
		address: { globule: 0, tube: 0, band },
		leftPartnerBand,
		facets: qs.map((q, i) => ({
			path: transformPatternByQuad(subunits[i % 3], q),
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

/** An open tube: band 0 has no left partner. */
const openTube = (bandCount: number, quadCount: number) =>
	Array.from({ length: bandCount }, (_, b) => cutBand(b, quadCount, b > 0 ? b - 1 : undefined));

type Line = [number, number, number, number];
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
	// Fold both ends by the same whole number of turns, chosen from the midpoint,
	// so a line crossing the wrap seam keeps its shape.
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

describe('HexParquet2 subunits', () => {
	it('keeps every node inside its quad', () => {
		for (const path of generateHexparquet2Subunits(2))
			for (const seg of path) {
				const [, x, y] = seg as ['M' | 'L', number, number];
				expect(x).toBeGreaterThanOrEqual(0);
				expect(x).toBeLessThanOrEqual(1);
				expect(y).toBeGreaterThanOrEqual(0);
				expect(y).toBeLessThanOrEqual(1);
			}
	});

	it('stacks the three subunits into the preview', () => {
		const subunits = generateHexparquet2Subunits(1);
		expect(generateHexparquet2Preview(1)).toHaveLength(
			subunits.reduce((n, path) => n + path.length, 0)
		);
	});
});

describe('adjustHexparquet2AfterTiling', () => {
	it('draws every line of a wrapping tube exactly once, plus the end caps', () => {
		const bandCount = 3;
		const tube = wrappingTube(bandCount, 6);
		const adjusted = adjustHexparquet2AfterTiling(tube, config());
		const counts = countKeys(
			adjusted.flatMap((b) => b.facets.map((f) => f.path)),
			bandCount
		);
		expect([...counts.values()].every((n) => n === 1)).toBe(true);

		// The full tiling, with each column-edge vertical drawn once.
		const tiling = countKeys(
			tube.flatMap((b) => b.facets.map((f) => f.path)),
			bandCount
		);
		const caps = [...counts.keys()].filter((k) => !tiling.has(k));
		expect([...tiling.keys()].every((k) => counts.has(k))).toBe(true);
		// Two peak lines per band at the end.
		expect(caps).toHaveLength(2 * bandCount);
		caps.forEach((k) => expect(k).toMatch(/,6\.166667/));
	});

	it('also tiles exactly once with two columns per band', () => {
		const bandCount = 3;
		const adjusted = adjustHexparquet2AfterTiling(wrappingTube(bandCount, 3, 2), config(2));
		const counts = countKeys(
			adjusted.flatMap((b) => b.facets.map((f) => f.path)),
			bandCount
		);
		expect([...counts.values()].every((n) => n === 1)).toBe(true);
	});

	it("gains the right partner's left seam in the middle subunit", () => {
		const [, band1] = adjustHexparquet2AfterTiling(wrappingTube(3, 3), config());
		// Grid (6,8)→(7,9)→(7,11)→(6,12) in band 1's middle subunit (x0 = 1, y ∈ [1, 2]).
		const middle = band1.facets[1].path;
		expect(has(middle, [2, 1 + 4 / 6, 2 + 1 / 6, 1 + 3 / 6])).toBe(true);
		expect(has(middle, [2 + 1 / 6, 1 + 3 / 6, 2 + 1 / 6, 1 + 1 / 6])).toBe(true);
		expect(has(middle, [2 + 1 / 6, 1 + 1 / 6, 2, 1])).toBe(true);
	});

	it('gives the top-right diagonal to the right partner, which draws it beyond its left edge', () => {
		const [, band1, band2] = adjustHexparquet2AfterTiling(wrappingTube(3, 3), config());
		// Grid (6,0)→(4,2) in band 1's top subunit: x 2 → 1 + 4/6, y 3 → 2 + 4/6.
		const diagonal: Line = [2, 3, 1 + 4 / 6, 2 + 4 / 6];
		expect(has(band1.facets[2].path, diagonal)).toBe(false);
		expect(has(band2.facets[2].path, diagonal)).toBe(true);
	});

	it('keeps the left seam on both bands with keepPartnerSeam', () => {
		const [band0, band1] = adjustHexparquet2AfterTiling(
			wrappingTube(3, 3),
			config(1, { keepPartnerSeam: true })
		);
		// Grid (0,12)→(0,16): band 1's own left vertical, band 0's right one.
		const vertical: Line = [1, 1, 1, 1 / 3];
		expect(has(band1.facets[0].path, vertical)).toBe(true);
		expect(has(band0.facets[0].path, vertical)).toBe(true);
		// Band 1 gains band 0's right stem, grid (4,2)→(4,6) one column left.
		expect(has(band1.facets[2].path, [1 - 2 / 6, 2 + 4 / 6, 1 - 2 / 6, 2])).toBe(true);
	});

	it('closes the left outline of a middle unit with the default config', () => {
		const keep = tiledPatternConfigs['tiledHexparquet2Pattern-0'];
		const [, band1] = adjustHexparquet2AfterTiling(wrappingTube(3, 9), keep);
		const all = band1.facets.flatMap((f) => f.path);
		// The left seam of the middle unit (y 3..6), in band 1's design grid.
		const g = ([x, row]: [number, number]): [number, number] => [1 + x / 6, 3 + (18 - row) / 6];
		const seam: [number, number][] = [
			[-2, 0],
			[-2, 2],
			[-2, 6],
			[0, 8],
			[1, 9],
			[1, 11],
			[0, 12],
			[0, 16],
			[-2, 18]
		];
		for (let i = 1; i < seam.length; i++) {
			const line = [...g(seam[i - 1]), ...g(seam[i])] as Line;
			expect([key(line), has(all, line)]).toEqual([key(line), true]);
		}
	});

	it('closes the left outline of a middle unit with the default config', () => {
		const keep = tiledPatternConfigs['tiledHexparquet2Pattern-0'];
		const [, band1] = adjustHexparquet2AfterTiling(wrappingTube(3, 9), keep);
		const all = band1.facets.flatMap((f) => f.path);
		// The left seam of the middle unit (y 3..6), in band 1's design grid.
		const g = ([x, row]: [number, number]): [number, number] => [1 + x / 6, 3 + (18 - row) / 6];
		const seam: [number, number][] = [
			[-2, 0],
			[-2, 2],
			[-2, 6],
			[0, 8],
			[1, 9],
			[1, 11],
			[0, 12],
			[0, 16],
			[-2, 18]
		];
		for (let i = 1; i < seam.length; i++) {
			const line = [...g(seam[i - 1]), ...g(seam[i])] as Line;
			expect([key(line), has(all, line)]).toEqual([key(line), true]);
		}
	});

	it('leaves out gained seam lines that would run past the band ends', () => {
		const [, band1] = adjustHexparquet2AfterTiling(
			wrappingTube(3, 3),
			config(1, { keepPartnerSeam: true })
		);
		// Past the end: grid (−2,0)→(−2,2). Past the start: grid (0,16)→(−2,18).
		expect(has(band1.facets[2].path, [1 - 2 / 6, 3, 1 - 2 / 6, 2 + 4 / 6])).toBe(false);
		expect(has(band1.facets[0].path, [1, 1 / 3, 1 - 2 / 6, 0])).toBe(false);
	});

	it('follows its own lines on an open left side and gains nothing there', () => {
		const [band0] = adjustHexparquet2AfterTiling(openTube(3, 3), config());
		const top = band0.facets[2].path;
		// Grid (0,0)→(2,2) is outside the open-side outline.
		expect(has(top, [0, 3, 2 / 6, 2 + 4 / 6])).toBe(false);
		expect(lines(top).every(([x0, , x1]) => x0 >= -1e-9 && x1 >= -1e-9)).toBe(true);
	});

	it('gains nothing on an open right side', () => {
		const tube = openTube(3, 3);
		const [, , last] = adjustHexparquet2AfterTiling(tube, config());
		const right = 3;
		for (const facet of last.facets)
			expect(
				lines(facet.path).every(([x0, , x1]) => x0 <= right + 1e-9 && x1 <= right + 1e-9)
			).toBe(true);
	});

	it('caps the band end with the next unit’s peak', () => {
		const [band] = adjustHexparquet2AfterTiling([cutBand(0, 3)], config());
		const top = band.facets[2].path;
		expect(has(top, [2 / 6, 3, 3 / 6, 3 + 1 / 6])).toBe(true);
		expect(has(top, [3 / 6, 3 + 1 / 6, 4 / 6, 3])).toBe(true);
	});

	it('leaves refused bands untouched', () => {
		const refused = { ...cutBand(0, 0), error: 'nope' } as BandCutPattern;
		expect(adjustHexparquet2AfterTiling([refused], config())[0]).toEqual(refused);
	});
});

describe('seam flap stitching', () => {
	/**
	 * Band 0's right edge (b→c, shared with band 1) bends at a different angle
	 * per quad while keeping band 1's edge length, as two flattened bands of a
	 * curved tube do. Band 1 (rectangular, at x = 1) gains band 0's flap, and
	 * laying each quad onto band 1's straight edge separately opens the joints.
	 */
	const angles = [0, 0.15, 0.3, 0.15, 0, -0.1];
	const taperedBand = (): BandCutPattern => {
		const right = [new Vector3(1, 0, 0)];
		for (const t of angles)
			right.push(
				right
					.at(-1)!
					.clone()
					.add(new Vector3(Math.sin(t), Math.cos(t), 0))
			);
		const qs: Quadrilateral[] = angles.map((_, i) => ({
			a: right[i].clone().sub(new Vector3(1, 0, 0)),
			b: right[i].clone(),
			c: right[i + 1].clone(),
			d: right[i + 1].clone().sub(new Vector3(1, 0, 0))
		}));
		const subunits = generateHexparquet2Subunits(1);
		return {
			...cutBand(0, 6),
			facets: qs.map((q, i) => ({
				path: transformPatternByQuad(subunits[i % 3], q),
				quad: q,
				label: `${i}`
			}))
		} as BandCutPattern;
	};
	const tube = () => [taperedBand(), cutBand(1, 6, 0)];
	const keep = (stitchGainedSeam: boolean) =>
		config(1, { keepPartnerSeam: true, stitchGainedSeam });

	/** Pairs of endpoints closer than `near` that are not the same point. */
	const nearMisses = (paths: PathSegment[][], near = 0.1) => {
		const points = paths.flat().map((seg) => [seg[1], seg[2]] as [number, number]);
		let misses = 0;
		for (let i = 0; i < points.length; i++)
			for (let j = i + 1; j < points.length; j++) {
				const d = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
				if (d > 1e-9 && d < near) misses++;
			}
		return misses;
	};

	it('scores the joints of a flap gained from a tilted partner', () => {
		const [, band1] = adjustHexparquet2AfterTiling(tube(), keep(false));
		expect(band1.seamDeviation).toHaveLength(6);
		expect(Math.max(...(band1.seamDeviation as number[]))).toBeGreaterThan(0.01);
		expect(nearMisses(band1.facets.map((f) => f.path))).toBeGreaterThan(0);
	});

	it('closes those joints when stitching, and still reports the score', () => {
		const [, open] = adjustHexparquet2AfterTiling(tube(), keep(false));
		const [, stitched] = adjustHexparquet2AfterTiling(tube(), keep(true));
		expect(nearMisses(stitched.facets.map((f) => f.path))).toBe(0);
		expect(stitched.seamDeviation).toEqual(open.seamDeviation);
	});

	it('scores nothing when the partner quads line up', () => {
		const adjusted = adjustHexparquet2AfterTiling(wrappingTube(3, 6), keep(true));
		for (const band of adjusted) expect(band.seamDeviation?.every((s) => s < 1e-9)).toBe(true);
	});
});
