/**
 * Index of the "middle" quad in a band of `quadCount` quads, rounding down for
 * even counts (quadCount 1,2,3,4,5 -> 0,0,1,1,2).
 */
export const middleQuadIndex = (quadCount: number): number =>
	Math.floor((quadCount - 1) / 2);

/**
 * The middle quad's index plus the indices of its two outer edges in the
 * `OutlineEdge[]` walk produced by `getOutlineEdges`. For `n = quadCount`:
 * - before (a->d) edge of quad i sits at index i
 * - after (c->b) edge of quad i sits at index 2n - i
 */
export const middleQuadEdgeIndices = (
	quadCount: number
): { midQuad: number; beforeIndex: number; afterIndex: number } => {
	const midQuad = middleQuadIndex(quadCount);
	return {
		midQuad,
		beforeIndex: midQuad,
		afterIndex: 2 * quadCount - midQuad
	};
};

export type EdgeCandidate = {
	/** Index of this edge in the OutlineEdge[] walk array. */
	index: number;
	/** Whether this edge has a tab (its index is present in tabsByIndex). */
	hasTab: boolean;
	/** Partner band number if an adjacent band shares this edge, else undefined. */
	partnerBand: number | undefined;
};

/**
 * Pick the better of the middle quad's two outer edges. Lower tier wins:
 *  1. no tab over tab
 *  2. no partner over partner (when tab status ties)
 *  3. higher partner band number (when both still tie with partners)
 *  4. deterministic fallback to the `before` candidate (passed first)
 */
export const selectMiddleQuadEdgeIndex = (
	before: EdgeCandidate,
	after: EdgeCandidate
): number => {
	// 1. no tab over tab
	if (before.hasTab !== after.hasTab) {
		return before.hasTab ? after.index : before.index;
	}
	// 2. no partner over partner
	const beforeHasPartner = before.partnerBand !== undefined;
	const afterHasPartner = after.partnerBand !== undefined;
	if (beforeHasPartner !== afterHasPartner) {
		return beforeHasPartner ? after.index : before.index;
	}
	// 3. higher partner band number (only meaningful when both have partners)
	if (beforeHasPartner && afterHasPartner && before.partnerBand !== after.partnerBand) {
		return (before.partnerBand as number) > (after.partnerBand as number)
			? before.index
			: after.index;
	}
	// 4. deterministic fallback
	return before.index;
};
