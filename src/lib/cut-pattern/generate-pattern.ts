import type {
	GlobuleAddress_Band,
	GlobuleAddress_BandPiece,
	TransformConfig,
	TriangleEdge,
	TriangleEdgePermissive,
	Tube
} from '$lib/projection-geometry/types';
import type {
	Globule,
	GlobulePatternConfig,
	BandCutPatternPattern,
	SubGlobule,
	SubGlobuleConfig,
	SuperGlobule,
	SuperGlobuleConfig,
	TrianglePoint,
	FacetOrientation,
	TubeCutPattern,
	Band,
	BandCutPattern,
	UnitPatternGenerator,
	SplitConfig
} from '$lib/types';
import { isTiledPatternConfig, isOutlinedPatternConfig } from '$lib/types';

import { applyStrokeWidth } from './generate-cut-pattern';
import {
	generateTiledBandPattern,
	generateTubeCutPattern,
	applyTubePatternPostProcessing
} from './generate-tiled-pattern';
import { resolvePatternEntry } from '$lib/patterns/resolve-pattern';
import { generateOutlinedProjectionPattern } from './generate-outlined-pattern';
import { getEdge } from '$lib/projection-geometry/generate-projection';
import type {
	SuperGlobuleBandPattern,
	SuperGlobuleProjectionPattern
} from '$lib/stores/superGlobuleStores';
import {
	shouldUsePanelPattern,
	generateProjectionPanelPattern,
	validateAllPanels,
	getPanelEdgeMeta,
	applyHolesToEdgeMeta,
	type PanelHoleConfig
} from './generate-panel-pattern';
import { isSameAddress, isGlobuleAddress_BandPiece } from '$lib/util';
import { resolveRangeIndices, type ProjectionRange } from '$lib/projection-geometry/filters';

// Re-export panel functions for backwards compatibility
export { validateAllPanels, getPanelEdgeMeta, applyHolesToEdgeMeta, type PanelHoleConfig };

type PatternGlobule = {
	globules: Globule[];
	config: SubGlobuleConfig;
};

export const generateSuperGlobulePattern = (
	superGlobule: SuperGlobule,
	superGlobuleConfig: SuperGlobuleConfig,
	globulePatternConfig: GlobulePatternConfig
): SuperGlobuleBandPattern => {
	const patternGlobules: PatternGlobule[] = superGlobule.subGlobules.map(
		(subGlobule: SubGlobule) => {
			const config = superGlobuleConfig.subGlobuleConfigs.find(
				(subGlobuleConfig) => subGlobuleConfig.id === subGlobule.subGlobuleConfigId
			);
			if (!config) {
				throw new Error('missing config');
			}
			return { globules: subGlobule.data.filter((globule: Globule) => globule.visible), config };
		}
	);

	const collectedBandPatterns: BandCutPatternPattern[] = patternGlobules
		.map(({ globules }: { globules: Globule[] }) => {
			const bandPatterns = globules.map(({ data: { bands }, address }, bandIndex) => {
				let pattern: BandCutPatternPattern;
				const {
					patternTypeConfig,
					patternConfig: { pixelScale }
				} = globulePatternConfig;
				if (!isTiledPatternConfig(patternTypeConfig)) {
					throw new Error('generateSuperGlobulePattern requires a TiledPatternConfig');
				}
				pattern = generateTiledBandPattern({
					address: { ...address, b: bandIndex },
					bands: bands.filter((b) => b.visible),
					tiledPatternConfig: patternTypeConfig,
					pixelScale
				});
				pattern = {
					...pattern,
					bands: pattern.bands.map((band) => ({ ...band, projectionType: pattern.projectionType }))
				};
				pattern.bands = applyStrokeWidth(pattern.bands, patternTypeConfig.config);
				return pattern;
			});
			return bandPatterns;
		})
		.flat();

	const bandPatterns = collectedBandPatterns
		.map((globulePattern: BandCutPatternPattern) => globulePattern.bands)
		.flat();

	const result = {
		type: 'SuperGlobulePattern',
		superGlobuleConfigId: superGlobuleConfig.id,
		bandPatterns
	};

	return result;
};

