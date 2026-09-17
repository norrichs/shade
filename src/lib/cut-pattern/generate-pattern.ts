import type {
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
import { buildPatternBandIndex, patternedTubes } from './pattern-band-index';
import { resolvePatternEntry } from '$lib/patterns/resolve-pattern';
import { generateOutlinedProjectionPattern } from './generate-outlined-pattern';
import { judgeTubeSplits } from './split-flat-bands';
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
import { resolveEndPartner, type BandEnd } from './resolve-partner-band';
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
	const effectiveTubes = patternedTubes(tubes, isOutlinedPatternConfig(patternTypeConfig));

	// Every configured tube's splits are judged against that tube's full quad
	// count (or rejected when the tube does not exist), independent of the tube
	// and band range — narrowing the view must not hide a rejection.
	const withRejections = (
		pattern: SuperGlobuleProjectionPattern,
		subunitCount: number
	): SuperGlobuleProjectionPattern => {
		// Panel patterns do not split. (Type check inline: importing the store
		// module's guard would pull Svelte stores into the worker bundle.)
		if (pattern.type !== 'SuperGlobuleProjectionCutPattern') return pattern;
		const rejectedSplits = judgeTubeSplits(effectiveTubes, splits, subunitCount);
		return rejectedSplits.length ? { ...pattern, rejectedSplits } : pattern;
	};

	if (isOutlinedPatternConfig(patternTypeConfig)) {
		return withRejections(
			generateOutlinedProjectionPattern(
				effectiveTubes,
				id,
				patternTypeConfig,
				pixelScale,
				projectionRange,
				splits
			),
			1
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

		// Facet partner meta names real tube bands; pattern addresses count visible
		// bands. One index over every tube, so partners in other tubes translate too.
		const patternBandIndexOf = buildPatternBandIndex(effectiveTubes);

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
				splitQuads: splitQuadsFor(address.tube),
				patternBandIndexOf
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
					splitQuads: splitQuadsFor(address.tube),
					patternBandIndexOf
				});
			}
		}

		// getEndPartnerTransforms indexes by tube number, so pass the sparse array
		// which preserves original tube indices
		getEndPartnerTransforms(tubePatterns as TubeCutPattern[]);

		const firstInRange = tubePatterns[tubeStart];
		const firstBandMeta = firstInRange?.bands[0]?.meta;
		// `meta` exists only when the band has an end partner in the geometry, so
		// with every band visible this is exactly "names a start or end partner".
		// It must not read the stored addresses: a hidden partner is stored as no
		// address, and hiding both of this one band's partners would otherwise
		// switch the adjuster off for every tube.
		const doAdjustAfterTiling = hasAdjustAfterTiling && (!needsEndPartners || !!firstBandMeta);
		if (doAdjustAfterTiling) {
			// Every tube adjusts against the same, unadjusted tiling: partners in
			// other tubes are read exactly as the adjuster reads its own tube (next
			// facet, previous band, seam siblings), so the result does not depend
			// on tube order and never reads indices shifted by a partner's
			// removals. Adjusters return new bands without mutating their inputs,
			// so keeping the tiled array and writing results to a new one is the
			// whole snapshot (`map` keeps the sparse holes tube indexing needs).
			const tiledTubePatterns = tubePatterns;
			tubePatterns = tiledTubePatterns.map((tp, t) =>
				tp && t >= tubeStart && t < tubeEnd
					? {
							...tp,
							// adjustAfterTiling indexes by tube number, pass the sparse array
							bands: adjustAfterTiling(
								tp.bands,
								tiledPatternConfig,
								tiledTubePatterns as TubeCutPattern[]
							)
						}
					: tp
			);
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

		return withRejections(
			{
				type: 'SuperGlobuleProjectionCutPattern',
				superGlobuleConfigId: id,
				projectionCutPattern: {
					address: { globule: tubes[0].address.globule },
					tubes: outputTubePatterns
				}
			},
			entry.subunitCount ?? 1
		);
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

/**
 * The transform that carries `partnerBand`'s joining end edge onto
 * `originBand`'s end edge.
 *
 * Which ends join is passed in, not re-derived here: comparing stored partner
 * addresses with `isSameAddress` cannot tell ends apart once either band is a
 * piece (a plain outer address never equals a piece address), and silently
 * picked the far end. Resolve the partner and its joining end with
 * `resolveEndPartner`.
 */
export const getEndPartnerTransform = (
	originBand: BandCutPattern,
	partnerBand: BandCutPattern,
	ends: { originEnd: BandEnd; partnerEnd: BandEnd }
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

	const isStartOrigin = ends.originEnd === 'start';
	const isStartPartner = ends.partnerEnd === 'start';

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

export const getEndPartnerTransforms = (tubePatterns: TubeCutPattern[]) => {
	tubePatterns.forEach((tubePattern) => {
		if (!tubePattern) return;
		tubePattern.bands.forEach((band) => {
			if (!band.meta) return;
			// Each end is resolved on its own. Previously both were gated on both,
			// so one unresolvable end silently disabled matching at the other.
			// End partners resolve by which end joins, independent of this band's
			// own piece index (spec amendment 2026-09-16).
			const start = resolveEndPartner(tubePatterns, band, 'start');
			if (start) {
				band.meta.startPartnerTransform = getEndPartnerTransform(band, start.band, {
					originEnd: 'start',
					partnerEnd: start.partnerEnd
				});
			}
			const end = resolveEndPartner(tubePatterns, band, 'end');
			if (end) {
				band.meta.endPartnerTransform = getEndPartnerTransform(band, end.band, {
					originEnd: 'end',
					partnerEnd: end.partnerEnd
				});
			}
		});
	});
};
