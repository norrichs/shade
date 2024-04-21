export const generateTiledBandPattern = ({
	bands,
	tiledPatternConfig
}: {
	bands: Band[];
	tiledPatternConfig: TiledPatternConfig;
}): PatternedBandPattern => {
	if (tiledPatternConfig.type !== 'tiledHexPattern-0') {
		console.error("TiledPatternConfig is not of type 'tiledHexPattern-0'", tiledPatternConfig);
	}
	console.debug('***************************\ngenerateTiledBandPattern');
	const pattern: PatternedBandPattern = { projectionType: 'patterned', bands: [] };

	const unitPattern = generateHexPattern(1);
	console.debug('unitPattern', unitPattern);
	const width =
		(tiledPatternConfig.config.find((cfg) => cfg.type === 'width')?.value as number) || 0;
	const appendTab =
		(tiledPatternConfig.config.find((cfg) => cfg.type === 'appendTab')?.value as
			| 'left'
			| 'right'
			| false) || false;
	const insetWidth =
		(tiledPatternConfig.config.find((cfg) => cfg.type === 'insetWidth')?.value as number) || 0;
	const tabVariant =
		(tiledPatternConfig.config.find((cfg) => cfg.type === 'tabVariant')?.value as
			| 'extend'
			| 'inset'
			| false) || false;
	const doTabs = !!appendTab && !!tabVariant;

	const layoutPattern = {
		bands: bands.map((band, index) => {
			const flatBand = getFlatStrip(band, { bandStyle: 'helical-right' });
			const quadBand = getQuadrilaterals(flatBand);
			const mappedPatternBand = quadBand.map((quad) => transformPatternByQuad(unitPattern, quad));
			const outlinedHoles = extractShapesFromMappedHexPatterns(
				mappedPatternBand,
				quadBand,
				tiledPatternConfig.config
			);
			return outlinedHoles;
		})
	};

	const insetHoles = {
		bands: layoutPattern.bands.map((band) =>
			band.holes.map((polygon) => {
				return polygon.segments.some((segment) => segment.variant === 'insettable')
					? getInsetPolygon(polygon, width)
					: polygon;
			})
		)
	};

	const cuttablePattern = insetHoles.bands.map((holes, index) => {
		const tabs = doTabs ? { appendTab, insetWidth, tabVariant, width } : undefined;
		const reTraced = traceCombinedOutline(holes, tabs, index);
		const finalHoles = reTraced.holes.map((hole) => svgPathStringFromInsettablePolygon(hole));
		const finalPattern = svgPathStringFromSegments(reTraced.outline).concat(finalHoles.join(' '));

		return { svgPath: finalPattern, facets: [], id: `patterned-band-pattern-${index}` };
	});
	pattern.bands = cuttablePattern;
	return pattern;
};
