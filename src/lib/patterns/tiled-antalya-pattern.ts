import type { BandCutPattern, PathSegment, Quadrilateral, TiledPatternConfig } from '#lib/types.js';
import { transformPatternByQuad } from './quadrilateral';
import { toQuad } from './tiled-asanoha-pattern';
import { alignNextBandPath, alignPrevBandPath } from './adjust/align-prev-band';
import { findLeftPartner, findRightPartner } from './adjust/side-partners';
import { alongsideFacetIndex } from '#lib/cut-pattern/resolve-partner-band.js';
import { computeTiledLabelAngle } from '#lib/cut-pattern/compute-tiled-label-angle.js';

/**
 * Antalya: two units, A (a wide bar with ears and two X crossings) and B (A
 * turned 90°: a tall bar with crossings top and bottom), each two quads long.
 * Units alternate along a band, and neighbouring bands (and neighbouring
 * columns) are offset by one unit, so A always sits beside B:
 *
 *     band 0: A B A B …    band 1: B A B A …    band 2: A B A B …
 *
 * A unit's lower quad is subunit A2 / B2, its upper quad A1 / B1 (quad i+1 lies
 * across quad i's unit y = 1 edge). The tiling step only cycles the two halves;
 * `adjustAntalyaAfterTiling` rebuilds every facet as A or B from the parity of
 * (column index across the tube + unit index along the band).
 *
 * Design grid. Each subunit is written in its quad's 8 × 4 grid: x in eighths
 * of a column, `r` in quarters DOWN from the quad's top. Lines reach one grid
 * step past their quad. Every node is resolved to the quad it lies in, so a
 * line shared by two quads lands on the same mapped node from both sides:
 * - past the top or bottom: the band's next / previous quad (extrapolated
 *   through this quad at the band's ends);
 * - past x = 0 or 8: the neighbouring column, which for the band's outer
 *   columns is the partner band's alongside quad, laid into this band's frame
 *   (extrapolated through this quad on an open side, or without
 *   `keepPartnerSeam`).
 *
 * Band outline. A reaches one column into each neighbour (its ears and the
 * x = −1 / 9 sides) while B draws back to x = 1 / 7, so bands interlock. A's
 * sides retrace the neighbouring B's sides; bands are cut apart, so both draw
 * them. Between columns of one band they are drawn once, by B.
 *
 * Band ends and split seams. B's quads close the band with the line the A
 * beyond would have drawn (`capUp` / `capDown`); A closes on its own lines.
 * Splits fall on unit boundaries, and a piece's ends are band ends.
 *
 * Straight seam. Around a closed tube with an odd number of columns two
 * neighbours have the same parity and cannot interlock. Their shared edge is
 * drawn straight: A's sides are dropped and its reaching horizontals stop at
 * the edge, B's side is dropped and its horizontals run out to the edge, and
 * the quad edge itself is drawn. The band carries a `notice`.
 */

type P = [number, number];
/**
 * - `sideL` / `sideR`: A's outline beyond its quad (it retraces the neighbour
 *   B's side). Dropped between columns of one band, and at a straight seam.
 * - `edgeL` / `edgeR`: B's own side. Dropped at a straight seam.
 * - `toEdgeL` / `toEdgeR`: a horizontal whose outer node moves onto the quad
 *   edge at a straight seam (A's shortens, B's lengthens).
 * - `capUp` / `capDown`: B's closing line, drawn only when the band has no
 *   quad above / below.
 */
type Tag = 'sideL' | 'sideR' | 'edgeL' | 'edgeR' | 'toEdgeL' | 'toEdgeR' | 'capUp' | 'capDown';
type Seg = { from: P; to: P; tags: Tag[] };
type Kind = 'A' | 'B';

export const ANTALYA_SUBUNIT_COUNT = 2;

const seg = (from: P, to: P, ...tags: Tag[]): Seg => ({ from, to, tags });

/** A1: A's upper quad. The ears, the top bar and the X crossings' upper halves. */
const A1: Seg[] = [
	seg([0, 0], [1, 1]),
	seg([1, 1], [7, 1]),
	seg([7, 1], [8, 0]),
	seg([3, 1], [3, 3]),
	seg([5, 1], [5, 3]),
	seg([3, 3], [2, 4]),
	seg([1, 3], [2, 4]),
	seg([5, 3], [6, 4]),
	seg([7, 3], [6, 4]),
	seg([1, 3], [-1, 3], 'toEdgeL'),
	seg([7, 3], [9, 3], 'toEdgeR'),
	seg([-1, 3], [-1, 1], 'sideL'),
	seg([-1, 1], [0, 0], 'sideL'),
	seg([9, 3], [9, 1], 'sideR'),
	seg([9, 1], [8, 0], 'sideR')
];

