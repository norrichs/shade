import type { BandCutPattern, Quadrilateral, TubeCutPattern, TubeSplits } from '$lib/types';

import { deriveAutoSplits } from './auto-split';
import { tubePieceIndex } from './band-piece-index';

/**
 * Turning generated bands into the input `deriveAutoSplits` wants.
 *
 * The solver works in ONE band's quad-index space and returns positions in it.
 * `TubeSplits.quads` is parent-absolute, so what it is fed must be a PARENT
 * band's extents — measuring a piece would return piece-local numbers
 * masquerading as parent addresses (Task 15 report, "Measure PARENT bands,
 * never pieces").
 *
 * A collated tube whose splits are already applied holds pieces, so the parent
 * is reassembled here from them, placing each piece's quads at its
 * `parentQuadOffset`. That is addressing by address, not by array position
 * (spec amendment, "Neighbour identity is by address, never by array
 * position"), and it is what makes the union in `applyAutoSplits` idempotent:
 * proposals derived from the parent do not move when the parent is already cut.
 */

/**
 * A quad's extent along the band axis.
 *
 * Bands are re-aligned with their long axis on y (`reAlignBand`), so "length
 * along the band" is the span of the quad's four corners in y. Taken as
 * max − min rather than from a nominated pair of corners, so a flipped or
 * skewed quad still measures its true extent.
 */
export const quadYExtent = (quad: Quadrilateral): number => {
	const ys = [quad.a.y, quad.b.y, quad.c.y, quad.d.y];
	return Math.max(...ys) - Math.min(...ys);
};

/** The quads a band's facets actually carry, the `QuadLabels.svelte` idiom. */
const quadsOf = (band: BandCutPattern): Quadrilateral[] =>
	band.facets.filter((facet) => !!facet.quad).map((facet) => facet.quad!);

/**
 * Per-quad extents of one PARENT band, in parent-quad-index space, assembled
 * from however many pieces it currently has.
 *
 * `undefined` when the parent cannot be measured: no quad-bearing facet at all
 * (a `DynamicPathCollection` tiled band collapses to one facet with no `quad` —
 * the same known gap the click targets have), or the pieces leave a hole in the
 * parent range, which would make the accumulated lengths silently wrong. Better
 * to propose nothing for that band than to propose from a partial measurement.
 */
export const parentQuadExtents = (pieces: BandCutPattern[]): number[] | undefined => {
	const extents: number[] = [];
	let last = -1;
	for (const piece of pieces) {
		// 0 on an uncut band: its quads already are the parent's.
		const offset = piece.parentQuadOffset ?? 0;
		quadsOf(piece).forEach((quad, i) => {
			extents[offset + i] = quadYExtent(quad);
			if (offset + i > last) last = offset + i;
		});
	}
	if (last < 0) return undefined;
	for (let i = 0; i <= last; i++) if (extents[i] === undefined) return undefined;
	return extents;
};

/**
 * The extents of the LONGEST parent band in a tube's band list.
 *
 * Longest by total length, not by quad count: two bands with equal quad counts
 * can have very different lengths, and sizing off the shorter one breaks the
 * property that makes one tube-wide split set safe for every sibling
 * (design L409-411). Length is the sum of per-quad extents — the same quantity
 * the solver accumulates — so the band chosen is the one that needs the most
 * cuts under the solver's own arithmetic. (That sum over-counts a band's true
 * length, because adjacent quads share an edge; it is used only to compare
 * bands with each other and against the page, never reported.)
 *
 * `[]` when no parent in the tube can be measured, which the solver reads as
 * "propose nothing".
 */
export const longestParentQuadExtents = (bands: BandCutPattern[]): number[] => {
	const { parents } = tubePieceIndex(bands);
	let best: number[] = [];
	let bestLength = -1;
	for (const parent of parents) {
		const extents = parentQuadExtents(parent);
		if (!extents) continue;
		const length = extents.reduce((sum, l) => sum + l, 0);
		if (length > bestLength) {
			bestLength = length;
			best = extents;
		}
	}
	return best;
};

/**
 * Auto-split proposals for every tube that needs them, ready to be unioned into
 * the persisted list.
 *
 * Keyed by `tube.address.tube`, never by position in `tubes`: `collateTubes`
 * concatenates tubes from several pattern variants, so a collated index is not
 * the tube number `splitFlatBands` is selected by at generation time. Two
 * collated entries naming the same tube merge into one, for the same reason.
 *
 * Every position returned is legal by the solver's construction — a multiple of
 * `subunitCount`, strictly inside the parent band — so nothing proposed here can
 * come back as a `rejectedSplits` entry.
 */
export const proposeTubeSplits = (
	tubes: TubeCutPattern[],
	{ pieceLengthBudget, subunitCount }: { pieceLengthBudget: number; subunitCount: number }
): TubeSplits[] => {
	const byTube = new Map<number, Set<number>>();
	for (const tube of tubes) {
		const quads = deriveAutoSplits({
			quadLengths: longestParentQuadExtents(tube.bands ?? []),
			pieceLengthBudget,
			subunitCount
		});
		if (quads.length === 0) continue;
		const tubeIndex = tube.address.tube;
		const set = byTube.get(tubeIndex) ?? new Set<number>();
		for (const quad of quads) set.add(quad);
		byTube.set(tubeIndex, set);
	}
	return [...byTube.entries()]
		.map(([tube, quads]) => ({ tube, quads: [...quads].sort((a, b) => a - b) }))
		.sort((a, b) => a.tube - b.tube);
};
