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
