import type { PathSegment } from '$lib/types';

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, A: 7, Z: 0 };

/**
 * Absolute-command SVG path data → PathSegment[]. Every exported DOM path is
 * written by `svgPathStringFromSegments`, which is absolute-only, so a relative
 * command means something unexpected reached the export; it throws.
 */
export const parsePathD = (d: string): PathSegment[] => {
	const tokens = d.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
	const out: PathSegment[] = [];
	let i = 0;
	let cmd = '';
	let cur = { x: 0, y: 0 };
	let start = cur;
	while (i < tokens.length) {
		if (/[A-Za-z]/.test(tokens[i])) {
			cmd = tokens[i];
			i += 1;
			if (!(cmd in ARITY)) throw new Error(`parsePathD: unsupported command "${cmd}"`);
			if (cmd === 'Z') {
				out.push(['Z']);
				cur = start;
				continue;
			}
		}
		const n = ARITY[cmd];
		if (!cmd || !n) throw new Error(`parsePathD: stray number at token ${i}`);
		const v = tokens.slice(i, i + n).map(Number);
		if (v.length < n || v.some((x) => !Number.isFinite(x))) throw new Error('parsePathD: truncated command');
		i += n;
		switch (cmd) {
			case 'M':
				out.push(['M', v[0], v[1]]);
				cur = start = { x: v[0], y: v[1] };
				cmd = 'L'; // implicit repeats after M are lines
				break;
			case 'L':
				out.push(['L', v[0], v[1]]);
				cur = { x: v[0], y: v[1] };
				break;
			case 'H':
				out.push(['L', v[0], cur.y]);
				cur = { x: v[0], y: cur.y };
				break;
			case 'V':
				out.push(['L', cur.x, v[0]]);
				cur = { x: cur.x, y: v[0] };
				break;
			case 'C':
				out.push(['C', v[0], v[1], v[2], v[3], v[4], v[5]]);
				cur = { x: v[4], y: v[5] };
				break;
			case 'Q':
				out.push(['Q', v[0], v[1], v[2], v[3]]);
				cur = { x: v[2], y: v[3] };
				break;
			case 'A':
				out.push(['A', v[0], v[1], v[2], v[3] ? 1 : 0, v[4] ? 1 : 0, v[5], v[6]]);
				cur = { x: v[5], y: v[6] };
				break;
		}
	}
	return out;
};

export type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

/** Apply an SVG matrix to every point. Convert arcs to cubics first. */
export const applyMatrix = (segs: PathSegment[], m: Matrix): PathSegment[] => {
	const X = (x: number, y: number) => m.a * x + m.c * y + m.e;
	const Y = (x: number, y: number) => m.b * x + m.d * y + m.f;
	return segs.map((s): PathSegment => {
		switch (s[0]) {
			case 'M':
				return ['M', X(s[1], s[2]), Y(s[1], s[2])];
			case 'L':
				return ['L', X(s[1], s[2]), Y(s[1], s[2])];
			case 'C':
				return ['C', X(s[1], s[2]), Y(s[1], s[2]), X(s[3], s[4]), Y(s[3], s[4]), X(s[5], s[6]), Y(s[5], s[6])];
			case 'Q':
				return ['Q', X(s[1], s[2]), Y(s[1], s[2]), X(s[3], s[4]), Y(s[3], s[4])];
			case 'Z':
				return s;
			default:
				throw new Error('applyMatrix: convert arcs to cubics before transforming');
		}
	});
};
