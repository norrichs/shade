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
	BandCutPattern
} from '$lib/types';

import { applyStrokeWidth } from './generate-cut-pattern';
import {
	generateTiledBandPattern,
	generateTubeCutPattern,
	applyTubePatternPostProcessing
} from './generate-tiled-pattern';
import { patterns } from '$lib/patterns';
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
import { isSameAddress } from '$lib/util';

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
					tiledPatternConfig,
					patternConfig: { pixelScale }
				} = globulePatternConfig;
				pattern = generateTiledBandPattern({
					address: { ...address, b: bandIndex },
					bands: bands.filter((b) => b.visible),
					tiledPatternConfig,
					pixelScale
				});
				pattern = {
					...pattern,
					bands: pattern.bands.map((band) => ({ ...band, projectionType: pattern.projectionType }))
				};
				pattern.bands = applyStrokeWidth(pattern.bands, tiledPatternConfig.config);
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

// TODO: Refactor this to accept range and existing pattern arguments, so that
//       it is possible to do granular updates
// TODO: Refactor so that this accepts globules as tubes

export const generateProjectionPattern = (
	tubes: Tube[],
	id: SuperGlobuleConfig['id'],
	globulePatternConfig: GlobulePatternConfig,
	range?: {
		tubes: { start: number; end: number };
		bands: { start: number; end: number };
		panels: { start: number; end: number };
	}
): SuperGlobuleProjectionPattern => {
	const {
		tiledPatternConfig,
		patternConfig: { pixelScale }
	} = globulePatternConfig;

	if (shouldUsePanelPattern(tiledPatternConfig)) {
		
		const projectionPanelPattern = generateProjectionPanelPattern({
			tubes,
			range,
			tiledPatternConfig
		});
		return {
			type: 'SuperGlobuleProjectionPanelPattern',
			superGlobuleConfigId: id,
			projectionPanelPattern
		};
	} else {
		let tubePatterns: TubeCutPattern[] = tubes.map(({ bands, address }, t) => {
			const tubePattern = generateTubeCutPattern({
				address,
				bands,
				tiledPatternConfig,
				pixelScale
			});
			return tubePattern;
		});

		getEndPartnerTransforms(tubePatterns);

		const { adjustAfterTiling } = patterns[tiledPatternConfig.type];

		if (adjustAfterTiling) {
			tubePatterns = tubePatterns.map((tubePattern) => {
				const adjusted = adjustAfterTiling(tubePattern.bands, tiledPatternConfig, tubePatterns);
				

				return {
					...tubePattern,
					bands: adjusted
				};
			});
		}

		// Apply post-processing (svgPath generation, stroke width) after adjustment
		tubePatterns = tubePatterns.map((tubePattern) =>
			applyTubePatternPostProcessing(tubePattern, tiledPatternConfig)
		);

		return {
			type: 'SuperGlobuleProjectionCutPattern',
			superGlobuleConfigId: id,
			projectionCutPattern: {
				address: { globule: tubes[0].address.globule },
				tubes: tubePatterns
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

const getEndPartnerTransforms = (tubePatterns: TubeCutPattern[]) => {
	tubePatterns.forEach((tubePattern) => {
		tubePattern.bands.forEach((band) => {
			if (!band.meta) return;
			const startPartnerAddress = band.meta.startPartnerBand;
			const endPartnerAddress = band.meta.endPartnerBand;
			if (startPartnerAddress && endPartnerAddress) {
				const startPartnerBand =
					tubePatterns[startPartnerAddress.tube].bands[startPartnerAddress.band];
				const endPartnerBand = tubePatterns[endPartnerAddress.tube].bands[endPartnerAddress.band];
				if (startPartnerBand && endPartnerBand) {
					band.meta.startPartnerTransform = getEndPartnerTransform(band, startPartnerBand);
					band.meta.endPartnerTransform = getEndPartnerTransform(band, endPartnerBand);
				}
			}
		});
	});
};
