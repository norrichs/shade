export type BandRenderMode = 'per-facet' | 'merged-tiled' | 'merged-outlined';

/**
 * Decide which geometry a band draws.
 *
 * `PatternLabel` stops drawing its own tag outline as soon as the band is in
 * `mergedBandPaths`, because from that point the outline is supposed to be part
 * of the band's merged path. So a band with a prepared merge must draw that
 * merged path — drawing anything else loses the label outline outright. That is
 * the invariant this function exists to hold: `hasMerged` never yields
 * `per-facet`.
 *
 * The two merged modes differ only in how they are painted. A tiled union is a
 * filled silhouette with holes; an outlined merge is a single cut contour.
 */
export const resolveBandRenderMode = ({
	hasMerged,
	patternType
}: {
	hasMerged: boolean;
	patternType: string | undefined;
}): BandRenderMode => {
	if (!hasMerged) return 'per-facet';
	return patternType === 'outlined' ? 'merged-outlined' : 'merged-tiled';
};
