import { derived } from 'svelte/store';
import type { GlobuleAddress_Band } from '#lib/projection-geometry/types.js';
import {
	assemblerHighlightOnSource,
	realBandToPattern
} from '#lib/cut-pattern/pattern-band-space.js';
import {
	bandFilterKey,
	patternFilterIncludes,
	patternedBandCount
} from '#lib/cut-pattern/pattern-filter.js';
import type { AssemblerHighlight } from '#lib/assembler-highlight.js';
import {
	assemblerHighlight,
	patternBandSpaces,
	tubesForGeometrySource,
	type GeometrySource
} from './selectionStores';
import { patternFilterSet, rangeShownBands } from './patternFilterSetStore';
import { modelRenderMode } from './uiStores';
import { superGlobulePatternStore, superGlobuleStore } from './superGlobuleStores';

/**
 * How each 3D band should be marked: the Assembler highlight and ring, the
 * pattern filter's shown set (red), and — in Selection render mode — the Range's
 * bands. One definition shared by the plain band/facet meshes
 * (ProjectionGeometryComponent) and the Pattern-on-model overlay, which marks
 * the same bands with a tint instead of a material swap.
 */
export type BandHighlightState = {
	/** The Assembler highlight mapped onto one source's real bands. */
	highlightFor: (source: GeometrySource) => AssemblerHighlight;
	/** Pattern-filtered (Model mode), or in the Range (Selection mode). */
	isFiltered: (source: GeometrySource, address?: GlobuleAddress_Band) => boolean;
	selectionView: boolean;
};

export const bandHighlightState = derived(
	[
		assemblerHighlight,
		patternBandSpaces,
		patternFilterSet,
		rangeShownBands,
		superGlobuleStore,
		superGlobulePatternStore,
		modelRenderMode
	],
	([$highlight, $spaceOf, $filterSet, $shown, $sg, $pattern, $renderMode]): BandHighlightState => {
		const selectionView = $renderMode === 'selection';

		// Mapped once per source per highlight (not per mesh).
		const cache = new Map<GeometrySource, AssemblerHighlight>();
		const highlightFor = (source: GeometrySource): AssemblerHighlight => {
			if (!$highlight) return null;
			if (!cache.has(source))
				cache.set(source, assemblerHighlightOnSource($spaceOf, $highlight, source));
			return cache.get(source) ?? null;
		};

		// The pattern filter's shown set (pattern band space) on one source's real
		// bands, painted red in 3D. False for every band while nothing is filtered.
		const isClickFiltered = (source: GeometrySource, address?: GlobuleAddress_Band) => {
			if (!$filterSet || !address || $filterSet.source !== source) return false;
			const band = realBandToPattern($spaceOf(source, address.globule), address);
			return !!band && patternFilterIncludes($filterSet, source, band);
		};

		// A range that shows every patterned band selects nothing in particular.
		const rangeNarrows =
			!!$shown &&
			$shown.keys.size <
				patternedBandCount(
					tubesForGeometrySource($sg, $shown.source as GeometrySource),
					$pattern.keepsFillBands
				);
		const isInRange = (source: GeometrySource, address?: GlobuleAddress_Band) => {
			if (!rangeNarrows || !$shown || !address || $shown.source !== source) return false;
			const band = realBandToPattern($spaceOf(source, address.globule), address);
			return !!band && $shown.keys.has(bandFilterKey(band));
		};

		return {
			highlightFor,
			isFiltered: (source, address) =>
				isClickFiltered(source, address) || (selectionView && isInRange(source, address)),
			selectionView
		};
	}
);
