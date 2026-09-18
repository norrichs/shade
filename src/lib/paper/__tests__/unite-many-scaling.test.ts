import { beforeAll, describe, expect, test } from '@jest/globals';
import type { PathSegment } from '$lib/types';
import { uniteMany } from '../path-operations';
import { getPaperScope } from '../scope';
import { pathSegmentsToPaper } from '../path-segment-to-paper';
import { paperToPathSegments } from '../paper-to-path-segment';

/**
 * `uniteMany` is the hot path of "Prepare Download": one call per band receives
 * ~800 expanded facet-edge outlines. A sequential fold (union outline N into the
 * whole accumulated result, N times) re-walks the entire accumulated geometry on
 * every step, so its cost grows roughly quadratically and one real band took
 * ~17s. Balanced pairwise reduction keeps the inputs small for most of the work.
 *
 * These tests pin BOTH halves of that: the scaling (so the quadratic fold cannot
 * come back) and the geometric equivalence with the fold it replaced (so the
 * speed-up is not bought with a different silhouette).
 */

const rect = (x: number, y: number, w: number, h: number): PathSegment[] => [
	['M', x, y],
	['L', x + w, y],
	['L', x + w, y + h],
	['L', x, y + h],
	['Z']
];

/** Rotate a path about the origin, so nothing is axis-aligned (real band
 * outlines never are, and axis-aligned rectangles let paper take fast paths
 * that hide the scaling behaviour). */
const rotate = (path: PathSegment[], angle: number): PathSegment[] =>
	path.map((seg) => {
		if (seg[0] === 'Z') return seg;
		const out: (string | number)[] = [seg[0]];
		for (let i = 1; i < seg.length; i += 2) {
			const x = seg[i] as number;
			const y = seg[i + 1] as number;
			out.push(
				x * Math.cos(angle) - y * Math.sin(angle),
				x * Math.sin(angle) + y * Math.cos(angle)
			);
		}
		return out as PathSegment;
	});

/**
 * A grid tessellation where every cell EDGE is its own thickened outline — the
 * same shape of input `buildBandUnionPath` produces (one outline per facet edge,
 * with interior holes formed purely by the union topology).
 */
const gridEdgeOutlines = (cells: number, cell = 10, half = 1): PathSegment[][] => {
	const outlines: PathSegment[][] = [];
	for (let row = 0; row <= cells; row++) {
		for (let col = 0; col < cells; col++) {
			// Horizontal edge, expanded into a bar with round-cap-ish overhang.
			outlines.push(rect(col * cell - half, row * cell - half, cell + 2 * half, 2 * half));
		}
	}
	for (let col = 0; col <= cells; col++) {
		for (let row = 0; row < cells; row++) {
			outlines.push(rect(col * cell - half, row * cell - half, 2 * half, cell + 2 * half));
		}
	}
	return outlines.map((o) => rotate(o, 0.3));
};

/**
 * The implementation `uniteMany` used to have: fold every outline into a single
 * accumulator, one at a time. Kept here as the equivalence ORACLE — the new
 * result must cover exactly the same area, even though subpath order differs.
 */
const uniteSequentially = (outlines: PathSegment[][]): PathSegment[] => {
	const valid = outlines.filter((o) => o.length > 0 && o[0][0] === 'M');
	if (valid.length === 0) return [];
	getPaperScope();
	let acc = pathSegmentsToPaper(valid[0]) as unknown as {
		unite: (other: unknown, options?: { insert?: boolean }) => typeof acc;
		remove: () => void;
	};
	for (let i = 1; i < valid.length; i++) {
		const next = pathSegmentsToPaper(valid[i]) as unknown as { remove: () => void };
		const united = acc.unite(next, { insert: false });
		acc.remove();
		next.remove();
		acc = united;
	}
	const out = paperToPathSegments(acc as Parameters<typeof paperToPathSegments>[0]);
	acc.remove();
	return out;
};

type PaperItem = {
	area: number;
	remove: () => void;
	subtract: (other: unknown, options?: { insert?: boolean }) => PaperItem;
};

const toPaper = (segments: PathSegment[]): PaperItem =>
	pathSegmentsToPaper(segments) as unknown as PaperItem;

const absArea = (segments: PathSegment[]): number => {
	const item = toPaper(segments);
	const a = Math.abs(item.area);
	item.remove();
	return a;
};

/** Area covered by exactly one of the two paths — 0 when they are the same region. */
const symmetricDifferenceArea = (a: PathSegment[], b: PathSegment[]): number => {
	getPaperScope();
	const pa = toPaper(a);
	const pb = toPaper(b);
	const ab = pa.subtract(pb, { insert: false });
	const ba = pb.subtract(pa, { insert: false });
	const diff = Math.abs(ab.area) + Math.abs(ba.area);
	ab.remove();
	ba.remove();
	pa.remove();
	pb.remove();
	return diff;
};

describe('uniteMany scaling', () => {
	beforeAll(() => {
		getPaperScope();
	});

	test('unions ~1200 outlines without quadratic blow-up', () => {
		// 24x24 grid of cells => 1200 edge outlines, the same order as one real
		// band (~811). Measured on this input: sequential fold ~17.5s, balanced
		// pairwise reduction ~0.6s. The 4s budget is ~6x headroom over the fixed
		// implementation — generous enough for a loaded machine, while the
		// quadratic fold misses it by more than 4x.
		const outlines = gridEdgeOutlines(24);
		expect(outlines.length).toBe(1200);

		const start = Date.now();
		const united = uniteMany(outlines);
		const elapsed = Date.now() - start;

		expect(united.length).toBeGreaterThan(0);
		expect(elapsed).toBeLessThan(4000);
	}, 180000);

	test('result is geometrically equivalent to the sequential fold it replaced', () => {
		// Small enough that the O(N^2) oracle still finishes quickly, but with
		// overlaps, disjoint clusters AND interior holes, so ordering genuinely
		// differs between the two strategies.
		const outlines = [
			...gridEdgeOutlines(4),
			rect(100, 100, 30, 30),
			rect(115, 115, 30, 30),
			rect(200, 0, 10, 10)
		];

		const pairwise = uniteMany(outlines);
		const sequential = uniteSequentially(outlines);

		// Same covered region: nothing is in one and not the other.
		expect(symmetricDifferenceArea(pairwise, sequential)).toBeCloseTo(0, 6);
		// Same area, and holes survive in both (signed area < filled outer area).
		expect(absArea(pairwise)).toBeCloseTo(absArea(sequential), 6);
		// Same number of contours (outer boundaries + holes).
		expect(pairwise.filter((s) => s[0] === 'M').length).toBe(
			sequential.filter((s) => s[0] === 'M').length
		);
	}, 120000);

	test('odd counts carry the unpaired outline through every level', () => {
		// 7 disjoint squares: an odd count at several reduction levels (7 -> 4 -> 2
		// -> 1). Every square must survive; a mishandled carry would drop one.
		const squares = Array.from({ length: 7 }, (_, i) => rect(i * 20, 0, 10, 10));
		const united = uniteMany(squares);
		expect(united.filter((s) => s[0] === 'M').length).toBe(7);
		expect(absArea(united)).toBeCloseTo(700, 6);
	});
});
