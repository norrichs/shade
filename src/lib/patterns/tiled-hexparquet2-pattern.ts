import type {
	BandCutPattern,
	PathSegment,
	Quadrilateral,
	SeamFlaps,
	TiledPatternConfig
} from '#lib/types.js';
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
 * HexParquet2: interlaced hexagons over Y-shaped stems, three subunits cycled
 * along a band, one per quad (blue, pink, blue in the design images; quad i+1
 * lies across quad i's unit y = 1 edge, so subunit 0 is the unit's bottom).
 *
 * Design grid. Segments are written in the design image's grid: x in sixths
 * across a column, `row` in eighteenths down the whole unit from its top
 * (rows 0–6 are subunit 2, 6–12 subunit 1, 12–18 subunit 0). Every node lies
 * inside or on its quad, so neighbouring subunits and columns meet exactly
 * through the quad mapping and nothing needs snapping.
 *
 * Band outline (with `keepPartnerSeam`; without it bands are left as tiled,
 * with no band-to-band changes). A band's outline is not its quads' straight edges but a zigzag
 * of pattern lines (the seam S), so neighbouring bands interlock. In a
 * column's grid the right seam is
 *
 *     (4,0)→(4,6)→(7,9)→(7,11)→(6,12)→(6,16)→(4,18)
 *
 * and the left seam is the same curve one column to the left. So a band gives
 * its right neighbour the lines right of x = 4 at the top of the unit, and
 * reaches into the neighbour at x = 6..7 in the middle: it drops segments on
 * one side and gains the matching ones on the other. Gained segments are
 * mapped through the neighbour's own quad, laid into this band's frame, so the
 * seam lands on the neighbour's mapped nodes.
 *
 * Open sides. A band with no left partner (band 0 of an open tube) cannot
 * reach left, so its left outline follows its own lines,
 * (2,0)→(2,6)→(0,8)→(1,9)→(1,11)→(0,12)→(0,16)→(2,18), and it drops the
 * diagonal left of x = 2. A band with no right partner keeps the mirror image
 * of that outline: it gains nothing and still drops the diagonal right of x = 4.
 *
 * Band ends. The start closes on its own lines. The end is capped with the
 * next unit's (2,18)→(3,17)→(4,18) peak, and gained seam lines that would run
 * past either end are left out.
 */

type P = [number, number];
/**
 * - `leftEdge`: the column's x = 0 vertical, which retraces the previous
 *   column's x = 6 vertical.
 * - `seamLeft`: a left-seam line inside the band's own quads. Gained, one
 *   column right, by the left partner.
 * - `seamRight`: a right-seam line inside the band's own quads. Gained, one
 *   column left, by the right partner.
 * - `giveRight`: lies right of the right seam, in the right partner's band.
 * - `openLeft`: lies left of the open-side outline; dropped with no left partner.
 * - `pastStart` / `pastEnd`: a gained copy would run past the band's start/end.
 * - `void`: left out of a gained flap with `seamFlaps: 'voids'`, opening the
 *   large hexagon the flap would otherwise enclose.
 * - `endChevron`: with voids, gained on the band's last facet although it runs
 *   past the end: it is the vertical of the end chevron (see `END_CHEVRON`).
 */
type Tag =
	| 'leftEdge'
	| 'seamLeft'
	| 'seamRight'
	| 'giveRight'
	| 'openLeft'
	| 'pastStart'
	| 'pastEnd'
	| 'void'
	| 'endChevron';

/*
 * `SeamFlaps`: how a flap gained from the left partner is laid flat. Its lines
 * cross the partner's quad boundaries, and each partner quad is laid onto this
 * band separately, so the flap's joints come apart.
 * - `mapped`: as laid, joints open.
 * - `stitched`: both copies of a joint move to their midpoint.
 * - `voids`: only the short vertical (from the partner quad) and the two
 *   diagonals joining it to this band's nodes are kept; the joint snaps onto
 *   the vertical's end.
 */
type Seg = { from: P; to: P; tags?: Tag[] };

