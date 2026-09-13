import type { PathSegment, Quadrilateral } from '$lib/types';
import { getAngle, rotatePS, translatePS } from '../utils';

/**
 * Bring a facet path from the previous (left-hand) band into this band's frame:
 * the previous quad's right edge (b→c, unit x = 1) is laid onto the reference
 * quad's left edge (a→d, unit x = 0) by a translation followed by a rotation.
 */
export const alignPrevBandPath = (
	path: PathSegment[],
	prevQuad: Quadrilateral,
	referenceQuad: Quadrilateral
): PathSegment[] => {
	const offset = { x: referenceQuad.a.x - prevQuad.b.x, y: referenceQuad.a.y - prevQuad.b.y };
	const angle = getAngle(referenceQuad.a, referenceQuad.d) - getAngle(prevQuad.b, prevQuad.c);
	const translated = translatePS(structuredClone(path), offset.x, offset.y);
	return rotatePS(translated, angle, referenceQuad.a);
};
