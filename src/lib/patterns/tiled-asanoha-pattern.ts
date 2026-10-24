import { Vector3 } from 'three';
import type { BandCutPattern, PathSegment, Quadrilateral, TiledPatternConfig } from '#lib/types.js';
import { removeInPlace } from './tesselation/shared/helpers';
import { transformPatternByQuad } from './quadrilateral';
import { getAngle, rotatePoint } from './utils';
import { pieceIndexOf } from '#lib/cut-pattern/resolve-partner-band.js';
import { isSameParentBand } from '#lib/util.js';

/**
 * Asanoha: the hemp-leaf row cut into quarter-height strips, one strip per quad,
 * for finer conformance to 3D curvature. The row repeats every half, and each half is two strips that
 * mirror each other across the star-centre line, so two subunits cycle along a
 * band: A (bottom: brown star line, top: purple star line) then B (A mirrored).
 *
 * Unit frame: x across the band in sixths of a column, y along the band.
 * Every node lies inside or on the quad, so adjacent strips meet exactly
 * through the quad mapping and nothing needs snapping — only drops and additions.
 *
 * Band ends. A physical end (a band's start, or its last piece's end) is capped:
 * the brown line is extended to the column edges. A split seam instead
 * interlocks: the lower piece drops the column-edge verticals of its last strip,
 * leaving a hexagonal end, and the higher piece borrows those verticals and the
 * red zigzags beside them, so its start reaches back in spikes along the edges.
 */

type P = [number, number];
/**
 * - `leftEdge`: the column's x = 0 line, drawn by the previous column or ceded to a partner band.
 * - `unitBottom`: A's bottom line, which retraces the previous B's top.
 * - `columnEdge`: a B vertical, dropped where a piece ends at a split.
 * - `spike`: a B segment the next piece borrows across a split.
 */
type Tag = 'leftEdge' | 'unitBottom' | 'columnEdge' | 'spike';
type Seg = { from: P; to: P; tags?: Tag[] };

export const ASANOHA_SUBUNIT_COUNT = 2;

const A: Seg[] = [
	// blue diamond, lower half
	{ from: [2 / 6, 1], to: [3 / 6, 0] },
	{ from: [3 / 6, 0], to: [4 / 6, 1] },
	// red zigzags
	{ from: [1 / 6, 0], to: [0, 1] },
	{ from: [5 / 6, 0], to: [1, 1] },
	// pink diamond, lower half
	{ from: [0, 1], to: [3 / 6, 0] },
	{ from: [3 / 6, 0], to: [1, 1] },
	// purples: the line A shares with B is A's top
	{ from: [0, 1], to: [2 / 6, 1] },
	{ from: [4 / 6, 1], to: [1, 1] },
	// greens
	{ from: [3 / 6, 0], to: [3 / 6, 1] },
	{ from: [0, 0], to: [0, 1], tags: ['leftEdge'] },
	{ from: [1, 0], to: [1, 1] },
	// brown: coincides with the previous B's top, so only the band's first unit keeps it
	{ from: [1 / 6, 0], to: [5 / 6, 0], tags: ['unitBottom'] }
];

const B: Seg[] = [
	// blue diamond, upper half
	{ from: [2 / 6, 0], to: [3 / 6, 1] },
	{ from: [3 / 6, 1], to: [4 / 6, 0] },
	// red zigzags
	{ from: [0, 0], to: [1 / 6, 1], tags: ['spike'] },
	{ from: [1, 0], to: [5 / 6, 1], tags: ['spike'] },
	// pink diamond, upper half
	{ from: [0, 0], to: [3 / 6, 1] },
	{ from: [3 / 6, 1], to: [1, 0] },
	// greens
	{ from: [3 / 6, 0], to: [3 / 6, 1] },
	{ from: [0, 0], to: [0, 1], tags: ['leftEdge', 'columnEdge', 'spike'] },
	{ from: [1, 0], to: [1, 1], tags: ['columnEdge', 'spike'] },
	// brown
	{ from: [1 / 6, 1], to: [5 / 6, 1] }
];

