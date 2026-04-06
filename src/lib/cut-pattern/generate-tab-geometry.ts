import { Vector3 } from 'three';
import type { PathSegment, OutlinedTabConfig } from '$lib/types';

export type TabGeometry = {
	/** The two points shared with the facet edge */
	edgeStart: Vector3;
	edgeEnd: Vector3;
	/** The path segments that trace the tab (from edgeStart side to edgeEnd side, not including the shared edge) */
	path: PathSegment[];
};

/**
 * Compute a unit normal to a 2D edge (z=0), pointing in the given direction.
 * `interiorPoint` is a point on the band interior side — the normal will point AWAY from it.
 */
const getOutwardNormal = (edgeStart: Vector3, edgeEnd: Vector3, interiorPoint: Vector3): Vector3 => {
	const edge = new Vector3().subVectors(edgeEnd, edgeStart);
	// 2D perpendicular (rotate 90 degrees)
	const normal = new Vector3(-edge.y, edge.x, 0).normalize();
	// Check if normal points away from interior
	const toInterior = new Vector3().subVectors(interiorPoint, edgeStart);
	if (normal.dot(toInterior) > 0) {
		normal.negate();
	}
	return normal;
};

/**
 * Generate a rectangular tab: a quadrilateral offset from the shared edge.
 *
 * Returns path segments from outerStart → outerEnd (the three non-shared edges).
 * The caller is responsible for connecting edgeStart → outerStart and outerEnd → edgeEnd.
 */
export const generateRectangularTab = (
	edgeStart: Vector3,
	edgeEnd: Vector3,
	tabWidth: number,
	interiorPoint: Vector3
): TabGeometry => {
	const normal = getOutwardNormal(edgeStart, edgeEnd, interiorPoint);
	const outerStart = edgeStart.clone().addScaledVector(normal, tabWidth);
	const outerEnd = edgeEnd.clone().addScaledVector(normal, tabWidth);

	return {
		edgeStart,
		edgeEnd,
		path: [
			['L', outerStart.x, outerStart.y],
			['L', outerEnd.x, outerEnd.y],
			['L', edgeEnd.x, edgeEnd.y]
		]
	};
};

/**
 * Generate an inset tab: starts as a rectangle, then the two outer corners are
 * offset toward the center of the outer edge by `inset` distance.
 * This creates a trapezoid that's narrower on the outer edge than on the shared edge.
 * If inset is not provided, defaults to tabWidth.
 */
export const generateInsetTab = (
	edgeStart: Vector3,
	edgeEnd: Vector3,
	tabWidth: number,
	interiorPoint: Vector3,
	inset?: number
): TabGeometry => {
	const normal = getOutwardNormal(edgeStart, edgeEnd, interiorPoint);
	const edgeVec = new Vector3().subVectors(edgeEnd, edgeStart);
	const edgeDir = edgeVec.clone().normalize();
	const insetAmount = inset ?? tabWidth;

	const outerStart = edgeStart.clone().addScaledVector(normal, tabWidth);
	const outerEnd = edgeEnd.clone().addScaledVector(normal, tabWidth);

	// Offset outer corners toward center of the outer edge
	const insetStart = outerStart.clone().addScaledVector(edgeDir, insetAmount);
	const insetEnd = outerEnd.clone().addScaledVector(edgeDir, -insetAmount);

	return {
		edgeStart,
		edgeEnd,
		path: [
			['L', insetStart.x, insetStart.y],
			['L', insetEnd.x, insetEnd.y],
			['L', edgeEnd.x, edgeEnd.y]
		]
	};
};

/**
 * Generate a rounded tab: like rectangular but with quarter-circle arcs at the two
 * outer corners, replacing the sharp 90-degree turns.
 *
 * Shape (walking from edgeStart side):
 *   edgeStart → straight up (normal direction) to arcStart →
 *   quarter-circle arc to arcTopStart →
 *   straight across the top to arcTopEnd →
 *   quarter-circle arc to arcEnd →
 *   straight down to edgeEnd
 *
 * The arc radius is clamped so arcs don't overlap on short edges.
 */
