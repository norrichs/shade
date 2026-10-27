import type { BandCutPattern, PathSegment, TiledPatternConfig } from '#lib/types.js';
import { removeInPlace } from './tesselation/shared/helpers';
import { transformPatternByQuad } from './quadrilateral';
import { toQuad } from './tiled-asanoha-pattern';
import {
	findLeftPartner,
	findRightPartner,
	layPartnerPath,
	partnerQuadAlongside
} from './adjust/side-partners';

/**
 * HexParquet2b: HexParquet2's interlaced hexagons over Y-shaped stems,
 * re-proportioned so every line is the same length (a 30° diagonal across one
 * column, or a vertical two rows high), with two subunits cycled along a band,
 * one per quad. Subunit 0 holds the full hexagon and is the unit's bottom
 * (quad i+1 lies across quad i's unit y = 1 edge).
 *
 * Design grid. Segments are written in the design image's grid: x in quarters
 * across a column, `row` in twelfths down the whole unit from its top (rows
 * 0–6 are subunit 1, 6–12 subunit 0). Every node lies inside or on its quad,
 * so nothing needs snapping.
 *
 * Band outline (with `keepPartnerSeam`). Bands interlock along a zigzag seam.
 * In subunit 1 a band gives its right neighbour the lines right of the x = 3
 * stem and gains the same lines from its left neighbour, one column left: a
 * half hexagon (0,0)→(−1,1)→(−1,5)→(0,6) with its diagonal (−1,3)→(0,2). In
 * subunit 0 it gives its left neighbour the lines left of x = 1 and gains the
 * right neighbour's bump (4,6)→(5,7)→(5,9)→(4,10). Each band draws its whole
 * outline, so seam lines are drawn by both bands, except the diagonal
 * (3,3)→(4,2), which lies inside the right neighbour's piece and is drawn by it
 * alone.
 *
 * None of the gained nodes lies on the partner quad's top or bottom edge away
 * from the shared edge, so gained lines stay joined when laid flat (unlike
 * HexParquet2's flaps). An open side (no partner) gains the same lines,
 * extrapolated through the band's own quad.
 *
 * Band ends. The end closes on subunit 1's own zigzag, less the right arm
 * (3,1)→(4,0), which would stick out alone (the right partner still draws it,
 * joined to its own zigzag). The start is capped
 * with the zigzag of the unit below, (0,12)→(1,13)→(2,12)→(3,13)→(4,12).
 */

type P = [number, number];
/**
 * - `leftEdge`: the column's x = 0 vertical, which retraces the previous
 *   column's x = 4 vertical.
 * - `seamLeft`: gained, one column right, by the left partner.
 * - `seamRight`: gained, one column left, by the right partner.
 * - `giveRight`: lies inside the right partner's piece; dropped in the last column.
 * - `endSpur`: at the band's end its outer node meets nothing; dropped in the
 *   last column of the last facet.
 */
type Tag = 'leftEdge' | 'seamLeft' | 'seamRight' | 'giveRight' | 'endSpur';
type Seg = { from: P; to: P; tags?: Tag[] };

export const HEXPARQUET2B_SUBUNIT_COUNT = 2;

const seg = (from: P, to: P, ...tags: Tag[]): Seg => ({ from, to, tags });

/** Subunit 0: rows 6–12, the chevrons, the full hexagon and the edge verticals. */
const BOTTOM: Seg[] = [
	seg([0, 6], [1, 7], 'seamLeft'),
	seg([1, 7], [2, 6]),
	seg([2, 6], [3, 7]),
	seg([3, 7], [4, 6]),
	seg([1, 7], [1, 9], 'seamLeft'),
	seg([1, 9], [1, 11]),
	seg([3, 7], [3, 11]),
	seg([0, 10], [1, 9], 'seamLeft'),
	seg([1, 9], [2, 8]),
	seg([2, 8], [4, 10]),
	seg([0, 10], [0, 12], 'leftEdge'),
	seg([4, 10], [4, 12]),
	seg([1, 11], [2, 12]),
	seg([2, 12], [3, 11])
];

/** Subunit 1: rows 0–6, the stems, the crossing diagonals and the chevrons above. */
const TOP: Seg[] = [
	seg([0, 0], [1, 1]),
	seg([1, 1], [2, 0]),
	seg([2, 0], [3, 1]),
	seg([3, 1], [4, 0], 'seamRight', 'endSpur'),
	seg([1, 1], [1, 5]),
	seg([3, 1], [3, 5], 'seamRight'),
	seg([0, 2], [2, 4]),
	seg([2, 4], [3, 3]),
	seg([3, 3], [4, 2], 'seamRight', 'giveRight'),
	seg([2, 4], [2, 6]),
	seg([1, 5], [0, 6]),
	seg([3, 5], [4, 6], 'seamRight')
];

/** The unit below's zigzag, closing the band's start (subunit 0's grid). */
const START_CAP: Seg[] = [
	seg([0, 12], [1, 13]),
	seg([1, 13], [2, 12]),
	seg([2, 12], [3, 13]),
	seg([3, 13], [4, 12])
];

const SUBUNITS = [BOTTOM, TOP];
const subunitIndexOf = (facetIndex: number) => facetIndex % HEXPARQUET2B_SUBUNIT_COUNT;

