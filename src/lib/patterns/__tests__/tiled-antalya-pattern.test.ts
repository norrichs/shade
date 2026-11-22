import { Vector3 } from 'three';
import type { BandCutPattern, PathSegment, Quadrilateral, TiledPatternConfig } from '#lib/types.js';
import { transformPatternByQuad } from '../quadrilateral';
import {
	adjustAntalyaAfterTiling,
	antalyaBandSegments,
	antalyaKindOf,
	generateAntalyaPreview,
	generateAntalyaSubunits,
	type AntalyaBandLayout
} from '../tiled-antalya-pattern';
import { tiledPatternConfigs } from '#lib/shades-config.js';

const config = (
	columnCount = 1,
	overrides: Partial<TiledPatternConfig['config']> = {}
): TiledPatternConfig => ({
	type: 'tiledAntalyaPattern-0',
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
		keepPartnerSeam: true,
		...overrides
	}
});

// Unit-square quads stacked along +y; band b of a tube sits at x0 = b * width.
const quads = (count: number, x0: number, width = 1): Quadrilateral[] =>
	Array.from({ length: count }, (_, i) => ({
		a: new Vector3(x0, i, 0),
		b: new Vector3(x0 + width, i, 0),
		c: new Vector3(x0 + width, i + 1, 0),
		d: new Vector3(x0, i + 1, 0)
	}));