// TODO: Refactor so that this accepts globules as tubes

export const generateProjectionPattern = (
	tubes: Tube[],
	id: SuperGlobuleConfig['id'],
	globulePatternConfig: GlobulePatternConfig,
	projectionRange?: ProjectionRange
): SuperGlobuleProjectionPattern => {
	const {
		patternTypeConfig,
		patternConfig: { pixelScale, splits }
	} = globulePatternConfig;

	// Splits are persisted per tube as absolute quad indices. An absent entry
	// yields an empty array, which is splitFlatBands' documented no-op path.
	const splitQuadsFor = (tube: number) =>
		splits?.tubeSplits.find((t) => t.tube === tube)?.quads ?? [];

	// fillAll produces interior fill BANDS (one degenerate facet per quad) inside normal tubes.
	// Tiled/panel patterns cannot tile degenerate facets — keep fill bands for outlined only.
	const effectiveTubes = isOutlinedPatternConfig(patternTypeConfig)
		? tubes
		: tubes.map((t) => ({ ...t, bands: t.bands.filter((b) => !b.isFill) }));

	if (isOutlinedPatternConfig(patternTypeConfig)) {
		return generateOutlinedProjectionPattern(
			effectiveTubes,
			id,
			patternTypeConfig,
			pixelScale,
			projectionRange,
			splits
		);
	} else if (shouldUsePanelPattern(patternTypeConfig)) {
		const projectionPanelPattern = generateProjectionPanelPattern({
			tubes: effectiveTubes,
			range: projectionRange as any,
			tiledPatternConfig: patternTypeConfig
		});
		return {
			type: 'SuperGlobuleProjectionPanelPattern',
			superGlobuleConfigId: id,
			projectionPanelPattern
		};
	} else {
		const tiledPatternConfig = patternTypeConfig;
		const entry = resolvePatternEntry(tiledPatternConfig.type) as UnitPatternGenerator;
		const { adjustAfterTiling } = entry;
		const hasAdjustAfterTiling = !!adjustAfterTiling;
		// Most adjusters need tube-end partner transforms; entries can opt out.
		const needsEndPartners = entry.adjustAfterTilingNeedsEndPartners ?? true;

		// Resolve tube range
		const [tubeStart, tubeEnd] = resolveRangeIndices(projectionRange?.tubes, effectiveTubes.length);

		// Resolve band range — expand by 1 on each side if adjustAfterTiling needs neighbors
		const bandExpand = hasAdjustAfterTiling ? 1 : 0;

		// Generate tube patterns, but only for in-range tubes
		// Use a sparse array so that adjustAfterTiling index lookups still work
		let tubePatterns: (TubeCutPattern | undefined)[] = new Array(effectiveTubes.length);

		for (let t = tubeStart; t < tubeEnd; t++) {
			const { bands, address } = effectiveTubes[t];
			const totalBands = bands.filter((b) => b.visible).length;
			const [bandStart, bandEnd] = resolveRangeIndices(
				projectionRange?.bands,
				totalBands,
				bandExpand
			);

			const tubePattern = generateTubeCutPattern({
				address,
				bands,
				tiledPatternConfig,
				pixelScale,
				bandRange: { start: bandStart, end: bandEnd },
				splitQuads: splitQuadsFor(address.tube)
			});
			tubePatterns[t] = tubePattern;
		}

		// getEndPartnerTransforms needs all referenced tubes to exist.
		// Partner bands may reference out-of-range tubes, so we generate
		// minimal stubs for those if needed.
		const referencedTubeIndices = new Set<number>();
		for (let t = tubeStart; t < tubeEnd; t++) {
			const tp = tubePatterns[t];
			if (!tp) continue;
			for (const band of tp.bands) {
				if (band.meta?.startPartnerBand) referencedTubeIndices.add(band.meta.startPartnerBand.tube);
				if (band.meta?.endPartnerBand) referencedTubeIndices.add(band.meta.endPartnerBand.tube);
			}
		}

		// Generate any referenced tubes that weren't already generated
		for (const t of referencedTubeIndices) {
			if (t >= 0 && t < effectiveTubes.length && tubePatterns[t] === undefined) {
				const { bands, address } = effectiveTubes[t];
				tubePatterns[t] = generateTubeCutPattern({
					address,
					bands,
					tiledPatternConfig,
					pixelScale,
					splitQuads: splitQuadsFor(address.tube)
				});
			}
		}

		// getEndPartnerTransforms indexes by tube number, so pass the sparse array
		// which preserves original tube indices
		getEndPartnerTransforms(tubePatterns as TubeCutPattern[]);

		const firstInRange = tubePatterns[tubeStart];
		const doAdjustAfterTiling =
			hasAdjustAfterTiling &&
			(!needsEndPartners || !!firstInRange?.bands[0]?.meta?.startPartnerBand);
		if (doAdjustAfterTiling) {
			for (let t = tubeStart; t < tubeEnd; t++) {
				const tp = tubePatterns[t];
				if (!tp) continue;
				// adjustAfterTiling indexes by tube number, pass the sparse array
				const adjusted = adjustAfterTiling(
					tp.bands,
					tiledPatternConfig,
					tubePatterns as TubeCutPattern[]
				);
				tubePatterns[t] = { ...tp, bands: adjusted };
			}
		}

		// After adjustment, trim bands back to the exact requested range (remove expanded neighbors)
		if (projectionRange?.bands !== undefined && bandExpand > 0) {
			for (let t = tubeStart; t < tubeEnd; t++) {
				const tp = tubePatterns[t];
				if (!tp) continue;
				const totalVisibleBands = effectiveTubes[t].bands.filter((b) => b.visible).length;
				const [exactStart, exactEnd] = resolveRangeIndices(
					projectionRange.bands,
					totalVisibleBands
				);
				// Bands were generated with expanded range; now trim to exact
				tubePatterns[t] = {
					...tp,
					bands: tp.bands.filter((band) => {
						const b = band.address.band;
						return b >= exactStart && b < exactEnd;
					})
				};
			}
		}

		// Collect only in-range tube patterns for output
		const outputTubePatterns: TubeCutPattern[] = [];
		for (let t = tubeStart; t < tubeEnd; t++) {
			const tp = tubePatterns[t];
			if (tp) {
				outputTubePatterns.push(applyTubePatternPostProcessing(tp, tiledPatternConfig));
			}
		}

		return {
			type: 'SuperGlobuleProjectionCutPattern',
			superGlobuleConfigId: id,
			projectionCutPattern: {
				address: { globule: tubes[0].address.globule },
				tubes: outputTubePatterns
			}
		};
	}
};

