import type { GeometrySource } from '$lib/stores';
import { patternBandSpaces, recordBandSelection, setAssemblerHighlightForBand } from '$lib/stores';
import type { GlobuleAddress_Band, GlobuleAddress_Facet } from '$lib/projection-geometry/types';
import { realBandToPattern } from '$lib/cut-pattern/pattern-band-space';
import type { Vector3 } from 'three';
import { get } from 'svelte/store';
import { addMeasurementPoint } from '$lib/stores/measurementStore';
import { interactionMode, isMeasureInteractionMode } from './interaction-mode';
import { isNearestIntersection, nearestVertexFromEvent } from './nearest-vertex';

/**
 * Standard facet-click handler for any geometry source: ignore non-nearest hits,
 * stop propagation, and record the band selection. Pass the per-source setter
 * (e.g. `(a) => ($selectedVoronoiSurface = a)`) to also drive in-scene
 * highlighting for that source.
 */
export const handleFacetSelect = (
	ev: {
		object?: unknown;
		point?: Vector3;
		intersections?: { object: unknown }[];
		stopPropagation?: () => void;
	},
	source: GeometrySource,
	address: GlobuleAddress_Facet,
	setHighlight?: (address: GlobuleAddress_Facet) => void
): void => {
	if (!isNearestIntersection(ev)) return;
	ev.stopPropagation?.();

	// While measuring, a facet click places a measurement point instead of
	// changing the selection — so measurement works on projection, surface and
	// voronoi geometry, not just globule bands.
	if (isMeasureInteractionMode(get(interactionMode))) {
		const vertex = nearestVertexFromEvent(ev);
		if (vertex) addMeasurementPoint(vertex);
		return;
	}

	setHighlight?.(address);
	recordBandSelection(source, address);

	// Also drive the Assembler cross-view highlight, so a band clicked in 3D lights
	// up in the SVG pattern and the data grid too. Facet index is dropped — the
	// cross-view highlight is band-granular.
	highlightRealBand(source, address);
};

/**
 * Drive the Assembler cross-view highlight from a band clicked in 3D. The
 * highlight is in pattern band space and the click in real band space, so the
 * band is mapped first; a band that was not patterned (hidden, or a fill band a
 * tiled pattern drops) has no pattern band and highlights nothing.
 */
export const highlightRealBand = (source: GeometrySource, address: GlobuleAddress_Band): void => {
	const band = realBandToPattern(get(patternBandSpaces)(source, address.globule), {
		globule: address.globule,
		tube: address.tube,
		band: address.band
	});
	if (band) setAssemblerHighlightForBand(band);
};