export const HEXPARQUET2_SUBUNIT_COUNT = 3;

const seg = (from: P, to: P, ...tags: Tag[]): Seg => ({ from, to, tags });

/** Subunit 0: rows 12–18, the hexagons' lower halves and the stems' feet. */
const BOTTOM: Seg[] = [
	seg([1, 12], [1, 15]),
	seg([5, 12], [5, 15]),
	seg([0, 12], [0, 16], 'leftEdge', 'seamLeft'),
	seg([6, 12], [6, 16]),
	seg([0, 16], [2, 18]),
	seg([6, 16], [4, 18], 'seamRight', 'pastStart'),
	seg([1, 15], [3, 17]),
	seg([3, 17], [4, 18]),
	seg([5, 15], [3, 17]),
	seg([3, 17], [2, 18])
];

/** Subunit 1: rows 6–12, the chevrons and the hexagons' upper halves. */
const MIDDLE: Seg[] = [
	seg([3, 6], [3, 7]),
	seg([2, 6], [0, 8]),
	seg([4, 6], [6, 8], 'seamRight', 'void'),
	seg([0, 8], [1, 9], 'seamLeft'),
	seg([6, 8], [5, 9]),
	seg([1, 9], [3, 7]),
	seg([5, 9], [3, 7]),
	seg([1, 9], [1, 11], 'seamLeft'),
	seg([1, 11], [1, 12]),
	seg([5, 9], [5, 11]),
	seg([5, 11], [5, 12]),
	seg([3, 9], [1, 11]),
	seg([1, 11], [0, 12], 'seamLeft'),
	seg([3, 9], [5, 11]),
	seg([5, 11], [6, 12])
];

/** Subunit 2: rows 0–6, the stems and the crossing diagonals. */
const TOP: Seg[] = [
	seg([0, 0], [2, 2], 'openLeft'),
	seg([2, 2], [3, 3]),
	seg([6, 0], [4, 2], 'giveRight'),
	seg([4, 2], [3, 3]),
	seg([2, 0], [2, 2]),
	seg([2, 2], [2, 6]),
	seg([4, 0], [4, 2], 'seamRight', 'pastEnd', 'endChevron'),
	seg([4, 2], [4, 6], 'seamRight', 'void'),
	seg([3, 3], [3, 6])
];

/** The next unit's peak, closing the band's end (subunit 2's grid). */
const END_CAP: Seg[] = [seg([2, 0], [3, -1]), seg([3, -1], [4, 0])];

/**
 * With voids, the band's last facet closes its flap as a full chevron, like
 * the flaps between units: the gained vertical's top (−2,0) rises to a peak
 * on the x = 0 edge extended past the end (where the next unit's (0,16) would
 * be), which comes back down to this band's node (2,0). Subunit 2's grid.
 */
const END_CHEVRON_PEAK: P = [0, -2];
const END_CHEVRON_ARM: Seg = seg(END_CHEVRON_PEAK, [2, 0]);

const SUBUNITS = [BOTTOM, MIDDLE, TOP];
const subunitIndexOf = (facetIndex: number) => facetIndex % HEXPARQUET2_SUBUNIT_COUNT;

/** A grid point in subunit `s`'s unit frame (y up the band). */
const toUnit = ([x, row]: P, s: number): P => [x / 6, (18 - 6 * s - row) / 6];

/** `segsOf(c)` repeated across the columns, as M/L pairs in subunit `s`'s unit frame. */
const columnsPath = (columns: number, s: number, segsOf: (c: number) => Seg[]): PathSegment[] => {
	const path: PathSegment[] = [];
	for (let c = 0; c < columns; c++) {
		for (const { from, to } of segsOf(c)) {
			const [fx, fy] = toUnit(from, s);
			const [tx, ty] = toUnit(to, s);
			path.push(['M', (c + fx) / columns, fy], ['L', (c + tx) / columns, ty]);
		}
	}
	return path;
};

export const generateHexparquet2Subunits = (columns: number): PathSegment[][] =>
	SUBUNITS.map((segs, s) => columnsPath(columns, s, () => segs));

