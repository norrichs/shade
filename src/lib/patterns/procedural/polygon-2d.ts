/**
 * Minimal 2D polygon math for procedural pattern fills.
 *
 * Deliberately Three.js-free: the fill algorithms work on plain `{ x, y }`
 * points so they stay pure and cheap to test. Callers convert at the boundary.
 */

export type Point2 = { x: number; y: number };

/** An implicitly closed ring: the last point connects back to the first. */
export type Polygon = Point2[];

const DEFAULT_EPSILON = 1e-9;

/**
 * Drop consecutive coincident points, including the wrap from last to first.
 *
 * Load-bearing, not cosmetic. `buildOutlinePath` already skips zero-length
 * edges, and globule bands begin at a collapsed pole facet, so a band's edge
 * list genuinely contains coincident points. A zero-length edge makes
 * `distanceToPolygonEdge` divide by zero and poisons the packer with NaN.
 */
export const dedupePolygon = (polygon: Polygon, epsilon = DEFAULT_EPSILON): Polygon => {
	if (polygon.length === 0) return [];
	const epsSq = epsilon * epsilon;
	const out: Polygon = [polygon[0]];
	for (let i = 1; i < polygon.length; i++) {
		const prev = out[out.length - 1];
		const p = polygon[i];
		const dx = p.x - prev.x;
		const dy = p.y - prev.y;
		if (dx * dx + dy * dy > epsSq) out.push(p);
	}
	// The ring closes implicitly, so a final point coincident with the first is
	// also a duplicate.
	while (out.length > 1) {
		const first = out[0];
		const last = out[out.length - 1];
		const dx = last.x - first.x;
		const dy = last.y - first.y;
		if (dx * dx + dy * dy > epsSq) break;
		out.pop();
	}
	return out;
};

/** Unsigned area via the shoelace formula. Orientation independent. */
export const polygonArea = (polygon: Polygon): number => {
	if (polygon.length < 3) return 0;
	let twice = 0;
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i];
		const b = polygon[(i + 1) % polygon.length];
		twice += a.x * b.y - b.x * a.y;
	}
	return Math.abs(twice) / 2;
};

export const polygonBounds = (
	polygon: Polygon
): { minX: number; minY: number; maxX: number; maxY: number } => {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of polygon) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return { minX, minY, maxX, maxY };
};

/**
 * Crossing-number test. Handles concave rings, which band outlines are: a
 * curved band's two long sides both bow the same way.
 */
export const pointInPolygon = (p: Point2, polygon: Polygon): boolean => {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const a = polygon[i];
		const b = polygon[j];
		const straddles = a.y > p.y !== b.y > p.y;
		if (!straddles) continue;
		const t = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
		if (p.x < t) inside = !inside;
	}
	return inside;
};

const distanceToSegment = (p: Point2, a: Point2, b: Point2): number => {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
	let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Unsigned distance from `p` to the nearest edge of the closed ring. */
export const distanceToPolygonEdge = (p: Point2, polygon: Polygon): number => {
	let min = Infinity;
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i];
		const b = polygon[(i + 1) % polygon.length];
		const d = distanceToSegment(p, a, b);
		if (d < min) min = d;
	}
	return min;
};
