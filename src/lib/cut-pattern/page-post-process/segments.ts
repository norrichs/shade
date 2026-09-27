import type { Pt } from '../post-process-types';

export type Seg = { a: Pt; b: Pt };

export const isFinitePt = (p: Pt): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

export const segmentsOf = (polylines: Pt[][]): Seg[] =>
	polylines.flatMap((run) => run.slice(1).map((b, i) => ({ a: run[i], b })));

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/** Distance along `dir` from `origin` to segment `s` (in units of |dir|), or null. */
export const raySegment = (origin: Pt, dir: Pt, s: Seg): number | null => {
	const ex = s.b.x - s.a.x;
	const ey = s.b.y - s.a.y;
	const den = cross(dir.x, dir.y, ex, ey);
	if (Math.abs(den) < 1e-12) return null;
	const wx = s.a.x - origin.x;
	const wy = s.a.y - origin.y;
	const t = cross(wx, wy, ex, ey) / den;
	const u = cross(wx, wy, dir.x, dir.y) / den;
	if (t < 0 || u < 0 || u > 1) return null;
	return t;
};

export const segmentsIntersect = (p: Seg, q: Seg): boolean => {
	const o = (a: Pt, b: Pt, c: Pt) => Math.sign(cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y));
	return o(p.a, p.b, q.a) !== o(p.a, p.b, q.b) && o(q.a, q.b, p.a) !== o(q.a, q.b, p.b);
};

export const rotate = (v: Pt, deg: number): Pt => {
	const r = (deg * Math.PI) / 180;
	const c = Math.cos(r);
	const s = Math.sin(r);
	return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

export const rectEdges = (r: { x: number; y: number; width: number; height: number }): Seg[] => {
	const p0 = { x: r.x, y: r.y };
	const p1 = { x: r.x + r.width, y: r.y };
	const p2 = { x: r.x + r.width, y: r.y + r.height };
	const p3 = { x: r.x, y: r.y + r.height };
	return [{ a: p0, b: p1 }, { a: p1, b: p2 }, { a: p2, b: p3 }, { a: p3, b: p0 }];
};
