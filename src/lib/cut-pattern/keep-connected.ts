import type { PathSegment } from '$lib/types';

type Point = { x: number; y: number };

type Edge = {
	/** Original draw command for this edge (forward orientation). For the */
	/** synthetic closing edge this is a straight line back to the start point. */
	cmd: PathSegment;
	start: Point;
	end: Point;
	straight: boolean;
	length: number;
};

const endpointOf = (segment: PathSegment, prev: Point): Point => {
	switch (segment[0]) {
		case 'M':
		case 'L':
			return { x: segment[1], y: segment[2] };
		case 'C':
			return { x: segment[5], y: segment[6] };
		case 'Q':
			return { x: segment[3], y: segment[4] };
		case 'A':
			return { x: segment[6], y: segment[7] };
		case 'Z':
			return prev;
	}
};

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * Insert a single uncut "bridge" of width `gap` into a closed cut outline so the
 * cut piece stays attached to the surrounding material (keepConnected).
 *
 * `path` must be a single closed contour (begins with 'M', ends with 'Z'). The
 * break is centered on the midpoint of the topmost (minimum-y) straight segment
 * that is longer than `gap`. The returned path is **open** (no 'Z') and draws
 * the whole boundary except the gap span, traversing the loop once in the
 * original direction:
 *
 *   M gapEnd, L <chosen end>, <every other edge forward…>, L gapStart
 *
 * Returns the path unchanged when `gap <= 0`, when the path is not a single
 * contour (≠ exactly one 'M'), or when no straight segment is longer than `gap`.
 */
export const insertKeepConnectedBreak = (path: PathSegment[], gap: number): PathSegment[] => {
	if (gap <= 0 || path.length < 3) return path;
	if (path[0][0] !== 'M') return path;
	if (path.filter((s) => s[0] === 'M').length !== 1) return path;

	const start: Point = { x: path[0][1], y: path[0][2] };

	// Build the cyclic edge list (excluding the leading M; expanding a trailing Z
	// into an explicit straight closing edge).
	const edges: Edge[] = [];
	let prev = start;
	for (let i = 1; i < path.length; i++) {
		const seg = path[i];
		if (seg[0] === 'Z') {
			// Explicit closing edge back to the contour start.
			edges.push({
				cmd: ['L', start.x, start.y],
				start: prev,
				end: start,
				straight: true,
				length: Math.hypot(start.x - prev.x, start.y - prev.y)
			});
			prev = start;
			continue;
		}
		const end = endpointOf(seg, prev);
		const straight = seg[0] === 'L';
		edges.push({
			cmd: seg,
			start: prev,
			end,
			straight,
			length: straight ? Math.hypot(end.x - prev.x, end.y - prev.y) : 0
		});
		prev = end;
	}

	// Pick the topmost (min midpoint-y) straight edge longer than the gap.
	let chosen = -1;
	let chosenMidY = Infinity;
	for (let i = 0; i < edges.length; i++) {
		const e = edges[i];
		if (!e.straight || e.length <= gap) continue;
		const midY = (e.start.y + e.end.y) / 2;
		if (midY < chosenMidY) {
			chosenMidY = midY;
			chosen = i;
		}
	}
	if (chosen === -1) return path;

	const e = edges[chosen];
	const dx = (e.end.x - e.start.x) / e.length;
	const dy = (e.end.y - e.start.y) / e.length;
	const half = e.length / 2;
	const gapStart: Point = {
		x: round(e.start.x + dx * (half - gap / 2)),
		y: round(e.start.y + dy * (half - gap / 2))
	};
	const gapEnd: Point = {
		x: round(e.start.x + dx * (half + gap / 2)),
		y: round(e.start.y + dy * (half + gap / 2))
	};

	// Rebuild as one open path: start just past the gap, traverse the loop in the
	// original direction, end just before the gap.
	const result: PathSegment[] = [
		['M', gapEnd.x, gapEnd.y],
		['L', e.end.x, e.end.y]
	];
	for (let k = 1; k < edges.length; k++) {
		const edge = edges[(chosen + k) % edges.length];
		result.push(edge.cmd);
	}
	result.push(['L', gapStart.x, gapStart.y]);
	return result;
};
