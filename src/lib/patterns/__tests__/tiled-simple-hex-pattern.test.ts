import { Vector3 } from 'three';
import type { BandCutPattern, PathSegment, Quadrilateral, TiledPatternConfig } from '#lib/types.js';
import { transformPatternByQuad } from '../quadrilateral';
import {
	adjustSimpleHexAfterTiling,
	generateSimpleHexPreview,
	generateSimpleHexSubunits
} from '../tiled-simple-hex-pattern';
import { tiledPatternConfigs } from '#lib/shades-config.js';

const config = (
	columnCount = 1,
	overrides: Partial<TiledPatternConfig['config']> = {}
): TiledPatternConfig => ({
	type: 'tiledSimpleHexPattern-0',
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
	columns = 1,
	bandQuads = quads(quadCount, band)
): BandCutPattern => {
	const subunits = generateSimpleHexSubunits(columns);
	return {
		id: `b${band}`,
		projectionType: 'patterned',
		tagAnchorPoint: { x: 0, y: 0 },
		address: { globule: 0, tube: 0, band },
		leftPartnerBand,
		facets: bandQuads.map((q, i) => ({
			path: transformPatternByQuad(subunits[i % 2], q),
			quad: q,
			label: `${i}`
		}))
	} as BandCutPattern;
};

const wrappingTube = (bandCount: number, quadCount: number, columns = 1) =>
	Array.from({ length: bandCount }, (_, b) =>
		cutBand(b, quadCount, (b + bandCount - 1) % bandCount, columns)
	);

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
		for (const l of lines(path)) {
			const k = key(l, wrap);
			counts.set(k, (counts.get(k) ?? 0) + 1);
		}
	return counts;
};

const has = (path: PathSegment[], l: Line) => lines(path).some((m) => key(m) === key(l));
const allPaths = (bands: BandCutPattern[]) => bands.flatMap((b) => b.facets.map((f) => f.path));

/** A design-grid line of band `b` (one column), unit `u`: x in sixths, row in halves down the unit. */
const line = (b: number, [x0, r0]: G, [x1, r1]: G, u = 0): Line => [
	b + x0 / 6,
	2 * u + 2 - r0,
	b + x1 / 6,
	2 * u + 2 - r1
];

/** The hexagon tiling's lines over band `b`'s quads, units 0..units−1, plus the top line. */
const referenceTiling = (b: number, units: number): Line[] => {
	const out: Line[] = [];
	for (let u = 0; u < units; u++) {
		out.push(
			line(b, [0, 2], [2, 2], u),
			line(b, [3, 1], [2, 2], u),
			line(b, [5, 1], [6, 2], u),
			line(b, [3, 1], [5, 1], u),
			line(b, [2, 0], [3, 1], u),
			line(b, [5, 1], [6, 0], u)
		);
	}
	out.push(line(b, [0, 0], [2, 0], units - 1));
	return out;
};

describe('SimpleHex subunits', () => {
	it('keeps every node inside its quad', () => {
		for (const path of generateSimpleHexSubunits(2))
			for (const seg of path) {
				const [, x, y] = seg as ['M' | 'L', number, number];
				expect(x).toBeGreaterThanOrEqual(0);
				expect(x).toBeLessThanOrEqual(1);
				expect(y).toBeGreaterThanOrEqual(0);
				expect(y).toBeLessThanOrEqual(1);
			}
	});

	it('draws a regular hexagon when a column is √3 rows wide', () => {
		// Column width W, row height H: edges are equal when (W/3)² = (W/6)² + H², W = 2√3·H.
		const H = 1;
		const W = 6 / Math.sqrt(3);
		const lengths = generateSimpleHexSubunits(1).flatMap((path) =>
			lines(path).map(([x0, y0, x1, y1]) => Math.hypot((x1 - x0) * W, (y1 - y0) * H))
		);
		for (const l of lengths) expect(l).toBeCloseTo(W / 3, 9);
	});

	it('stacks the two subunits into the preview', () => {
		const subunits = generateSimpleHexSubunits(1);
		expect(generateSimpleHexPreview(1)).toHaveLength(
			subunits.reduce((n, path) => n + path.length, 0)
		);
	});
});

