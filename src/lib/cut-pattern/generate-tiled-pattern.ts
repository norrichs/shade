import type {
	Band,
	BandAddressed,
	GeometryAddress,
	PathSegment,
	PatternedBand,
	PatternedPattern,
	PixelScale,
	Point,
	Quadrilateral,
	TiledPattern
} from '$lib/types';
import { getQuadrilaterals, transformPatternByQuad } from '$lib/patterns/quadrilateral';
import type { PatternedBandPattern, TiledPatternConfig } from '$lib/types';
import { getFlatStrip } from './cut-pattern';
import { patterns } from '$lib/patterns';
import {
	rotatePS,
	translatePS,
	getQuadWidth,
	svgPathStringFromSegments
} from '$lib/patterns/utils';
import { formatAddress } from '$lib/recombination';

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
}): PatternedBandPattern => {
	const pattern: PatternedBandPattern = { projectionType: 'patterned', bands: [] };
	const { adjustAfterTiling } = patterns[tiledPatternConfig.type];
	// Creates a line pattern without inner and outer elements, appropriate for post processing in Affinity
	// TODO - see if it's possible to convert the output of this to "expanded path" (e.g. convert stroke widths to paths instead of doing so in Affinity)

	const visibleBands = bands.filter((b) => b.visible);
	const quadBands = visibleBands.map((band) => {
		const flatBand = getFlatStrip(band, { bandStyle: 'helical-right', pixelScale });
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

	return pattern as PatternedBandPattern;
};

export type GenerateTilingProps = {
	quadBands: Quadrilateral[][];
	tiledPatternConfig: TiledPatternConfig;
	address: GeometryAddress<BandAddressed>;
};

export const generateTiling = ({ quadBands, tiledPatternConfig, address }: GenerateTilingProps) => {
	const tiling: {
		facets: PatternedPattern[];
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
		const cuttablePattern: PatternedPattern[] = adjustedPatternBand.map((facet, facetIndex) => {
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
			const cuttable: PatternedPattern = {
				// TODO - rescale this based on selected real units
				path: facet,
				triangle: undefined,
				quad,
				quadWidth,
				label: `${formatAddress(address)}: ${facetIndex}`
			};
			return cuttable;
		});
		const result: PatternedBand = {
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
