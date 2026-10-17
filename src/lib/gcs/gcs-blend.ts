import type { GcsBlend, LevelPrototype } from '$lib/types';

/** The cross-section prototype at silhouette parameter `t` (0..1). */
export type PrototypeAt = (t: number) => LevelPrototype;

/**
 * Maps the linear position `u` (0..1) between two anchors through a transition's
 * blend. The only place future blend modes (e.g. bezier) plug in.
 */
export function ease(blend: GcsBlend | undefined, u: number): number {
	switch (blend?.mode) {
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
