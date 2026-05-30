import { Triangle, Vector3 } from 'three';
import type { Section } from './types';

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
