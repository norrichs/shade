import type { BandCutPattern, PathSegment, Quadrilateral, TiledPatternConfig } from '$lib/types';
import type { IndexPair } from './spec-types';
import type { FacetSnapRule } from './adjust/snap-adjacent-facets';
import { snapAdjacentFacets } from './adjust/snap-adjacent-facets';
import { alignPrevBandPath } from './adjust/align-prev-band';
import { removeInPlace, replaceInPlace } from './tesselation/shared/helpers';

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
 * Tube-level adjustment: snap each band's column-0 left apexes onto its left
 * partner band's right apex (brought into this band's frame), then drop segments.
 * All snaps read complete paths, so drops happen last.
 */
export const adjustHexparquetAfterTiling = (
	bands: BandCutPattern[],
	tiledPatternConfig: TiledPatternConfig
): BandCutPattern[] => {
	const columns = tiledPatternConfig.config.columnCount || 1;
	const byIndex = new Map(bands.map((band) => [band.address.band, band]));

	const snapped = bands.map((band) => {
		const partner =
			band.leftPartnerBand === undefined ? undefined : byIndex.get(band.leftPartnerBand);
		if (band.error || !partner || partner.error || partner.facets.length !== band.facets.length) {
			return band;
		}
		return {
			...band,
			facets: band.facets.map((facet, f) => {
				const partnerFacet = partner.facets[f];
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