export const generateRoundedTab = (
	edgeStart: Vector3,
	edgeEnd: Vector3,
	tabWidth: number,
	interiorPoint: Vector3
): TabGeometry => {
	const normal = getOutwardNormal(edgeStart, edgeEnd, interiorPoint);
	const edgeVec = new Vector3().subVectors(edgeEnd, edgeStart);
	const edgeDir = edgeVec.clone().normalize();
	const edgeLength = edgeVec.length();

	// Clamp arc radius so two arcs don't overlap, and radius doesn't exceed tabWidth
	const radius = Math.min(tabWidth, edgeLength / 2);

	// Full rectangular corners
	const outerStart = edgeStart.clone().addScaledVector(normal, tabWidth);
	const outerEnd = edgeEnd.clone().addScaledVector(normal, tabWidth);

	// Arc start/end points: inset from the rectangular corners by radius
	// Start corner: arc goes from a point on the perpendicular edge to a point on the top edge
	const arcStart = edgeStart.clone().addScaledVector(normal, tabWidth - radius);
	const arcTopStart = outerStart.clone().addScaledVector(edgeDir, radius);

	// End corner: arc goes from a point on the top edge to a point on the perpendicular edge
	const arcTopEnd = outerEnd.clone().addScaledVector(edgeDir, -radius);
	const arcEnd = edgeEnd.clone().addScaledVector(normal, tabWidth - radius);

	// Determine sweep direction for each corner independently.
	// The arc should bulge toward the sharp corner it replaces (outerStart / outerEnd).
	// Cross product of chord × (chord_start→corner) tells us which side the corner is on.

	// Start corner: chord is arcStart→arcTopStart, corner is outerStart
	const startChord = new Vector3().subVectors(arcTopStart, arcStart);
	const startToCorner = new Vector3().subVectors(outerStart, arcStart);
	const startCross = startChord.x * startToCorner.y - startChord.y * startToCorner.x;
	const startSweep = startCross > 0 ? 0 : 1;

	// End corner: chord is arcTopEnd→arcEnd, corner is outerEnd
	const endChord = new Vector3().subVectors(arcEnd, arcTopEnd);
	const endToCorner = new Vector3().subVectors(outerEnd, arcTopEnd);
	const endCross = endChord.x * endToCorner.y - endChord.y * endToCorner.x;
	const endSweep = endCross > 0 ? 0 : 1;

	return {
		edgeStart,
		edgeEnd,
		path: [
			// Straight up from edgeStart toward outer corner
			['L', arcStart.x, arcStart.y],
			// Quarter-circle arc around the start corner
			['A', radius, radius, 0, 0, startSweep, arcTopStart.x, arcTopStart.y],
			// Straight across the top
			['L', arcTopEnd.x, arcTopEnd.y],
			// Quarter-circle arc around the end corner
			['A', radius, radius, 0, 0, endSweep, arcEnd.x, arcEnd.y],
			// Straight down to edgeEnd
			['L', edgeEnd.x, edgeEnd.y]
		]
	};
};

/**
 * Find the intersection of two infinite lines defined by point pairs.
 * Returns undefined if lines are parallel.
 */
const lineIntersection = (
	p1: Vector3,
	p2: Vector3,
	p3: Vector3,
	p4: Vector3
): Vector3 | undefined => {
	const d1x = p2.x - p1.x;
	const d1y = p2.y - p1.y;
	const d2x = p4.x - p3.x;
	const d2y = p4.y - p3.y;

	const denom = d1x * d2y - d1y * d2x;
	if (Math.abs(denom) < 1e-10) return undefined;

	const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
	return new Vector3(p1.x + t * d1x, p1.y + t * d1y, 0);
};

/**
 * Generate a partner-shaped tab.
 *
 * The tab outer points are NOT the partner quad's outer vertices directly.
 * Instead, they are the intersections of:
 * 1. The rectangular tab's outer line (offset by tabWidth from shared edge)
 * 2. The lines from each shared vertex to the partner's corresponding outer vertex
 *
 * This constrains the tab height to tabWidth while following the partner's edge angles.
 *
 * partnerPointA: partner outer vertex on the edgeStart side (transformed to local coords)
 * partnerPointB: partner outer vertex on the edgeEnd side (transformed to local coords)
 */
export const generatePartnerTab = (
	edgeStart: Vector3,
	edgeEnd: Vector3,
	tabWidth: number,
	interiorPoint: Vector3,
	partnerPointA: Vector3,
	partnerPointB: Vector3
): TabGeometry => {
	const normal = getOutwardNormal(edgeStart, edgeEnd, interiorPoint);

	// Rectangular outer line (at tabWidth offset)
	const outerStart = edgeStart.clone().addScaledVector(normal, tabWidth);
	const outerEnd = edgeEnd.clone().addScaledVector(normal, tabWidth);

	// Lines from shared vertices to partner outer vertices
	// Find where they cross the rectangular outer line
	const intersectA = lineIntersection(edgeStart, partnerPointA, outerStart, outerEnd);
	const intersectB = lineIntersection(edgeEnd, partnerPointB, outerStart, outerEnd);

	// Fall back to rectangular corners if lines are parallel
	const tabOuterStart = intersectA ?? outerStart;
	const tabOuterEnd = intersectB ?? outerEnd;

	return {
		edgeStart,
		edgeEnd,
		path: [
			['L', tabOuterStart.x, tabOuterStart.y],
			['L', tabOuterEnd.x, tabOuterEnd.y],
			['L', edgeEnd.x, edgeEnd.y]
		]
	};
};

/**
 * Generate a partner-inset tab: same as partner, but the outer points are
 * inset toward the center of the outer edge by `inset` distance.
 * If inset is not provided, defaults to tabWidth.
 */
