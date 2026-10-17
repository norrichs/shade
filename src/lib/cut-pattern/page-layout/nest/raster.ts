import type { Pt, Raster, Span } from './types';

const EPS = 1e-9;

/** Andrew's monotone chain; returns CCW hull without repeated endpoint. */
export const convexHull = (pts: Pt[]): Pt[] => {
	const p = pts
		.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y))
		.slice()
		.sort((a, b) => a.x - b.x || a.y - b.y);
	if (p.length <= 2) return p;
	const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const lower: Pt[] = [];
	for (const q of p) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= EPS)
			lower.pop();
		lower.push(q);
	}
	const upper: Pt[] = [];
	for (let i = p.length - 1; i >= 0; i--) {
		const q = p[i];
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= EPS)
			upper.pop();
		upper.push(q);
	}
	return lower.slice(0, -1).concat(upper.slice(0, -1));
};

/** Conservative outward offset: hull of r-squares around every vertex (⊇ Minkowski sum with a disk). */
export const inflateConvex = (poly: Pt[], r: number): Pt[] => {
	if (!(r > 0)) return poly;
	return convexHull(
		poly.flatMap((q) => [
			{ x: q.x - r, y: q.y - r },
			{ x: q.x + r, y: q.y - r },
			{ x: q.x + r, y: q.y + r },
			{ x: q.x - r, y: q.y + r }
		])
	);
};

/** Rotate about `pivot` (SVG rotate convention, y down); result is pivot-RELATIVE. */
export const rotateAbout = (pts: Pt[], deg: number, pivot: Pt): Pt[] => {
	const t = (deg * Math.PI) / 180;
	const c = Math.cos(t);
	const s = Math.sin(t);
	return pts.map((p) => {
		const dx = p.x - pivot.x;
		const dy = p.y - pivot.y;
		return { x: dx * c - dy * s, y: dx * s + dy * c };
	});
};

/** x-extent of a convex polygon inside the horizontal slab [y0, y1], or null. */
const slabXRange = (poly: Pt[], y0: number, y1: number): [number, number] | null => {
	let lo = Infinity;
	let hi = -Infinity;
	const take = (x: number) => {
		if (x < lo) lo = x;
		if (x > hi) hi = x;
	};
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i];
		const b = poly[(i + 1) % poly.length];
		if (a.y >= y0 && a.y <= y1) take(a.x);
		for (const yy of [y0, y1]) {
			if ((a.y - yy) * (b.y - yy) < 0) take(a.x + ((yy - a.y) * (b.x - a.x)) / (b.y - a.y));
		}
	}
	return lo <= hi ? [lo, hi] : null;
};

const mergeSpans = (spans: Span[]): Span[] => {
	if (spans.length <= 1) return spans.slice();
	const s = spans.slice().sort((a, b) => a[0] - b[0]);
	const out: Span[] = [[s[0][0], s[0][1]]];
	for (let i = 1; i < s.length; i++) {
		const last = out[out.length - 1];
		if (s[i][0] <= last[1]) last[1] = Math.max(last[1], s[i][1]);
		else out.push([s[i][0], s[i][1]]);
	}
	return out;
};

/** Total set-cell count of a raster's rows. */
export const areaOf = (rows: Span[][]) =>
	rows.reduce((n, row) => n + row.reduce((m, [a, b]) => m + b - a, 0), 0);

/** Conservative scan conversion: a cell is set if any polygon touches it. */
export const rasterizeConvex = (polys: Pt[][], cell: number): Raster => {
	const valid = polys.filter(
		(p) => p.length > 0 && p.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))
	);
	if (valid.length === 0) return { w: 0, h: 0, rows: [], ox: 0, oy: 0, area: 0 };
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const p of valid)
		for (const q of p) {
			minX = Math.min(minX, q.x);
			maxX = Math.max(maxX, q.x);
			minY = Math.min(minY, q.y);
			maxY = Math.max(maxY, q.y);
		}
	const ox = Math.floor(minX / cell);
	const oy = Math.floor(minY / cell);
	const w = Math.max(1, Math.ceil(maxX / cell) - ox);
	const h = Math.max(1, Math.ceil(maxY / cell) - oy);
	const rows: Span[][] = Array.from({ length: h }, () => []);
	for (const p of valid) {
		let pMinY = Infinity,
			pMaxY = -Infinity;
		for (const q of p) {
			pMinY = Math.min(pMinY, q.y);
			pMaxY = Math.max(pMaxY, q.y);
		}
		const r0 = Math.max(0, Math.floor(pMinY / cell) - oy);
		const r1 = Math.min(h - 1, Math.max(r0, Math.ceil(pMaxY / cell) - oy - 1));
		for (let r = r0; r <= r1; r++) {
			const y0 = (r + oy) * cell;
			const xr = slabXRange(p, y0, y0 + cell);
			if (!xr) continue;
			const c0 = Math.max(0, Math.floor(xr[0] / cell) - ox);
			let c1 = Math.min(w, Math.ceil(xr[1] / cell) - ox);
			if (c1 <= c0) c1 = Math.min(w, c0 + 1);
			rows[r].push([c0, c1]);
		}
	}
	const merged = rows.map(mergeSpans);
	return { w, h, rows: merged, ox, oy, area: areaOf(merged) };
};

/**
 * Disk dilation by k cells; offsets shift by −k so the frame stays put. Keeps `area`.
 * An empty raster (h = 0) is returned unchanged, so "no geometry" stays detectable.
 */
export const dilateRaster = (r: Raster, k: number): Raster => {
	if (k <= 0 || r.h === 0) return r;
	const h = r.h + 2 * k;
	const rows: Span[][] = Array.from({ length: h }, () => []);
	const half = Array.from({ length: 2 * k + 1 }, (_, i) =>
		Math.floor(Math.sqrt(k * k - (i - k) * (i - k)))
	);
	r.rows.forEach((row, y) => {
		for (const [a, b] of row) {
			for (let dy = -k; dy <= k; dy++) {
				const hw = half[dy + k];
				rows[y + dy + k].push([a - hw + k, b + hw + k]);
			}
		}
	});
	return {
		w: r.w + 2 * k,
		h,
		rows: rows.map(mergeSpans),
		ox: r.ox - k,
		oy: r.oy - k,
		area: r.area
	};
};

/** Coarse raster for placement at fine x/y that are multiples of c. */
export const coarsenRaster = (r: Raster, c: number): Raster => {
	const h = Math.ceil(r.h / c);
	const rows: Span[][] = Array.from({ length: h }, () => []);
	r.rows.forEach((row, y) => {
		for (const [a, b] of row) rows[Math.floor(y / c)].push([Math.floor(a / c), Math.ceil(b / c)]);
	});
	const merged = rows.map(mergeSpans);
	return { w: Math.ceil(r.w / c), h, rows: merged, ox: 0, oy: 0, area: areaOf(merged) };
};

export const nestAngles = (step: number): number[] => {
	if (!(step > 0) || step >= 360) return [0];
	const out: number[] = [];
	for (let k = 0; k * step < 360 - 1e-9; k++) out.push(k * step);
	return out;
};
