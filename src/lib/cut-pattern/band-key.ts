import type { GlobuleAddress_Band, GlobuleAddress_BandPiece } from '$lib/projection-geometry/types';

/**
 * Stable string key for a band or band piece.
 *
 * This previously existed as four separate copies — in band-sort-index.ts,
 * band-partner-info.ts, build-pattern-csv.ts (whose comment noted it was
 * mirroring a module-private original) and ProjectionGeometryComponent.svelte.
 * Split bands made the duplication actively dangerous, since a copy that does
 * not know about `piece` collides sibling pieces.
 *
 * The unsplit shape is unchanged: persisted group codes and CSV output depend
 * on it.
 */
export const bandKey = (a: GlobuleAddress_Band | GlobuleAddress_BandPiece): string => {
	const base = `${a.globule}-${a.tube}-${a.band}`;
	return 'piece' in a && a.piece !== undefined ? `${base}-p${a.piece}` : base;
};