export const getBandBasePoints = (
	orientation: FacetOrientation
): [{ p0: TrianglePoint; p1: TrianglePoint }, { p0: TrianglePoint; p1: TrianglePoint }] => {
	const base0 = getTrianglePointFromTriangleEdge(
		getEdge('base', 'even', orientation),
		'triangle-order'
	);
	const base1 = getTrianglePointFromTriangleEdge(
		getEdge('base', 'odd', orientation),
		'triangle-order'
	);

	return [
		{ p0: base0[0], p1: base0[1] },
		{ p0: base1[0], p1: base1[1] }
	] as [{ p0: TrianglePoint; p1: TrianglePoint }, { p0: TrianglePoint; p1: TrianglePoint }];
};

const TRIANGLE_POINT_MAP = {
	'edge-order': {
		ab: ['a', 'b'],
		bc: ['b', 'c'],
		ac: ['a', 'c'],
		ba: ['a', 'b'],
		cb: ['b', 'c'],
		ca: ['a', 'c']
	},
	'triangle-order': {
		ab: ['a', 'b'],
		bc: ['b', 'c'],
		ac: ['c', 'a'],
		ba: ['a', 'b'],
		cb: ['b', 'c'],
		ca: ['c', 'a']
	}
};

export const getTrianglePointFromTriangleEdge = (
	edge: TriangleEdge,
	ordering: 'edge-order' | 'triangle-order'
) => {
	const [p0, p1] = TRIANGLE_POINT_MAP[ordering][edge] as [TrianglePoint, TrianglePoint];
	const p2 = getOtherTrianglePointFromTriangleEdge(edge);
	return [p0, p1, p2] as [TrianglePoint, TrianglePoint, TrianglePoint];
};

