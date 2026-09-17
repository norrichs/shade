import type { BandCutPattern, PathSegment, Quadrilateral, TiledPatternConfig } from '$lib/types';
import type { IndexPair } from './spec-types';
import type { FacetSnapRule } from './adjust/snap-adjacent-facets';
import { snapAdjacentFacets } from './adjust/snap-adjacent-facets';
import { alignPrevBandPath } from './adjust/align-prev-band';
import { removeInPlace, replaceInPlace } from './tesselation/shared/helpers';
import {
	alongsideFacetIndex,
	findSideNeighbourInBands,
	pieceIndexOf
} from '$lib/cut-pattern/resolve-partner-band';
import { isSameParentBand } from '$lib/util';
import type { GlobuleAddress_BandPiece } from '$lib/projection-geometry/types';

/**
 * Hexparquet: three subunits cycled along a band, one per quad. Quad i+1 lies
 * across quad i's unit y = 1 edge, so in quad-index order a unit is
 * blue (bottom), green (middle), red (top).
 *
 * Unit frame: x across the band in sixths, y along the band. `◀` is the left
 * apex, defined at (-1/6, y): the quad mapping extrapolates it into place when
 * there is no neighbour, and snaps overwrite it when there is one.
 */

type P = [number, number];
type Tag = 'leftEdge' | 'partnerDrop' | 'unitBottom';
type Seg = { from: P; to: P; tags?: Tag[] };

export const HEXPARQUET_SUBUNIT_COUNT = 3;

const APEX = (y: number): P => [-1 / 6, y];
const RIGHT_APEX: P = [5 / 6, 0.5];

const BLUE: Seg[] = [
	{ from: [0, 1], to: [2 / 6, 1] },
	{ from: [2 / 6, 1], to: [0, 0] },
	{ from: [0, 1], to: APEX(0.5), tags: ['leftEdge'] },
	{ from: APEX(0.5), to: [0, 0], tags: ['leftEdge'] },
	{ from: [0, 0], to: [1, 0], tags: ['unitBottom'] },
	{ from: [1, 0], to: RIGHT_APEX },
	{ from: RIGHT_APEX, to: [1, 1] },
	{ from: [2 / 6, 1], to: [3 / 6, 0.5] },
	{ from: [3 / 6, 0.5], to: [2 / 6, 0] },
	{ from: [3 / 6, 0.5], to: RIGHT_APEX }
];

const GREEN: Seg[] = [
	{ from: [0, 1], to: APEX(0.5), tags: ['leftEdge'] },
	{ from: APEX(0.5), to: [0, 0], tags: ['leftEdge', 'partnerDrop'] },
	{ from: APEX(0.5), to: RIGHT_APEX },
	{ from: [2 / 6, 1], to: [3 / 6, 0.5] },
	{ from: [3 / 6, 0.5], to: [4 / 6, 0] }, // `to` snaps down onto blue
	{ from: [4 / 6, 1], to: [3 / 6, 0.5] }, // `from` snaps up onto red
	{ from: [3 / 6, 0.5], to: [2 / 6, 0] },
	{ from: [1, 1], to: RIGHT_APEX },
	{ from: RIGHT_APEX, to: [1, 0] }
];

const RED: Seg[] = [
	{ from: APEX(0.5), to: [0, 0], tags: ['leftEdge'] },
	{ from: APEX(0.5), to: [0, 1], tags: ['leftEdge'] },
	{ from: [0, 1], to: [1, 1] },
	{ from: [1, 1], to: RIGHT_APEX },
	{ from: RIGHT_APEX, to: [1, 0] },
	{ from: [0, 0], to: [2 / 6, 0] },
	{ from: [2 / 6, 0], to: [0, 1] },
	{ from: [2 / 6, 1], to: [3 / 6, 0.5] },
	{ from: [3 / 6, 0.5], to: [2 / 6, 0] },
	{ from: [3 / 6, 0.5], to: RIGHT_APEX }
];

const SUBUNITS = [BLUE, GREEN, RED];
const subunitOf = (facetIndex: number) => SUBUNITS[facetIndex % HEXPARQUET_SUBUNIT_COUNT];

