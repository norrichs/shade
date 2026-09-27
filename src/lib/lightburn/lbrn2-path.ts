import type { PathSegment } from '$lib/types';

type Pt = { x: number; y: number };

export const fmt = (n: number): string => {
	const r = Math.round(n * 1e6) / 1e6;
	return r === 0 ? '0' : String(r);
};

/** SVG endpoint arc → cubic Béziers of at most 90° each (centre parameterisation). */
const arcToCubics = (
	p0: Pt,
	rxIn: number,
	ryIn: number,
	phiDeg: number,
	largeArc: boolean,
	sweep: boolean,
	p1: Pt
): PathSegment[] => {
	if (p0.x === p1.x && p0.y === p1.y) return [];
	if (rxIn === 0 || ryIn === 0) return [['L', p1.x, p1.y]];
	let rx = Math.abs(rxIn);
	let ry = Math.abs(ryIn);
	const phi = (phiDeg * Math.PI) / 180;
	const cos = Math.cos(phi);
	const sin = Math.sin(phi);
	const dx = (p0.x - p1.x) / 2;
	const dy = (p0.y - p1.y) / 2;
	const x1p = cos * dx + sin * dy;
	const y1p = -sin * dx + cos * dy;
	const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
	if (lambda > 1) {
		rx *= Math.sqrt(lambda);
		ry *= Math.sqrt(lambda);
	}
	const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
	const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
	let coef = Math.sqrt(Math.max(0, num / den));
	if (largeArc === sweep) coef = -coef;
	const cxp = (coef * rx * y1p) / ry;
	const cyp = (-coef * ry * x1p) / rx;
	const cx = cos * cxp - sin * cyp + (p0.x + p1.x) / 2;
	const cy = sin * cxp + cos * cyp + (p0.y + p1.y) / 2;
	const ang = (ux: number, uy: number, vx: number, vy: number) =>
		Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
	const theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
	let dtheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
	if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
	else if (sweep && dtheta < 0) dtheta += 2 * Math.PI;
	const n = Math.max(1, Math.ceil(Math.abs(dtheta) / (Math.PI / 2) - 1e-9));
	const delta = dtheta / n;
	const k = (4 / 3) * Math.tan(delta / 4);
	const at = (a: number): Pt => ({
		x: cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin,
		y: cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos
	});
	const deriv = (a: number): Pt => ({
		x: -rx * Math.sin(a) * cos - ry * Math.cos(a) * sin,
		y: -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos
	});
	const out: PathSegment[] = [];
	for (let i = 0; i < n; i += 1) {
		const a0 = theta1 + i * delta;
		const a1 = a0 + delta;
		const s = at(a0);
		const e = i === n - 1 ? p1 : at(a1);
		const d0 = deriv(a0);
		const d1 = deriv(a1);
		out.push(['C', s.x + k * d0.x, s.y + k * d0.y, e.x - k * d1.x, e.y - k * d1.y, e.x, e.y]);
	}
	return out;
};

/** Normalise to M, L, C, Z — the primitives LightBurn's condensed format has. */
export const toCubicSegments = (segs: PathSegment[]): PathSegment[] => {
	const out: PathSegment[] = [];
	let cur: Pt = { x: 0, y: 0 };
	let start: Pt = cur;
	for (const s of segs) {
		switch (s[0]) {
			case 'M':
				cur = start = { x: s[1], y: s[2] };
				out.push(s);
				break;
			case 'L':
				cur = { x: s[1], y: s[2] };
				out.push(s);
				break;
			case 'C':
				cur = { x: s[5], y: s[6] };
				out.push(s);
				break;
			case 'Q': {
				const c = { x: s[1], y: s[2] };
				const p1 = { x: s[3], y: s[4] };
				out.push([
					'C',
					cur.x + (2 / 3) * (c.x - cur.x),
					cur.y + (2 / 3) * (c.y - cur.y),
					p1.x + (2 / 3) * (c.x - p1.x),
					p1.y + (2 / 3) * (c.y - p1.y),
					p1.x,
					p1.y
				]);
				cur = p1;
				break;
			}
			case 'A': {
				const p1 = { x: s[6], y: s[7] };
				out.push(...arcToCubics(cur, s[1], s[2], s[3], s[4] === 1, s[5] === 1, p1));
				cur = p1;
				break;
			}
			case 'Z':
				out.push(s);
				cur = start;
				break;
		}
	}
	return out;
};

type Vertex = { x: number; y: number; c0?: Pt; c1?: Pt };
type Prim = { type: 'L' | 'B'; i: number; j: number };

const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

const encodeRun = (verts: Vertex[], prims: Prim[]) => ({
	vertList: verts
		.map(
			(v) =>
				`V${fmt(v.x)} ${fmt(v.y)}` +
				(v.c0 ? `c0x${fmt(v.c0.x)}c0y${fmt(v.c0.y)}` : 'c0x1') +
				(v.c1 ? `c1x${fmt(v.c1.x)}c1y${fmt(v.c1.y)}` : 'c1x1')
		)
		.join(''),
	primList: prims.map((p) => `${p.type}${p.i} ${p.j}`).join('')
});

/**
 * LightBurn condensed (`FormatVersion="1"`) VertList/PrimList, one entry per
 * M-run. `c0` is a vertex's outgoing control point, `c1` its incoming one;
 * `c0x1`/`c1x1` mean "none" (inferred from LightBurn 1.7.08 files — see the
 * research doc). Input must already be M/L/C/Z (`toCubicSegments`).
 */
export const encodeSubpaths = (segs: PathSegment[]): { vertList: string; primList: string }[] => {
	const out: { vertList: string; primList: string }[] = [];
	let verts: Vertex[] = [];
	let prims: Prim[] = [];
	const flush = () => {
		if (prims.length > 0) out.push(encodeRun(verts, prims));
		verts = [];
		prims = [];
	};
	for (const s of segs) {
		if (s[0] === 'M') {
			flush();
			verts.push({ x: s[1], y: s[2] });
		} else if (s[0] === 'L') {
			verts.push({ x: s[1], y: s[2] });
			prims.push({ type: 'L', i: verts.length - 2, j: verts.length - 1 });
		} else if (s[0] === 'C') {
			verts[verts.length - 1].c0 = { x: s[1], y: s[2] };
			verts.push({ x: s[5], y: s[6], c1: { x: s[3], y: s[4] } });
			prims.push({ type: 'B', i: verts.length - 2, j: verts.length - 1 });
		} else if (s[0] === 'Z') {
			if (verts.length < 2) continue;
			const last = verts[verts.length - 1];
			if (same(last, verts[0])) {
				// The run already returns to its start: fold the duplicate into vertex 0.
				verts[0].c1 = last.c1;
				verts.pop();
				prims[prims.length - 1].j = 0;
			} else {
				prims.push({ type: 'L', i: verts.length - 1, j: 0 });
			}
		} else {
			throw new Error(`encodeSubpaths: unsupported segment ${s[0]}; run toCubicSegments first`);
		}
	}
	flush();
	return out;
};
