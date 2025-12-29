import type {
	Band,
	BandAddressed,
	GeometryAddress,
	PathSegment,
	BandCutPattern,
	CutPattern,
	PixelScale,
	Point,
	Quadrilateral,
	TiledPattern,
	TubeCutPattern,
	Facet
} from '$lib/types';
import { getQuadrilaterals, transformPatternByQuad } from '$lib/patterns/quadrilateral';
import type { BandCutPatternPattern, TiledPatternConfig } from '$lib/types';
import { applyStrokeWidth, getFlatStripV2 } from './generate-cut-pattern';
import { patterns } from '$lib/patterns';
import { getQuadWidth, svgPathStringFromSegments } from '$lib/patterns/utils';
import { formatAddress } from '$lib/recombination';
import type {
	GlobuleAddress_Band,
	GlobuleAddress_FacetEdge,
	GlobuleAddress_Tube
} from '$lib/projection-geometry/types';
import {
	getAllTrianglePoints,
	getMinimalBoundingBoxAndRotationAngle
} from '../../components/cut-pattern/distrubute-panels';
import { Triangle, Vector3 } from 'three';
import { getBandTriangleEdges } from '$lib/projection-geometry/generate-projection';

export const generateTubeCutPattern = ({
	address,
	bands,
	tiledPatternConfig,
	pixelScale
}: {
	address: GlobuleAddress_Tube;
	bands: Band[];
	tiledPatternConfig: TiledPatternConfig;
	pixelScale: PixelScale;
}): TubeCutPattern => {
	const tubeCutPattern: TubeCutPattern = { projectionType: 'patterned', address, bands: [] };
	const { adjustAfterTiling } = patterns[tiledPatternConfig.type];
	// Creates a line pattern without inner and outer elements, appropriate for post processing in Affinity
	// TODO - see if it's possible to convert the output of this to "expanded path" (e.g. convert stroke widths to paths instead of doing so in Affinity)

	const visibleBands = bands.filter((b) => b.visible);
	const flatBands = visibleBands.map((band) =>
		getFlatStripV2(band, { bandStyle: 'helical-right', pixelScale })
	);
	const alignedBands = alignBands(flatBands);

	const quadBands = alignedBands.map((flatBand) => getQuadrilaterals(flatBand, pixelScale.value));

	const tiling = generateTiling({ quadBands, bands: alignedBands, tiledPatternConfig, address });

	if (adjustAfterTiling) {
		const adjusted = adjustAfterTiling(tiling, tiledPatternConfig);
		tubeCutPattern.bands = adjusted;
	} else {
		tubeCutPattern.bands = tiling;
	}

	tubeCutPattern.bands = tubeCutPattern.bands.map((band) => {
		const patternBand = {
			...band,
			facets: band.facets.map((facet) => {
				const segments = facet.path;
				if (facet.addenda) {
					const addendaSegments = facet.addenda.map((a) => a.path);
					segments.push(...facet.addenda.map((a) => a.path).flat());
				}
				return { ...facet, svgPath: svgPathStringFromSegments([...segments]) };
			})
		};
		patternBand.svgPath = patternBand.facets.map((facet) => facet.svgPath).join('\n');
		return patternBand;
	});

	tubeCutPattern.bands = applyStrokeWidth(tubeCutPattern.bands, tiledPatternConfig.config);

	return tubeCutPattern;
};

export const generateTiledBandPattern = ({
	address,
	bands,
	tiledPatternConfig,
	pixelScale
}: {
	address: GeometryAddress<BandAddressed>;
	bands: Band[];
	tiledPatternConfig: TiledPatternConfig;
	pixelScale: PixelScale;
}): BandCutPatternPattern => {
	const pattern: BandCutPatternPattern = { projectionType: 'patterned', bands: [] };
	const { adjustAfterTiling } = patterns[tiledPatternConfig.type];
	// Creates a line pattern without inner and outer elements, appropriate for post processing in Affinity
	// TODO - see if it's possible to convert the output of this to "expanded path" (e.g. convert stroke widths to paths instead of doing so in Affinity)

	const visibleBands = bands.filter((b) => b.visible);
	const quadBands = visibleBands.map((band) => {
		const flatBand = getFlatStripV2(band, { bandStyle: 'helical-right', pixelScale });
		return getQuadrilaterals(flatBand, pixelScale.value);
	});

	const tiling = generateTiling({ quadBands, tiledPatternConfig, address });

	if (adjustAfterTiling) {
		const adjusted = adjustAfterTiling(tiling, tiledPatternConfig);
		pattern.bands = adjusted;
	} else {
		pattern.bands = tiling;
	}

	pattern.bands = pattern.bands.map((band) => ({
		...band,
		facets: band.facets.map((facet) => {
			const segments = facet.path;
			if (facet.addenda) {
				const addendaSegments = facet.addenda.map((a) => a.path);
				segments.push(...facet.addenda.map((a) => a.path).flat());
			}
			return { ...facet, svgPath: svgPathStringFromSegments([...segments]) };
		})
	}));

	return pattern as BandCutPatternPattern;
};

