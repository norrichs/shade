import type { BandCutPattern, BandRef, BandSortIndex, TubeCutPattern } from '$lib/types';
import { isSameAddress } from '$lib/util';
import { bandKey } from './band-key';

/**
 * Resolution of a `BandSortIndex`'s refs back to the bands they name, for the
 * cut-pattern renderer's sort-index path (any `bandSortMode` but `tube-order`).
 *
 * A ref names one band or one piece exactly (spec amendment 2026-09-16,
 * "Neighbour identity is by address"). Matching on `address.band` alone
 * resolved every piece of a split band to its piece 0, so piece 0 rendered
 * repeatedly, later pieces never did, and the renderer's keyed `{#each}` got
 * duplicate keys.
 */

export type ResolvedBand = { band: BandCutPattern; tube: TubeCutPattern };

export const resolveBandWithTube = (
	tubes: TubeCutPattern[],
	ref: BandRef
): ResolvedBand | undefined => {
	const tube = tubes.find((t) => t.address.tube === ref.tube && t.address.globule === ref.globule);
	if (!tube) return undefined;
	const band = tube.bands.find((b) => isSameAddress(b.address, ref));
	if (!band) return undefined;
	return { band, tube };
};

export const resolveIndexBands = (tubes: TubeCutPattern[], index: BandSortIndex): ResolvedBand[] =>
	index.groups.flatMap((group) =>
		group.bands.map((ref) => resolveBandWithTube(tubes, ref)).filter((r): r is ResolvedBand => !!r)
	);

/** The group code of a band or piece; `buildBandCodeMap` keys by `bandKey`. */
export const groupCodeForBand = (
	codeMap: Map<string, string> | undefined,
	address: BandRef
): string | undefined => codeMap?.get(bandKey(address));
