/**
 * Shared ring lookup for the Assembler's cross-view band highlight.
 *
 * Ring membership is defined by the current `BandSortIndex`, which until now
 * only `PatternData` could compute (it held the index locally). That left the
 * 3D view and the SVG view with no way to produce a ring, so a band clicked
 * outside the data grid could only ever highlight itself. Deriving the lookup
 * once here means all three contexts resolve the same ring for the same band.
 *
 * Lives in its own module rather than in `selectionStores` because the lookup
 * needs `patternConfigStore` / `viewControlStore`, and pulling those into
 * `selectionStores` (which sits underneath much of the store graph) risks the
 * same import cycle that `$lib/assembler-highlight` was carved out to avoid.
 */
import { derived, get } from 'svelte/store';
import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';
import { buildBandRingLookup, type BandRingLookup } from '$lib/cut-pattern/band-ring-lookup';
import { collateTubes } from '$lib/cut-pattern/collate-tubes';
import { buildBandSortIndex } from '$lib/cut-pattern/band-sort-index';
import { superGlobulePatternStore } from './superGlobuleStores';
import { patternConfigStore } from './globulePatternStores';
import { viewControlStore } from './viewControlStore';
import { setAssemblerHighlight } from './selectionStores';

export type { BandRingLookup };

export const bandRingLookup = derived(
	[superGlobulePatternStore, patternConfigStore, viewControlStore],
	([$superGlobulePatternStore, $patternConfigStore, $viewControlStore]): BandRingLookup => {
		const empty: BandRingLookup = () => [];

		const patternState = $superGlobulePatternStore;
		if (!patternState || typeof patternState === 'string') return empty;

		const mode = $patternConfigStore.patternViewConfig.bandSortMode ?? 'tube-order';
		// tube-order has no rings; skip the (non-trivial) index build entirely.
		if (mode === 'tube-order') return empty;

		let index;
		try {
			const tubes = collateTubes({
				globuleTubePattern: patternState.globuleTubePattern,
				projectionPattern: patternState.projectionPattern,
				surfaceProjectionPattern: patternState.surfaceProjectionPattern,
				voronoiPattern: patternState.voronoiPattern,
				voronoiSurfacePattern: patternState.voronoiSurfacePattern,
				showGlobuleTubeGeometry: $viewControlStore.showGlobuleTubeGeometry,
				showProjectionGeometry: $viewControlStore.showProjectionGeometry,
				patternSource: $patternConfigStore.patternViewConfig.patternSource ?? 'projection'
			});
			if (!tubes.length) return empty;
			index = buildBandSortIndex(tubes, mode);
		} catch (e) {
			console.warn('bandRingLookup: failed to build band sort index', e);
			return empty;
		}

		// Piece-aware, with a parent fallback for plain (3D view) addresses.
		return buildBandRingLookup(index);
	}
);

/**
 * Highlight `band` along with its ring, resolved through `bandRingLookup`.
 *
 * The single entry point for a band click in ANY of the three Assembler
 * contexts (3D geometry, SVG pattern, data grid), so they cannot disagree about
 * which bands belong to the clicked band's ring. Re-clicking the highlighted
 * band clears the highlight (see `setAssemblerHighlight`).
 */
export const setAssemblerHighlightForBand = (band: GlobuleAddress_Band): void => {
	setAssemblerHighlight(band, get(bandRingLookup)(band));
};