export const getTrianglePointAsKVFromTriangleEdge = (
	edge: TriangleEdge,
	ordering: 'edge-order' | 'triangle-order'
) => {
	const [p0, p1] = TRIANGLE_POINT_MAP[ordering][edge] as [TrianglePoint, TrianglePoint];
	return { p0, p1 };
};

export type TrianglePointPair = [TrianglePoint, TrianglePoint];

const isTrianglePointPair = (
	p: TrianglePoint | [TrianglePoint, TrianglePoint] | TriangleEdgePermissive
): p is TrianglePointPair => {
	return (
		Array.isArray(p) &&
		p[0] !== p[1] &&
		['a', 'b', 'c'].includes(p[0]) &&
		['a', 'b', 'c'].includes(p[1])
	);
};

type GetOtherTriangleElementsConfig = {
	ordering?: 'edge-order' | 'triangle-order';
	split?: boolean;
};

// Function overloads for type-safe return types
export function getOtherTriangleElements(p: TrianglePoint, config?: undefined): TrianglePointPair;

export function getOtherTriangleElements(
	p: TrianglePoint,
	config: GetOtherTriangleElementsConfig & { split?: true }
): TrianglePointPair;

export function getOtherTriangleElements(
	p: TrianglePoint,
	config: GetOtherTriangleElementsConfig & { split: false }
): TriangleEdge;

export function getOtherTriangleElements(
	p: TriangleEdgePermissive | TrianglePointPair,
	config?: GetOtherTriangleElementsConfig
): TrianglePoint;

// Implementation
export function getOtherTriangleElements(
	p: TrianglePoint | [TrianglePoint, TrianglePoint] | TriangleEdgePermissive,
	config: GetOtherTriangleElementsConfig = { ordering: 'triangle-order', split: true }
): TriangleEdgePermissive | TrianglePoint | TrianglePointPair {
	const { ordering = 'triangle-order', split = true } = config;
	const others: { [key: string]: { [key: string]: TriangleEdgePermissive | TrianglePoint } } = {
		'edge-order': {
			a: 'bc',
			b: 'ac',
			c: 'ab',
			ab: 'c',
			bc: 'a',
			ac: 'b',
			ba: 'c',
			cb: 'a',
			ca: 'b'
		},
		'triangle-order': {
			a: 'bc',
			b: 'ca',
			c: 'ab',
			ab: 'c',
			bc: 'a',
			ac: 'b',
			ba: 'c',
			cb: 'a',
			ca: 'b'
		}
	};

	const key: TrianglePoint | TriangleEdgePermissive = isTrianglePointPair(p)
		? (`${p[0]}${p[1]}` as TriangleEdgePermissive)
		: p;
	const result = others[ordering][key];
	return result.length === 2 && split ? (result.split('') as TrianglePointPair) : result;
}

export const getOtherTrianglePointFromTriangleEdge = (edge: TriangleEdge): TrianglePoint => {
	const otherPoints: { [key: string]: TrianglePoint } = {
		ab: 'c',
		bc: 'a',
		ac: 'b',
		ba: 'c',
		cb: 'a',
		ca: 'b'
	};
	return otherPoints[edge];
};

export const getOtherTrianglePointsFromTrianglePoint = (
	point: TrianglePoint,
	ordering: 'edge-order' | 'triangle-order'
): [TrianglePoint, TrianglePoint] => {
	const otherPoints = {
		'edge-order': {
			a: ['b', 'c'],
			b: ['a', 'c'],
			c: ['a', 'b']
		},
		'triangle-order': {
			a: ['b', 'c'],
			b: ['c', 'a'],
			c: ['a', 'b']
		}
	};
	return otherPoints[ordering][point] as [TrianglePoint, TrianglePoint];
};

