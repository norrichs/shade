import type { PathSegment } from '$lib/types';
import {
	splitContours,
	pointInPolygon,
	bboxContains,
	type Contour,
	type Pt
} from './path-contours';

/**
 * One droppable internal contour.
 *
 * `start`/`end` index into the merged `PathSegment[]`; `bandFraction` is the
 * position of the hole's centroid along the PARENT band, 0 at the band's first
 * quad and 1 at its last.
 */
export type HoleRef = {
	start: number;
	end: number;
	bandFraction: number;
	/** |area| of the hole. Unused today; a future minimum-size filter needs it. */
	area: number;
};

export type BandHoleIndex = { seed: number; holes: HoleRef[] };

export type HoleIndexInput = {
	facets: { path: PathSegment[] }[];
	pieceStartFraction: number;
	pieceEndFraction: number;
	seed: number;
};

/**
 * Nesting depth of each contour, by containment rather than by winding.
 *
 * `uniteMany` deliberately does not normalise winding (see its doc comment), so
 * signed area is not a reliable hole signal on a merged path. A container must
 * have larger absolute area than what it contains, so each contour is tested
 * only against larger ones, bbox-prefiltered.
 */
const depthsOf = (contours: Contour[]): number[] => {
	const order = contours
		.map((contour, index) => ({ contour, index }))
		.sort((a, b) => Math.abs(b.contour.area) - Math.abs(a.contour.area));
	const depths = new Array<number>(contours.length).fill(0);

	for (let i = 0; i < order.length; i += 1) {
		const { contour, index } = order[i];
		let depth = 0;
		for (let j = 0; j < i; j += 1) {
			const candidate = order[j].contour;
			if (!bboxContains(candidate.bbox, contour.bbox)) continue;
			if (pointInPolygon(contour.points[0], candidate.points)) depth += 1;
		}
		depths[index] = depth;
	}
	return depths;
};

/** Mean of a facet path's on-curve points: its approximate centre. */
const facetCentroid = (path: PathSegment[]): Pt | undefined => {
	let sx = 0;
	let sy = 0;
	let n = 0;
	for (const seg of path) {
		if (seg[0] === 'Z') continue;
		const x = seg[seg.length - 2];
		const y = seg[seg.length - 1];
		if (typeof x !== 'number' || typeof y !== 'number') continue;
		sx += x;
		sy += y;
		n += 1;
	}
	return n === 0 ? undefined : { x: sx / n, y: sy / n };
};

type Centerline = { points: Pt[]; cumulative: number[]; total: number };

/**
 * The band's spine: one point per facet, in facet order.
 *
 * Tiled output is one facet per quad (`types.ts:464-470`), so this runs cleanly
 * along the band with no zigzag, and facet order settles which end is the start
 * without an orientation heuristic.
 */
const centerlineOf = (facets: { path: PathSegment[] }[]): Centerline => {
	const points: Pt[] = [];
	for (const facet of facets) {
		const c = facetCentroid(facet.path);
		if (c) points.push(c);
	}
	const cumulative: number[] = [0];
	let total = 0;
	for (let i = 1; i < points.length; i += 1) {
		const dx = points[i].x - points[i - 1].x;
		const dy = points[i].y - points[i - 1].y;
		total += Math.hypot(dx, dy);
		cumulative.push(total);
	}
	return { points, cumulative, total };
};

/**
 * Arc-length position of `p` along the centerline, as a fraction of its length.
 * 0.5 when the band has no usable centerline — a single facet, or none.
 */
const localFractionOf = (p: Pt, line: Centerline): number => {
	if (line.points.length < 2 || line.total <= 0) return 0.5;

	let best = Infinity;
	let bestArc = 0;
	for (let i = 1; i < line.points.length; i += 1) {
		const a = line.points[i - 1];
		const b = line.points[i];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const lengthSq = dx * dx + dy * dy;
		const t =
			lengthSq === 0
				? 0
				: Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
		const px = a.x + t * dx;
		const py = a.y + t * dy;
		const distanceSq = (p.x - px) ** 2 + (p.y - py) ** 2;
		if (distanceSq < best) {
			best = distanceSq;
			bestArc = line.cumulative[i - 1] + t * Math.sqrt(lengthSq);
		}
	}
	return bestArc / line.total;
};

/**
 * Index every internal hole of one merged band path.
 *
 * Pure and config-free: it decides WHERE holes are, never WHETHER to drop them.
 * Runs in the band-merge worker as stage 1b, where the facet geometry and the
 * piece span are already in hand.
 */
export const buildHoleIndex = (path: PathSegment[], input: HoleIndexInput): BandHoleIndex => {
	const contours = splitContours(path);
	if (contours.length < 2) return { seed: input.seed, holes: [] };

	const depths = depthsOf(contours);
	const line = centerlineOf(input.facets);
	const span = input.pieceEndFraction - input.pieceStartFraction;
	const holes: HoleRef[] = [];

	for (let i = 0; i < contours.length; i += 1) {
		if (depths[i] % 2 === 0) continue;
		const contour = contours[i];
		const local = localFractionOf(contour.centroid, line);
		holes.push({
			start: contour.start,
			end: contour.end,
			bandFraction: input.pieceStartFraction + local * span,
			area: Math.abs(contour.area)
		});
	}
	return { seed: input.seed, holes };
};