const cutBand = (
	band: number,
	quadCount: number,
	leftPartnerBand?: number,
	columns = 1,
	width = 1
): BandCutPattern => {
	const subunits = generateAntalyaSubunits(columns);
	return {
		id: `b${band}`,
		projectionType: 'patterned',
		tagAnchorPoint: { x: 0, y: 0 },
		address: { globule: 0, tube: 0, band },
		leftPartnerBand,
		facets: quads(quadCount, band, width).map((q, i) => ({
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

type Step = string;
/**
 * A line in lattice units (x in eighths of a column, y in quarters of a quad)
 * broken into unit steps; `wrap` folds x around the tube.
 */
const steps = (
	[x0, y0, x1, y1]: [number, number, number, number],
	columns: number,
	wrap?: number
): Step[] => {
	const X0 = Math.round(x0 * 8 * columns);
	const Y0 = Math.round(y0 * 4);
	const X1 = Math.round(x1 * 8 * columns);
	const Y1 = Math.round(y1 * 4);
	const n = Math.max(Math.abs(X1 - X0), Math.abs(Y1 - Y0));
	const fold = (x: number) => (wrap ? ((x % wrap) + wrap) % wrap : x);
	const out: Step[] = [];
	for (let i = 0; i < n; i++) {
		const a = [X0 + ((X1 - X0) * i) / n, Y0 + ((Y1 - Y0) * i) / n];
		const b = [X0 + ((X1 - X0) * (i + 1)) / n, Y0 + ((Y1 - Y0) * (i + 1)) / n];
		const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? [a, b] : [b, a];
		const shift = fold(p[0]) - p[0];
		out.push(`${p[0] + shift},${p[1]}>${q[0] + shift},${q[1]}`);
	}
	return out;
};

const pathLines = (path: PathSegment[]) => {
	const out: [number, number, number, number][] = [];
	for (let i = 0; i < path.length; i += 2) {
		const [, x0, y0] = path[i] as ['M', number, number];
		const [, x1, y1] = path[i + 1] as ['L', number, number];
		out.push([x0, y0, x1, y1]);
	}
	return out;
};

const count = (all: Step[]) => {
	const m = new Map<Step, number>();
	for (const s of all) m.set(s, (m.get(s) ?? 0) + 1);
	return m;
};

/** Lattice-level steps of a band, split into A's outline (`side`) and everything else. */
const latticeSteps = (layout: AntalyaBandLayout, wrap?: number) => {
	const side: Step[] = [];
	const rest: Step[] = [];
	const straight: Step[] = [];
	antalyaBandSegments(layout).forEach((segs) =>
		segs.forEach(({ from, to, tags }) => {
			const line: [number, number, number, number] = [
				layout.band + from.x,
				from.facet + from.y,
				layout.band + to.x,
				to.facet + to.y
			];
			const s = steps(line, layout.columns, wrap);
			const t = tags as string[];
			if (t.includes('sideL') || t.includes('sideR')) side.push(...s);
			else if (t.includes('straight')) straight.push(...s);
			else rest.push(...s);
		})
	);
	return { side, rest, straight };
};

const layout = (band: number, extra: Partial<AntalyaBandLayout> = {}): AntalyaBandLayout => ({
	band,
	columns: 1,
	parentQuadOffset: 0,
	facetCount: 8,
	leftStraight: false,
	rightStraight: false,
	...extra
});

describe('Antalya unit assignment', () => {
	it('alternates A and B along a band, offset by one unit per band', () => {
		const row = (band: number) => [0, 2, 4, 6].map((f) => antalyaKindOf(band, f)).join('');
		expect(row(0)).toBe('ABAB');
		expect(row(1)).toBe('BABA');
		expect(row(2)).toBe('ABAB');
		expect(row(3)).toBe('BABA');
	});

	it('pairs both quads of a unit', () => {
		expect(antalyaKindOf(0, 0)).toBe(antalyaKindOf(0, 1));
		expect(antalyaKindOf(0, 2)).toBe(antalyaKindOf(0, 3));
	});

	it('gives the stacked preview and two in-quad subunits', () => {
		const preview = generateAntalyaPreview(1);
		expect(preview.length).toBeGreaterThan(0);
		for (const s of preview) {
			const [, x, y] = s as ['M' | 'L', number, number];
			expect(x).toBeGreaterThanOrEqual(0);
			expect(x).toBeLessThanOrEqual(1);
			expect(y).toBeGreaterThanOrEqual(0);
			expect(y).toBeLessThanOrEqual(1);
		}
		expect(generateAntalyaSubunits(2)).toHaveLength(2);
	});

	it('defaults to keepPartnerSeam', () => {
		expect(tiledPatternConfigs['tiledAntalyaPattern-0'].config.keepPartnerSeam).toBe(true);
	});
});

describe('Antalya tiling, lattice level', () => {
	it.each([1, 2])(
		'draws every line exactly once around a wrapping tube; A sides retrace B sides (%i columns)',
		(columns) => {
			const bandCount = 4;
			const wrap = bandCount * 8 * columns;
			const side: Step[] = [];
			const rest: Step[] = [];
			for (let b = 0; b < bandCount; b++) {
				const l = latticeSteps(layout(b, { columns }), wrap);
				side.push(...l.side);
				rest.push(...l.rest);
			}
			const counts = count(rest);
			const twice = [...counts].filter(([, n]) => n !== 1);
			expect(twice).toEqual([]);
			const restSet = new Set(rest);
			expect(side.filter((s) => !restSet.has(s))).toEqual([]);
			// Between columns of one band A's sides are left to B.
			if (columns > 1) {
				const sidesPerBand = latticeSteps(layout(0, { columns }), wrap).side.length;
				const oneColumn = latticeSteps(layout(0), 8).side.length;
				expect(sidesPerBand).toBe(oneColumn);
			}
		}
	);

	it('caps B at the band ends and A closes on its own lines', () => {
		// Band 0 (8 quads): A B A B, so B1 is the last quad and gets the cap above.
		const segs = antalyaBandSegments(layout(0));
		const capped = segs.flatMap((s, f) => s.filter((x) => x.to.y > 1 || x.from.y > 1).map(() => f));
		expect(new Set(capped)).toEqual(new Set([7]));
		expect(segs[7].some((s) => s.from.facet === 7 && s.from.y === 1.25)).toBe(true);
		// Band 1 starts with B2: capped below.
		const segs1 = antalyaBandSegments(layout(1));
		expect(segs1[0].some((s) => s.from.y < 0 || s.to.y < 0)).toBe(true);
		expect(segs[0].some((s) => s.from.y < 0 || s.to.y < 0)).toBe(false);
	});

	it('starts a split piece on the unit its parent quad offset gives', () => {
		const piece = antalyaBandSegments(layout(0, { parentQuadOffset: 2, facetCount: 4 }));
		// Parent quads 2..5 of band 0 are B, A: the piece starts on B2, capped below.
		expect(piece[0].some((s) => s.from.y < 0 || s.to.y < 0)).toBe(true);
	});

	it('draws a straight seam between same-parity neighbours', () => {
		const a = latticeSteps(layout(0, { leftStraight: true }));
		const z = latticeSteps(layout(2, { rightStraight: true }));
		// Nothing reaches across the seam (x = 0 of band 0, x = 3 of band 2).
		const xs = (all: Step[]) =>
			all.flatMap((s) => s.split('>').map((p) => Number(p.split(',')[0])));
		expect(Math.min(...xs([...a.rest, ...a.side]))).toBeGreaterThanOrEqual(0);
		expect(Math.max(...xs([...z.rest, ...z.side]))).toBeLessThanOrEqual(24);
		// The edge is drawn full length on both sides.
		expect(a.straight).toHaveLength(32);
		expect(z.straight).toHaveLength(32);
		// B's horizontals run out to the edge: B2 of band 0 (facet 2) at its row 1.
		expect(a.rest).toContain('0,11>1,11');
	});
});

describe('adjustAntalyaAfterTiling', () => {
	const allSteps = (bands: BandCutPattern[], columns: number, wrap?: number) =>
		bands.flatMap((band) =>
			band.facets.flatMap((f) => pathLines(f.path).flatMap((l) => steps(l, columns, wrap)))
		);

	it.each([1, 2])('maps the lattice exactly on rectangular quads (%i columns)', (columns) => {
		const bandCount = 4;
		const wrap = bandCount * 8 * columns;
		const out = adjustAntalyaAfterTiling(wrappingTube(bandCount, 8, columns), config(columns));
		const expected: Step[] = [];
		for (let b = 0; b < bandCount; b++) {
			const l = latticeSteps(layout(b, { columns }), wrap);
			expected.push(...l.rest, ...l.side);
		}
		expect(count(allSteps(out, columns, wrap))).toEqual(count(expected));
		expect(out.every((b) => b.notice === undefined)).toBe(true);
	});

	it('straightens the wrap seam of an odd tube and leaves a notice', () => {
		const out = adjustAntalyaAfterTiling(wrappingTube(3, 8), config());
		expect(out[0].notice).toMatch(/odd number of bands.*bands 2 and 0 is straight/);
		expect(out[2].notice).toBe(out[0].notice);
		expect(out[1].notice).toBeUndefined();
		// Band 0's left edge (x = 0) is drawn, and nothing lies left of it.
		const lines0 = out[0].facets.flatMap((f) => pathLines(f.path));
		expect(Math.min(...lines0.flatMap(([x0, , x1]) => [x0, x1]))).toBeCloseTo(0);
		expect(lines0.some(([x0, y0, x1, y1]) => x0 === 0 && x1 === 0 && Math.abs(y1 - y0) === 1)).toBe(
			true
		);
	});

	it('interlocks an odd tube when its column count makes the total even', () => {
		const out = adjustAntalyaAfterTiling(wrappingTube(3, 8, 2), config(2));
		expect(out.every((b) => b.notice === undefined)).toBe(true);
	});

	it('extrapolates the outline on open sides', () => {
		const out = adjustAntalyaAfterTiling(openTube(2, 8), config());
		const xs = out[0].facets.flatMap((f) => pathLines(f.path).flatMap(([x0, , x1]) => [x0, x1]));
		// Band 0 starts with A, whose side lies one column left of the band.
		expect(Math.min(...xs)).toBeCloseTo(-1 / 8);
		expect(out[0].notice).toBeUndefined();
	});

	it("maps A's side through the partner's quad with keepPartnerSeam, else extrapolates", () => {
		// Band 1 starts with B; band 2 starts with A beside it. The left partner is twice as wide.
		const wide = cutBand(1, 8, undefined, 1, 2);
		const own = { ...cutBand(2, 8, 1), facets: cutBand(2, 8, 1).facets.map((f) => f) };
		own.facets = quads(8, 3).map((q, i) => ({ ...own.facets[i], quad: q }));
		own.address = { ...own.address, band: 2 };
		const minX = (keep: boolean) => {
			const [, adjusted] = adjustAntalyaAfterTiling(
				[wide, own],
				config(1, { keepPartnerSeam: keep })
			);
			return Math.min(...adjusted.facets[0].path.map((s) => (s as ['M' | 'L', number, number])[1]));
		};
		expect(minX(true)).toBeCloseTo(3 - 2 / 8);
		expect(minX(false)).toBeCloseTo(3 - 1 / 8);
	});

	it("anchors the label on the line closing the band's start, not the quad edge", () => {
		const [a, b] = adjustAntalyaAfterTiling(wrappingTube(4, 8), config());
		// Band 0 starts with A: the middle of A2's bottom bar, inside the quad.
		expect(a.tagAnchorPoint.x).toBeCloseTo(0.5);
		expect(a.tagAnchorPoint.y).toBeCloseTo(0.25);
		// Band 1 starts with B: the middle of its cap, past the quad edge.
		expect(b.tagAnchorPoint.x).toBeCloseTo(1.5);
		expect(b.tagAnchorPoint.y).toBeCloseTo(-0.25);
		for (const band of [a, b]) {
			const { x, y } = band.tagAnchorPoint;
			const onLine = pathLines(band.facets[0].path).some(
				([x0, y0, x1, y1]) =>
					Math.abs(y0 - y) < 1e-9 &&
					Math.abs(y1 - y) < 1e-9 &&
					Math.min(x0, x1) < x &&
					x < Math.max(x0, x1)
			);
			expect(onLine).toBe(true);
			expect(band.tagAnchorAutoAngle).toBeDefined();
		}
	});

	it('leaves refused bands untouched', () => {
		const refused = { ...cutBand(0, 3), facets: [], error: 'nope' } as BandCutPattern;
		expect(adjustAntalyaAfterTiling([refused], config())[0]).toBe(refused);
	});

	it('does not mutate its input', () => {
		const tube = wrappingTube(3, 8);
		const before = JSON.stringify(tube);
		adjustAntalyaAfterTiling(tube, config());
		expect(JSON.stringify(tube)).toBe(before);
	});
});