// The brown line's missing ends, closing a physical band end.
const START_CAP: Seg[] = [
	{ from: [0, 0], to: [1 / 6, 0] },
	{ from: [5 / 6, 0], to: [1, 0] }
];
const END_CAP: Seg[] = [
	{ from: [0, 1], to: [1 / 6, 1] },
	{ from: [5 / 6, 1], to: [1, 1] }
];

const SUBUNITS = [A, B];
const subunitOf = (facetIndex: number) => SUBUNITS[facetIndex % ASANOHA_SUBUNIT_COUNT];

/** `segsOf(c)` repeated across the columns, as M/L pairs in unit coordinates. */
const columnsPath = (columns: number, segsOf: (c: number) => Seg[]): PathSegment[] => {
	const path: PathSegment[] = [];
	for (let c = 0; c < columns; c++) {
		const x = (v: number) => (c + v) / columns;
		for (const { from, to } of segsOf(c)) {
			path.push(['M', x(from[0]), from[1]], ['L', x(to[0]), to[1]]);
		}
	}
	return path;
};

export const generateAsanohaSubunits = (columns: number): PathSegment[][] =>
	SUBUNITS.map((segs) => columnsPath(columns, () => segs));

/** A, B, A, B stacked into one unit square: one legacy Asanoha row. */
export const generateAsanohaPreview = (columns: number): PathSegment[] => {
	const [a, b] = generateAsanohaSubunits(columns);
	const strips = [a, b, a, b];
	return strips.flatMap((path, s) =>
		path.map((seg) => {
			const [command, x, y] = seg as ['M' | 'L', number, number];
			return [command, x, (s + y) / strips.length] as PathSegment;
		})
	);
};

/**
 * Path indices to remove from one facet.
 *
 * - `leftEdge` in columns after the first: retraces the previous column's right edge.
 * - `leftEdge` in column 0 when the band has a left partner: the partner's right
 *   edge already draws the band seam. `keepPartnerSeam` keeps it, so every band
 *   is self-contained and the seam is drawn by both bands.
 * - `unitBottom` after facet 0: retraces the previous B's top line.
 * - `columnEdge` when `endsAtSplit`: the last strip of a piece followed by
 *   another; the next piece draws these verticals instead.
 *
 * Facet indices are piece-local; splits fall on multiples of the subunit count,
 * so every piece starts on A and keeps its own bottom line as a physical end.
 */
/** A `leftEdge` the previous column, or a partner band (`partnerDrop`), draws instead. */
const isCededEdge = (tags: Tag[], column: number, partnerDrop: boolean) =>
	tags.includes('leftEdge') && (column > 0 || partnerDrop);

export const getAsanohaDropIndices = (
	facetIndex: number,
	columns: number,
	{
		hasLeftPartner,
		keepPartnerSeam = false,
		endsAtSplit = false
	}: { hasLeftPartner: boolean; keepPartnerSeam?: boolean; endsAtSplit?: boolean }
): number[] => {
	const segs = subunitOf(facetIndex);
	const out: number[] = [];
	for (let c = 0; c < columns; c++) {
		segs.forEach(({ tags = [] }, s) => {
			const drop =
				isCededEdge(tags, c, hasLeftPartner && !keepPartnerSeam) ||
				(facetIndex > 0 && tags.includes('unitBottom')) ||
				(endsAtSplit && tags.includes('columnEdge'));
			if (drop) {
				const base = 2 * (c * segs.length + s);
				out.push(base, base + 1);
			}
		});
	}
	return out;
};

type Point3 = { x: number; y: number; z?: number };
/** A facet's stored quad is a structured clone (plain points); rebuild Vector3s to map through it. */
export const toQuad = (q: Record<'a' | 'b' | 'c' | 'd', Point3>): Quadrilateral => {
	const v = ({ x, y, z = 0 }: Point3) => new Vector3(x, y, z);
	return { a: v(q.a), b: v(q.b), c: v(q.c), d: v(q.d) };
};

