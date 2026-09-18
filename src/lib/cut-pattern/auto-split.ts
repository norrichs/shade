/**
 * Derive split positions that keep each piece inside the caller's per-piece
 * length budget.
 *
 * Greedy first-fit along the band, snapped to multiples of subunitCount so
 * both sides of every split stay divisible and generateTiling never refuses a
 * piece. A one-shot computation over already-generated geometry: the result is
 * written into config as ordinary splits, indistinguishable from hand-placed
 * ones (spec decisions table, "Auto-split materializes into the list; thereafter
 * it is plain hand data").
 *
 * Pure and deterministic: no store reads, no randomness, no time or iteration
 * order dependence, and a fresh array every call. The same input always yields
 * the same positions, and every position is legal by construction — a multiple
 * of `subunitCount`, strictly inside the band — which is the same rule
 * `classifySplitQuads` enforces at generation time, so nothing proposed here can
 * come back as a `rejectedSplits` entry.
 *
 * `quadLengths` are per-quad extents along the band axis, in the same units as
 * `pieceLengthBudget`.
 *
 * ## What the sum of `quadLengths` is, and is not
 *
 * It does NOT double-count: quad k+1's near rung IS quad k's far rung, so the
 * rung-midpoint distances `quadBandExtent` measures chain end to end and their
 * sum is the band's CENTRELINE ARC LENGTH.
 *
 * What overflow is tested against is something else: an axis-aligned BOX
 * extent. `flex-wrap.ts:20-21` and `skyline.ts:113-124` compare
 * `effectiveBoundsForBand` height against `PageGeom.contentHeight`
 * (`page-layout/registry.ts:20-21`). Arc length and box height are equal only
 * for a straight band laid along its box's long axis, and the gap cuts both
 * ways:
 *
 * - **Curved band, arc > box height.** The solver reads the piece as longer
 *   than the layout will measure it, so it can propose cuts for a tube that
 *   already fits. Conservative — a needless cut, not an overflowing one — but
 *   it is why a "no overflow" gate belongs at the caller (`split-budget.ts`)
 *   and not in the arithmetic here.
 * - **Short piece, box height taken from the WIDTH.** `alignBands` re-orients
 *   every piece onto its own minimal bounding box, so once a piece is short
 *   enough that the band's width is its longer dimension, the height the layout
 *   measures is a dimension this solver never looked at. A proposal can
 *   therefore still overflow. Splitting further cannot fix that case, which is
 *   the same shape as the `widthBlocked` precondition below.
 *
 * Neither gap is a safety margin, and neither may be relied on as one.
 *
 * ## The `pieceLengthBudget` contract — the caller owns the subtraction
 *
 * This is deliberately NOT named `contentLength`, because it is not
 * `PageGeom.contentHeight`. It is **the length available to one piece's raw
 * geometry, after the caller has subtracted everything the layout adds per
 * piece.**
 *
 * The real overflow rule lives in the layout, not here. `flex-wrap.ts:20-21`
 * (and `skyline.ts:113-124`) raise overflow as
 * `it.width > contentWidth || it.height > contentHeight`, and the item measured
 * is not the band's raw bounds: `toLayoutItems` (`CutPatternRenderer.svelte:147-157`)
 * builds it from `effectiveBoundsForBand` (`cut-pattern/band-layout.ts:33-49`),
 * i.e. geometry **plus the external self-tag / label footprint**. Splitting adds
 * pieces, and every piece carries its own tag, so a run sized at exactly
 * `contentHeight` can still overflow once it is laid out. The caller must
 * therefore reduce `contentHeight` by that per-piece footprint before calling
 * in. This module stays pure and renderer-free on purpose and cannot do it.
 *
 * ## Preconditions the caller must gate on
 *
 * Overflow is a two-dimensional test, and splitting along the band only ever
 * shortens a piece:
 *
 * - **Width.** `width > contentWidth` cannot be fixed by any number of splits —
 *   a piece is as wide as its band. Do not call here to fix that; it needs a
 *   bigger page or a smaller `pageScale`.
 * - **Rotation.** `skyline.ts:113-124` minimises over orientations when
 *   `allowRotation` is set, so a band that fits rotated is not overflowing at
 *   all and must not be split.
 *
 * If a single subunit group already exceeds the budget, no split can help and
 * none is returned — the caller surfaces the existing overflow warning.
 */
export const deriveAutoSplits = ({
	quadLengths,
	pieceLengthBudget,
	subunitCount
}: {
	quadLengths: number[];
	/** Length available to ONE piece's geometry. See the budget contract above. */
	pieceLengthBudget: number;
	subunitCount: number;
}): number[] => {
	const quadCount = quadLengths.length;
	if (quadCount === 0) return [];
	// Degenerate numerics terminate the walk below only by accident of NaN
	// comparison semantics (every `>` is false, so nothing is ever pushed and the
	// band is silently declared fitting). Rejected explicitly instead, so a bad
	// measurement proposes nothing rather than proposing nonsense.
	if (!Number.isFinite(pieceLengthBudget) || pieceLengthBudget <= 0) return [];
	if (!quadLengths.every((l) => Number.isFinite(l))) return [];
	// The stride must be a positive integer: zero or negative never advances the
	// group walk (an infinite loop on whichever thread called in), and a
	// fractional one yields fractional "quad indices", which are not quad
	// boundaries at all. Real callers resolve this through
	// `resolveSplitSubunitCount`, which already floors at 1; this guards a bad
	// config value, not an expected path.
	if (!Number.isInteger(subunitCount) || subunitCount < 1) return [];

	const total = quadLengths.reduce((sum, l) => sum + l, 0);
	if (total <= pieceLengthBudget) return [];

	const splits: number[] = [];
	let runLength = 0;

	// Walk in subunit groups so every candidate boundary is legal by construction.
	for (let group = 0; group * subunitCount < quadCount; group++) {
		const start = group * subunitCount;
		const end = Math.min(start + subunitCount, quadCount);
		const groupLength = quadLengths.slice(start, end).reduce((sum, l) => sum + l, 0);

		// A single subunit group that does not fit on its own is unsplittable
		// along the band: no arrangement of splits helps. Checked BEFORE any
		// push, so a late oversized group cannot silently discard the splits
		// already found — and the caller surfaces the existing overflow warning
		// instead of receiving a set of splits that still overflows.
		if (groupLength > pieceLengthBudget) return [];

		if (runLength > 0 && runLength + groupLength > pieceLengthBudget) {
			splits.push(start);
			runLength = groupLength;
		} else {
			runLength += groupLength;
		}
	}

	return splits;
};