export const generatePartnerInsetTab = (
	edgeStart: Vector3,
	edgeEnd: Vector3,
	tabWidth: number,
	interiorPoint: Vector3,
	partnerPointA: Vector3,
	partnerPointB: Vector3,
	inset?: number
): TabGeometry => {
	const normal = getOutwardNormal(edgeStart, edgeEnd, interiorPoint);
	const edgeVec = new Vector3().subVectors(edgeEnd, edgeStart);
	const edgeDir = edgeVec.clone().normalize();
	const insetAmount = inset ?? tabWidth;

	// Rectangular outer line (at tabWidth offset)
	const outerStart = edgeStart.clone().addScaledVector(normal, tabWidth);
	const outerEnd = edgeEnd.clone().addScaledVector(normal, tabWidth);

	// Partner intersection points (same as generatePartnerTab)
	const intersectA = lineIntersection(edgeStart, partnerPointA, outerStart, outerEnd);
	const intersectB = lineIntersection(edgeEnd, partnerPointB, outerStart, outerEnd);
	const tabOuterStart = intersectA ?? outerStart;
	const tabOuterEnd = intersectB ?? outerEnd;

	// Inset the outer points toward center
	const insetStart = tabOuterStart.clone().addScaledVector(edgeDir, insetAmount);
	const insetEnd = tabOuterEnd.clone().addScaledVector(edgeDir, -insetAmount);

	return {
		edgeStart,
		edgeEnd,
		path: [
			['L', insetStart.x, insetStart.y],
			['L', insetEnd.x, insetEnd.y],
			['L', edgeEnd.x, edgeEnd.y]
		]
	};
};

/**
 * Find the intersection point of two 2D line segments.
 * Returns undefined if segments are parallel or intersection is outside both segments.
 */
const segmentIntersection = (
	p1: Vector3,
	p2: Vector3,
	p3: Vector3,
	p4: Vector3
): Vector3 | undefined => {
	const d1x = p2.x - p1.x;
	const d1y = p2.y - p1.y;
	const d2x = p4.x - p3.x;
	const d2y = p4.y - p3.y;

	const denom = d1x * d2y - d1y * d2x;
	if (Math.abs(denom) < 1e-10) return undefined;

	const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
	const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;

	// Both parameters must be in [0, 1] for intersection within segments
	if (t < 0 || t > 1 || u < 0 || u > 1) return undefined;

	return new Vector3(p1.x + t * d1x, p1.y + t * d1y, 0);
};

/**
 * Extract the outer edge points from a rectangular/partner tab's path segments.
 * Returns the two outer points (the offset corners).
 */
const getTabOuterPoints = (tab: TabGeometry): [Vector3, Vector3] => {
	// For rectangular/partner tabs, path is [L outerStart, L outerEnd, L edgeEnd]
	// The first two L segments give us the outer points
	const p1 = tab.path[0];
	const p2 = tab.path[1];
	if (p1[0] === 'L' && p2[0] === 'L') {
		return [
			new Vector3(p1[1], p1[2], 0),
			new Vector3(p2[1], p2[2], 0)
		];
	}
	// For arc tabs, we'd need different handling — skip correction for now
	return [tab.edgeStart.clone(), tab.edgeEnd.clone()];
};

/**
 * Correct overlapping tabs on the same side of a band.
 *
 * When two adjacent tabs overlap (their offset edges cross), find the intersection
 * and truncate both tabs to meet at that point cleanly.
 */
export const correctTabOverlaps = (tabs: TabGeometry[]): TabGeometry[] => {
	if (tabs.length < 2) return tabs;

	const corrected = tabs.map((tab) => ({
		...tab,
		path: [...tab.path]
	}));

	for (let i = 0; i < corrected.length - 1; i++) {
		const tabA = corrected[i];
		const tabB = corrected[i + 1];

		const [, outerEndA] = getTabOuterPoints(tabA);
		const [outerStartB] = getTabOuterPoints(tabB);

		// Check if the offset edges of adjacent tabs intersect:
		// tabA's "end" offset edge: outerEndA → edgeEnd
		// tabB's "start" offset edge: edgeStart → outerStartB
		const intersection = segmentIntersection(
			outerEndA,
			tabA.edgeEnd,
			tabB.edgeStart,
			outerStartB
		);

		if (intersection) {
			// Replace tabA's outerEnd with intersection point
			if (tabA.path[1][0] === 'L') {
				tabA.path[1] = ['L', intersection.x, intersection.y];
			}
			// Remove tabA's final L to edgeEnd — it now goes to intersection
			tabA.path[2] = ['L', tabA.edgeEnd.x, tabA.edgeEnd.y];

			// Replace tabB's outerStart with intersection point
			if (tabB.path[0][0] === 'L') {
				tabB.path[0] = ['L', intersection.x, intersection.y];
			}
		}
	}

	return corrected;
};
