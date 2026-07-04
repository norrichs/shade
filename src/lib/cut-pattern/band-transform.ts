import type { Point } from '$lib/types';

// SVG transform for a band placed at `origin`, optionally rotated `rotation`
// degrees about `pivot` (the band's local bounds-center). Rotation 0 yields a
// plain translate so unrotated bands render exactly as before.
export const bandTransform = (origin: Point, rotation: number, pivot: Point): string => {
	const t = `translate(${origin.x} ${origin.y})`;
	return rotation ? `${t} rotate(${rotation} ${pivot.x} ${pivot.y})` : t;
};
