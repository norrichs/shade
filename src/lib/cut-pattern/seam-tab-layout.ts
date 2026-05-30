import type { TabEdgeOption } from '$lib/types';

/**
 * Index of the seam closest to the tube center.
 *
 * Seam `i` sits between bands `i` and `i+1` at position `i + 0.5`.
 * Tube center = (bandCount - 1) / 2. Even bandCount has one middle seam;
 * odd bandCount has a center *band* with two tied flanking seams — we pick
 * the LOWER seam index deterministically.
 *
 * Returns -1 when no seams exist (bandCount < 2).
 */
export const centerSeamIndex = (bandCount: number): number => {
	if (bandCount < 2) return -1;
	if (bandCount % 2 === 0) return bandCount / 2 - 1;
	const centerBand = (bandCount - 1) / 2;
	return centerBand - 1;
};

export type SeamTabOwner = { band: number; edge: 'before' | 'after' };

/**
 * Which band+edge carries the tab for the seam between bands `seamIndex` and
 * `seamIndex + 1`. Returns 0, 1, or 2 owners (2 only for a beforeAndAfter center).
 *
 * - Center seam: governed by `bandEdge` (before => upper band's before edge;
 *   after => lower band's after edge; beforeAndAfter => both; undefined => none).
 * - Non-center seam: the band nearer the center owns it under `inner` (on the
 *   edge facing the farther band); under `outer` the farther band owns it (mirror).
 */
export const seamTabOwner = (
	seamIndex: number,
	bandCount: number,
	layout: 'inner' | 'outer',
	bandEdge: TabEdgeOption | undefined
): SeamTabOwner[] => {
	const lower = seamIndex;
	const upper = seamIndex + 1;

	if (seamIndex === centerSeamIndex(bandCount)) {
		if (bandEdge === 'before') return [{ band: upper, edge: 'before' }];
		if (bandEdge === 'after') return [{ band: lower, edge: 'after' }];
		if (bandEdge === 'beforeAndAfter')
			return [
				{ band: upper, edge: 'before' },
				{ band: lower, edge: 'after' }
			];
		return [];
	}

	const center = (bandCount - 1) / 2;
	const nearer = Math.abs(lower - center) <= Math.abs(upper - center) ? lower : upper;
	const owner = layout === 'inner' ? nearer : nearer === lower ? upper : lower;
	// owner === lower => tab on its 'after' edge (faces upper);
	// owner === upper => tab on its 'before' edge (faces lower).
	const edge: 'before' | 'after' = owner === lower ? 'after' : 'before';
	return [{ band: owner, edge }];
};
