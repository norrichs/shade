/**
 * Derive split positions that make each piece fit the page's content box.
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
 * `contentLength`. Adjacent quads share an edge, so their sum over-counts the
 * band's true length; that is harmless here because the sum is only ever
 * compared against the page, and it errs towards smaller pieces.
 *
 * If a single subunit group already exceeds the content box, no split can help
 * and none is returned — the caller surfaces the existing overflow warning.
 */
export const deriveAutoSplits = ({
	quadLengths,
	contentLength,
	subunitCount
}: {
	quadLengths: number[];
	contentLength: number;
	subunitCount: number;
}): number[] => {
	const quadCount = quadLengths.length;
	if (quadCount === 0 || contentLength <= 0) return [];
	// A zero, negative or non-finite stride would never advance the group walk
	// below, hanging whichever thread called in. Real callers resolve this through
	// `resolveSplitSubunitCount`, which already floors at 1; this is a guard
	// against a bad config value, not an expected path.
	if (!Number.isFinite(subunitCount) || subunitCount < 1) return [];

	const total = quadLengths.reduce((sum, l) => sum + l, 0);
	if (total <= contentLength) return [];

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
		if (groupLength > contentLength) return [];

		if (runLength > 0 && runLength + groupLength > contentLength) {
			splits.push(start);
			runLength = groupLength;
		} else {
			runLength += groupLength;
		}
	}

	return splits;
};
