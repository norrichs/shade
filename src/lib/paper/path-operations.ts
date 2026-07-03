import type { PathSegment } from '$lib/types';
import { pathSegmentsToPaper } from './path-segment-to-paper';
import { paperToPathSegments } from './paper-to-path-segment';
import { getPaperScope } from './scope';
type Op = 'unite' | 'subtract' | 'intersect' | 'exclude';

const apply = (a: PathSegment[], b: PathSegment[], op: Op): PathSegment[] => {
	const pa = pathSegmentsToPaper(a) as unknown as {
		unite: (other: unknown, options?: { insert?: boolean }) => unknown;
		subtract: (other: unknown, options?: { insert?: boolean }) => unknown;
		intersect: (other: unknown, options?: { insert?: boolean }) => unknown;
		exclude: (other: unknown, options?: { insert?: boolean }) => unknown;
		remove: () => void;
	};
	const pb = pathSegmentsToPaper(b);
	const result = pa[op](pb, { insert: false }) as Parameters<typeof paperToPathSegments>[0] & {
		remove: () => void;
		reorient?: (nonZero: boolean, clockwise: boolean) => void;
	};
	// Normalize winding so all sub-paths have consistent (positive) area.
	// Paper's boolean ops can produce CompoundPaths with opposite-winding
	// children (e.g. exclude), causing signed areas to cancel.
	// Note: for subtract producing a hole (donut), the relative winding
	// between outer + inner contours is preserved by paper internally;
	// reorient does not collapse the hole.
	if (typeof result.reorient === 'function') {
		result.reorient(false, true);
	}
	const out = paperToPathSegments(result);
	pa.remove();
	(pb as unknown as { remove: () => void }).remove();
	result.remove();
	return out;
};

export const unitePaths = (a: PathSegment[], b: PathSegment[]): PathSegment[] =>
	apply(a, b, 'unite');
export const subtractPaths = (a: PathSegment[], b: PathSegment[]): PathSegment[] =>
	apply(a, b, 'subtract');
export const intersectPaths = (a: PathSegment[], b: PathSegment[]): PathSegment[] =>
	apply(a, b, 'intersect');
export const excludePaths = (a: PathSegment[], b: PathSegment[]): PathSegment[] =>
	apply(a, b, 'exclude');

/**
 * Union a list of closed outline paths into a single path, PRESERVING interior
 * holes. Unlike `unitePaths`, this does not reorient sub-path winding, so holes
 * produced by the union (e.g. the negative space in a grid) survive as separate
 * opposite-winding contours in the result.
 *
 * Input contours must each begin with 'M'. Engine-agnostic: it knows nothing
 * about how the outlines were produced.
 */
export const uniteMany = (outlines: PathSegment[][]): PathSegment[] => {
	const valid = outlines.filter((o) => o.length > 0 && o[0][0] === 'M');
	if (valid.length === 0) return [];
	getPaperScope();
	let acc = pathSegmentsToPaper(valid[0]) as {
		unite: (other: unknown, options?: { insert?: boolean }) => typeof acc;
		remove: () => void;
	};
	for (let i = 1; i < valid.length; i++) {
		const next = pathSegmentsToPaper(valid[i]) as { remove: () => void };
		const united = acc.unite(next, { insert: false });
		acc.remove();
		next.remove();
		acc = united;
	}
	const out = paperToPathSegments(acc as Parameters<typeof paperToPathSegments>[0]);
	acc.remove();
	return out;
};
