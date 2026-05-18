import type { PathSegment } from '$lib/types';
import { rotatePS, translatePS } from '$lib/patterns/utils';

/**
 * Lift a label outline from label-local coords (stem tip at origin) into the
 * band's local coord space by applying rotation around the origin, then
 * translation by `renderAnchor`.
 *
 * This matches the SVG transform pipeline `translate(anchor) rotate(angle)`
 * which is applied right-to-left at render time (rotate first, then
 * translate). The output is in band-local coords — the same space as
 * `band.facets[0].path`.
 *
 * `effectiveAngleRad` is in radians (NOT degrees).
 */
export const transformLabelOutlineToBandSpace = (
	localPath: PathSegment[],
	renderAnchor: { x: number; y: number },
	effectiveAngleRad: number
): PathSegment[] => {
	const rotated = rotatePS(localPath, effectiveAngleRad, { x: 0, y: 0 });
	return translatePS(rotated, renderAnchor.x, renderAnchor.y);
};
