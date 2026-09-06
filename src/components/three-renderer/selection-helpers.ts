import type { GeometrySource } from '$lib/stores';
import { recordBandSelection } from '$lib/stores';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';
import { isNearestIntersection } from './nearest-vertex';

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
