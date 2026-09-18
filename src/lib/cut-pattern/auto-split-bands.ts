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
 * A quad's length along the band: the distance between the midpoints of its two
 * rung edges (`a→b`, the near rung, and `d→c`, the far one).
 *
 * **Rotation- and translation-invariant, and that is the point.** The obvious
 * measure — the span of the four corners in y, since bands are re-aligned with
 * their long axis on y — is only valid within one band's own frame, and pieces
 * of a split parent do NOT share a frame: `generate-tiled-pattern.ts:136-137`
 * splits before aligning so each piece gets its own bounding box, and
 * `alignBands` (:617-628) takes `getMinimalBoundingBoxAndRotationAngle` per
 * band, inheriting only the flip (`parentAscending`), never the rotation. On a
 * curved or tapering band the pieces therefore come back rotated relative to
 * each other, a y-extent sum reads a SHORTER parent after the split than
 * before, and a second Auto-split click proposes different positions. Measuring
 * between rung midpoints removes the frame from the answer entirely, which is
 * what makes the union in `applyAutoSplits` genuinely idempotent.
 *
 * Midpoints rather than one nominated corner pair, so a tapering quad (its two
 * rungs different lengths) measures along its centreline instead of along
 * whichever side happens to be longer.
 */
export const quadBandExtent = (quad: Quadrilateral): number => {
	const nearX = (quad.a.x + quad.b.x) / 2;
	const nearY = (quad.a.y + quad.b.y) / 2;
	const farX = (quad.d.x + quad.c.x) / 2;
	const farY = (quad.d.y + quad.c.y) / 2;
	return Math.hypot(farX - nearX, farY - nearY);
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
			extents[offset + i] = quadBandExtent(quad);
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
 * can have very different lengths, and sizing off the shorter one would leave
 * an obviously worse split set for the siblings (design L409-411). Length is
 * the sum of per-quad extents — the same quantity the solver accumulates, i.e.
 * the band's centreline arc length — so the band chosen is the one that needs
 * the most cuts under the solver's own arithmetic. The sum is used only to
 * compare bands with each other, never reported.
 *
 * **A HEURISTIC, not a guarantee.** One split set is shared by every band of
 * the tube, but the constraint is per QUAD RANGE, and the greatest TOTAL length
 * does not dominate every range. Counterexample, budget 50:
 *
 * - band A: 90 quads of extent 1.0 → total 90, so A is chosen;
 * - band B: quads 0-44 of extent 1.2, quads 45-89 of extent 0.2 → total 63.
 *
 * First-fit on A cuts at 50, filling the budget exactly. B's first piece is
 * then 50 × 1.2 = 60 and still overflows. Nothing here detects that; the
 * overflow it leaves is reported by the page overflow notice, and the panel
 * re-reads the published budget after regenerating. The heuristic is the
 * spec's — keep it.
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
		// A tube with no usable address cannot be named in `TubeSplits.tube`, and
		// guessing its number from its position in the collated list is exactly
		// the positional identity this module exists to avoid.
		const tubeIndex = tube?.address?.tube;
		if (!Number.isInteger(tubeIndex)) continue;
		const quads = deriveAutoSplits({
			quadLengths: longestParentQuadExtents(tube.bands ?? []),
			pieceLengthBudget,
			subunitCount
		});
		if (quads.length === 0) continue;
		const set = byTube.get(tubeIndex) ?? new Set<number>();
		for (const quad of quads) set.add(quad);
		byTube.set(tubeIndex, set);
	}
	return [...byTube.entries()]
		.map(([tube, quads]) => ({ tube, quads: [...quads].sort((a, b) => a - b) }))
		.sort((a, b) => a.tube - b.tube);
};
