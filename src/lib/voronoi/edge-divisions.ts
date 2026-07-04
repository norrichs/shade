/**
 * Pure helpers for adaptive Voronoi edge divisions. Kept dependency-free (no three,
 * no config) so they can be imported by lightweight modules (e.g. migration) and
 * unit-tested in isolation.
 */

/**
 * Clamp an edgeDivisions pair to its invariant (min <= max) and to >= 1 division
 * each, rounding to integers. Also accepts the legacy scalar form (n -> [n, n]).
 */
export function normalizeEdgeDivisions(edgeDivisions: [number, number] | number): [number, number] {
	const pair: [number, number] = Array.isArray(edgeDivisions)
		? [edgeDivisions[0], edgeDivisions[1]]
		: [edgeDivisions, edgeDivisions];
	const lo = Math.max(1, Math.round(Math.min(pair[0], pair[1])));
	const hi = Math.max(1, Math.round(Math.max(pair[0], pair[1])));
	return [lo, hi];
}

/**
 * Per-edge division counts. The shortest edge gets minDivisions, the longest gets
 * maxDivisions, and every edge in between is linearly interpolated by length. When
 * all edges are (near) equal length, every edge gets maxDivisions.
 */
export function computeAdaptiveEdgeDivisions(
	lengths: number[],
	edgeDivisions: [number, number]
): number[] {
	const [minDiv, maxDiv] = normalizeEdgeDivisions(edgeDivisions);
	if (lengths.length === 0) return [];
	const minLen = Math.min(...lengths);
	const maxLen = Math.max(...lengths);
	const range = maxLen - minLen;
	return lengths.map((len) => {
		if (range < 1e-9) return maxDiv;
		const t = (len - minLen) / range;
		return Math.max(1, Math.round(minDiv + t * (maxDiv - minDiv)));
	});
}

/** Per-edge geometry needed to reason about facet aspect ratios. */
export type EdgeMetric = { length: number; width: number };

/**
 * Facet aspect ratio for one edge subdivided into `divisions` segments:
 * each facet is (length / divisions) long and `width` wide, so
 *   aspect = width / (length / divisions) = width * divisions / length.
 */
function facetAspect(edge: EdgeMetric, divisions: number): number {
	return (edge.width * divisions) / edge.length;
}

/**
 * Derive a `max` edge-division count so the facets on the LONGEST voronoi edges have
 * an aspect ratio close to the facets on the SHORTEST edges (which get `min`
 * divisions). Keeps facets visually consistent across a size range.
 *
 * Two passes:
 *   1. Use the single shortest edge (at `min` divisions) as the aspect target and
 *      solve for the integer `max` that best matches on the single longest edge.
 *   2. Assign every edge its adaptive division count for [min, pass1Max], then refine:
 *      target = mean facet-aspect of the edges assigned `min`; solve `max` so the mean
 *      facet-aspect of the edges assigned `max` matches that target. Averaging over the
 *      groups (rather than lone extremes) makes the result robust to outlier edges.
 *
 * Returns `max` rounded to an integer and clamped to [min, maxCap]. Falls back to
 * `min` when there isn't enough distinct geometry to derive from.
 */
export function deriveEdgeDivisionsMax(
	edges: EdgeMetric[],
	min: number,
	opts: { maxCap?: number } = {}
): number {
	const maxCap = Math.max(min, Math.round(opts.maxCap ?? 20));
	const clampMax = (m: number) => Math.min(maxCap, Math.max(min, Math.round(m)));

	const usable = edges.filter((e) => e.length > 1e-9 && e.width > 1e-9);
	if (usable.length < 2) return min;

	const lengths = usable.map((e) => e.length);
	const minLen = Math.min(...lengths);
	const maxLen = Math.max(...lengths);
	// All edges (near) equal length: adaptive divisions collapse to a single value and
	// there is no short/long distinction to match, so keep max at min.
	if (maxLen - minLen < 1e-9) return min;

	const shortEdge = usable[lengths.indexOf(minLen)];
	const longEdge = usable[lengths.indexOf(maxLen)];

	// Pass 1 — single shortest vs single longest.
	const targetAspect1 = facetAspect(shortEdge, min);
	// Solve width_long * max / length_long = targetAspect1.
	const pass1Max = clampMax((targetAspect1 * longEdge.length) / longEdge.width);

	// Pass 2 — group by assigned division count and average.
	const counts = computeAdaptiveEdgeDivisions(lengths, [min, pass1Max]);
	const minGroup = usable.filter((_, i) => counts[i] === min);
	const maxGroup = usable.filter((_, i) => counts[i] === pass1Max);
	// Fall back to the lone extremes if a group is empty (e.g. pass1Max === min).
	const minG = minGroup.length ? minGroup : [shortEdge];
	const maxG = maxGroup.length ? maxGroup : [longEdge];

	const targetAspect2 = minG.reduce((s, e) => s + facetAspect(e, min), 0) / minG.length;
	// mean facet-aspect of the max group at D divisions = D * mean(width / length).
	const meanWOverL = maxG.reduce((s, e) => s + e.width / e.length, 0) / maxG.length;
	if (meanWOverL < 1e-12) return pass1Max;

	return clampMax(targetAspect2 / meanWOverL);
}
