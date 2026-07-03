import type { Point, Quadrilateral } from '$lib/types';

/**
 * Computes the auto-orientation angle for a tiled-pattern band label.
 *
 * The label originates at `anchor` (a point on the mapped pattern, expressed in
 * the same flattened-band coordinate space as the quad). We orient it relative
 * to the quad edge nearest that anchor so that:
 *
 *   - the label text runs PARALLEL to the nearest edge, and
 *   - the label stem runs PERPENDICULAR to it, pointing OUTWARD (away from the
 *     quad interior) so the callout body sits outside the pattern.
 *
 * The returned `autoAngle` matches the convention consumed by `PatternLabel`
 * (and produced by `computeOutlinedLabelAnchor`): SVG `rotate(θ)` maps the
 * path-space stem direction (0,1) to the outward normal N, i.e.
 * `θ = atan2(-N.x, N.y)`. Under the same rotation the path-space text direction
 * (1,0) maps to the edge direction, so the text ends up parallel to the edge.
 */
export const computeTiledLabelAngle = (anchor: Point, quad: Quadrilateral): number => {
	const centroid: Point = {
		x: (quad.a.x + quad.b.x + quad.c.x + quad.d.x) / 4,
		y: (quad.a.y + quad.b.y + quad.c.y + quad.d.y) / 4
	};

	// The four directed edges of the quad, in order a→b→c→d→a.
	const edges: [Point, Point][] = [
		[quad.a, quad.b],
		[quad.b, quad.c],
		[quad.c, quad.d],
		[quad.d, quad.a]
	];

	let nearest = edges[0];
	let nearestDist = Number.POSITIVE_INFINITY;
	for (const edge of edges) {
		const d = distanceToSegment(anchor, edge[0], edge[1]);
		if (d < nearestDist) {
			nearestDist = d;
			nearest = edge;
		}
	}

	const [start, end] = nearest;
	const edgeDx = end.x - start.x;
	const edgeDy = end.y - start.y;
	const len = Math.hypot(edgeDx, edgeDy) || 1;

	// Perpendicular candidate, then flip so it points away from the quad centroid
	// (outward). Mirrors the outward-normal convention in compute-label-anchor.ts.
	let Nx = -edgeDy / len;
	let Ny = edgeDx / len;
	const edgeMidX = (start.x + end.x) / 2;
	const edgeMidY = (start.y + end.y) / 2;
	if (Nx * (centroid.x - edgeMidX) + Ny * (centroid.y - edgeMidY) > 0) {
		Nx = -Nx;
		Ny = -Ny;
	}

	// rotate(θ) takes (0,1) → (-sin θ, cos θ); solve for θ so that equals N.
	return Math.atan2(-Nx, Ny);
};

/** Shortest distance from point `p` to the segment `a`→`b`. */
const distanceToSegment = (p: Point, a: Point, b: Point): number => {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
	let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
	t = Math.max(0, Math.min(1, t));
	const projX = a.x + t * dx;
	const projY = a.y + t * dy;
	return Math.hypot(p.x - projX, p.y - projY);
};