export type GenerateTilingProps = {
	quadBands: Quadrilateral[][];
	bands: Band[];
	tiledPatternConfig: TiledPatternConfig;
	address: GlobuleAddress_Tube | GeometryAddress<BandAddressed>;
};

export const generateTiling = ({
	quadBands,
	bands,
	tiledPatternConfig,
	address
}: GenerateTilingProps) => {
	const tiling: {
		facets: CutPattern[];
		svgPath?: string | undefined;
		id: string;
		tagAnchorPoint: Point;
	}[] = quadBands.map((quadBand, bandIndex) => {
		const { getPattern, tagAnchor, adjustAfterMapping } = patterns[tiledPatternConfig.type];
		const { rowCount, columnCount, variant } = tiledPatternConfig.config;

		let mappedPatternBand: PathSegment[][] | PathSegment[];
		if (tiledPatternConfig.tiling === 'quadrilateral') {
			const unitPattern = getPattern(
				rowCount as 3 | 1 | 2,
				columnCount as 1 | 2 | 3 | 4 | 5,
				undefined,
				variant
			);
			mappedPatternBand = quadBand.map((quad) =>
				transformPatternByQuad(unitPattern, quad)
			) as PathSegment[][];
			// } else if (tiledPatternConfig.tiling === 'triangle') {

			// 	const unitPattern = getPattern(
			// 		rowCount as 3 | 1 | 2,
			// 		columnCount as 1 | 2 | 3 | 4 | 5,
			// 		undefined,
			// 		variant
			// 	);
		} else {
			mappedPatternBand = [getPattern(1, 1, quadBand)] as PathSegment[][];
		}

		let adjustedPatternBand: PathSegment[][];

		if (adjustAfterMapping) {
			adjustedPatternBand = adjustAfterMapping(mappedPatternBand, quadBand, tiledPatternConfig);
		} else {
			adjustedPatternBand = mappedPatternBand;
		}
		const tagAnchorPoint = { x: 0, y: 0 };

		const band = bands[bandIndex];
		const edges = getBandTriangleEdges(band.orientation);
		const startPartner: GlobuleAddress_FacetEdge | undefined =
			band.facets[0].meta?.[edges[0].base].partner;
		const endPartner: GlobuleAddress_FacetEdge | undefined =
			band.facets[band.facets.length - 1].meta?.[edges[1].second].partner;
		const startPartnerBand: GlobuleAddress_Band | undefined = startPartner
			? {
					globule: startPartner.globule,
					tube: startPartner.tube,
					band: startPartner.band
			  }
			: undefined;
		const endPartnerBand: GlobuleAddress_Band | undefined = endPartner
			? { globule: endPartner.globule, tube: endPartner.tube, band: endPartner.band }
			: undefined;

		const cuttablePattern: CutPattern[] = adjustedPatternBand.map((facet, facetIndex) => {
			const quad = window.structuredClone(quadBand[facetIndex % quadBand.length]);
			const facetPathSegment = facet[(facet.length + tagAnchor.segmentIndex) % facet.length];
			if (
				tagAnchor.facetIndex === facetIndex &&
				Array.isArray(facetPathSegment) &&
				facetPathSegment.length >= 2
			) {
				tagAnchorPoint.x = facetPathSegment[1] || 0;
				tagAnchorPoint.y = facetPathSegment[2] || 0;
			}
			const quadWidth = getQuadWidth(quad);

			const cuttable: CutPattern = {
				// TODO - rescale this based on selected real units
				path: facet,
				triangle: undefined,
				triangles: [
					bands[bandIndex].facets[facetIndex * 2].triangle.clone(),
					bands[bandIndex].facets[facetIndex * 2 + 1].triangle.clone()
				],
				quad,
				quadWidth,
				label: 'test label' //`${formatAddress(address)}: ${facetIndex}`
			};

			return cuttable;
		});

		const result: BandCutPattern = {
			facets: cuttablePattern,
			sideOrientation: bands[bandIndex].sideOrientation,
			svgPath: undefined, //cuttablePattern.map((p) => p.svgPath).join(),
			id: `${tiledPatternConfig.type}-band-${bandIndex}`,
			tagAnchorPoint,
			tagAngle: tiledPatternConfig.labels?.angle ?? tagAnchor.angle ?? 0,
			projectionType: 'patterned',
			address: { ...address, band: bandIndex },
			bounds: bands[bandIndex].bounds,
			meta: startPartnerBand && endPartnerBand ? { startPartnerBand, endPartnerBand } : undefined
		};
		return result;
	});
	return tiling;
};

