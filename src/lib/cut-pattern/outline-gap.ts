import type { PathSegment } from '$lib/types';
import type { BandEnds, Pt, TaggedPath } from './post-process-types';

type Quad4 = [Pt, Pt, Pt, Pt];
type Line = { kind: 'L'; p0: Pt; p1: Pt; len: number };
type Cubic = { kind: 'C'; q: Quad4; len: number; lut: number[] };
type Edge = Line | Cubic;

const LUT_N = 64;
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

const cubicAt = ([p0, c1, c2, p1]: Quad4, t: number): Pt => {
	const u = 1 - t;
	return {
		x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
		y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y
	};
};

/** de Casteljau split at t. */
const splitCubic = (q: Quad4, t: number): [Quad4, Quad4] => {
	const [p0, c1, c2, p1] = q;
	const a = lerp(p0, c1, t);
	const b = lerp(c1, c2, t);
	const c = lerp(c2, p1, t);
	const d = lerp(a, b, t);
	const e = lerp(b, c, t);
	const f = lerp(d, e, t);
	return [[p0, a, d, f], [f, e, c, p1]];
};

/** The part of a cubic between t0 and t1, exactly. */
const subCubic = (q: Quad4, t0: number, t1: number): Quad4 => {
	if (t1 <= 0) return [q[0], q[0], q[0], q[0]];
	const [left] = splitCubic(q, t1);
	return splitCubic(left, t0 / t1)[1];
};

const cubicEdge = (q: Quad4): Cubic => {
	const lut = [0];
	let prev = q[0];
	for (let i = 1; i <= LUT_N; i += 1) {
		const p = cubicAt(q, i / LUT_N);
		lut.push(lut[i - 1] + dist(prev, p));
		prev = p;
	}
	return { kind: 'C', q, len: lut[LUT_N], lut };
};

/** t at arc length s along a cubic, from the sampled table. */
const tAt = (e: Cubic, s: number): number => {
	if (s <= 0) return 0;
	if (s >= e.len) return 1;
	let i = 1;
	while (e.lut[i] < s) i += 1;
	const f = (s - e.lut[i - 1]) / (e.lut[i] - e.lut[i - 1] || 1);
	return (i - 1 + f) / LUT_N;
};

/** Arc length at t along a cubic, from the sampled table. */
const sAt = (e: Cubic, t: number): number => {
	const x = t * LUT_N;
	const i = Math.min(LUT_N - 1, Math.floor(x));
	return e.lut[i] + (e.lut[i + 1] - e.lut[i]) * (x - i);
};

/** Edges of a single closed `M … Z` run, or null for anything else. */
const edgesOf = (segs: PathSegment[]): Edge[] | null => {
	if (segs.length < 2 || segs[0][0] !== 'M') return null;
	if (segs.slice(1).some((s) => s[0] === 'M')) return null;
	if (segs[segs.length - 1][0] !== 'Z') return null;
	const start = { x: segs[0][1] as number, y: segs[0][2] as number };
	let cur = start;
	const edges: Edge[] = [];
	for (const s of segs.slice(1)) {
		if (s[0] === 'L' || s[0] === 'A') {
			// Merged paths contain no arcs; treat one as its chord rather than fail.
			const p1 = s[0] === 'L' ? { x: s[1], y: s[2] } : { x: s[6], y: s[7] };
			edges.push({ kind: 'L', p0: cur, p1, len: dist(cur, p1) });
			cur = p1;
		} else if (s[0] === 'C') {
			const p1 = { x: s[5], y: s[6] };
			edges.push(cubicEdge([cur, { x: s[1], y: s[2] }, { x: s[3], y: s[4] }, p1]));
			cur = p1;
		} else if (s[0] === 'Q') {
			const c = { x: s[1], y: s[2] };
			const p1 = { x: s[3], y: s[4] };
			edges.push(cubicEdge([cur, lerp(cur, c, 2 / 3), lerp(p1, c, 2 / 3), p1]));
			cur = p1;
		} else if (s[0] === 'Z') {
			if (dist(cur, start) > 1e-9) edges.push({ kind: 'L', p0: cur, p1: start, len: dist(cur, start) });
			cur = start;
		}
	}
	return edges.filter((e) => e.len > 1e-12);
};

const cumulative = (edges: Edge[]) => {
	const cum = [0];
	for (const e of edges) cum.push(cum[cum.length - 1] + e.len);
	return cum;
};

const pointAtEdge = (e: Edge, s: number): Pt =>
	e.kind === 'L' ? lerp(e.p0, e.p1, s / e.len) : cubicAt(e.q, tAt(e, s));

const pointAt = (edges: Edge[], cum: number[], s: number): Pt => {
	let i = 0;
	while (i < edges.length - 1 && cum[i + 1] < s) i += 1;
	return pointAtEdge(edges[i], s - cum[i]);
};

/** Arc-length position of the contour point closest to `p`, and its distance. */
const closestArc = (edges: Edge[], cum: number[], p: Pt): { s: number; d: number } => {
	let best = { s: 0, d: Infinity };
	edges.forEach((e, i) => {
		if (e.kind === 'L') {
			const dx = e.p1.x - e.p0.x;
			const dy = e.p1.y - e.p0.y;
			const t = Math.max(0, Math.min(1, ((p.x - e.p0.x) * dx + (p.y - e.p0.y) * dy) / (e.len * e.len)));
			const d = dist(p, lerp(e.p0, e.p1, t));
			if (d < best.d) best = { s: cum[i] + t * e.len, d };
			return;
		}
		let bi = 0;
		let bd = Infinity;
		for (let k = 0; k <= LUT_N; k += 1) {
			const d = dist(p, cubicAt(e.q, k / LUT_N));
			if (d < bd) {
				bd = d;
				bi = k;
			}
		}
		let lo = Math.max(0, (bi - 1) / LUT_N);
		let hi = Math.min(1, (bi + 1) / LUT_N);
		for (let it = 0; it < 40; it += 1) {
			const m1 = lo + (hi - lo) / 3;
			const m2 = hi - (hi - lo) / 3;
			if (dist(p, cubicAt(e.q, m1)) < dist(p, cubicAt(e.q, m2))) hi = m2;
			else lo = m1;
		}
		const t = (lo + hi) / 2;
		const d = dist(p, cubicAt(e.q, t));
		if (d < best.d) best = { s: cum[i] + sAt(e, t), d };
	});
	return best;
};

