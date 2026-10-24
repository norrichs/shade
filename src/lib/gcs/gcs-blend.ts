import type { BezierConfig, GcsBlend, LevelPrototype } from '#lib/types.js';

/** The cross-section prototype at silhouette parameter `t` (0..1). */
export type PrototypeAt = (t: number) => LevelPrototype;

/** A blend curve from (0,0) to (1,1) with handles (x1,y1) and (x2,y2), as in CSS cubic-bezier. */
export const easeCurve = (x1: number, y1: number, x2: number, y2: number): BezierConfig => ({
	type: 'BezierConfig',
	points: [
		{ type: 'PointConfig2', x: 0, y: 0 },
		{ type: 'PointConfig2', x: x1, y: y1 },
		{ type: 'PointConfig2', x: x2, y: y2 },
		{ type: 'PointConfig2', x: 1, y: 1 }
	]
});

/**
 * The blend used when a cross section sets none: CSS `ease-in-out`. Both handles
 * are level (y = 0, y = 1), so the morph has zero rate at each cross section and
 * the surface passes through it without a crease.
 */
export const DEFAULT_GCS_EASE: GcsBlend = { mode: 'bezier', curve: easeCurve(0.42, 0, 0.58, 1) };

/** A fresh copy of the default, for writing into a config. */
export const defaultGcsBlend = (): GcsBlend => structuredClone(DEFAULT_GCS_EASE);

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** One coordinate of a cubic from 0 to 1 with handle coordinates p1, p2, at parameter s. */
const cubic01 = (p1: number, p2: number, s: number) => {
	const r = 1 - s;
	return 3 * r * r * s * p1 + 3 * r * s * s * p2 + s * s * s;
};

/**
 * y for a given x on the curve. Handles are clamped into the unit square, which
 * keeps x(s) non-decreasing (so x has exactly one s) and y inside [0, 1] (so the
 * blend never extrapolates past either cross section). Bisection, because x(s)
 * may be flat where Newton would stall; 50 halvings is below double precision.
 */
const solveBezier = (curve: BezierConfig, u: number): number => {
	const [, h1, h2] = curve.points;
	const x1 = clamp01(h1.x);
	const x2 = clamp01(h2.x);
	let lo = 0;
	let hi = 1;
	let s = u;
	for (let i = 0; i < 50; i++) {
		const x = cubic01(x1, x2, s);
		if (x === u) break;
		if (x < u) lo = s;
		else hi = s;
		s = (lo + hi) / 2;
	}
	return cubic01(clamp01(h1.y), clamp01(h2.y), s);
};

/**
 * Maps the linear position `u` (0..1) between two anchors through a transition's
 * blend. 0 and 1 map to themselves exactly, so each cross section is reproduced
 * exactly at its own level whatever the curve.
 */
export function ease(blend: GcsBlend | undefined, u: number): number {
	if (u <= 0) return 0;
	if (u >= 1) return 1;
	const effective = blend ?? DEFAULT_GCS_EASE;
	switch (effective.mode) {
		case 'bezier':
			return solveBezier(effective.curve, u);
		case 'linear':
		default:
			return u;
	}
}

const clonePrototype = (p: LevelPrototype): LevelPrototype => ({
	center: p.center.clone(),
	vertices: p.vertices.map((v) => v.clone())
});

const lerpPrototype = (a: LevelPrototype, b: LevelPrototype, u: number): LevelPrototype => ({
	center: a.center.clone().lerp(b.center, u),
	vertices: a.vertices.map((v, k) => v.clone().lerp(b.vertices[k], u))
});

/**
 * Blends prototypes anchored at silhouette levels (`levels[i] / divisions` in t).
 * Holds the first below the lowest anchor and the last above the highest.
 * Every call returns fresh objects. Assumes a valid list (equal vertex counts,
 * strictly increasing levels).
 */
export function makePrototypeAt(
	prototypes: LevelPrototype[],
	levels: number[],
	divisions: number,
	blends: (GcsBlend | undefined)[]
): PrototypeAt {
	if (prototypes.length === 1) {
		const only = prototypes[0];
		return () => clonePrototype(only);
	}
	const anchors = levels.map((level) => level / divisions);
	const last = prototypes.length - 1;
	return (t: number) => {
		if (t <= anchors[0]) return clonePrototype(prototypes[0]);
		if (t >= anchors[last]) return clonePrototype(prototypes[last]);
		let i = 0;
		while (i < last - 1 && t >= anchors[i + 1]) i++;
		const u = ease(blends[i], (t - anchors[i]) / (anchors[i + 1] - anchors[i]));
		return lerpPrototype(prototypes[i], prototypes[i + 1], u);
	};
}
