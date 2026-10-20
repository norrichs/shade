import type { PathSegment, Quadrilateral, TiledPatternConfig } from '#lib/types.js';
import { removeInPlace } from './tesselation/shared/helpers';

/**
 * Asanoha split: the legacy Asanoha row (`tiled-asanoha-pattern.ts`) cut into
 * quarter-height strips, one strip per quad, for finer conformance to 3D
 * curvature. The row repeats every half, and each half is two strips that
 * mirror each other across the star-centre line, so two subunits cycle along a
 * band: A (bottom: brown star line, top: purple star line) then B (A mirrored).
 *
 * Unit frame: x across the band in sixths of a column, y along the band.
 * Every node lies inside or on the quad, so adjacent strips meet exactly
 * through the quad mapping and nothing needs snapping — only drops.
 */

type P = [number, number];
type Tag = 'leftEdge' | 'unitBottom';
type Seg = { from: P; to: P; tags?: Tag[] };

export const ASANOHA_SPLIT_SUBUNIT_COUNT = 2;

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
	{ from: [0, 0], to: [1 / 6, 1] },
	{ from: [1, 0], to: [5 / 6, 1] },
	// pink diamond, upper half
	{ from: [0, 0], to: [3 / 6, 1] },
	{ from: [3 / 6, 1], to: [1, 0] },
	// greens
	{ from: [3 / 6, 0], to: [3 / 6, 1] },
	{ from: [0, 0], to: [0, 1], tags: ['leftEdge'] },
	{ from: [1, 0], to: [1, 1] },
	// brown
	{ from: [1 / 6, 1], to: [5 / 6, 1] }
];

const SUBUNITS = [A, B];
const subunitOf = (facetIndex: number) => SUBUNITS[facetIndex % ASANOHA_SPLIT_SUBUNIT_COUNT];

export const generateAsanohaSplitSubunits = (columns: number): PathSegment[][] =>
	SUBUNITS.map((segs) => {
		const path: PathSegment[] = [];
		for (let c = 0; c < columns; c++) {
			const x = (v: number) => (c + v) / columns;
			for (const { from, to } of segs) {
				path.push(['M', x(from[0]), from[1]], ['L', x(to[0]), to[1]]);
			}
		}
		return path;
	});

/** A, B, A, B stacked into one unit square: one legacy Asanoha row. */
export const generateAsanohaSplitPreview = (columns: number): PathSegment[] => {
	const [a, b] = generateAsanohaSplitSubunits(columns);
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
 *
 * Facet indices are piece-local; splits fall on multiples of the subunit count,
 * so every piece starts on A and keeps its own bottom line as a physical end.
 */
export const getAsanohaSplitDropIndices = (
	facetIndex: number,
	columns: number,
	{
		hasLeftPartner,
		keepPartnerSeam = false
	}: { hasLeftPartner: boolean; keepPartnerSeam?: boolean }
): number[] => {
	const segs = subunitOf(facetIndex);
	const out: number[] = [];
	for (let c = 0; c < columns; c++) {
		segs.forEach(({ tags = [] }, s) => {
			const drop =
				(tags.includes('leftEdge') && (c > 0 || (hasLeftPartner && !keepPartnerSeam))) ||
				(facetIndex > 0 && tags.includes('unitBottom'));
			if (drop) {
				const base = 2 * (c * segs.length + s);
				out.push(base, base + 1);
			}
		});
	}
	return out;
};

export const adjustAsanohaSplitAfterMapping = (
	patternBand: PathSegment[][],
	_quadBand: Quadrilateral[],
	tiledPatternConfig: TiledPatternConfig,
	bandContext?: { hasOuterPartner: boolean; bandIndex: number; leftPartnerBand?: number }
): PathSegment[][] => {
	const columns = tiledPatternConfig.config.columnCount || 1;
	const hasLeftPartner = bandContext?.leftPartnerBand !== undefined;
	const keepPartnerSeam = tiledPatternConfig.config.keepPartnerSeam ?? false;
	return patternBand.map((facetPath, f) => {
		const path = structuredClone(facetPath);
		removeInPlace({
			indices: getAsanohaSplitDropIndices(f, columns, { hasLeftPartner, keepPartnerSeam }),
			target: path
		});
		return path;
	});
};
