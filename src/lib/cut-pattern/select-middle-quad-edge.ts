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
