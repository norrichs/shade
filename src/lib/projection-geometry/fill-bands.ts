import { Triangle, Vector3 } from 'three';
import type { Band, Facet, FacetOrientation } from '$lib/types';
import type { Section, GlobuleAddress_Band } from './types';

/** Edges shorter than this (Euclidean) are treated as collapsed/degenerate. */
export const FILL_DEGENERATE_EPSILON = 1e-6;

/** True when any edge of the triangle is shorter than FILL_DEGENERATE_EPSILON. */
export const isDegenerateTriangle = (t: Triangle): boolean => {
	const eps2 = FILL_DEGENERATE_EPSILON * FILL_DEGENERATE_EPSILON;
	return (
		t.a.distanceToSquared(t.b) < eps2 ||
		t.b.distanceToSquared(t.c) < eps2 ||
		t.c.distanceToSquared(t.a) < eps2
	);
};

/**
 * The outer-border polyline of a tube's first or last band.
 * 'first' → points[0] of each section; 'last' → points[last] of each section.
 * These are the polygon/cell-bordering ("open space") edges. Returns ordered clones.
 */
export const outerBorderPolyline = (sections: Section[], side: 'first' | 'last'): Vector3[] =>
	sections.map((s) =>
		(side === 'first' ? s.points[0] : s.points[s.points.length - 1]).clone()
	);

const realFacetNormalDotOutward = (
	p0: Vector3,
	p1: Vector3,
	center: Vector3,
	projCenter: Vector3
): number => {
	const normal = new Vector3().subVectors(p1, p0).cross(new Vector3().subVectors(center, p0));
	const facetCentroid = new Vector3().addVectors(p0, p1).add(center).divideScalar(3);
	return normal.dot(new Vector3().subVectors(facetCentroid, projCenter));
};

/**
 * Build one interior fill band for a polygon/cell border polyline.
 * Real facet per segment = (P_j, P_{j+1}, C); degenerate facet = (P_{j+1}, C, C).
 * Wound so real-facet normals face away from projCenter.
 */
export const buildFillBand = ({
	borderEdge,
	center,
	address,
	projCenter
}: {
	borderEdge: Vector3[];
	center: Vector3;
	address: GlobuleAddress_Band;
	projCenter: Vector3;
}): Band => {
	const orientation: FacetOrientation = 'axial-right';
	// Orient the polyline so the first real facet faces outward.
	let edge = borderEdge;
	if (edge.length >= 2) {
		const dot = realFacetNormalDotOutward(edge[0], edge[1], center, projCenter);
		if (dot < 0) edge = [...borderEdge].reverse();
	}

	const facets: Facet[] = [];
	for (let j = 0; j < edge.length - 1; j++) {
		const pj = edge[j];
		const pj1 = edge[j + 1];
		facets.push({
			triangle: new Triangle(pj.clone(), pj1.clone(), center.clone()),
			address: { ...address, facet: facets.length },
			orientation
		});
		facets.push({
			triangle: new Triangle(pj1.clone(), center.clone(), center.clone()),
			address: { ...address, facet: facets.length },
			orientation,
			isDegenerate: true
		});
	}

	return { facets, orientation, visible: true, isFill: true, address };
};