export const corrected = (s: string): TriangleEdge => {
	if (s === 'ba') return 'ab';
	if (s === 'ca') return 'ac';
	if (s === 'cb') return 'bc';
	return s as TriangleEdge;
};

const nullTransform: TransformConfig = {
	translate: { x: 0, y: 0, z: 0 },
	scale: { x: 1, y: 1, z: 1 },
	rotate: { x: 0, y: 0, z: 0 }
};

export const getEndPartnerTransform = (
	originBand: BandCutPattern,
	partnerBand: BandCutPattern
): TransformConfig => {
	// A tube-end partner band may have been refused by generateTiling (quad count not
	// divisible by the pattern's subunitCount): it has `facets: []` and no `meta`. Bail
	// out to the null transform rather than indexing into an empty facets array.
	if (
		originBand.error ||
		partnerBand.error ||
		!originBand.facets.length ||
		!partnerBand.facets.length
	) {
		return nullTransform;
	}

	const isStartOrigin =
		originBand.meta?.startPartnerBand &&
		isSameAddress(originBand.meta?.startPartnerBand, partnerBand.address);

	const isStartPartner =
		partnerBand.meta?.startPartnerBand &&
		isSameAddress(partnerBand.meta?.startPartnerBand, originBand.address);

	const originPair = isStartOrigin
		? [originBand.facets[0].quad?.b, originBand.facets[0].quad?.a]
		: [
				originBand.facets[originBand.facets.length - 1].quad?.d,
				originBand.facets[originBand.facets.length - 1].quad?.c
			];

	// if (originBand.sideOrientation && originBand.sideOrientation === 'inside') originPair.reverse();

	if (!originPair[0] || !originPair[1]) return nullTransform;
	const partnerPair = isStartPartner
		? [partnerBand.facets[0].quad?.a, partnerBand.facets[0].quad?.b]
		: [
				partnerBand.facets[partnerBand.facets.length - 1].quad?.d,
				partnerBand.facets[partnerBand.facets.length - 1].quad?.c
			];
	// if (partnerBand.sideOrientation && partnerBand.sideOrientation === 'inside')
	// 	partnerPair.reverse();
	if (!partnerPair[0] || !partnerPair[1]) return nullTransform;

	// Calculate the angle of each edge
	const originAngle = Math.atan2(
		originPair[1].y - originPair[0].y,
		originPair[1].x - originPair[0].x
	);
	const partnerAngle =
		Math.atan2(partnerPair[1].y - partnerPair[0].y, partnerPair[1].x - partnerPair[0].x) +
		(isStartPartner ? 0 : Math.PI);

	// Rotation needed to align partner edge with origin edge
	const rotation = originAngle - partnerAngle;

	// Calculate where the partner point ends up after rotation around origin (0,0)
	// Then translate to align with originPair[0]
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	const partnerPoint = isStartPartner ? partnerPair[0] : partnerPair[1];
	const rotatedPartnerX = partnerPoint.x * cos - partnerPoint.y * sin;
	const rotatedPartnerY = partnerPoint.x * sin + partnerPoint.y * cos;

	const xOffset = originPair[0].x - rotatedPartnerX;
	const yOffset = originPair[0].y - rotatedPartnerY;

	return {
		translate: { x: xOffset, y: yOffset, z: 0 },
		scale: { x: 1, y: 1, z: 1 },
		rotate: { x: 0, y: 0, z: (rotation * 180) / Math.PI }
	};
};

