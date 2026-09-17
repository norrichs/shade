/**
 * Band → ring lookup for the Assembler's cross-view band highlight, built from a
 * `BandSortIndex`. Pure, so `bandRingStore` can derive it and tests can use it.
 */
import type { BandSortIndex } from '$lib/types';
import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';
import { concatAddress_Band } from '$lib/util';
import { bandKey } from './band-key';

/** Every band in `band`'s ring (including itself); empty when it has none. */
export type BandRingLookup = (band: GlobuleAddress_Band) => GlobuleAddress_Band[];

/**
 * - A band or piece finds the ring that holds it exactly (`bandKey`, which
 *   includes `piece`).
 * - A plain address that is not itself a ring member — a click in the 3D view,
 *   which has no pieces, on a split band — falls back to the ring of that parent
 *   band's pieces (`concatAddress_Band` ignores `piece`).
 *
 * Where a key is in several rings, the last one indexed wins (unchanged).
 * Unsplit data never reaches the fallback, so it resolves exactly as before.
 */
export const buildBandRingLookup = (index: BandSortIndex): BandRingLookup => {
	const exact = new Map<string, GlobuleAddress_Band[]>();
	const byParent = new Map<string, GlobuleAddress_Band[]>();
	index.groups.forEach((group) => {
		group.bands.forEach((band) => {
			exact.set(bandKey(band), group.bands);
			byParent.set(concatAddress_Band(band), group.bands);
		});
	});
	return (band: GlobuleAddress_Band) =>
		exact.get(bandKey(band)) ?? byParent.get(concatAddress_Band(band)) ?? [];
};
