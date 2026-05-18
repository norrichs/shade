import type { PathSegment } from '$lib/types';

/**
 * Convert a paper.PathItem (Path or CompoundPath) back to PathSegment[].
 *
 * Walks paper's segments and emits:
 *   - ['M', x, y] at the start of each contour
 *   - ['L', x, y] for straight segments (no bezier handles)
 *   - ['C', cx1, cy1, cx2, cy2, x, y] for any segment with handles
 *   - ['Z'] at the end of each closed contour
 *
 * Paper internally normalizes Q and A from SVG import into C, so we never
 * emit Q or A here — the result is a geometry-preserving normalization,
 * not a representation-preserving round-trip.
 *
 * Compound paths emit one M..Z run per child.
 */
type PaperPointLike = { x: number; y: number };
type PaperSegmentLike = {
	point: PaperPointLike;
	handleIn: PaperPointLike;
	handleOut: PaperPointLike;
	hasHandles: () => boolean;
};
type PaperPathLike = {
	segments?: PaperSegmentLike[];
	closed?: boolean;
	children?: PaperPathLike[];
};

const emitContour = (path: PaperPathLike, out: PathSegment[]): void => {
	if (!path.segments || path.segments.length === 0) return;
	const first = path.segments[0];
	out.push(['M', first.point.x, first.point.y]);
	for (let i = 1; i < path.segments.length; i++) {
		const prev = path.segments[i - 1];
		const curr = path.segments[i];
		if (
			prev.handleOut.x === 0 &&
			prev.handleOut.y === 0 &&
			curr.handleIn.x === 0 &&
			curr.handleIn.y === 0
		) {
			out.push(['L', curr.point.x, curr.point.y]);
		} else {
			out.push([
				'C',
				prev.point.x + prev.handleOut.x,
				prev.point.y + prev.handleOut.y,
				curr.point.x + curr.handleIn.x,
				curr.point.y + curr.handleIn.y,
				curr.point.x,
				curr.point.y
			]);
		}
	}
	if (path.closed) {
		// Emit the closing curve from the last point back to the first, if curved.
		const last = path.segments[path.segments.length - 1];
		const first2 = path.segments[0];
		const lastCurved =
			last.handleOut.x !== 0 ||
			last.handleOut.y !== 0 ||
			first2.handleIn.x !== 0 ||
			first2.handleIn.y !== 0;
		if (lastCurved) {
			out.push([
				'C',
				last.point.x + last.handleOut.x,
				last.point.y + last.handleOut.y,
				first2.point.x + first2.handleIn.x,
				first2.point.y + first2.handleIn.y,
				first2.point.x,
				first2.point.y
			]);
		}
		out.push(['Z']);
	}
	// If !path.closed, no Z is emitted and the last point is not connected back.
};

export const paperToPathSegments = (item: PaperPathLike): PathSegment[] => {
	const out: PathSegment[] = [];
	if (item.children && item.children.length > 0) {
		for (const child of item.children) {
			emitContour(child, out);
		}
	} else {
		emitContour(item, out);
	}
	return out;
};