/** Open path covering arc length [from, to], 0 ≤ from < to ≤ total. */
const slice = (edges: Edge[], cum: number[], from: number, to: number): PathSegment[] => {
	const start = pointAt(edges, cum, from);
	const out: PathSegment[] = [['M', start.x, start.y]];
	edges.forEach((e, i) => {
		const s0 = Math.max(from, cum[i]) - cum[i];
		const s1 = Math.min(to, cum[i + 1]) - cum[i];
		if (s1 - s0 <= 1e-9) return;
		if (e.kind === 'L') {
			const p = pointAtEdge(e, s1);
			out.push(['L', p.x, p.y]);
		} else {
			const [, c1, c2, p1] = subCubic(e.q, tAt(e, s0), tAt(e, s1));
			out.push(['C', c1.x, c1.y, c2.x, c2.y, p1.x, p1.y]);
		}
	});
	return out;
};

/** Like `slice`, but `from` may be anywhere and the span may wrap past the start. */
const sliceCyclic = (edges: Edge[], cum: number[], from: number, span: number): PathSegment[] => {
	const total = cum[cum.length - 1];
	const f = ((from % total) + total) % total;
	if (f + span <= total + 1e-9) return slice(edges, cum, f, Math.min(total, f + span));
	const head = slice(edges, cum, f, total);
	const tail = slice(edges, cum, 0, f + span - total);
	return [...head, ...tail.slice(1)];
};

/**
 * Cut a gap of arc length `gap`, centred on the contour point nearest each of
 * `points`, out of one closed outline piece. The cut-out stretches come back as
 * `outline-gap` pieces; the rest stays `pattern-outline` (now open runs).
 * Overlapping windows merge. If the gaps would total half the contour or more,
 * the piece would be cut loose, so it is returned untouched.
 */
export const insertGaps = (piece: TaggedPath, points: Pt[], gap: number): TaggedPath[] => {
	const edges = edgesOf(piece.segments);
	if (!edges || edges.length === 0 || points.length === 0 || !(gap > 0)) return [piece];
	const cum = cumulative(edges);
	const total = cum[cum.length - 1];
	if (gap >= total / 2) return [piece];

	const windows = points
		.map((p) => closestArc(edges, cum, p).s - gap / 2)
		.map((s) => ({ start: ((s % total) + total) % total, span: gap }))
		.sort((a, b) => a.start - b.start);
	const merged: { start: number; span: number }[] = [];
	for (const w of windows) {
		const last = merged[merged.length - 1];
		if (last && w.start <= last.start + last.span) {
			last.span = Math.max(last.span, w.start + w.span - last.start);
		} else merged.push({ ...w });
	}
	if (merged.length > 1) {
		const first = merged[0];
		const last = merged[merged.length - 1];
		if (last.start + last.span >= first.start + total) {
			last.span = Math.max(last.span, first.start + total + first.span - last.start);
			merged.shift();
		}
	}
	if (merged.reduce((n, w) => n + w.span, 0) >= total / 2) return [piece];

	const outlineSegs: PathSegment[] = [];
	const gaps: TaggedPath[] = [];
	merged.forEach((w, k) => {
		gaps.push({
			geometry: 'outline-gap',
			segments: sliceCyclic(edges, cum, w.start, w.span),
			contour: piece.contour
		});
		const next = merged[(k + 1) % merged.length];
		const restStart = w.start + w.span;
		const restEnd = k + 1 < merged.length ? next.start : next.start + total;
		if (restEnd - restStart > 1e-9) outlineSegs.push(...sliceCyclic(edges, cum, restStart, restEnd - restStart));
	});
	return [{ geometry: 'pattern-outline', segments: outlineSegs, contour: piece.contour }, ...gaps];
};

/** Distance from `p` to a closed outline piece, or Infinity when it is not one. */
const distanceTo = (piece: TaggedPath, p: Pt): number => {
	const edges = edgesOf(piece.segments);
	if (!edges || edges.length === 0) return Infinity;
	return closestArc(edges, cumulative(edges), p).d;
};

/** Connect surround: one gap per band end, in whichever outline piece the end lies on. */
export const applyConnectSurround = (pieces: TaggedPath[], ends: BandEnds, gap: number): TaggedPath[] => {
	const assigned = new Map<number, Pt[]>();
	for (const end of [ends.start, ends.end]) {
		let bestI = -1;
		let bestD = Infinity;
		pieces.forEach((piece, i) => {
			if (piece.geometry !== 'pattern-outline') return;
			const d = distanceTo(piece, end.point);
			if (d < bestD) {
				bestD = d;
				bestI = i;
			}
		});
		if (bestI >= 0) assigned.set(bestI, [...(assigned.get(bestI) ?? []), end.point]);
	}
	return pieces.flatMap((piece, i) =>
		assigned.has(i) ? insertGaps(piece, assigned.get(i)!, gap) : [piece]
	);
};
