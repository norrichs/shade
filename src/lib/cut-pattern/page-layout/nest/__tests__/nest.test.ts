import { nestPageLayout, type NestGeom } from '../nest';
import { skylinePageLayout } from '../../skyline';
import { chevron, rect } from './fixtures';
import type { NestShape, Pt } from '../types';
import type { PageLayoutResult } from '../../types';

const geom = (over: Partial<NestGeom> = {}): NestGeom => ({
	pageScale: 1,
	pageWidth: 300,
	pageHeight: 300,
	contentWidth: 300,
	contentHeight: 300,
	marginPx: 0,
	pageGap: 50,
	gap: 4,
	reorderWindow: 8,
	allowRotation: false,
	rotationStep: 15,
	cellMm: 1,
	...over
});

const placed = (s: NestShape, r: PageLayoutResult, i: number): Pt[][] => {
	const t = (r.rotations[i] * Math.PI) / 180;
	const o = r.origins[i];
	return s.polygons.map((poly) =>
		poly.map((p) => {
			const dx = p.x - s.pivot.x;
			const dy = p.y - s.pivot.y;
			return {
				x: o.x + s.pivot.x + dx * Math.cos(t) - dy * Math.sin(t),
				y: o.y + s.pivot.y + dx * Math.sin(t) + dy * Math.cos(t)
			};
		})
	);
};

// Exact distance between convex polygons (0 if they intersect).
const segDist = (p: Pt, a: Pt, b: Pt) => {
	const vx = b.x - a.x,
		vy = b.y - a.y;
	const L = vx * vx + vy * vy;
	const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L)) : 0;
	return Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy);
};
const overlaps = (A: Pt[], B: Pt[]) => {
	for (const P of [A, B])
		for (let i = 0; i < P.length; i++) {
			const a = P[i],
				b = P[(i + 1) % P.length];
			const nx = -(b.y - a.y),
				ny = b.x - a.x;
			const pa = A.map((q) => q.x * nx + q.y * ny),
				pb = B.map((q) => q.x * nx + q.y * ny);
			if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
		}
	return true;
};
const polyDist = (A: Pt[], B: Pt[]) => {
	if (overlaps(A, B)) return 0;
	let d = Infinity;
	for (const [P, Q] of [
		[A, B],
		[B, A]
	])
		for (const p of P)
			for (let i = 0; i < Q.length; i++) d = Math.min(d, segDist(p, Q[i], Q[(i + 1) % Q.length]));
	return d;
};

const assertValid = (shapes: NestShape[], r: PageLayoutResult, g: NestGeom) => {
	const all = shapes.map((s, i) => placed(s, r, i));
	const cell = 1;
	shapes.forEach((_, i) => {
		const page = r.pages.findIndex((pg) =>
			all[i].flat().every((p) => p.y >= pg.y - cell && p.y <= pg.y + pg.height + cell)
		);
		expect(page).toBeGreaterThanOrEqual(0);
		const pg = r.pages[page];
		for (const p of all[i].flat()) {
			expect(p.x).toBeGreaterThanOrEqual(pg.x + g.marginPx - cell - 1e-6);
			expect(p.x).toBeLessThanOrEqual(pg.x + g.marginPx + g.contentWidth + cell + 1e-6);
			expect(p.y).toBeGreaterThanOrEqual(pg.y + g.marginPx - cell - 1e-6);
			expect(p.y).toBeLessThanOrEqual(pg.y + g.marginPx + g.contentHeight + cell + 1e-6);
		}
	});
	for (let i = 0; i < all.length; i++)
		for (let j = i + 1; j < all.length; j++)
			for (const A of all[i])
				for (const B of all[j]) expect(polyDist(A, B)).toBeGreaterThanOrEqual(g.gap - 1e-6);
};

const perPage = (r: PageLayoutResult) =>
	r.origins.filter((o) => o.y < r.pages[0].y + r.pages[0].height).length;