const EPS = 1e-9;
const at =
	(x: number, y: number) =>
	([px, py]: P) =>
		Math.abs(px - x) < EPS && Math.abs(py - y) < EPS;
const isLeftApex = ([px]: P) => Math.abs(px + 1 / 6) < EPS;
const isRightApex = at(...RIGHT_APEX);

/** Path indices, within column `c`, of every segment endpoint matching `match`. */
const nodeIndices = (segs: Seg[], c: number, match: (p: P) => boolean): number[] => {
	const out: number[] = [];
	segs.forEach((seg, s) => {
		const base = 2 * (c * segs.length + s);
		if (match(seg.from)) out.push(base);
		if (match(seg.to)) out.push(base + 1);
	});
	return out;
};

export const generateHexparquetSubunits = (columns: number): PathSegment[][] =>
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

/** All three subunits stacked into one unit square (blue bottom third, red top). */
export const generateHexparquetPreview = (columns: number): PathSegment[] =>
	generateHexparquetSubunits(columns).flatMap((path, s) =>
		path.map((seg) => {
			const [command, x, y] = seg as ['M' | 'L', number, number];
			return [command, x, (s + y) / HEXPARQUET_SUBUNIT_COUNT] as PathSegment;
		})
	);

/** Within-band snaps for one facet (see spec: Snap rules). */
export const getHexparquetSnapRules =
	(columns: number) =>
	(facetIndex: number): FacetSnapRule[] => {
		const segs = subunitOf(facetIndex);
		const rules: FacetSnapRule[] = [];

		const self: IndexPair[] = [];
		for (let c = 1; c < columns; c++) {
			const source = nodeIndices(segs, c - 1, isRightApex)[0];
			for (const target of nodeIndices(segs, c, isLeftApex)) self.push({ target, source });
		}
		if (self.length) rules.push({ from: 'self', pairs: self });

		if (segs === GREEN) {
			const up: IndexPair[] = [];
			const down: IndexPair[] = [];
			for (let c = 0; c < columns; c++) {
				up.push({
					target: nodeIndices(GREEN, c, at(4 / 6, 1))[0],
					source: nodeIndices(RED, c, isRightApex)[0]
				});
				down.push({
					target: nodeIndices(GREEN, c, at(4 / 6, 0))[0],
					source: nodeIndices(BLUE, c, isRightApex)[0]
				});
			}
			rules.push({ from: 'next', pairs: up }, { from: 'prev', pairs: down });
		}
		return rules;
	};

/** Column-0 left apexes ← the left partner band's last-column right apex (same facet index). */
export const getHexparquetAcrossBandPairs = (facetIndex: number, columns: number): IndexPair[] => {
	const segs = subunitOf(facetIndex);
	const source = nodeIndices(segs, columns - 1, isRightApex)[0];
	return nodeIndices(segs, 0, isLeftApex).map((target) => ({ target, source }));
};

/** Path indices to remove from one facet, applied after every snap. */
export const getHexparquetDropIndices = (
	facetIndex: number,
	columns: number,
	{ hasLeftPartner }: { hasLeftPartner: boolean }
): number[] => {
	const segs = subunitOf(facetIndex);
	const out: number[] = [];
	for (let c = 0; c < columns; c++) {
		segs.forEach(({ tags = [] }, s) => {
			const drop =
				(c > 0 && tags.includes('leftEdge')) ||
				(c === 0 && hasLeftPartner && tags.includes('partnerDrop')) ||
				// Blue's bottom line coincides with the previous unit's red top; only the
				// band's first unit (facet 0) keeps it as the band's end.
				(facetIndex > 0 && tags.includes('unitBottom'));
			if (drop) {
				const base = 2 * (c * segs.length + s);
				out.push(base, base + 1);
			}
		});
	}
	return out;
};

/** Within-band snaps: green up/down nodes and column-to-column apexes. */
export const adjustHexparquetAfterMapping = (
	patternBand: PathSegment[][],
	quadBand: Quadrilateral[],
	tiledPatternConfig: TiledPatternConfig
): PathSegment[][] =>
	snapAdjacentFacets(
		patternBand,
		quadBand,
		getHexparquetSnapRules(tiledPatternConfig.config.columnCount || 1),
		{ endsMatched: false }
	);