/** All three subunits stacked into one unit square (subunit 0 bottom). */
export const generateHexparquet2Preview = (columns: number): PathSegment[] =>
	generateHexparquet2Subunits(columns).flatMap((path, s) =>
		path.map((seg) => {
			const [command, x, y] = seg as ['M' | 'L', number, number];
			return [command, x, (s + y) / HEXPARQUET2_SUBUNIT_COUNT] as PathSegment;
		})
	);

/**
 * Path indices to remove from one facet's own lines.
 *
 * - `leftEdge` in columns after the first: retraces the previous column.
 *
 * With `interBand` (the band outline follows the zigzag seam):
 * - `giveRight` in the last column: it belongs to the right partner, or, with
 *   none, lies outside the open-side outline.
 * - `openLeft` in column 0 with no left partner: outside the open-side outline.
 */
export const getHexparquet2DropIndices = (
	facetIndex: number,
	columns: number,
	{ hasLeftPartner, interBand }: { hasLeftPartner: boolean; interBand: boolean }
): number[] => {
	const segs = SUBUNITS[subunitIndexOf(facetIndex)];
	const out: number[] = [];
	for (let c = 0; c < columns; c++) {
		segs.forEach(({ tags = [] }, s) => {
			const drop =
				(c > 0 && tags.includes('leftEdge')) ||
				(interBand && c === columns - 1 && tags.includes('giveRight')) ||
				(interBand && c === 0 && !hasLeftPartner && tags.includes('openLeft'));
			if (drop) {
				const base = 2 * (c * segs.length + s);
				out.push(base, base + 1);
			}
		});
	}
	return out;
};

type BandEnds = { isStart: boolean; isEnd: boolean };
const reachesPastEnd = ({ tags = [] }: Seg, { isStart, isEnd }: BandEnds) =>
	(isStart && tags.includes('pastStart')) || (isEnd && tags.includes('pastEnd'));

/** The left partner's lines this facet gains: what it gives away, and its right seam. */
export const hexparquet2LeftGain = (
	facetIndex: number,
	{ seamFlaps = 'mapped', ...ends }: BandEnds & { seamFlaps?: SeamFlaps }
): Seg[] =>
	SUBUNITS[subunitIndexOf(facetIndex)].filter(
		(s) =>
			(!reachesPastEnd(s, ends) || (seamFlaps === 'voids' && !!s.tags?.includes('endChevron'))) &&
			!(seamFlaps === 'voids' && s.tags?.includes('void')) &&
			(s.tags?.includes('giveRight') || s.tags?.includes('seamRight'))
	);

/** The right partner's lines this facet gains: its left seam, bar the vertical this band repeats. */
export const hexparquet2RightGain = (facetIndex: number, ends: BandEnds): Seg[] =>
	SUBUNITS[subunitIndexOf(facetIndex)].filter(
		(s) => !reachesPastEnd(s, ends) && s.tags?.includes('seamLeft') && !s.tags.includes('leftEdge')
	);

/**
 * A gained node on the neighbour quad's top (y = 1) or bottom (y = 0) edge,
 * away from the shared edge. The facet above or below gains the same node
 * through the neighbour's next quad; laid flat separately, the two copies
 * only meet when the bands are folded.
 */
type Joint = { key: string; edge: 'top' | 'bottom'; index: number };

/**
 * Map a neighbour's lines into this facet's frame. `path` is in the
 * neighbour's unit frame; with the neighbour's alongside facet it is mapped
 * through that facet's quad and laid onto this quad's shared edge, otherwise
 * it is shifted one band sideways and extrapolated through this quad.
 * `joints` index into the returned path.
 */