/** A2: A's lower quad, A1 upside down. */
const A2: Seg[] = [
	seg([2, 0], [3, 1]),
	seg([2, 0], [1, 1]),
	seg([6, 0], [5, 1]),
	seg([6, 0], [7, 1]),
	seg([3, 1], [3, 3]),
	seg([5, 1], [5, 3]),
	seg([1, 3], [7, 3]),
	seg([0, 4], [1, 3]),
	seg([7, 3], [8, 4]),
	seg([1, 1], [-1, 1], 'toEdgeL'),
	seg([7, 1], [9, 1], 'toEdgeR'),
	// The sides are split where the horizontals above meet them: the halves lie
	// in different partner quads, laid flat separately, so a T-junction would miss.
	seg([-1, -1], [-1, 1], 'sideL'),
	seg([-1, 1], [-1, 3], 'sideL'),
	seg([-1, 3], [0, 4], 'sideL'),
	seg([9, -1], [9, 1], 'sideR'),
	seg([9, 1], [9, 3], 'sideR'),
	seg([9, 3], [8, 4], 'sideR')
];

/** B1: B's upper quad. The stems from A2's bar, the upper crossing and B's sides. */
const B1: Seg[] = [
	seg([3, -1], [3, 1]),
	seg([5, -1], [5, 1]),
	seg([3, 1], [5, 3]),
	seg([5, 1], [3, 3]),
	seg([3, 3], [1, 3], 'toEdgeL'),
	seg([5, 3], [7, 3], 'toEdgeR'),
	seg([1, 3], [1, 1], 'edgeL'),
	seg([1, 1], [0, 0], 'edgeL'),
	seg([7, 3], [7, 1], 'edgeR'),
	seg([7, 1], [8, 0], 'edgeR'),
	seg([0, 0], [1, -1], 'capUp'),
	seg([1, -1], [7, -1], 'capUp'),
	seg([7, -1], [8, 0], 'capUp')
];

/** B2: B's lower quad, B1 upside down. */
const B2: Seg[] = [
	seg([3, 1], [5, 3]),
	seg([5, 1], [3, 3]),
	seg([3, 3], [3, 5]),
	seg([5, 3], [5, 5]),
	seg([1, 1], [3, 1], 'toEdgeL'),
	seg([7, 1], [5, 1], 'toEdgeR'),
	seg([1, 1], [1, 3], 'edgeL'),
	seg([1, 3], [0, 4], 'edgeL'),
	seg([1, 1], [1, -1], 'edgeL'),
	seg([7, 1], [7, 3], 'edgeR'),
	seg([7, 3], [8, 4], 'edgeR'),
	seg([7, 1], [7, -1], 'edgeR'),
	seg([0, 4], [1, 5], 'capDown'),
	seg([1, 5], [7, 5], 'capDown'),
	seg([7, 5], [8, 4], 'capDown')
];

/** [lower, upper] quad of each unit. */
const SUBUNITS: Record<Kind, [Seg[], Seg[]]> = { A: [A2, A1], B: [B2, B1] };

/** A when (column across the tube + unit along the band) is even. */
export const antalyaKindOf = (globalColumn: number, globalFacet: number): Kind =>
	(globalColumn + Math.floor(globalFacet / ANTALYA_SUBUNIT_COUNT)) % 2 === 0 ? 'A' : 'B';

/**
 * A node: unit coordinates (x across the band, y up the quad) in `facet`'s
 * quad. x < 0 or > 1 lies in the left / right partner band's alongside quad
 * (shifted by one band width). `facet` is the band's quad the node lies in, or
 * the nearest one when it lies past the band's end (y then outside [0, 1]).
 */
export type AntalyaNode = { facet: number; x: number; y: number };
export type AntalyaSegment = { from: AntalyaNode; to: AntalyaNode; tags: Tag[] | ['straight'] };

export type AntalyaBandLayout = {
	/** Pattern band index (address.band). */
	band: number;
	columns: number;
	/** The band's first quad in parent coordinates (pieces), else 0. */
	parentQuadOffset: number;
	facetCount: number;
	leftStraight: boolean;
	rightStraight: boolean;
};

const resolveNode = (
	[X, r]: P,
	f: number,
	c: number,
	{ columns, facetCount }: AntalyaBandLayout
): AntalyaNode => {
	const x = (c + X / 8) / columns;
	const y = (4 - r) / 4;
	const shift = y > 1 ? 1 : y < 0 ? -1 : 0;
	const facet = f + shift;
	return facet >= 0 && facet < facetCount ? { facet, x, y: y - shift } : { facet: f, x, y };
};

