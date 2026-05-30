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
 * The fan sections layout is [P_k, C] (outer perimeter point first, centroid second).
 * The first real facet is (sections[0].points[0], sections[0].points[1], sections[1].points[0])
 * = (P_0, C, P_1). If inward, reverse the perimeter traversal order by reversing the inner
 * sections (excluding the wrap-around last section) and updating the wrap-around to close
 * correctly. This preserves the [P_k, C] layout while reversing the polygon's winding.
 * Returns the (possibly reordered) sections.
 */
export const windFanSectionsOutward = (sections: Section[], projCenter: Vector3): Section[] => {
	if (sections.length < 2) return sections;
	// First real facet: (P_0, C, P_1) = (sections[0].points[0], sections[0].points[1], sections[1].points[0])
	const p0 = sections[0].points[0];
	const p1 = sections[0].points[1];
	const p2 = sections[1].points[0];
	const v1 = new Vector3().subVectors(p1, p0);
	const v2 = new Vector3().subVectors(p2, p0);
	const normal = new Vector3().crossVectors(v1, v2);
	const facetCentroid = new Vector3().addVectors(p0, p1).add(p2).divideScalar(3);
	const toFacet = new Vector3().subVectors(facetCentroid, projCenter);
	if (normal.dot(toFacet) < 0) {
		// Reverse perimeter traversal order.
		// sections layout: [P_0,C], [P_1,C], ..., [P_{m-1},C], [P_0,C] (wrap)
		// Reversed: [P_{m-1},C], [P_{m-2},C], ..., [P_0,C], [P_{m-1},C] (wrap)
		// Achieved by reversing the perimeter sections (0..m-1) and appending a new wrap.
		const perimeterSections = sections.slice(0, sections.length - 1).reverse();
		const wrap = { points: [perimeterSections[0].points[0].clone(), perimeterSections[0].points[1].clone()] };
		return [...perimeterSections, wrap];
	}
	return sections;
};
