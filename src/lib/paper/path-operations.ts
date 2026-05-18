import type { PathSegment } from '$lib/types';
import { pathSegmentsToPaper } from './path-segment-to-paper';
import { paperToPathSegments } from './paper-to-path-segment';
import { getPaperScope } from './scope';

type Op = 'unite' | 'subtract' | 'intersect' | 'exclude';

const apply = (a: PathSegment[], b: PathSegment[], op: Op): PathSegment[] => {
	getPaperScope();
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