/** Each facet's lines, as nodes in the quads they lie in (no geometry). */
export const antalyaBandSegments = (layout: AntalyaBandLayout): AntalyaSegment[][] => {
	const { band, columns, parentQuadOffset, facetCount, leftStraight, rightStraight } = layout;
	return Array.from({ length: facetCount }, (_, f) => {
		const globalFacet = parentQuadOffset + f;
		const out: AntalyaSegment[] = [];
		for (let c = 0; c < columns; c++) {
			const kind = antalyaKindOf(band * columns + c, globalFacet);
			const segs = SUBUNITS[kind][globalFacet % 2];
			const straightL = c === 0 && leftStraight;
			const straightR = c === columns - 1 && rightStraight;
			for (const { from, to, tags } of segs) {
				const has = (t: Tag) => tags.includes(t);
				if (has('sideL') && (c > 0 || straightL)) continue;
				if (has('sideR') && (c < columns - 1 || straightR)) continue;
				if (has('edgeL') && straightL) continue;
				if (has('edgeR') && straightR) continue;
				if (has('capUp') && f < facetCount - 1) continue;
				if (has('capDown') && f > 0) continue;
				let [a, b] = [from, to];
				if (has('toEdgeL') && straightL) {
					[a, b] = a[0] < b[0] ? [[0, a[1]], b] : [a, [0, b[1]]];
				}
				if (has('toEdgeR') && straightR) {
					[a, b] = a[0] > b[0] ? [[8, a[1]], b] : [a, [8, b[1]]];
				}
				out.push({ from: resolveNode(a, f, c, layout), to: resolveNode(b, f, c, layout), tags });
			}
			if (straightL) {
				out.push({
					from: resolveNode([0, 4], f, c, layout),
					to: resolveNode([0, 0], f, c, layout),
					tags: ['straight']
				});
			}
			if (straightR) {
				out.push({
					from: resolveNode([8, 4], f, c, layout),
					to: resolveNode([8, 0], f, c, layout),
					tags: ['straight']
				});
			}
		}
		return out;
	});
};

/** Nodes of `segs` that lie inside the quad, as M/L pairs (y shifted by `yOffset` quads). */
const inQuadPath = (segs: AntalyaSegment[], f: number, yOffset = 0): PathSegment[] =>
	segs
		.filter(({ from, to }) =>
			[from, to].every((n) => n.facet === f && n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1)
		)
		.flatMap(({ from, to }) => [
			['M', from.x, from.y + yOffset] as PathSegment,
			['L', to.x, to.y + yOffset] as PathSegment
		]);

/** Interior layout of a long band for previews: no straight seams, no ends nearby. */
const previewLayout = (columns: number): AntalyaBandLayout => ({
	band: 0,
	columns,
	parentQuadOffset: 0,
	facetCount: 6,
	leftStraight: false,
	rightStraight: false
});

/**
 * The two subunits as tiled before adjustment (band 0's first unit: A in even
 * columns, B in odd). Only lines wholly inside the quad; the adjuster rebuilds
 * every facet.
 */
export const generateAntalyaSubunits = (columns: number): PathSegment[][] => {
	const segments = antalyaBandSegments(previewLayout(columns));
	return [0, 1].map((half) => inQuadPath(segments[half], half));
};

/** A and B stacked (A2, A1, B2, B1 from the bottom) into one unit square, for the picker. */
export const generateAntalyaPreview = (columns: number): PathSegment[] => {
	const segments = antalyaBandSegments(previewLayout(columns));
	return [2, 3, 4, 5].flatMap((f, i) =>
		inQuadPath(segments[f], f, i).map((s) => {
			const [command, x, y] = s as ['M' | 'L', number, number];
			return [command, x, y / 4] as PathSegment;
		})
	);
};

/**
 * The label anchor: the middle of the line that closes the band's start, in
 * the middle column, mapped exactly as the lines are. For A that is A2's bottom
 * bar (4,3), between the ears; for B its cap (4,5), past the quad edge. The
 * quad edge itself (where a split cuts) carries no line.
 */
export const antalyaStartAnchorNode = (layout: AntalyaBandLayout): AntalyaNode => {
	const column = Math.floor((layout.columns - 1) / 2);
	const kind = antalyaKindOf(layout.band * layout.columns + column, layout.parentQuadOffset);
	return resolveNode([4, kind === 'A' ? 3 : 5], 0, column, layout);
};

