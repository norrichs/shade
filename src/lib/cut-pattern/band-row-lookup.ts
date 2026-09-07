/**
 * Which data-grid row holds a given band.
 *
 * The Assembler's data pane renders one row per sort-index group (end-connection
 * mode) or one row per band in tube-major order (tube-order mode). Auto-scroll
 * needs the reverse mapping — band address to row index — which is why this is a
 * pure helper rather than more logic inside the component's per-cell resolver.
 *
 * The returned index is the row's ORIGINAL position, matching `index.groups[r]` /
 * `flatBands[r]`, so it stays valid after the filters reorder or drop rows.
 */
import type { BandSortIndex } from '$lib/types';
import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';
import { sameGlobuleBand } from '$lib/assembler-highlight';

export const findBandRow = (
	index: BandSortIndex | undefined,
	flatBands: GlobuleAddress_Band[],
	band: GlobuleAddress_Band | undefined
): number | null => {
	if (!index || !band) return null;

	if (index.mode === 'end-connection-tube') {
		// A band can appear in more than one ring; the first row that contains it is
		// the one the grid scrolls to.
		const row = index.groups.findIndex((group) =>
			group.bands.some((b) => sameGlobuleBand(b, band))
		);
		return row === -1 ? null : row;
	}

	if (index.mode === 'tube-order') {
		const row = flatBands.findIndex((b) => sameGlobuleBand(b, band));
		return row === -1 ? null : row;
	}

	return null;
};
