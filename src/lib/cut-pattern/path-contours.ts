import type { PathSegment } from '$lib/types';

export type Pt = { x: number; y: number };
export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * One `M … Z` run of a flat path, flattened to a polygon and measured.
 *
 * `start`/`end` index back into the ORIGINAL `PathSegment[]` (`end` exclusive),
 * which is what makes dropping a hole a slice deletion rather than a re-union.
 */
export type Contour = {
	start: number;
	end: number;
	points: Pt[];
	bbox: BBox;
	/** Signed shoelace area. Sign is winding, which we never trust; use |area|. */
	area: number;
	centroid: Pt;
};

/** Samples per cubic/quadratic segment. Enough for centroid and containment. */
const CURVE_SAMPLES = 8;

const cubicAt = (p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt => {
	const u = 1 - t;
	const a = u * u * u;
	const b = 3 * u * u * t;
	const c = 3 * u * t * t;
	const d = t * t * t;
	return {
		x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
		y: a * p0.y + b * c1.y + c * c2.y + d * p1.y
	};
};

const quadraticAt = (p0: Pt, c: Pt, p1: Pt, t: number): Pt => {
	const u = 1 - t;
	return {
		x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
		y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y
	};
};

const shoelaceArea = (points: Pt[]): number => {
	let sum = 0;
	for (let i = 0; i < points.length; i += 1) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		sum += a.x * b.y - b.x * a.y;
	}
	return sum / 2;
};

const boundsOf = (points: Pt[]): BBox => {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of points) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return { minX, minY, maxX, maxY };
};

const centroidOf = (points: Pt[], area: number, bbox: BBox): Pt => {
	// A sliver, a degenerate run, or a single edge has no usable polygon
	// centroid; the bbox centre is a stable stand-in, and it only ever feeds a
	// position fraction, never a cut line.
	if (Math.abs(area) < 1e-9) {
		return { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 };
	}
	let cx = 0;
	let cy = 0;
	for (let i = 0; i < points.length; i += 1) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		const cross = a.x * b.y - b.x * a.y;
		cx += (a.x + b.x) * cross;
		cy += (a.y + b.y) * cross;
	}
	return { x: cx / (6 * area), y: cy / (6 * area) };
};

const measure = (start: number, end: number, points: Pt[]): Contour => {
	const bbox = boundsOf(points);
	const area = shoelaceArea(points);
	return { start, end, points, bbox, area, centroid: centroidOf(points, area, bbox) };
};

/**
 * Split a flat path into its contours, flattening curves to polylines.
 *
 * `paperToPathSegments` normalises everything to M/L/C/Z, so `Q` and `A` are
 * handled defensively rather than expected. An `A` contributes only its
 * endpoint: it never reaches here from a merge, and approximating it as a line
 * beats dropping the point.
 */
export const splitContours = (path: PathSegment[]): Contour[] => {
	const contours: Contour[] = [];
	let start = -1;
	let points: Pt[] = [];
	let cursor: Pt = { x: 0, y: 0 };

	const flush = (end: number) => {
		if (start >= 0 && points.length >= 2) contours.push(measure(start, end, points));
		start = -1;
		points = [];
	};

	for (let i = 0; i < path.length; i += 1) {
		const seg = path[i];
		const cmd = seg[0];
		if (cmd === 'M') {
			flush(i);
			start = i;
			cursor = { x: seg[1], y: seg[2] };
			points = [cursor];
		} else if (start < 0) {
			continue;
		} else if (cmd === 'L') {
			cursor = { x: seg[1], y: seg[2] };
			points.push(cursor);
		} else if (cmd === 'C') {
			const c1 = { x: seg[1], y: seg[2] };
			const c2 = { x: seg[3], y: seg[4] };
			const p1 = { x: seg[5], y: seg[6] };
			for (let s = 1; s <= CURVE_SAMPLES; s += 1) {
				points.push(cubicAt(cursor, c1, c2, p1, s / CURVE_SAMPLES));
			}
			cursor = p1;
		} else if (cmd === 'Q') {
			const c = { x: seg[1], y: seg[2] };
			const p1 = { x: seg[3], y: seg[4] };
			for (let s = 1; s <= CURVE_SAMPLES; s += 1) {
				points.push(quadraticAt(cursor, c, p1, s / CURVE_SAMPLES));
			}
			cursor = p1;
		} else if (cmd === 'A') {
			const p1 = { x: seg[6], y: seg[7] };
			points.push(p1);
			cursor = p1;
		} else if (cmd === 'Z') {
			flush(i + 1);
		}
	}
	flush(path.length);
	return contours;
};

/** Ray-casting containment. Boundary cases are not meaningful here. */
export const pointInPolygon = (p: Pt, polygon: Pt[]): boolean => {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
		const a = polygon[i];
		const b = polygon[j];
		const straddles = a.y > p.y !== b.y > p.y;
		if (straddles && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
			inside = !inside;
		}
	}
	return inside;
};

export const bboxContains = (outer: BBox, inner: BBox): boolean =>
	inner.minX >= outer.minX &&
	inner.minY >= outer.minY &&
	inner.maxX <= outer.maxX &&
	inner.maxY <= outer.maxY;

/**
 * Every `M`-run of a path as a polyline, open or closed. Unlike
 * `splitContours`, it keeps open runs (split outline pieces, disconnect lines)
 * and does no measuring. `Z` appends the run's first point. Arcs are treated as
 * straight to their endpoint — merged paths contain none.
 */
export const flattenPath = (path: PathSegment[]): Pt[][] => {
	const runs: Pt[][] = [];
	let run: Pt[] = [];
	let cur: Pt = { x: 0, y: 0 };
	const flush = () => {
		if (run.length > 0) runs.push(run);
		run = [];
	};
	for (const seg of path) {
		switch (seg[0]) {
			case 'M':
				flush();
				cur = { x: seg[1], y: seg[2] };
				run.push(cur);
				break;
			case 'L':
				cur = { x: seg[1], y: seg[2] };
				run.push(cur);
				break;
			case 'C': {
				const p0 = cur;
				const c1 = { x: seg[1], y: seg[2] };
				const c2 = { x: seg[3], y: seg[4] };
				const p1 = { x: seg[5], y: seg[6] };
				for (let i = 1; i < CURVE_SAMPLES; i += 1) run.push(cubicAt(p0, c1, c2, p1, i / CURVE_SAMPLES));
				run.push(p1);
				cur = p1;
				break;
			}
			case 'Q': {
				const p0 = cur;
				const c = { x: seg[1], y: seg[2] };
				const p1 = { x: seg[3], y: seg[4] };
				for (let i = 1; i < CURVE_SAMPLES; i += 1) {
					const t = i / CURVE_SAMPLES;
					const u = 1 - t;
					run.push({
						x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
						y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y
					});
				}
				run.push(p1);
				cur = p1;
				break;
			}
			case 'A':
				cur = { x: seg[6], y: seg[7] };
				run.push(cur);
				break;
			case 'Z':
				if (run.length > 0) {
					run.push(run[0]);
					cur = run[0];
				}
				break;
		}
	}
	flush();
	return runs;
};