const startLabelAnchor = (
	layout: AntalyaBandLayout,
	firstQuad: Quadrilateral | undefined,
	place: (node: AntalyaNode) => [number, number] | undefined
): { point: { x: number; y: number }; angle: number } | undefined => {
	const placed = firstQuad ? place(antalyaStartAnchorNode(layout)) : undefined;
	if (!placed || !firstQuad) return undefined;
	const point = { x: placed[0], y: placed[1] };
	return { point, angle: computeTiledLabelAngle(point, firstQuad) };
};

const mapPoint = (x: number, y: number, quad: Quadrilateral): [number, number] => {
	const [[, px, py]] = transformPatternByQuad([['M', x, y]], quad) as [['M', number, number]];
	return [px, py];
};

const parityOf = (band: number, column: number, columns: number) => (band * columns + column) % 2;

const straightNotice = (tube: number, left: number, right: number) =>
	`Tube ${tube} has an odd number of bands, so Antalya's A and B units cannot alternate all the way round: the seam between bands ${left} and ${right} is straight.`;

/**
 * Tube-level adjustment: rebuild every facet's lines as A or B, mapping each
 * node through the quad it lies in (see the module comment). Without
 * `keepPartnerSeam`, nodes in a partner band are extrapolated through this
 * band's own quad instead of read from the partner.
 */
export const adjustAntalyaAfterTiling = (
	bands: BandCutPattern[],
	tiledPatternConfig: TiledPatternConfig
): BandCutPattern[] => {
	const columns = tiledPatternConfig.config.columnCount || 1;
	const interBand = tiledPatternConfig.config.keepPartnerSeam ?? false;

	return bands.map((band) => {
		if (band.error || band.facets.length === 0) return band;
		const b = band.address.band;
		const rightBand = findRightPartner(bands, band);
		const leftStraight =
			band.leftPartnerBand !== undefined &&
			parityOf(band.leftPartnerBand, columns - 1, columns) === parityOf(b, 0, columns);
		const rightStraight =
			rightBand !== undefined &&
			parityOf(rightBand.address.band, 0, columns) === parityOf(b, columns - 1, columns);
		const partners = interBand
			? { left: findLeftPartner(bands, band), right: rightBand }
			: { left: undefined, right: undefined };

		const quads = band.facets.map((facet) => (facet.quad ? toQuad(facet.quad) : undefined));
		const partnerQuad = (side: 'left' | 'right', h: number): Quadrilateral | undefined => {
			const partner = partners[side];
			if (!partner || partner.error) return undefined;
			const index = alongsideFacetIndex(band, h, partner);
			const quad = index === undefined ? undefined : partner.facets[index].quad;
			return quad ? toQuad(quad) : undefined;
		};

		const place = ({ facet, x, y }: AntalyaNode): [number, number] | undefined => {
			const own = quads[facet];
			if (!own) return undefined;
			const side = x < -1e-9 ? 'left' : x > 1 + 1e-9 ? 'right' : undefined;
			const inBand = y >= -1e-9 && y <= 1 + 1e-9;
			const partner = side && inBand ? partnerQuad(side, facet) : undefined;
			if (!side || !partner) return mapPoint(x, y, own);
			const mapped = transformPatternByQuad([['M', side === 'left' ? x + 1 : x - 1, y]], partner);
			const [[, px, py]] = (
				side === 'left'
					? alignPrevBandPath(mapped, partner, own)
					: alignNextBandPath(mapped, partner, own)
			) as [['M', number, number]];
			return [px, py];
		};

		const layout: AntalyaBandLayout = {
			band: b,
			columns,
			parentQuadOffset: band.parentQuadOffset ?? 0,
			facetCount: band.facets.length,
			leftStraight,
			rightStraight
		};
		const segments = antalyaBandSegments(layout);
		const label = startLabelAnchor(layout, quads[0], place);

		const facets = band.facets.map((facet, f) => {
			if (!quads[f]) return facet;
			const path: PathSegment[] = [];
			for (const { from, to } of segments[f]) {
				const p = place(from);
				const q = place(to);
				if (p && q) path.push(['M', p[0], p[1]], ['L', q[0], q[1]]);
			}
			return { ...facet, path };
		});

		const notice =
			leftStraight && band.leftPartnerBand !== undefined
				? straightNotice(band.address.tube, band.leftPartnerBand, b)
				: rightStraight && rightBand
					? straightNotice(band.address.tube, b, rightBand.address.band)
					: undefined;
		return {
			...band,
			...(label && { tagAnchorPoint: label.point, tagAnchorAutoAngle: label.angle }),
			facets,
			...(notice ? { notice } : {})
		};
	});
};
