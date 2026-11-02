import { Vector3 } from 'three';
import type {
	BandCutPattern,
	EndTermination,
	PathSegment,
	Quadrilateral,
	TiledPatternConfig,
	TubeCutPattern
} from '#lib/types.js';
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

/**
 * The hexagon tiling's lines over band `b`'s quads, units 0..units−1, plus the
 * top line and the default (smoothed) end lines.
 */
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
	out.push(line(b, [2, 2], [6, 2], 0), line(b, [2, 0], [6, 0], units - 1));
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

	it('closes the band end with its top line', () => {
		const [band] = adjustSimpleHexAfterTiling([cutBand(0, 4)], config());
		expect(has(band.facets[3].path, line(0, [0, 0], [2, 0], 1))).toBe(true);
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
		// Each facet's gained line starts at the apex: (5,1)→(6,2) in facet 0, followed
		// by its smoothing line; (5,1)→(6,0) in facet 1, followed by its top and
		// smoothing lines.
		const f0 = adjusted.facets[0].path;
		const f1 = adjusted.facets[1].path;
		const [, ax, ay] = f0[f0.length - 4] as ['M', number, number];
		const [, bx, by] = f1[f1.length - 6] as ['M', number, number];
		expect(bx).toBeCloseTo(ax, 9);
		expect(by).toBeCloseTo(ay, 9);
	});

	describe('at a split', () => {
		/** Band 0 cut into two pieces of 2 quads; piece 1 laid out at `offset` from its true place. */
		const split = (columns = 1, offset: [number, number] = [0, 0]) => {
			const subunits = generateSimpleHexSubunits(columns);
			const piece = (p: number, shift: [number, number]): BandCutPattern =>
				({
					id: `b0p${p}`,
					projectionType: 'patterned',
					tagAnchorPoint: { x: 0, y: 0 },
					address: { globule: 0, tube: 0, band: 0, piece: p },
					facets: quads(4, 0)
						.slice(2 * p, 2 * p + 2)
						.map((q, i) => {
							const m = (v: Vector3) => new Vector3(v.x + shift[0], v.y + shift[1], 0);
							const moved = { a: m(q.a), b: m(q.b), c: m(q.c), d: m(q.d) };
							return {
								path: transformPatternByQuad(subunits[i % 2], moved),
								quad: moved,
								label: `${i}`
							};
						})
				}) as BandCutPattern;
			return adjustSimpleHexAfterTiling([piece(0, [0, 0]), piece(1, offset)], config(columns));
		};
		const upperHalf = [
			line(0, [2, 2], [3, 1], 1),
			line(0, [3, 1], [5, 1], 1),
			line(0, [5, 1], [6, 2], 1)
		];

		it('the earlier piece takes the straddling hexagon’s upper half', () => {
			const [earlier] = split();
			for (const l of upperHalf) expect(has(earlier.facets[1].path, l)).toBe(true);
		});

		it('the later piece drops the spur and keeps the rest of its bottom outline', () => {
			const [, later] = split();
			const first = later.facets[0].path;
			expect(has(first, line(0, [5, 1], [6, 2], 1))).toBe(false);
			expect(has(first, line(0, [0, 2], [2, 2], 1))).toBe(true);
			expect(has(first, line(0, [3, 1], [2, 2], 1))).toBe(true);
		});

		it('lays the gain through the later piece’s quad wherever that piece lies', () => {
			const [earlier] = split(1, [10, 5]);
			for (const l of upperHalf) expect(has(earlier.facets[1].path, l)).toBe(true);
		});

		it('with 2 columns, drops the spur only in the last column and gains in each', () => {
			const [earlier, later] = split(2);
			const col = (c: number, [x0, y0, x1, y1]: Line): Line => [(c + x0) / 2, y0, (c + x1) / 2, y1];
			const spur = line(0, [5, 1], [6, 2], 1);
			expect(has(later.facets[0].path, col(0, spur))).toBe(true);
			expect(has(later.facets[0].path, col(1, spur))).toBe(false);
			for (const c of [0, 1])
				for (const l of upperHalf) expect(has(earlier.facets[1].path, col(c, l))).toBe(true);
		});

		it('leaves the split ends out of the end termination', () => {
			const [earlier, later] = split();
			expect(has(earlier.facets[1].path, line(0, [2, 0], [6, 0], 1))).toBe(false);
			expect(has(later.facets[0].path, line(0, [2, 2], [6, 2], 1))).toBe(false);
		});
	});

	describe('end termination', () => {
		const ends = (termination: EndTermination, columns = 1) =>
			adjustSimpleHexAfterTiling(
				[cutBand(0, 4, undefined, columns)],
				config(columns, { endTermination: termination })
			)[0];
		const startSpur = line(0, [5, 1], [6, 2], 0);
		const endSpur = line(0, [5, 1], [6, 0], 1);
		const startSmooth = line(0, [2, 2], [6, 2], 0);
		const endSmooth = line(0, [2, 0], [6, 0], 1);

		it('defaults to smoothed', () => {
			expect(tiledPatternConfigs['tiledSimpleHexPattern-0'].config.endTermination).toBe('smoothed');
			const [band] = adjustSimpleHexAfterTiling([cutBand(0, 4)], config());
			expect(has(band.facets[0].path, startSmooth)).toBe(true);
		});

		it('smoothed: keeps the spurs and closes each half hexagon along the end edge', () => {
			const band = ends('smoothed');
			expect(has(band.facets[0].path, startSpur)).toBe(true);
			expect(has(band.facets[0].path, startSmooth)).toBe(true);
			expect(has(band.facets[3].path, endSpur)).toBe(true);
			expect(has(band.facets[3].path, endSmooth)).toBe(true);
		});

		it('smoothed, 2 columns: closes the half hexagon in every column', () => {
			const band = ends('smoothed', 2);
			const col = (c: number, [x0, y0, x1, y1]: Line): Line => [(c + x0) / 2, y0, (c + x1) / 2, y1];
			for (const c of [0, 1]) {
				expect(has(band.facets[0].path, col(c, startSmooth))).toBe(true);
				expect(has(band.facets[3].path, col(c, endSmooth))).toBe(true);
			}
		});

		it('natural: removes the spurs and adds nothing', () => {
			const band = ends('natural');
			expect(has(band.facets[0].path, startSpur)).toBe(false);
			expect(has(band.facets[3].path, endSpur)).toBe(false);
			expect(lines(band.facets[0].path)).toHaveLength(2);
			expect(lines(band.facets[3].path)).toHaveLength(3);
		});

		it('extended without an end partner: smoothed', () => {
			const band = ends('extended');
			expect(has(band.facets[0].path, startSmooth)).toBe(true);
			expect(has(band.facets[3].path, endSmooth)).toBe(true);
		});

		describe('extended with an end partner in another tube', () => {
			/**
			 * Tube 0's band 0 ends where tube 1's band 0 starts. Tube 1's band is
			 * laid out on its own, rotated a quarter turn and moved by `offset`.
			 */
			const pair = () => {
				const a = {
					...cutBand(0, 4),
					meta: { endPartnerBand: { globule: 0, tube: 1, band: 0 } }
				} as BandCutPattern;
				const turn = (v: Vector3) => new Vector3(-v.y + 20, v.x + 7, 0);
				const bQuads = quads(4, 0).map((q) => ({
					a: turn(q.a),
					b: turn(q.b),
					c: turn(q.c),
					d: turn(q.d)
				}));
				const b = {
					...cutBand(0, 4, undefined, 1, bQuads),
					address: { globule: 0, tube: 1, band: 0 },
					meta: { startPartnerBand: { globule: 0, tube: 0, band: 0 } }
				} as BandCutPattern;
				const tubes = [{ bands: [a] }, { bands: [b] }] as unknown as TubeCutPattern[];
				const cfg = config(1, { endTermination: 'extended' });
				return {
					a: adjustSimpleHexAfterTiling([a], cfg, tubes)[0],
					b: adjustSimpleHexAfterTiling([b], cfg, tubes)[0]
				};
			};

			it('the band that sorts first extends the half hexagon into its partner', () => {
				const { a } = pair();
				const last = a.facets[3].path;
				// The quad beyond the end is y 4..5: unit 2's lower subunit.
				for (const l of [
					line(0, [2, 2], [3, 1], 2),
					line(0, [3, 1], [5, 1], 2),
					line(0, [5, 1], [6, 2], 2)
				])
					expect(has(last, l)).toBe(true);
				expect(has(last, endSpur)).toBe(true);
				expect(has(last, endSmooth)).toBe(false);
			});

			it('its partner drops the spur and adds nothing', () => {
				const { b } = pair();
				const first = b.facets[0].path;
				expect(lines(first)).toHaveLength(2);
			});

			it('the free ends stay smoothed', () => {
				const { a, b } = pair();
				expect(has(a.facets[0].path, startSmooth)).toBe(true);
				expect(lines(b.facets[3].path)).toHaveLength(5);
			});
		});
	});

	describe('label anchor', () => {
		/** Within 1e-9 of an endpoint of one of the facet's lines. */
		const isNode = (path: PathSegment[], { x, y }: { x: number; y: number }) =>
			path.some((seg) => Math.hypot((seg[1] as number) - x, (seg[2] as number) - y) < 1e-9);
		/** The stem points straight out of the band start (−y): rotate(θ) maps (0,1) to (0,−1). */
		const pointsOutOfStart = (band: BandCutPattern) =>
			expect(Math.cos(band.tagAnchorAutoAngle as number)).toBeCloseTo(-1, 9);

		it.each(['smoothed', 'natural', 'extended'] as const)(
			'%s, unpartnered: anchors at the real (2,2) node of facet 0 (1 and 2 columns)',
			(termination) => {
				for (const columns of [1, 2]) {
					const [band] = adjustSimpleHexAfterTiling(
						[cutBand(0, 4, undefined, columns)],
						config(columns, { endTermination: termination })
					);
					const [x, y] = [1 / (3 * columns), 0];
					expect(band.tagAnchorPoint.x).toBeCloseTo(x, 9);
					expect(band.tagAnchorPoint.y).toBeCloseTo(y, 9);
					expect(isNode(band.facets[0].path, band.tagAnchorPoint)).toBe(true);
					pointsOutOfStart(band);
				}
			}
		);

		it('at a split, the later piece anchors on its remaining bottom tab', () => {
			const subunits = generateSimpleHexSubunits(1);
			const piece = (p: number): BandCutPattern =>
				({
					...cutBand(0, 4),
					address: { globule: 0, tube: 0, band: 0, piece: p },
					facets: quads(4, 0)
						.slice(2 * p, 2 * p + 2)
						.map((q, i) => ({
							path: transformPatternByQuad(subunits[i % 2], q),
							quad: q,
							label: `${i}`
						}))
				}) as BandCutPattern;
			const [, later] = adjustSimpleHexAfterTiling([piece(0), piece(1)], config());
			expect(isNode(later.facets[0].path, later.tagAnchorPoint)).toBe(true);
			expect(later.tagAnchorPoint.y).toBeCloseTo(2, 9);
			pointsOutOfStart(later);
		});

		it('an extending start anchors at its extension’s lowest node, pointing out', () => {
			// Tube 0's band 0 starts where tube 1's band 0 ends. (tube 0, band 0, start)
			// sorts first, so tube 0's start extends and tube 1's end drops its spur.
			const a = {
				...cutBand(0, 4),
				meta: { startPartnerBand: { globule: 0, tube: 1, band: 0 } }
			} as BandCutPattern;
			const below = quads(4, 0).map((q) => {
				const m = (v: Vector3) => new Vector3(v.x, v.y - 4, 0);
				return { a: m(q.a), b: m(q.b), c: m(q.c), d: m(q.d) };
			});
			const b = {
				...cutBand(0, 4, undefined, 1, below),
				address: { globule: 0, tube: 1, band: 0 },
				meta: { endPartnerBand: { globule: 0, tube: 0, band: 0 } }
			} as BandCutPattern;
			const tubes = [{ bands: [a] }, { bands: [b] }] as unknown as TubeCutPattern[];
			const [adjusted] = adjustSimpleHexAfterTiling(
				[a],
				config(1, { endTermination: 'extended' }),
				tubes
			);
			// The extension's (3,3) is grid (3,1) of subunit 1 in the quad below: (1/2, −1).
			expect(adjusted.tagAnchorPoint.x).toBeCloseTo(0.5, 9);
			expect(adjusted.tagAnchorPoint.y).toBeCloseTo(-1, 9);
			expect(isNode(adjusted.facets[0].path, adjusted.tagAnchorPoint)).toBe(true);
			pointsOutOfStart(adjusted);
		});

		it('does not mutate the input band', () => {
			const band = cutBand(0, 4);
			const before = structuredClone(band.tagAnchorPoint);
			adjustSimpleHexAfterTiling([band], config());
			expect(band.tagAnchorPoint).toEqual(before);
		});
	});

	it('defaults to keeping the partner seam', () => {
		expect(tiledPatternConfigs['tiledSimpleHexPattern-0'].config.keepPartnerSeam).toBe(true);
	});

	it('returns refused bands unchanged', () => {
		const refused = { ...cutBand(0, 2), error: 'refused' } as BandCutPattern;
		expect(adjustSimpleHexAfterTiling([refused], config())[0]).toEqual(refused);
	});
});
