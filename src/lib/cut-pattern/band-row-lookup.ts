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
import { bandKey } from './band-key';

/**
 * First index in `items` whose band is `band`: an exact address match (a piece
 * finds its own entry) wins; otherwise the first entry of the same parent band.
 * The fallback serves plain addresses, e.g. a click in the 3D view, which has no
 * pieces, landing on a split band. For unsplit data the two coincide.
 */
const findBandIndex = <T>(
	items: T[],
	band: GlobuleAddress_Band,
	matches: (item: T, same: (b: GlobuleAddress_Band) => boolean) => boolean
): number => {
	const key = bandKey(band);
	const exact = items.findIndex((item) => matches(item, (b) => bandKey(b) === key));
	if (exact !== -1) return exact;
	return items.findIndex((item) => matches(item, (b) => sameGlobuleBand(b, band)));
};

export const findBandRow = (
	index: BandSortIndex | undefined,
	flatBands: GlobuleAddress_Band[],
	band: GlobuleAddress_Band | undefined
): number | null => {
	if (!index || !band) return null;

	if (index.mode === 'end-connection-tube') {
		// A band can appear in more than one ring; the first row that contains it is
		// the one the grid scrolls to.
		const row = findBandIndex(index.groups, band, (group, same) => group.bands.some(same));
		return row === -1 ? null : row;
	}

	if (index.mode === 'tube-order') {
		const row = findBandIndex(flatBands, band, (b, same) => same(b));
		return row === -1 ? null : row;
	}

	return null;
};