describe('adjustSimpleHexAfterTiling', () => {
	it.each([1, 2])(
		'without the seam, a wrapping tube draws the tiling exactly once (%i columns)',
		(columns) => {
			const bandCount = 3;
			const tube = wrappingTube(bandCount, 4, columns);
			const counts = countKeys(
				allPaths(adjustSimpleHexAfterTiling(tube, config(columns))),
				bandCount
			);
			expect([...counts.values()].every((n) => n === 1)).toBe(true);
			const expected = new Set<string>();
			for (let b = 0; b < bandCount; b++)
				for (let c = 0; c < columns; c++)
					for (const [x0, y0, x1, y1] of referenceTiling(0, 2))
						expected.add(key([b + (c + x0) / columns, y0, b + (c + x1) / columns, y1], bandCount));
			expect(new Set(counts.keys())).toEqual(expected);
		}
	);

	it('with the seam, adds only the left partner’s seam diagonals, so seam lines are drawn twice', () => {
		const bandCount = 3;
		const plain = countKeys(
			allPaths(adjustSimpleHexAfterTiling(wrappingTube(bandCount, 4), config())),
			bandCount
		);
		const seamed = countKeys(
			allPaths(adjustSimpleHexAfterTiling(wrappingTube(bandCount, 4), interlock())),
			bandCount
		);
		expect(new Set(seamed.keys())).toEqual(new Set(plain.keys()));
		const seam = new Set<string>();
		for (let b = 0; b < bandCount; b++)
			for (let u = 0; u < 2; u++) {
				seam.add(key(line(b, [5, 1], [6, 2], u), bandCount));
				seam.add(key(line(b, [5, 1], [6, 0], u), bandCount));
			}
		for (const [k, n] of seamed) expect([k, n]).toEqual([k, seam.has(k) ? 2 : 1]);
	});

	it('gives each band the left neighbour’s chevron as its left outline', () => {
		const [, band1] = adjustSimpleHexAfterTiling(wrappingTube(3, 4), interlock());
		for (let u = 0; u < 2; u++) {
			const [f0, f1] = [band1.facets[2 * u].path, band1.facets[2 * u + 1].path];
			expect(has(f0, line(0, [5, 1], [6, 2], u))).toBe(true);
			expect(has(f1, line(0, [5, 1], [6, 0], u))).toBe(true);
		}
	});

	it('draws an open left side as a closed one, extrapolated through its own quads', () => {
		const [band0] = adjustSimpleHexAfterTiling(openTube(3, 2), interlock());
		expect(has(band0.facets[0].path, line(-1, [5, 1], [6, 2]))).toBe(true);
		expect(has(band0.facets[1].path, line(-1, [5, 1], [6, 0]))).toBe(true);
	});

	it('closes the band end with its top line and adds no caps', () => {
		const [band] = adjustSimpleHexAfterTiling([cutBand(0, 4)], config());
		expect(has(band.facets[3].path, line(0, [0, 0], [2, 0], 1))).toBe(true);
		expect(lines(band.facets[0].path)).toHaveLength(3);
	});

	it('stitches the chevron apex when the partner’s quads are laid apart', () => {
		// A partner whose quads lean differently, so each facet lays its own apex copy elsewhere.
		const lean = (i: number) => (i % 2 ? 0.3 : -0.2);
		const partnerQuads: Quadrilateral[] = Array.from({ length: 2 }, (_, i) => ({
			a: new Vector3(-1 + lean(i), i, 0),
			b: new Vector3(0, i, 0),
			c: new Vector3(0, i + 1, 0),
			d: new Vector3(-1 - lean(i), i + 1, 0)
		}));
		const partner = cutBand(0, 2, undefined, 1, partnerQuads);
		const band = cutBand(1, 2, 0);
		const [, adjusted] = adjustSimpleHexAfterTiling([partner, band], interlock());
		const apexOf = (path: PathSegment[]) => {
			const [, x, y] = path[path.length - 2] as ['M', number, number];
			return [x, y];
		};
		// Facet 0's gained line is (5,1)→(6,2): its M is the apex. Facet 1's
		// gained line is (5,1)→(6,0), appended before the top line.
		const f0 = adjusted.facets[0].path;
		const f1 = adjusted.facets[1].path;
		const [ax, ay] = apexOf(f0);
		const [, bx, by] = f1[f1.length - 4] as ['M', number, number];
		expect(bx).toBeCloseTo(ax, 9);
		expect(by).toBeCloseTo(ay, 9);
	});

	it('defaults to keeping the partner seam', () => {
		expect(tiledPatternConfigs['tiledSimpleHexPattern-0'].config.keepPartnerSeam).toBe(true);
	});

	it('returns refused bands unchanged', () => {
		const refused = { ...cutBand(0, 2), error: 'refused' } as BandCutPattern;
		expect(adjustSimpleHexAfterTiling([refused], config())[0]).toEqual(refused);
	});
});