const mapGain = (
	side: 'left' | 'right',
	segs: Seg[],
	s: number,
	columns: number,
	ownQuad: Quadrilateral,
	partnerQuad: Quadrilateral | undefined
): { path: PathSegment[]; joints: Joint[] } => {
	if (segs.length === 0) return { path: [], joints: [] };
	// The left partner's last column, or the right partner's first.
	const column = side === 'left' ? columns - 1 : 0;
	const sharedEdge = side === 'left' ? 1 : 0;
	const joints: Joint[] = [];
	const inPartner = columnsPath(1, s, () => segs).map((seg, index) => {
		const [command, ux, y] = seg as ['M' | 'L', number, number];
		const x = (column + ux) / columns;
		const onEdge = Math.abs(y) < 1e-9 || Math.abs(y - 1) < 1e-9;
		if (onEdge && Math.abs(x - sharedEdge) > 1e-9) {
			joints.push({ key: `${side}:${x.toFixed(6)}`, edge: y > 0.5 ? 'top' : 'bottom', index });
		}
		return [command, x, y] as PathSegment;
	});
	return { path: layPartnerPath(side, inPartner, ownQuad, partnerQuad), joints };
};

/** A quad's size for normalising deviations: the square root of its area. */
const quadSize = ({ a, b, c, d }: Quadrilateral) => {
	const twiceArea =
		a.x * b.y -
		b.x * a.y +
		(b.x * c.y - c.x * b.y) +
		(c.x * d.y - d.x * c.y) +
		(d.x * a.y - a.x * d.y);
	return Math.sqrt(Math.abs(twiceArea) / 2);
};

/**
 * Pair each facet's top-edge joints with the next facet's bottom-edge joints of
 * the same key, and score both facets by how far a node moves to meet its copy,
 * over the quad's size. A facet's score is its worst joint.
 * - `mapped` / `stitched`: half the gap, the move to the midpoint. `stitched`
 *   makes that move, so the gained flap is one closed outline.
 * - `voids`: the whole gap. The only joint left is the end of the vertical,
 *   which lies in the lower facet (subunit 2); the upper facet's diagonal snaps
 *   onto it.
 */
const stitchJoints = (
	paths: PathSegment[][],
	joints: Joint[][],
	quads: (Quadrilateral | undefined)[],
	seamFlaps: SeamFlaps
): number[] => {
	const scores = paths.map(() => 0);
	for (let f = 1; f < paths.length; f++) {
		const below = joints[f - 1].filter((j) => j.edge === 'top');
		const above = joints[f].filter((j) => j.edge === 'bottom');
		for (const key of new Set(below.map((j) => j.key))) {
			const lower = below.filter((j) => j.key === key);
			const upper = above.filter((j) => j.key === key);
			if (upper.length === 0) continue;
			const [, px, py] = paths[f - 1][lower[0].index] as ['M' | 'L', number, number];
			const [, qx, qy] = paths[f][upper[0].index] as ['M' | 'L', number, number];
			const gap = Math.hypot(px - qx, py - qy);
			const moved = seamFlaps === 'voids' ? gap : gap / 2;
			for (const g of [f - 1, f]) {
				const quad = quads[g];
				const size = quad ? quadSize(quad) : 0;
				if (size > 0) scores[g] = Math.max(scores[g], moved / size);
			}
			if (seamFlaps === 'mapped') continue;
			const [tx, ty] = seamFlaps === 'voids' ? [px, py] : [(px + qx) / 2, (py + qy) / 2];
			const to = (command: string) => [command, tx, ty] as PathSegment;
			for (const j of lower) paths[f - 1][j.index] = to(paths[f - 1][j.index][0]);
			for (const j of upper) paths[f][j.index] = to(paths[f][j.index][0]);
		}
	}
	return scores;
};

/**
 * The end chevron's two arms (`END_CHEVRON_PEAK`): peak → the gained vertical's
 * top, and peak → (2,0). The peak and (2,0) map through this quad (the peak
 * extrapolated past its end); the vertical's top is its one top-edge joint, as
 * mapped from the partner. Empty when no vertical was gained.
 */
