import type { PathSegment } from '$lib/types';
import {
	splitContours,
	pointInPolygon,
	bboxContains,
	type Contour,
	type Pt
} from './path-contours';
import type { BandEnds, Pt as EndPt } from './post-process-types';

export type ContourKind = 'outline' | 'hole';

/**
 * One contour of a merged band path. `start`/`end` index the merged
 * `PathSegment[]`. Kind is containment-depth parity (even = outline, odd =
 * hole) — exact topology, not winding. `bandFraction` is set on holes only: the
 * hole centroid's position along the PARENT band.
 */
export type ContourRef = {
	start: number;
	end: number;
	kind: ContourKind;
	depth: number;
	/** |area|. */
	area: number;
	bandFraction?: number;
};

export type BandContourIndex = {
	seed: number;
	contours: ContourRef[];
	/** PCA major axis of the outline contours, band-local. */
	axis?: { origin: EndPt; direction: EndPt };
	/** Extreme outline points along the axis; `start` is the end nearer the first facet. */
	ends?: BandEnds;
};

export type ContourIndexInput = {
	facets: { path: PathSegment[] }[];
	pieceStartFraction: number;
	pieceEndFraction: number;
	seed: number;
};

export const holesOf = (index: BandContourIndex) =>
	index.contours.filter(
		(c): c is ContourRef & { bandFraction: number } => c.kind === 'hole'
	);

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

/** Major axis by PCA. A degenerate cloud gets +x. */
const majorAxis = (points: Pt[]): { origin: Pt; direction: Pt } => {
	let mx = 0;
	let my = 0;
	for (const p of points) {
		mx += p.x;
		my += p.y;
	}
	mx /= points.length;
	my /= points.length;
	let sxx = 0;
	let syy = 0;
	let sxy = 0;
	for (const p of points) {
		const dx = p.x - mx;
		const dy = p.y - my;
		sxx += dx * dx;
		syy += dy * dy;
		sxy += dx * dy;
	}
	if (sxx + syy === 0) return { origin: { x: mx, y: my }, direction: { x: 1, y: 0 } };
	const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
	return { origin: { x: mx, y: my }, direction: { x: Math.cos(theta), y: Math.sin(theta) } };
};

const bandEndsOf = (
	outlinePoints: Pt[],
	axis: { origin: Pt; direction: Pt },
	firstFacet: Pt | undefined
): BandEnds => {
	const d = axis.direction;
	let minT = Infinity;
	let maxT = -Infinity;
	let minP = outlinePoints[0];
	let maxP = outlinePoints[0];
	for (const p of outlinePoints) {
		const t = (p.x - axis.origin.x) * d.x + (p.y - axis.origin.y) * d.y;
		if (t < minT) {
			minT = t;
			minP = p;
		}
		if (t > maxT) {
			maxT = t;
			maxP = p;
		}
	}
	const low = { point: minP, outward: { x: -d.x, y: -d.y } };
	const high = { point: maxP, outward: { x: d.x, y: d.y } };
	if (!firstFacet) return { start: low, end: high };
	const dLow = Math.hypot(firstFacet.x - minP.x, firstFacet.y - minP.y);
	const dHigh = Math.hypot(firstFacet.x - maxP.x, firstFacet.y - maxP.y);
	return dLow <= dHigh ? { start: low, end: high } : { start: high, end: low };
};

/**
 * Stage 1b: index every contour of one merged band path, plus the band's axis
 * and ends. Pure and config-free. Runs in the band-merge worker.
 *
 * Outlined bands: every contour is `outline`. Their only interior contours are
 * label-tag artefacts, which must never be dropped as holes.
 */
export const buildContourIndex = (
	path: PathSegment[],
	input: ContourIndexInput,
	patternType: string
): BandContourIndex => {
	const contours = splitContours(path);
	if (contours.length === 0) return { seed: input.seed, contours: [] };

	const depths = depthsOf(contours);
	const line = centerlineOf(input.facets);
	const span = input.pieceEndFraction - input.pieceStartFraction;
	const refs: ContourRef[] = [];
	const outlinePoints: Pt[] = [];

	for (let i = 0; i < contours.length; i += 1) {
		const contour = contours[i];
		const isHole = patternType !== 'outlined' && depths[i] % 2 === 1;
		const ref: ContourRef = {
			start: contour.start,
			end: contour.end,
			kind: isHole ? 'hole' : 'outline',
			depth: depths[i],
			area: Math.abs(contour.area)
		};
		if (isHole) {
			ref.bandFraction =
				input.pieceStartFraction + localFractionOf(contour.centroid, line) * span;
		} else {
			outlinePoints.push(...contour.points);
		}
		refs.push(ref);
	}

	if (outlinePoints.length === 0) return { seed: input.seed, contours: refs };
	const axis = majorAxis(outlinePoints);
	return {
		seed: input.seed,
		contours: refs,
		axis,
		ends: bandEndsOf(outlinePoints, axis, line.points[0])
	};
};
