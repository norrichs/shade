import { Vector3 } from 'three';
import type { Section } from './types';

/** Edges shorter than this (Euclidean) are treated as collapsed/degenerate. */
export const FAN_DEGENERATE_EPSILON = 1e-6;

/** True when two points are coincident within FAN_DEGENERATE_EPSILON. */
export const isDegenerateEdge = (a: Vector3, b: Vector3): boolean =>
	a.distanceToSquared(b) < FAN_DEGENERATE_EPSILON * FAN_DEGENERATE_EPSILON;

/**
 * Build fan sections for a polygon interior fill band.
 * Outer ring = perimeter points (winding order); inner ring collapsed to centroid.
 * Layout: sections[k] = [perimeter[k], centroid] for k in 0..m-1, plus a wrap-around
 * section [perimeter[0], centroid]. With generateProjectionBands(..,'axial-right',..)
 * this yields one band of m quads, each one real + one degenerate (centroid-collapsed) facet.
 */
export const buildFanSections = (perimeter: Vector3[], centroid: Vector3): Section[] => {
	const sections: Section[] = perimeter.map((p) => ({
		points: [p.clone(), centroid.clone()]
	}));
	sections.push({ points: [perimeter[0].clone(), centroid.clone()] });
	return sections;
};

/**
 * Ensure the fan's first real facet normal points outward (away from projCenter).
 * Mirrors the winding check in generateSurfaceProjectionBands. If inward, reverse
 * each section's point order. Returns the (possibly reversed) sections.
 */
export const windFanSectionsOutward = (sections: Section[], projCenter: Vector3): Section[] => {
	if (sections.length < 2) return sections;
	const p0 = sections[0].points[0];
	const p1 = sections[0].points[1];
	const p2 = sections[1].points[0];
	const v1 = new Vector3().subVectors(p1, p0);
	const v2 = new Vector3().subVectors(p2, p0);
	const normal = new Vector3().crossVectors(v1, v2);
	const facetCentroid = new Vector3().addVectors(p0, p1).add(p2).divideScalar(3);
	const toFacet = new Vector3().subVectors(facetCentroid, projCenter);
	if (normal.dot(toFacet) < 0) {
		sections.forEach((s) => s.points.reverse());
	}
	return sections;
};