describe('nestPageLayout', () => {
	it('zero shapes → one empty page', () => {
		const r = nestPageLayout([], geom());
		expect(r.pages).toHaveLength(1);
		expect(r.utilisation).toEqual([0]);
	});

	it('places one rect at the content origin', () => {
		const r = nestPageLayout([rect(50, 20)], geom({ rotationStep: 0, gap: 0 }));
		expect(r.rotations[0]).toBe(0);
		// rect pivot (25,10) lands so the rect's top-left is within one cell of (0,0)
		expect(Math.abs(r.origins[0].x)).toBeLessThanOrEqual(1.0001);
		expect(Math.abs(r.origins[0].y)).toBeLessThanOrEqual(1.0001);
	});

	it('never overlaps and keeps gap clearance (chevrons, 15° steps)', () => {
		const shapes = Array.from({ length: 12 }, () => chevron());
		const g = geom();
		const r = nestPageLayout(shapes, g);
		assertValid(shapes, r, g);
	});

	it('respects margins', () => {
		const shapes = Array.from({ length: 6 }, () => rect(60, 30));
		const g = geom({ pageWidth: 320, pageHeight: 320, marginPx: 10 });
		assertValid(shapes, nestPageLayout(shapes, g), g);
	});

	it('only uses multiples of the rotation step', () => {
		const r = nestPageLayout(
			Array.from({ length: 8 }, () => chevron()),
			geom({ rotationStep: 25 })
		);
		for (const a of r.rotations) expect(a % 25).toBe(0);
		const r0 = nestPageLayout(
			Array.from({ length: 4 }, () => chevron()),
			geom({ rotationStep: 0 })
		);
		expect(r0.rotations.every((a) => a === 0)).toBe(true);
	});

	it('packs chevrons at least 1.5× denser than skyline with rotation', () => {
		const n = 30;
		const shapes = Array.from({ length: n }, () => chevron());
		const g = geom();
		const nest = nestPageLayout(shapes, g);
		const xs = shapes[0].polygons.flat().map((p) => p.x);
		const ys = shapes[0].polygons.flat().map((p) => p.y);
		const box = {
			width: Math.max(...xs) - Math.min(...xs),
			height: Math.max(...ys) - Math.min(...ys),
			left: Math.min(...xs),
			top: Math.min(...ys),
			alignedYOffset: 0
		};
		const sky = skylinePageLayout(
			Array.from({ length: n }, () => box),
			{ ...g, allowRotation: true }
		);
		expect(perPage(nest)).toBeGreaterThanOrEqual(Math.ceil(1.5 * perPage(sky)));
	});

	it('overflow: an item larger than the page at every angle', () => {
		const g = geom({ rotationStep: 90 });
		const r = nestPageLayout([rect(50, 50), rect(600, 400)], g);
		expect(r.overflow?.itemIndex).toBe(1);
		const f = (r.overflow?.requiredScale ?? 0) / g.pageScale;
		expect(f).toBeCloseTo(2, 5); // 600/300 at 0°, min over 0/90
	});

	it('is deterministic', () => {
		const shapes = Array.from({ length: 10 }, (_, i) => (i % 2 ? chevron() : rect(40, 15)));
		const a = nestPageLayout(shapes, geom());
		const b = nestPageLayout(shapes, geom());
		expect(a.origins.map((o) => [o.x, o.y])).toEqual(b.origins.map((o) => [o.x, o.y]));
		expect(a.rotations).toEqual(b.rotations);
	});

	it('spills to a second page when the first is full', () => {
		const r = nestPageLayout(
			Array.from({ length: 6 }, () => rect(140, 140)),
			geom({ rotationStep: 0 })
		);
		expect(r.pages.length).toBeGreaterThanOrEqual(2);
		expect(r.utilisation!.length).toBe(r.pages.length);
	});

	it('handles shapes with no polygons', () => {
		const r = nestPageLayout([{ polygons: [], pivot: { x: 0, y: 0 } }, rect(10, 10)], geom());
		expect(r.origins).toHaveLength(2);
	});

	// gap 4 → k = 3; W = H = 306. rect(300,40) dilates to 306×46: it fits the fine grid
	// exactly but never passes coarse (306 → 76 usable coarse blocks = 304 cells).
	it('a single content-width rect produces one page with utilisation[0] > 0', () => {
		const shapes = [rect(300, 40)];
		const g = geom({ rotationStep: 0 });
		const r = nestPageLayout(shapes, g);
		expect(r.pages).toHaveLength(1);
		expect(r.utilisation![0]).toBeGreaterThan(0);
		assertValid(shapes, r, g);
	});

	// Each dilates to 46×306 (full height); side by side they need 92 ≤ 306 columns.
	it('two rect(40,300) on a 300×300 page share one page', () => {
		const shapes = [rect(40, 300), rect(40, 300)];
		const g = geom({ rotationStep: 0 });
		const r = nestPageLayout(shapes, g);
		expect(r.pages).toHaveLength(1);
		assertValid(shapes, r, g);
	});

	// Square at [0.5, 300.5] with pivot (0,0): bbox 300 passes the overflow check,
	// but it covers 301 cells → dilated 307 > W = 306, so it cannot fit an empty grid.
	it('falls back to (0,0) without throwing when a raster cannot fit an empty grid', () => {
		const sq: NestShape = {
			polygons: [
				[
					{ x: 0.5, y: 0.5 },
					{ x: 300.5, y: 0.5 },
					{ x: 300.5, y: 300.5 },
					{ x: 0.5, y: 300.5 }
				]
			],
			pivot: { x: 0, y: 0 }
		};
		const r = nestPageLayout([sq], geom({ rotationStep: 0 }));
		expect(r.overflow).toBeUndefined();
		expect(r.pages).toHaveLength(1);
		expect(r.origins[0].x).toBeCloseTo(0, 9);
		expect(r.origins[0].y).toBeCloseTo(0, 9);
		expect(r.utilisation![0]).toBeLessThanOrEqual(1);
	});

	it('30 chevrons at 15° finish in under 2 s', () => {
		const t0 = Date.now();
		nestPageLayout(
			Array.from({ length: 30 }, () => chevron()),
			geom()
		);
		expect(Date.now() - t0).toBeLessThan(2000);
	});
});
