import type { BandCutPattern, PathSegment, TiledPatternConfig } from '#lib/types.js';
import { transformPatternByQuad } from './quadrilateral';
import { toQuad } from './tiled-asanoha-pattern';
import { findLeftPartner, layPartnerPath, partnerQuadAlongside } from './adjust/side-partners';

/**
 * SimpleHex: the plain regular hexagon tiling, two subunits cycled along a
 * band, one per quad. Subunit 0 is the unit's bottom (quad i+1 lies across
 * quad i's unit y = 1 edge). The basis for Escher-like tessellations, which
 * replace its straight edges with interlocking curves.
 *
 * Design grid. x in sixths across a column, `row` in halves down the whole unit
 * from its top (row 0–1 is subunit 1, 1–2 subunit 0):
 *
 *     (0,0)──(2,0)               (6,0)
 *               ╲                ╱
 *              (3,1)────────(5,1)
 *               ╱                ╲
 *     (0,2)──(2,2)               (6,2)
 *
 * Each horizontal lies on a quad edge; the subunit above that edge draws it as
 * its bottom line, so the tiling draws every line once. Every node lies inside
 * or on its quad, so nothing needs snapping.
 *
 * Band outline (with `keepPartnerSeam`). A band's right outline is its own
 * x = 5..6 diagonals. Its left outline is the left neighbour's: the chevron
 * (0,0)→(−1,1)→(0,2), gained from the left partner's last column and mapped
 * through the partner's own quads. Nothing is dropped, so each seam diagonal is
 * drawn by both bands it bounds. The chevron's apex lies on the boundary
 * between two facets, each of which lays its own copy; both copies move to
 * their midpoint so the chevron stays closed. An open side is drawn as a
 * closed one: with no left partner the chevron is extrapolated through the
 * band's own quads.
 *
 * Band ends. No caps or trims: the start draws its own bottom line, and the
 * last facet adds its top line (the next quad's bottom, which would otherwise
 * be missing) so both ends close on the band's edge.
 */

type P = [number, number];
/** `seamRight`: gained, one column right, by the right partner as its left outline. */
type Tag = 'seamRight';
type Seg = { from: P; to: P; tags?: Tag[] };

export const SIMPLE_HEX_SUBUNIT_COUNT = 2;

const seg = (from: P, to: P, ...tags: Tag[]): Seg => ({ from, to, tags });

/** Subunit 0: row 1–2, the hexagon's lower half and the bottom-left edge. */
const BOTTOM: Seg[] = [seg([0, 2], [2, 2]), seg([3, 1], [2, 2]), seg([5, 1], [6, 2], 'seamRight')];

/** Subunit 1: row 0–1, the hexagon's bottom edge and the upper half. */
const TOP: Seg[] = [seg([3, 1], [5, 1]), seg([2, 0], [3, 1]), seg([5, 1], [6, 0], 'seamRight')];

/** Each subunit's top line, drawn by the subunit above (the band's last facet adds it). */
const TOP_EDGE: Seg[][] = [[seg([3, 1], [5, 1])], [seg([0, 0], [2, 0])]];

const SUBUNITS = [BOTTOM, TOP];
const subunitIndexOf = (facetIndex: number) => facetIndex % SIMPLE_HEX_SUBUNIT_COUNT;

/** A grid point in subunit `s`'s unit frame (y up the band). */
const toUnit = ([x, row]: P, s: number): P => [x / 6, 2 - s - row];

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

export const generateSimpleHexSubunits = (columns: number): PathSegment[][] =>
	SUBUNITS.map((segs, s) => columnsPath(columns, s, segs));

/** Both subunits stacked into one unit square (subunit 0 bottom). */
export const generateSimpleHexPreview = (columns: number): PathSegment[] =>
	generateSimpleHexSubunits(columns).flatMap((path, s) =>
		path.map((seg) => {
			const [command, x, y] = seg as ['M' | 'L', number, number];
			return [command, x, (s + y) / SIMPLE_HEX_SUBUNIT_COUNT] as PathSegment;
		})
	);

/** The left partner's seam lines, in its own unit frame (its last column). */
const leftPartnerPath = (facetIndex: number, columns: number): PathSegment[] => {
	const s = subunitIndexOf(facetIndex);
	return columnsPath(
		1,
		s,
		SUBUNITS[s].filter(({ tags = [] }) => tags.includes('seamRight'))
	).map((seg) => {
		const [command, x, y] = seg as ['M' | 'L', number, number];
		return [command, (columns - 1 + x) / columns, y] as PathSegment;
	});
};

const isApex = (seg: PathSegment, columns: number, y: number) => {
	const [, x, py] = seg as ['M' | 'L', number, number];
	return Math.abs(x - (columns - 1 + 5 / 6) / columns) < 1e-9 && Math.abs(py - y) < 1e-9;
};

/**
 * Tube-level adjustment. With `keepPartnerSeam`, each facet gains the left
 * partner's seam diagonal, mapped through the partner's alongside quad (or
 * extrapolated with no left partner), and the chevron apexes shared by
 * consecutive facets are stitched to their midpoint. Every band's last facet
 * gets its top line.
 *
 * Facet indices are piece-local. Splits fall on multiples of the subunit
 * count, so every piece starts on subunit 0 and ends on subunit 1, and a
 * piece's ends are treated as band ends.
 */
export const adjustSimpleHexAfterTiling = (
	bands: BandCutPattern[],
	tiledPatternConfig: TiledPatternConfig
): BandCutPattern[] => {
	const columns = tiledPatternConfig.config.columnCount || 1;
	const interBand = tiledPatternConfig.config.keepPartnerSeam ?? false;

	return bands.map((band) => {
		if (band.error || band.facets.length === 0) return band;
		const left = interBand ? findLeftPartner(bands, band) : undefined;
		const last = band.facets.length - 1;
		/** Per facet, the index of its gained apex node in its path, if any. */
		const apex: (number | undefined)[] = band.facets.map(() => undefined);

		const paths = band.facets.map((facet, f) => {
			const path = structuredClone(facet.path);
			if (!facet.quad) return path;
			const quad = toQuad(facet.quad);
			const s = subunitIndexOf(f);

			if (interBand) {
				const inPartner = leftPartnerPath(f, columns);
				// Subunit 0's apex is on its top edge, subunit 1's on its bottom.
				const apexAt = inPartner.findIndex((seg) => isApex(seg, columns, s === 0 ? 1 : 0));
				const gained = layPartnerPath(
					'left',
					inPartner,
					quad,
					partnerQuadAlongside(band, f, left, SIMPLE_HEX_SUBUNIT_COUNT)
				);
				if (apexAt >= 0) apex[f] = path.length + apexAt;
				path.push(...gained);
			}
			if (f === last)
				path.push(...transformPatternByQuad(columnsPath(columns, s, TOP_EDGE[s]), quad));
			return path;
		});

		// Stitch each subunit-0 facet's apex to the next facet's.
		for (let f = 0; f < last; f++) {
			const lower = apex[f];
			const upper = apex[f + 1];
			if (subunitIndexOf(f) !== 0 || lower === undefined || upper === undefined) continue;
			const [cl, lx, ly] = paths[f][lower] as ['M' | 'L', number, number];
			const [cu, ux, uy] = paths[f + 1][upper] as ['M' | 'L', number, number];
			const mx = (lx + ux) / 2;
			const my = (ly + uy) / 2;
			paths[f][lower] = [cl, mx, my] as PathSegment;
			paths[f + 1][upper] = [cu, mx, my] as PathSegment;
		}

		return { ...band, facets: band.facets.map((facet, f) => ({ ...facet, path: paths[f] })) };
	});
};