/**
 * The band on `band`'s left (unit x = 0) side, by address (spec amendment
 * 2026-09-16: neighbour identity is by address, never by array position).
 * `leftPartnerBand` names a parent band in the same tube; when that band was
 * split, the side-neighbour rule picks the piece alongside `band` (same piece
 * index, else the neighbour's last piece).
 */
const findLeftPartner = (
	bands: BandCutPattern[],
	band: BandCutPattern
): BandCutPattern | undefined => {
	if (band.leftPartnerBand === undefined) return undefined;
	// The parent's plain address with the partner's band index: drop `piece`,
	// keep every other component exactly as stored.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { piece, ...parent } = band.address as GlobuleAddress_BandPiece;
	return findSideNeighbourInBands(
		bands,
		{ ...parent, band: band.leftPartnerBand },
		pieceIndexOf(band.address)
	);
};

/**
 * The parent band's facet count: the sum over its pieces, or the band's own
 * count when it is unsplit. Tiled output has one facet per quad.
 */
const parentFacetCount = (bands: BandCutPattern[], band: BandCutPattern): number =>
	bands
		.filter((b) => isSameParentBand(b.address, band.address))
		.reduce((count, b) => count + b.facets.length, 0);

/**
 * Tube-level adjustment: snap each band's column-0 left apexes onto its left
 * partner band's right apex (brought into this band's frame), then drop segments.
 * All snaps read complete paths, so drops happen last.
 *
 * Split tubes (pieces). The snap must reproduce the unsplit band's, so:
 * - the left partner is resolved by address with the side-neighbour rule
 *   (`findLeftPartner`), never by band index alone, which cannot tell pieces
 *   apart;
 * - the length gate compares PARENT bands, as the unsplit run does;
 * - facets pair in parent quad coordinates (`alongsideFacetIndex`); a facet the
 *   partner piece does not cover is left unsnapped.
 * The subunit (`f % 3`) and the drop rules read the piece-local facet index.
 * That equals the parent's modulo 3 because splits fall only on multiples of
 * the subunit count, and `facetIndex > 0` (keep blue's bottom line) is meant
 * per piece: a piece's first facet is a physical end, seam or not.
 * `hasLeftPartner` reads the stored partner index exactly as the unsplit run
 * does (pieces inherit it from the parent), so the drops match the parent's.
 */
export const adjustHexparquetAfterTiling = (
	bands: BandCutPattern[],
	tiledPatternConfig: TiledPatternConfig
): BandCutPattern[] => {
	const columns = tiledPatternConfig.config.columnCount || 1;

	const snapped = bands.map((band) => {
		const partner = findLeftPartner(bands, band);
		if (
			band.error ||
			!partner ||
			partner.error ||
			parentFacetCount(bands, partner) !== parentFacetCount(bands, band)
		) {
			return band;
		}
		return {
			...band,
			facets: band.facets.map((facet, f) => {
				const partnerIndex = alongsideFacetIndex(band, f, partner);
				if (partnerIndex === undefined) return facet;
				const partnerFacet = partner.facets[partnerIndex];
				if (!facet.quad || !partnerFacet.quad) return facet;
				const source = alignPrevBandPath(partnerFacet.path, partnerFacet.quad, facet.quad);
				const path = structuredClone(facet.path);
				replaceInPlace({ pairs: getHexparquetAcrossBandPairs(f, columns), target: path, source });
				return { ...facet, path };
			})
		};
	});

	return snapped.map((band) => {
		if (band.error) return band;
		const hasLeftPartner = band.leftPartnerBand !== undefined;
		return {
			...band,
			facets: band.facets.map((facet, f) => {
				const path = structuredClone(facet.path);
				removeInPlace({
					indices: getHexparquetDropIndices(f, columns, { hasLeftPartner }),
					target: path
				});
				return { ...facet, path };
			})
		};
	});
};
