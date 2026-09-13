import type { PathSegment, Quadrilateral } from '$lib/types';
import type { IndexPair } from '../spec-types';
import { replaceInPlace } from '../tesselation/shared/helpers';
import { rotatePS, translatePS } from '../utils';

/**
 * Snap nodes of a facet onto nodes of a neighbouring facet (or of itself), by
 * path index. `from` names where the source node lives:
 * - `prev` / `next`: the previous / next facet along the band
 * - `self`: the same facet (e.g. adjacent columns inside one quad)
 */
export type FacetSnapRule = { from: 'prev' | 'next' | 'self'; pairs: IndexPair[] };

/**
 * Apply per-facet snap rules to a mapped band. Sources are always read from the
 * unmodified input, so rule order never matters. With `endsMatched`, the first
 * facet's `prev` and the last facet's `next` are the far-end facet translated so
 * the two ends meet (Asanoha's end matching).
 */
export const snapAdjacentFacets = (
	patternBand: PathSegment[][],
	quadBand: Quadrilateral[],
	getRules: (facetIndex: number) => FacetSnapRule[],
	{ endsMatched }: { endsMatched: boolean }
): PathSegment[][] => {
	const last = patternBand.length - 1;

	const getSource = (i: number, from: FacetSnapRule['from']): PathSegment[] | undefined => {
		if (from === 'self') return patternBand[i];
		if (from === 'prev') {
			if (i > 0) return patternBand[i - 1];
			if (!endsMatched) return undefined;
			const thisQuad = quadBand[i];
			const prevQuad = quadBand[last];
			return rotatePS(
				translatePS(
					structuredClone(patternBand[last]),
					thisQuad.a.x - prevQuad.d.x,
					thisQuad.a.y - prevQuad.d.y
				),
				0
			);
		}
		if (i < last) return patternBand[i + 1];
		// A single-facet band never wraps `next` (matches Asanoha's original branching).
		if (!endsMatched || i === 0) return undefined;
		const thisQuad = quadBand[i];
		const nextQuad = quadBand[0];
		return rotatePS(
			translatePS(
				structuredClone(patternBand[0]),
				thisQuad.d.x - nextQuad.a.x,
				thisQuad.d.y - nextQuad.a.y
			),
			0
		);
	};

	return patternBand.map((facet, i) => {
		const output = structuredClone(facet);
		for (const rule of getRules(i)) {
			const source = getSource(i, rule.from);
			if (source) replaceInPlace({ pairs: rule.pairs, target: output, source });
		}
		return output;
	});
};
