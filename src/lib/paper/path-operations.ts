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
 *
 * Reduction strategy: BALANCED PAIRWISE, not a sequential fold. Folding each
 * outline into one accumulator makes every step re-process the whole accumulated
 * result, so the cost grows roughly quadratically in the number of outlines —
 * and "Prepare Download" hands this ~800 outlines PER BAND (one per expanded
 * facet edge), which measured at ~17.5s for a single band. Unioning adjacent
 * pairs and repeating keeps most unions between small operands: the same real
 * band drops to ~0.5s, with an identical result region (symmetric-difference
 * area 0). Only the ORDER of the resulting subpaths differs, which no consumer
 * depends on (rendering uses fill-rule="evenodd"; layout uses bounds).
 */
type PaperUnitable = {
	unite: (other: unknown, options?: { insert?: boolean }) => PaperUnitable;
	remove: () => void;
};

export const uniteMany = (outlines: PathSegment[][]): PathSegment[] => {
	const valid = outlines.filter((o) => o.length > 0 && o[0][0] === 'M');
	if (valid.length === 0) return [];
	getPaperScope();
	// Every paper item created here is removed exactly once: the two operands of
	// each union right after it produces their replacement, an odd trailing item
	// by the level that finally pairs it (it is carried by REFERENCE, never
	// copied, so it is never removed twice), and the final survivor below.
	let level: PaperUnitable[] = valid.map((o) => pathSegmentsToPaper(o) as unknown as PaperUnitable);
	while (level.length > 1) {
		const next: PaperUnitable[] = [];
		for (let i = 0; i < level.length; i += 2) {
			if (i + 1 >= level.length) {
				// Odd one out: carry it, unmodified and unremoved, to the next level.
				next.push(level[i]);
				continue;
			}
			const united = level[i].unite(level[i + 1], { insert: false });
			level[i].remove();
			level[i + 1].remove();
			next.push(united);
		}
		level = next;
	}
	const acc = level[0];
	const out = paperToPathSegments(acc as unknown as Parameters<typeof paperToPathSegments>[0]);
	acc.remove();
	return out;
};