/** A grid point in subunit `s`'s unit frame (y up the band). */
const toUnit = ([x, row]: P, s: number): P => [x / 4, (12 - 6 * s - row) / 6];

/** `segs` repeated across the columns, as M/L pairs in subunit `s`'s unit frame. */
const columnsPath = (columns: number, s: number, segs: Seg[]): PathSegment[] => {
	const path: PathSegment[] = [];
	for (let c = 0; c < columns; c++) {
		for (const { from, to } of segs) {
			const [fx, fy] = toUnit(from, s);
			const [tx, ty] = toUnit(to, s);
			path.push(['M', (c + fx) / columns, fy], ['L', (c + tx) / columns, ty]);
		}
	}
	return path;
};

export const generateHexparquet2bSubunits = (columns: number): PathSegment[][] =>
	SUBUNITS.map((segs, s) => columnsPath(columns, s, segs));

/** Both subunits stacked into one unit square (subunit 0 bottom). */
export const generateHexparquet2bPreview = (columns: number): PathSegment[] =>
	generateHexparquet2bSubunits(columns).flatMap((path, s) =>
		path.map((seg) => {
			const [command, x, y] = seg as ['M' | 'L', number, number];
			return [command, x, (s + y) / HEXPARQUET2B_SUBUNIT_COUNT] as PathSegment;
		})
	);

/**
 * Path indices to remove from one facet's own lines.
 *
 * - `leftEdge` in columns after the first: retraces the previous column.
 * - With `interBand`, `giveRight` in the last column: it lies inside the right
 *   partner's piece, which draws it.
 * - With `interBand`, `endSpur` in the last column of the band's last facet.
 */
export const getHexparquet2bDropIndices = (
	facetIndex: number,
	columns: number,
	{ interBand, isEnd }: { interBand: boolean; isEnd: boolean }
): number[] => {
	const segs = SUBUNITS[subunitIndexOf(facetIndex)];
	const out: number[] = [];
	for (let c = 0; c < columns; c++) {
		segs.forEach(({ tags = [] }, s) => {
			const drop =
				(c > 0 && tags.includes('leftEdge')) ||
				(interBand &&
					c === columns - 1 &&
					(tags.includes('giveRight') || (isEnd && tags.includes('endSpur'))));
			if (drop) {
				const base = 2 * (c * segs.length + s);
				out.push(base, base + 1);
			}
		});
	}
	return out;
};

/**
 * A partner's tagged lines in its own unit frame: the left partner's last
 * column, or the right partner's first.
 */
const partnerPath = (side: 'left' | 'right', facetIndex: number, columns: number) => {
	const s = subunitIndexOf(facetIndex);
	const tag: Tag = side === 'left' ? 'seamRight' : 'seamLeft';
	const column = side === 'left' ? columns - 1 : 0;
	return columnsPath(
		1,
		s,
		SUBUNITS[s].filter(({ tags = [] }) => tags.includes(tag))
	).map((seg) => {
		const [command, x, y] = seg as ['M' | 'L', number, number];
		return [command, (column + x) / columns, y] as PathSegment;
	});
};

/**
 * Tube-level adjustment. With `keepPartnerSeam`, drop the line given to the
 * right partner and append the lines gained from either side, mapped through
 * the partner's alongside quad (or extrapolated on an open side). Every band
 * gets the start cap. Without `keepPartnerSeam` each band keeps exactly its own
 * quads' lines, bar the repeated column-edge vertical, plus the start cap.
 *
 * Facet indices are piece-local. Splits fall on multiples of the subunit
 * count, so every piece starts on subunit 0 and ends on subunit 1, and a
 * piece's ends are treated as band ends.
 */
export const adjustHexparquet2bAfterTiling = (
	bands: BandCutPattern[],
	tiledPatternConfig: TiledPatternConfig
): BandCutPattern[] => {
	const columns = tiledPatternConfig.config.columnCount || 1;
	const interBand = tiledPatternConfig.config.keepPartnerSeam ?? false;

	return bands.map((band) => {
		if (band.error || band.facets.length === 0) return band;
		const left = interBand ? findLeftPartner(bands, band) : undefined;
		const right = interBand ? findRightPartner(bands, band) : undefined;

		const facets = band.facets.map((facet, f) => {
			const path = structuredClone(facet.path);
			removeInPlace({
				indices: getHexparquet2bDropIndices(f, columns, {
					interBand,
					isEnd: f === band.facets.length - 1
				}),
				target: path
			});
			if (!facet.quad) return { ...facet, path };
			const quad = toQuad(facet.quad);

			if (interBand) {
				for (const [side, partner] of [
					['left', left],
					['right', right]
				] as const) {
					path.push(
						...layPartnerPath(
							side,
							partnerPath(side, f, columns),
							quad,
							partnerQuadAlongside(band, f, partner, HEXPARQUET2B_SUBUNIT_COUNT)
						)
					);
				}
			}
			if (f === 0) {
				path.push(...transformPatternByQuad(columnsPath(columns, 0, START_CAP), quad));
			}
			return { ...facet, path };
		});
		return { ...band, facets };
	});
};