const endChevron = (
	path: PathSegment[],
	joints: Joint[],
	s: number,
	columns: number,
	quad: Quadrilateral
): PathSegment[] => {
	const top = joints.find((j) => j.edge === 'top');
	if (!top) return [];
	const [, tx, ty] = path[top.index] as ['M' | 'L', number, number];
	const [peak, , armStart, armEnd] = transformPatternByQuad(
		[
			...columnsPath(columns, s, (c) => (c === 0 ? [seg(END_CHEVRON_PEAK, END_CHEVRON_PEAK)] : [])),
			...columnsPath(columns, s, (c) => (c === 0 ? [END_CHEVRON_ARM] : []))
		],
		quad
	);
	return [['M', peak[1], peak[2]] as PathSegment, ['L', tx, ty], armStart, armEnd];
};

/**
 * Tube-level adjustment: drop the lines that belong to a neighbour or lie
 * outside an open side, then append the lines gained from each partner and the
 * end cap. Runs per tube because gains read the neighbouring bands' quads.
 *
 * The band-to-band part (drops for the seam, gains from either partner) runs
 * only with `keepPartnerSeam`. Without it each band keeps exactly its own
 * quads' lines, bar the repeated column-edge vertical, plus the end cap.
 *
 * Gained lines that cross the neighbour's quad boundaries come apart when laid
 * flat (see `SeamFlaps` and `stitchJoints`). Every band is scored
 * (`seamDeviation`, per facet).
 *
 * Facet indices are piece-local. Splits fall on multiples of the subunit
 * count, so every piece starts on subunit 0 and ends on subunit 2, and a
 * piece's ends are treated as band ends.
 */
export const adjustHexparquet2AfterTiling = (
	bands: BandCutPattern[],
	tiledPatternConfig: TiledPatternConfig
): BandCutPattern[] => {
	const columns = tiledPatternConfig.config.columnCount || 1;
	const interBand = tiledPatternConfig.config.keepPartnerSeam ?? false;
	const seamFlaps = tiledPatternConfig.config.seamFlaps ?? 'mapped';

	return bands.map((band) => {
		if (band.error || band.facets.length === 0) return band;
		const hasLeftPartner = band.leftPartnerBand !== undefined;
		const left = hasLeftPartner ? findLeftPartner(bands, band) : undefined;
		const right = interBand ? findRightPartner(bands, band) : undefined;
		const last = band.facets.length - 1;
		const quads = band.facets.map((facet) => (facet.quad ? toQuad(facet.quad) : undefined));
		const joints: Joint[][] = band.facets.map(() => []);

		const paths = band.facets.map((facet, f) => {
			const path = structuredClone(facet.path);
			removeInPlace({
				indices: getHexparquet2DropIndices(f, columns, { hasLeftPartner, interBand }),
				target: path
			});
			const quad = quads[f];
			if (!quad) return path;
			const s = subunitIndexOf(f);
			const ends = { isStart: f === 0, isEnd: f === last };
			const append = (gain: { path: PathSegment[]; joints: Joint[] }) => {
				joints[f].push(...gain.joints.map((j) => ({ ...j, index: j.index + path.length })));
				path.push(...gain.path);
			};

			if (interBand && hasLeftPartner) {
				append(
					mapGain(
						'left',
						hexparquet2LeftGain(f, { seamFlaps, ...ends }),
						s,
						columns,
						quad,
						partnerQuadAlongside(band, f, left, HEXPARQUET2_SUBUNIT_COUNT)
					)
				);
				if (seamFlaps === 'voids' && ends.isEnd)
					path.push(...endChevron(path, joints[f], s, columns, quad));
			}
			if (right) {
				append(
					mapGain(
						'right',
						hexparquet2RightGain(f, ends),
						s,
						columns,
						quad,
						partnerQuadAlongside(band, f, right, HEXPARQUET2_SUBUNIT_COUNT)
					)
				);
			}
			if (ends.isEnd) {
				path.push(
					...transformPatternByQuad(
						columnsPath(columns, s, () => END_CAP),
						quad
					)
				);
			}
			return path;
		});

		const seamDeviation = stitchJoints(paths, joints, quads, seamFlaps);
		return {
			...band,
			facets: band.facets.map((facet, f) => ({ ...facet, path: paths[f] })),
			seamDeviation
		};
	});
};
