import type { GeometrySource } from '$lib/stores';
import { recordBandSelection } from '$lib/stores';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';

/**
 * Threlte's pointer events report ALL meshes under the cursor (`ev.intersections`
 * is depth-sorted, nearest first). For selection we only want the nearest hit —
 * otherwise a click also lands on back-faces / occluded facets behind it.
 *
 * Returns true only when the event's own object is the nearest intersection.
 */
export const isNearestIntersection = (ev: {
	object?: unknown;
	intersections?: { object: unknown }[];
}): boolean => ev.intersections?.[0]?.object === ev.object;

/**
 * Standard facet-click handler for any geometry source: ignore non-nearest hits,
 * stop propagation, and record the band selection. Pass the per-source setter
 * (e.g. `(a) => ($selectedVoronoiSurface = a)`) to also drive in-scene
 * highlighting for that source.
 */
export const handleFacetSelect = (
	ev: { object?: unknown; intersections?: { object: unknown }[]; stopPropagation?: () => void },
	source: GeometrySource,
	address: GlobuleAddress_Facet,
	setHighlight?: (address: GlobuleAddress_Facet) => void
): void => {
	if (!isNearestIntersection(ev)) return;
	ev.stopPropagation?.();
	setHighlight?.(address);
	recordBandSelection(source, address);
};
