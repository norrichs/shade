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
import { getFlatStripV2 } from './generate-cut-pattern';
import { patterns } from '$lib/patterns';
import {

	getQuadWidth,
	svgPathStringFromSegments
} from '$lib/patterns/utils';
import { formatAddress } from '$lib/recombination';
import type { ProjectionAddress_Band, ProjectionAddress_Tube } from '$lib/projection-geometry/types';

export const generateTubeCutPattern = ({
	address,
	bands,
	tiledPatternConfig,
	pixelScale
}: {
	address: ProjectionAddress_Tube;
	bands: Band[];
	tiledPatternConfig: TiledPatternConfig;
	pixelScale: PixelScale;
}): TubeCutPattern => {
	const pattern: TubeCutPattern = { projectionType: 'patterned', address, bands: [] };
	const { adjustAfterTiling } = patterns[tiledPatternConfig.type];
	// Creates a line pattern without inner and outer elements, appropriate for post processing in Affinity
	// TODO - see if it's possible to convert the output of this to "expanded path" (e.g. convert stroke widths to paths instead of doing so in Affinity)

	const visibleBands = bands.filter((b) => b.visible);
	const flatBands = visibleBands.map((band) => getFlatStripV2(band, { bandStyle: 'helical-right', pixelScale }))
	const quadBands = flatBands.map((flatBand) => getQuadrilaterals(flatBand, pixelScale.value));

	console.debug("generateTubeCutPattern", { quadBands, flatBands, bands, visibleBands })
	const tiling = generateTiling({ quadBands, bands: flatBands, tiledPatternConfig, address });

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

	return pattern;
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
	address: Proj
};

export const generateTiling = ({ quadBands, bands, tiledPatternConfig, address }: GenerateTilingProps) => {
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
		} else if (tiledPatternConfig.tiling === 'triangle') {
			console.debug('**** triangle tiling basis');
			const unitPattern = getPattern(
				rowCount as 3 | 1 | 2,
				columnCount as 1 | 2 | 3 | 4 | 5,
				undefined,
				variant
			);

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
			console.debug("generateTiling", {bands, bandIndex, facetIndex})
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
				label: "test label" //`${formatAddress(address)}: ${facetIndex}`
			};
			console.debug("cuttable", {cuttable})
			return cuttable;
		});
		const result: BandCutPattern = {
			facets: cuttablePattern,
			svgPath: undefined, //cuttablePattern.map((p) => p.svgPath).join(),
			id: `${tiledPatternConfig.type}-band-${bandIndex}`,
			tagAnchorPoint,
			tagAngle: tiledPatternConfig.labels?.angle || tagAnchor.angle || 0,
			projectionType: 'patterned',
			address: { ...address, b: bandIndex }
		};
		return result;
	});
	return tiling;
};