/**
 * The previous piece's last quad, moved rigidly so its top edge (d→c) lies on
 * this piece's bottom edge (a→b). Pieces are a partition of one flat layout
 * re-aligned separately, so the two edges are congruent.
 */
const alignPrevPieceQuad = (prev: Quadrilateral, first: Quadrilateral): Quadrilateral => {
	const angle = getAngle(first.a, first.b) - getAngle(prev.d, prev.c);
	const move = (p: Vector3) => {
		const { x, y } = rotatePoint(prev.d, p, angle);
		return new Vector3(x - prev.d.x + first.a.x, y - prev.d.y + first.a.y, 0);
	};
	return { a: move(prev.a), b: move(prev.b), c: move(prev.c), d: move(prev.d) };
};

/** Without the previous piece, extend this piece's first quad back by its own height. */
const extrapolatePrevQuad = ({ a, b, c, d }: Quadrilateral): Quadrilateral => ({
	a: a.clone().multiplyScalar(2).sub(d),
	b: b.clone().multiplyScalar(2).sub(c),
	c: b.clone(),
	d: a.clone()
});

/**
 * Tube-level adjustment: drops, physical end caps and split-seam spikes. Runs
 * here rather than per band because a piece's seam reads its sibling piece.
 *
 * A piece's siblings share its parent address. Splits fall on multiples of the
 * subunit count, so every piece starts on A and ends on B, and facet indices
 * are piece-local. Drops read complete paths, so they run first; additions are
 * appended after them.
 */
export const adjustAsanohaAfterTiling = (
	bands: BandCutPattern[],
	tiledPatternConfig: TiledPatternConfig
): BandCutPattern[] => {
	const columns = tiledPatternConfig.config.columnCount || 1;
	const keepPartnerSeam = tiledPatternConfig.config.keepPartnerSeam ?? false;

	return bands.map((band) => {
		if (band.error || band.facets.length === 0) return band;
		const hasLeftPartner = band.leftPartnerBand !== undefined;
		const partnerDrop = hasLeftPartner && !keepPartnerSeam;
		const piece = pieceIndexOf(band.address);
		const siblings = bands.filter((b) => b && isSameParentBand(b.address, band.address));
		const sibling = (p: number) => siblings.find((b) => pieceIndexOf(b.address) === p);
		const startsAtSplit = piece > 0;
		const endsAtSplit = !!sibling(piece + 1);
		const last = band.facets.length - 1;

		const facets = band.facets.map((facet, f) => {
			const path = structuredClone(facet.path);
			removeInPlace({
				indices: getAsanohaDropIndices(f, columns, {
					hasLeftPartner,
					keepPartnerSeam,
					endsAtSplit: endsAtSplit && f === last
				}),
				target: path
			});
			if (!facet.quad) return { ...facet, path };
			const quad = toQuad(facet.quad);

			if (f === 0 && !startsAtSplit) {
				path.push(
					...transformPatternByQuad(
						columnsPath(columns, () => START_CAP),
						quad
					)
				);
			}
			if (f === 0 && startsAtSplit) {
				const prevFacet = sibling(piece - 1)?.facets.at(-1);
				const prevQuad = prevFacet?.quad
					? alignPrevPieceQuad(toQuad(prevFacet.quad), quad)
					: extrapolatePrevQuad(quad);
				const spikes = columnsPath(columns, (c) =>
					B.filter(({ tags = [] }) => tags.includes('spike') && !isCededEdge(tags, c, partnerDrop))
				);
				path.push(...transformPatternByQuad(spikes, prevQuad));
			}
			if (f === last && !endsAtSplit) {
				path.push(
					...transformPatternByQuad(
						columnsPath(columns, () => END_CAP),
						quad
					)
				);
			}
			return { ...facet, path };
		});
		return { ...band, facets };
	});
};