/**
 * Resolve a band (or band piece) within a sparse set of tube patterns.
 *
 * Two passes, because the two kinds of caller ask different questions:
 *
 * 1. Exact match. A seam partner names a specific sibling
 *    (`{…, band, piece}`), and matching on `band` alone returned the first
 *    sibling, so seam transforms resolved against the wrong piece.
 * 2. Band-level match. Every *cross-band* partner address in the codebase is a
 *    plain `{globule, tube, band}` triple (`generate-tiled-pattern.ts:375-384`,
 *    `generate-outlined-pattern.ts:549-554`, `generate-cut-pattern.ts:282-295`),
 *    but once its target band is split there is no band with that exact
 *    address any more. `isSameAddress` cannot bridge this: it reports a piece
 *    and a non-piece address as never the same address, in either mode
 *    (`util.ts:331`, granularity 3 vs 3.5). Without pass 2, splitting a tube
 *    silently drops every cross-band end partner transform in it while the
 *    seam transforms keep working.
 *
 * Pass 2 is deliberately one-directional: a plain query resolves onto pieces,
 * a piece query never resolves onto an unsplit band.
 *
 * Pass 2 resolves to the partner piece with the SAME piece index as the
 * querying band, falling back to the partner's LAST piece when it has fewer
 * pieces. This is geometry, not convention: splits are tube-wide at identical
 * absolute quad indices, so band A's piece 1 physically abuts band B's piece 1.
 * Resolving to the lowest piece instead would point A-p1 at B-p0, which it
 * never touches. A band shorter than the split index is not cut there, so it
 * has one piece and every querying piece falls back onto it.
 *
 * The querying piece index cannot be recovered from the address alone — every
 * cross-band partner address in the codebase is destructured down to a plain
 * {globule, tube, band} triple at construction (generate-tiled-pattern.ts:375-384,
 * generate-outlined-pattern.ts:549-554, generate-cut-pattern.ts:282-295), and
 * widening those would mean a new persisted field and a migration. It does not
 * need to be: the only callers are getEndPartnerTransforms
 * (generate-pattern.ts:543-544), which iterates tubePattern.bands and therefore
 * already holds the querying band. So it is passed in.
 */
export const findBandByAddress = (
	tubePatterns: TubeCutPattern[],
	address: GlobuleAddress_Band | GlobuleAddress_BandPiece,
	/** Piece index of the band doing the asking; see pass 2 above. */
	fromPiece?: number
): BandCutPattern | undefined => {
	const tube = tubePatterns[address.tube];
	if (!tube) return undefined;
	// Bands may be a sparse subset, so look up by address rather than by index.
	const exact = tube.bands.find((b) => isSameAddress(b.address, address));
	if (exact) return exact;
	if (isGlobuleAddress_BandPiece(address)) return undefined;
	// `isGlobuleAddress_BandPiece` narrows the read so this compiles before
	// Task 9 widens BandCutPattern['address'] to admit `piece`.
	const pieces = tube.bands.filter(
		(b) => b.address.band === address.band && isGlobuleAddress_BandPiece(b.address)
	);
	if (pieces.length === 0) return undefined;
	const pieceOf = (b: BandCutPattern): number =>
		isGlobuleAddress_BandPiece(b.address) ? b.address.piece : 0;
	if (fromPiece !== undefined) {
		const sameIndex = pieces.find((b) => pieceOf(b) === fromPiece);
		if (sameIndex) return sameIndex;
	}
	// Partner has fewer pieces than the querying band (it was shorter than the
	// split index and so was never cut there): fall back to its last piece.
	return pieces.reduce((last, b) => (pieceOf(b) > pieceOf(last) ? b : last));
};

const getEndPartnerTransforms = (tubePatterns: TubeCutPattern[]) => {
	tubePatterns.forEach((tubePattern) => {
		if (!tubePattern) return;
		tubePattern.bands.forEach((band) => {
			if (!band.meta) return;
			const startPartnerAddress = band.meta.startPartnerBand;
			const endPartnerAddress = band.meta.endPartnerBand;
			if (startPartnerAddress && endPartnerAddress) {
				// `band.address` isn't widened to admit `piece` until Task 9, so read it
				// defensively here rather than assuming today's type.
				const fromPiece = isGlobuleAddress_BandPiece(band.address) ? band.address.piece : 0;
				const startPartnerBand = findBandByAddress(tubePatterns, startPartnerAddress, fromPiece);
				const endPartnerBand = findBandByAddress(tubePatterns, endPartnerAddress, fromPiece);
				if (startPartnerBand && endPartnerBand) {
					band.meta.startPartnerTransform = getEndPartnerTransform(band, startPartnerBand);
					band.meta.endPartnerTransform = getEndPartnerTransform(band, endPartnerBand);
				}
			}
		});
	});
};