const alignBands = (bands: Band[]) => {
	return bands.map((originalBand, bandIndex) => {
		const points = getAllTrianglePoints(originalBand);
		const bounds = getMinimalBoundingBoxAndRotationAngle(points);
		// TODO - make bounds a part of the type Band
		const realignedBand = reAlignBand(originalBand, bounds.rotatedCoordinates);
		realignedBand.bounds = getSimpleBounds(realignedBand);
		if (realignedBand.bounds.left !== 0 || realignedBand.bounds.top !== 0) {
			return normalizeBand(realignedBand);
		}
		return realignedBand;
	});
};

export const normalizeBand = (band: Band): Band => {
	const anchor = new Vector3(band.bounds?.left || 0, band.bounds?.top || 0, 0);
	const newFacets = band.facets.map((facet) => {
		return {
			...facet,
			triangle: new Triangle(
				facet.triangle.a.clone().sub(anchor),
				facet.triangle.b.clone().sub(anchor),
				facet.triangle.c.clone().sub(anchor)
			)
		};
	});
	const newBand: Band = {
		...band,
		facets: newFacets
	};
	const newBounds = getSimpleBounds(newBand);
	newBand.bounds = newBounds;

	return newBand;
};

const reAlignBand = (band: Band, rotatedCoordinates: { x: number; y: number }[]): Band => {
	const newBand = {
		...band,
		facets: band.facets.map((facet, index) => {
			return {
				...facet,
				triangle: new Triangle(
					new Vector3(rotatedCoordinates[index * 3].x, rotatedCoordinates[index * 3].y, 0),
					new Vector3(rotatedCoordinates[index * 3 + 1].x, rotatedCoordinates[index * 3 + 1].y, 0),
					new Vector3(rotatedCoordinates[index * 3 + 2].x, rotatedCoordinates[index * 3 + 2].y, 0)
				)
			};
		})
	};
	const isAscending =
		newBand.facets[0].triangle.a.y < newBand.facets[newBand.facets.length - 1].triangle.a.y;
	if (isAscending) {
		newBand.facets = rotateFacets(newBand.facets, Math.PI);
	}
	return newBand;
};

const rotateFacets = (facets: Band['facets'], angle: number) => {
	return facets.map((facet: Facet) => {
		return {
			...facet,
			triangle: new Triangle(
				facet.triangle.a.clone().applyAxisAngle(Z_AXIS, angle),
				facet.triangle.b.clone().applyAxisAngle(Z_AXIS, angle),
				facet.triangle.c.clone().applyAxisAngle(Z_AXIS, angle)
			)
		};
	});
};

const Z_AXIS = new Vector3(0, 0, 1);

const getSimpleBounds = (
	band: Band
): { left: number; top: number; width: number; height: number; center: Vector3 } => {
	const points = getAllTrianglePoints(band);
	const xValues = points.map((point) => point.x);
	const yValues = points.map((point) => point.y);
	const minX = Math.min(...xValues);
	const maxX = Math.max(...xValues);
	const minY = Math.min(...yValues);
	const maxY = Math.max(...yValues);
	const width = maxX - minX;
	const height = maxY - minY;
	const center = new Vector3(minX + width / 2, minY + height / 2, 0);
	return { left: minX, top: minY, width, height, center };
};
