import { Vector2, Vector3, Triangle, Matrix3 } from 'three';
import {
	generateMultiFacetFullTab,
	generateFullTab,
	generateTrapTab,
	isFullTab,
	isTrapTab,
	isMultiFacetFullTab,
	isMultiFacetTrapTab,
	isStrut,
	getRenderable
} from '../generate-shape';
import { validateCutoutConfig } from '../validators';
import { getFlatTriangle } from './generate-panel-pattern';
import { getBandBasePoints } from './generate-pattern';
import {
	generateFlowerOfLife1BandPattern,
	getTransformStringFromTriangle,
	processFlowerOfLife1PatternTransforms
} from '../patterns/flower-of-life';
import { arcCircle, getLength, simpleTriangle } from '../patterns/utils';
import type {
	AlignTrianglesConfig,
	Band,
	BandPattern,
	BandStyle,
	CutoutConfig,
	EdgeConfig,
	Facet,
	FacetPattern,
	FacetTab,
	FacetedBandPattern,
	FacetedStrutPattern,
	FlatStripConfig,
	FullTabPattern,
	Level,
	LevelPattern,
	LevelSetPattern,
	MultiFacetFullTabPattern,
	MultiFacetTrapTabPattern,
	OutlinePattern,
	OutlinedBandPattern,
	OutlinedStrutPattern,
	PanelBase,
	PathSegment,
	PatternConfig,
	BandCutPatternPattern,
	CutPattern,
	Point,
	RenderConfig,
	Strip,
	Strut,
	TabStyle,
	TrapTabPattern,
	TrianglePoint,
	BandCutPattern
} from '$lib/types';
import { generateUnitFlowerOfLifeTriangle } from '$lib/patterns/unit-pattern/unit-flower-of-life';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import outline from 'svg-path-outline';

export const expandStroke = (rawPathString?: string, strokeWidth?: number) => {
	if (!rawPathString) {
		return rawPathString;
	}
	const pathString = outline(rawPathString, strokeWidth || 1, {
		joints: 0,
		bezierAccuracy: 3,
		inside: true,
		outside: true,
		tagName: 'path'
	});
	return pathString;
};

export const expandAndCombine = (band: { svgPath?: string; facets: CutPattern[] }) => {
	const expandedPaths = band.facets.map((facet) => {
		return outline(facet.svgPath, (facet.strokeWidth || 1) / 2);
	});
	return { ...band, svgPath: expandedPaths.join('\n') };
};

const orderByTabStyle = (style: TabStyle['style'], isEven: boolean, points: Vector3[]) => {
	if (style.startsWith('multi-facet')) {
		return isEven ? points.reverse() : points;
	} else if (style === 'full') {
		return isEven ? points : points.reverse();
	}
	return points;
};

const getOutlinePoints = (strip: Strip, bandStyle: BandStyle): Vector3[] => {
	const points: Vector3[] = [];
	if (bandStyle === 'circumference' || bandStyle === 'helical-right') {
		// top edges
		let { lead, follow } = generateEdgeConfig(bandStyle, false, isStrut(strip), true);

		for (let i = 1; i < strip.facets.length; i += 2) {
			const facet = strip.facets[i];
			points.push(facet.triangle[follow]);
			if (facet.tab) {
				points.push(
					...orderByTabStyle(facet.tab.style, i % 2 === 0, orderedPointsList(facet.tab.outer))
				);
			}
		}

		points.push(strip.facets[strip.facets.length - 1].triangle[lead]);
		const swap = lead;
		lead = follow;
		follow = swap;

		for (let i = strip.facets.length - 2; i >= 0; i -= 2) {
			const facet = strip.facets[i];
			points.push(facet.triangle[lead]);
			if (facet.tab) {
				points.push(
					...orderByTabStyle(facet.tab.style, i % 2 === 0, orderedPointsList(facet.tab.outer))
				);
			}
		}

		points.push(strip.facets[0].triangle[follow]);
	}

	return points;
};

export const generateStrutPatterns = (
	config: PatternConfig,
	struts: Strut[]
): FacetedStrutPattern | OutlinedStrutPattern => {
	if (config.showPattern.strut === 'none') throw new Error('Strut patterns not configured');
	const tiling = struts[0].tiling;
	if (!struts.every((strut) => strut.tiling === tiling))
		throw new Error('tiling property inconsistent');

	const flattenedGeometry: Strut[] = struts.map((strut, i) => {
		return getFlatStrip(strut, {
			bandStyle: strut.tiling,
			origin: new Vector3(config.origin.x, config.origin.y, 0).addScaledVector(
				new Vector3(config.offset.x, config.offset.y, 0),
				i
			),
			direction: new Vector3(config.direction.x, config.direction.y, 0)
		});
	});

	if (config.showPattern.strut === 'faceted') {
		const facetedPattern: FacetedStrutPattern = {
			projectionType: 'faceted',
			struts: flattenedGeometry.map((flatStrut) => {
				const strutPattern = {
					...flatStrut,
					facets: flatStrut.facets.map((facet) => {
						const pattern: FacetPattern = {
							svgPath: getPathFromPoints([facet.triangle.a, facet.triangle.b, facet.triangle.c]),
							triangle: facet.triangle.clone()
						};
						return pattern;
					})
				};
				return strutPattern;
			})
		};
		return facetedPattern;
	}

	const outlinedPattern: OutlinedStrutPattern = {
		projectionType: 'outlined',
		struts: flattenedGeometry.map((flatStrut) => {
			const outline: Vector3[] = getOutlinePoints(flatStrut, tiling);
			const pattern: OutlinePattern = {
				outline: {
					points: outline,
					svgPath: getPathFromPoints(outline)
				}
			};
			return pattern;
		})
	};
	return outlinedPattern;
};

export const generateBandPatterns = (
	config: PatternConfig,
	cutoutConfig: CutoutConfig,
	bandStyle: BandStyle,
	tabStyle: TabStyle,
	bands: Band[]
): FacetedBandPattern | OutlinedBandPattern | BandCutPatternPattern => {
	if (config.showPattern.band === 'none') throw new Error('Band patterns not configured');
	const flattenedGeometry: Band[] = bands.map((band, i) =>
		getFlatStrip(
			band,
			{
				bandStyle: bandStyle,
				origin: new Vector3(config.origin.x, config.origin.y, 0).addScaledVector(
					new Vector3(config.offset.x, config.offset.y, 0),
					i
				),
				direction: new Vector3(config.direction.x, config.direction.y, 0)
			},
			tabStyle
		)
	);
	if (config.showPattern.band === 'faceted') {
		const facetedPattern: FacetedBandPattern = {
			projectionType: 'faceted',
			bands: flattenedGeometry.map((flatBand) => {
				const bandPattern = {
					...flatBand,
					facets: flatBand.facets.map((facet) => {
						const pattern: FacetPattern = {
							svgPath: getPathFromPoints([facet.triangle.a, facet.triangle.b, facet.triangle.c]),
							triangle: facet.triangle.clone()
						};
						const tab = generateFacetTabPattern(facet.tab);
						if (tab) {
							pattern.tab = tab;
						}
						return pattern;
					})
				};
				return bandPattern;
			})
		};
		return facetedPattern;
	} else if (config.showPattern.band === 'outlined') {
		const validity = { cutouts: validateCutoutConfig(cutoutConfig) };
		const outlinedPattern: OutlinedBandPattern = {
			projectionType: 'outlined',
			bands: flattenedGeometry.map((flatBand, bandIndex) => {
				const outline: Vector3[] = getOutlinePoints(flatBand, bandStyle);
				const svgCutouts =
					config.cutouts && validity.cutouts.isValid
						? getSVGCutouts(flatBand, bandIndex, cutoutConfig)
						: undefined;

				const pattern: OutlinePattern = {
					outline: {
						points: outline,
						svgPath: getPathFromPoints(outline)
					}
				};
				if (svgCutouts) {
					pattern.cutouts = svgCutouts;
				}
				return pattern;
			})
		};
		return outlinedPattern;
	} else {
		// TODO -
		// 	Make this section generic to the pattern type
		//		based on the pattern type, retrieve a specfic unitPattern generating function
		//		also retrieve a facet dividing function
		const patternName = 'flowerOfLife1';
		const width = 4;

		const { generatePatternUnit, deriveTransforms, processPatternTransforms, generateBandPattern } =
			generatePattern[patternName];
		const patternUnit = generatePatternUnit();

		const patternedPattern: BandCutPatternPattern = {
			projectionType: 'patterned',
			bands: flattenedGeometry.map((flatBand) => {
				// 				console.debug(`**********************************
				// ** Patterned Pattern - band: ${i}  **
				// **********************************`);
				const bandPattern = {
					svgPath: '',
					facets: flatBand.facets.map((facet, i) => {
						const pattern: CutPattern = {
							svgPath: patternUnit?.svgPath || '',
							svgTransform: deriveTransforms(facet.triangle, i),
							triangle: facet.triangle.clone()
						};

						return pattern;
					})
				};
				// console.debug(
				// 	'  prototype:',
				// 	parsePathString(bandPattern.facets[0].svgPath).map((seg: PathSegment) => roundPathSegments(seg))
				// );
				// Convert prototype facets deformed by transforms into new svg paths
				const transformedFacets: PathSegment[][] = [];
				bandPattern.facets.forEach((facet) => {
					// console.debug('', width);
					transformedFacets.push(
						processPatternTransforms({
							svgPath: facet.svgPath || '',
							svgTransform: facet.svgTransform || '',
							width
						})
					);
				});

				// console.debug('  transformed:', transformedFacets[0].map((seg: PathSegment) => roundPathSegments(seg)));
				bandPattern.svgPath = generateBandPattern(transformedFacets);
				// console.debug('  bandPattern:', parsePathString(bandPattern.svgPath).map((seg: PathSegment) => roundPathSegments(seg)));

				return bandPattern;
			})
		};
		return patternedPattern;
	}
};

const getSVGCutouts = (
	flatBand: Band,
	bandIndex: number,
	config: CutoutConfig
): { svgPath: string }[] | undefined => {
	const { tilePattern } = config;
	const holeConfig = config.holeConfigs[0][0];
	if (tilePattern.type === 'alternating-band' && holeConfig.type === 'HoleConfigBand') {
		if (bandIndex % tilePattern.nthBand === 0) {
			const holes = flatBand.facets
				.filter((facet, i, facets) => {
					const isLevel = i % 2 === 0;
					const isEnd =
						i < holeConfig.locate.skipEnds * 2 ||
						i > facets.length - holeConfig.locate.skipEnds * 2;
					const isNth = i % (holeConfig.locate.everyNth * 2) === 0;

					return isLevel && !isEnd && isNth;
				})
				.map((facet) => {
					const vectorAB = facet.triangle.b.clone().addScaledVector(facet.triangle.a, -1);
					const vectorACenter = vectorAB
						.clone()
						.setLength(vectorAB.length() / 2)
						.addScaledVector(facet.triangle.a, 1);
					const geometry = holeConfig.geometry[0];
					if (geometry.type === 'CircleConfig') {
						vectorACenter.addScaledVector(new Vector3(geometry.center.x, geometry.center.y, 0), 1);
						const { x, y } = vectorACenter;
						const r = geometry.radius;
						return { svgPath: arcCircle([x, y, r]) };
					}
					return { svgPath: '' };
				});
			return holes;
		}
	} else if (config.tilePattern.type === 'each-facet') {
		// const axis = new Vector3(0, 1, 0);
		// const holes: string[] = [];
		// flatBand.facets.forEach((facet, i) => {
		// 	const { a, b, c } = facet.triangle;
		// 	const ab = b.clone().addScaledVector(a, -1);
		// 	const ac = c.clone().addScaledVector(a, -1);
		// 	const [a0, b0, c0] = config.holeConfigs[0][0].corners.map(
		// 		(point) => new Vector3(point.x, point.y, 0)
		// 	);
		// 	const ab0 = b0.clone().addScaledVector(a0, -1);
		// 	const ac0 = c0.clone().addScaledVector(a0, -1);
		// 	const lengthRatio = ac.length() / ac0.length();
		// 	const angleRatio = ac.angleTo(ab) / ac0.angleTo(ab0);
		// 	// const offsetA = { x: a.x - a0.x, y: a.y - a0.y };
		// 	// we'll need to correct for direction of angle.  use dot product or whatever to convert some angles to negative
		//   const offsetAngle = axis.angleTo(ab) - axis.angleTo(ab0);
		//   const geometryStrings: string[] = [];
		//   const geometry = config.holeConfigs[0][0].geometry[0]
		// if (geometry.type === "CircleConfig") {
		//   const adjustedCenter =
		// }
		// TODO - refactor HoleConfig type to enforce a unit triangle or unit rectangle
		// Algorithm to use
		// forEach point
		// 1) scale vertical and scale horizontal
		// 2) rotate around anchor
		// });
	}

	const blankResult = [{ svgPath: '' }];
	return blankResult;
};

const generateFacetTabPattern = (facetTab: FacetTab | FacetTab[] | undefined) => {
	if (isFullTab(facetTab)) {
		return {
			style: 'full',
			svgPath: getPathFromPoints(orderedPointsList(facetTab.outer)),
			triangle: facetTab.footprint.triangle.clone()
		} as unknown as FullTabPattern;
	}
	if (isTrapTab(facetTab)) {
		return {
			style: 'trapezoid',
			svgPath: getPathFromPoints(orderedPointsList(facetTab.outer)),
			triangle: facetTab.footprint.triangle.clone()
		} as unknown as TrapTabPattern;
	}
	if (isMultiFacetFullTab(facetTab)) {
		return {
			style: 'multi-facet-full',
			svgPath: getPathFromPoints(orderedPointsList(facetTab.outer)),
			triangle1: facetTab.footprint[0].triangle.clone(),
			triangle2: facetTab.footprint[1].triangle.clone()
		} as unknown as MultiFacetFullTabPattern;
	}
	if (isMultiFacetTrapTab(facetTab)) {
		return {
			style: 'multi-facet-trapezoid',
			svgPath: getPathFromPoints(orderedPointsList(facetTab.outer)),
			triangle1: facetTab.footprint[0].triangle.clone(),
			triangle2: facetTab.footprint[1].triangle.clone()
		} as unknown as MultiFacetTrapTabPattern;
	}
};

export const generateLevelSetPatterns = (
	levels: Level[],
	config: PatternConfig
): LevelSetPattern => {
	if (config.showPattern.level === 'none') throw new Error('Level patterns not configured');
	const pattern: LevelSetPattern = { projectionType: 'outlined', levels: [] };

	const axis = new Vector2(0, 1);
	const center = new Vector2(0, 0);
	pattern.levels = levels.map((level) => {
		const primeVertex: Vector3 = level.vertices[0].clone().addScaledVector(level.center, -1);
		const levelPattern: LevelPattern = { outline: { svgPath: '', points: [] } };

		levelPattern.outline.points = level.vertices.map((vertex) => {
			const relativeVertex = vertex.clone().addScaledVector(level.center, -1);
			const cp = primeVertex.clone().cross(relativeVertex);
			let a = primeVertex.angleTo(relativeVertex);
			a = cp.z >= 0 ? a : Math.PI * 2 - a;
			const r = getLength(level.center, vertex);
			const patternVertex: Vector2 = axis.clone().setLength(r).rotateAround(center, a);
			return patternVertex;
		});

		levelPattern.outline.svgPath = getPathFromPoints(levelPattern.outline.points);
		return levelPattern;
	});
	return pattern;
};

const alignTriangle = (triangle: Triangle, config: AlignTrianglesConfig): Triangle => {
	// for odd facets (which should also be Greater Side), reverse the lead / follow vectors, and the angle?

	const parity = config.isEven ? 1 : -1;
	const tabParity = config.isTabOnGreaterSide ? -1 : 1;
	const zAxis = new Vector3(0, 0, 1);
	const pointSet: TrianglePoint[] = ['a', 'b', 'c'];

	const pivot = config.lead.p; // pivot is the same point as prevTriangle[config.follow], but has the same label as config.lead
	const constrained = config.follow.p;
	const free: TrianglePoint = pointSet.find((p) => p !== constrained && p !== pivot) || 'a';
	const segmentOldPivotFree = triangle[pivot].clone().addScaledVector(triangle[free], -1);
	const segmentOldPivotConstrained = triangle[pivot]
		.clone()
		.addScaledVector(triangle[constrained], -1);
	const len = segmentOldPivotFree.length();
	const angle = segmentOldPivotConstrained.angleTo(segmentOldPivotFree);

	const alignedTriangle = new Triangle();
	alignedTriangle[pivot] = config.isTabOnGreaterSide
		? config.lead.vec.clone()
		: config.follow.vec.clone();
	alignedTriangle[constrained] = config.isTabOnGreaterSide
		? config.follow.vec.clone()
		: config.lead.vec.clone();
	const segment = alignedTriangle[constrained]
		.clone()
		.addScaledVector(alignedTriangle[pivot], -1)
		.setLength(len)
		.applyAxisAngle(zAxis, angle * parity * tabParity);
	alignedTriangle[free] = segment.addScaledVector(alignedTriangle[pivot], 1);

	return alignedTriangle;
};

const getFirstTriangleParity = (bandStyle: BandStyle): boolean => {
	if (bandStyle === 'helical-right') return false;
	if (bandStyle === 'helical-left') return true;
	return true;
};

export const getFlatStrip = <T extends Strut | Band>(
	strip: T,
	flatStripConfig: FlatStripConfig,
	tabStyle?: TabStyle
): T => {
	const config = {
		origin: new Vector3(0, 0, 0),
		direction: new Vector3(0, -1, 0),
		...flatStripConfig
	};

	const scale = config.pixelScale?.value || 1;
	const scaleMatrix = new Matrix3();
	scaleMatrix.makeScale(scale, scale);

	const flatStrip: Strip = { ...strip, facets: [] };

	strip.facets.forEach((facet, i) => {
		const alignedFacet: Facet = { ...facet };

		// let edgeConfig
		let edgeConfig = generateEdgeConfig(
			flatStripConfig.bandStyle,
			Math.abs((i - 1) % 2) == 0,
			isStrut(strip),
			false
		);
		let alignConfig: AlignTrianglesConfig;

		if (i === 0) {
			const firstAlignedPoints: { pivot: TrianglePoint; constrained: TrianglePoint } = !isStrut(
				strip
			)
				? { pivot: 'a', constrained: 'c' }
				: { pivot: 'c', constrained: 'a' };
			const firstLength = getLength(
				facet.triangle[firstAlignedPoints.pivot],
				facet.triangle[firstAlignedPoints.constrained]
			);
			alignConfig = {
				isEven: getFirstTriangleParity(flatStripConfig.bandStyle),
				isTabOnGreaterSide: false,
				lead: {
					p: firstAlignedPoints.constrained,
					vec: config.direction.clone().setLength(firstLength).addScaledVector(config.origin, 1)
				},
				follow: { p: firstAlignedPoints.pivot, vec: config.origin.clone() }
			};
		} else {
			const prevFlatTriangle = flatStrip.facets[i - 1].triangle;
			alignConfig = {
				isEven: Math.abs((i - 1) % 2) === 0,
				isTabOnGreaterSide: false,
				lead: { p: edgeConfig.lead, vec: prevFlatTriangle[edgeConfig.lead].clone() },
				follow: { p: edgeConfig.follow, vec: prevFlatTriangle[edgeConfig.follow].clone() }
			};
		}
		alignedFacet.triangle = alignTriangle(facet.triangle, alignConfig);
		// if (config.pixelScale && config.pixelScale.value !== 1) {
		// 	const oldTriangle = alignedFacet.triangle.clone();
		// 	alignedFacet.triangle = new Triangle(
		// 		oldTriangle.a.clone().applyMatrix3(scaleMatrix),
		// 		oldTriangle.b.clone().applyMatrix3(scaleMatrix),
		// 		oldTriangle.c.clone().applyMatrix3(scaleMatrix)
		// 	);
		// 	console.debug(
		// 		'||| alignedFacet.triangle',
		// 		scale,
		// 		oldTriangle.a,
		// 		'->',
		// 		alignedFacet.triangle.a
		// 	);
		// } else {
		// 	console.debug('*** alignedFacet.triangle', scale, alignedFacet.triangle.a);
		// }

		if (facet.tab && tabStyle) {
			edgeConfig = generateEdgeConfig(config.bandStyle, i % 2 === 0, false, true);
			const tabAlignConfig = {
				isEven: Math.abs((i - 1) % 2) === 0,
				isTabOnGreaterSide: Math.abs((i - 1) % 2) === 1,
				lead: { p: edgeConfig.lead, vec: alignedFacet.triangle[edgeConfig.lead].clone() },
				follow: { p: edgeConfig.follow, vec: alignedFacet.triangle[edgeConfig.follow].clone() }
			};
			if (facet.tab.style === 'full' || facet.tab.style === 'trapezoid') {
				const tabFootprint = alignTriangle(facet.tab.footprint.triangle, tabAlignConfig);

				if (tabStyle?.style === 'full') {
					alignedFacet.tab = generateFullTab(tabStyle, tabFootprint, edgeConfig);
				} else if (tabStyle?.style === 'trapezoid') {
					alignedFacet.tab = generateTrapTab(tabStyle, tabFootprint, edgeConfig);
				}
			} else if (facet.tab?.style.startsWith('multi-facet')) {
				if (facet.tab.style === 'multi-facet-full') {
					const edgeConfig0 = generateEdgeConfig(config.bandStyle, i % 2 === 0, false, true);
					const alignConfig0: AlignTrianglesConfig = {
						isEven: i % 2 === 0,
						isTabOnGreaterSide: i % 2 === 1,
						lead: { vec: alignedFacet.triangle[edgeConfig0.follow], p: edgeConfig0.follow },
						follow: { vec: alignedFacet.triangle[edgeConfig0.lead], p: edgeConfig0.lead }
					};
					const tabTriangle0: Triangle = alignTriangle(
						facet.tab.footprint[0].triangle,
						alignConfig0
					);
					// Configure second triangle of tab
					const edgeConfig1 =
						i % 2 === 0
							? generateEdgeConfig(config.bandStyle, i % 2 !== 0, false, false)
							: ({ lead: 'b', follow: 'a' } as EdgeConfig);
					const alignConfig1: AlignTrianglesConfig = {
						isEven: false,
						isTabOnGreaterSide: false,
						lead: { vec: tabTriangle0[edgeConfig1.lead], p: edgeConfig1.lead },
						follow: { vec: tabTriangle0[edgeConfig1.follow], p: edgeConfig1.follow }
					};
					const tabTriangle1: Triangle = alignTriangle(
						facet.tab.footprint[1].triangle,
						alignConfig1
					);
					alignedFacet.tab = generateMultiFacetFullTab(
						{
							...facet.tab.footprint[0],
							triangle: tabTriangle0
						},
						{
							...facet.tab.footprint[1],
							triangle: tabTriangle1
						},
						generateEdgeConfig(flatStripConfig.bandStyle, i % 2 === 0, false, true),
						i % 2 === 0 ? 'lesser' : 'greater',
						tabStyle
					);
				}
			}

			// alignedFacet.tab = {
			//   ...facet.tab,
			//   footprint: {
			//     ...facet.tab.footprint,
			//     triangle: tabFootprint
			//   }
			// }
		}
		flatStrip.facets.push(alignedFacet);
	});

	return flatStrip as T;
};

export const getFlatStripV2 = <T extends Strut | Band>(
	strip: T,
	flatStripConfig: FlatStripConfig,
	tabStyle?: TabStyle
): T => {
	const config = {
		origin: new Vector3(0, 0, 0),
		direction: new Vector3(0, -1, 0),
		...flatStripConfig
	};

	const flatStrip: Strip = { ...strip, facets: [] };

	// Get the base points for even/odd triangles based on the first facet's orientation
	const bandBasePoints = getBandBasePoints(strip.facets[0].orientation);

	strip.facets.forEach((facet, i) => {
		const alignedFacet: Facet = { ...facet };

		// Determine which base points to use (even or odd)
		const thisBasePoints = bandBasePoints[i % 2];
		let base: PanelBase;

		if (i === 0) {
			// First triangle: use origin and (1,0,0) as the base
			base = {
				...thisBasePoints,
				v0: config.origin.clone(),
				v1: config.origin.clone().add(new Vector3(1, 0, 0))
			};
		} else {
			// Subsequent triangles: derive base from previous triangle's "second" points
			// The second points are p1, p0 (reversed order) from thisBasePoints
			const prevTriangle = flatStrip.facets[i - 1].triangle;
			base = {
				...thisBasePoints,
				v0: prevTriangle[thisBasePoints.p1].clone(),
				v1: prevTriangle[thisBasePoints.p0].clone()
			};
		}

		// Use getFlatTriangle to get the aligned triangle
		alignedFacet.triangle = getFlatTriangle({ triangle: facet.triangle, base });

		// Handle tabs
		if (facet.tab && tabStyle) {
			const edgeConfig = generateEdgeConfig(config.bandStyle, i % 2 === 0, false, true);
			const tabAlignConfig = {
				isEven: Math.abs((i - 1) % 2) === 0,
				isTabOnGreaterSide: Math.abs((i - 1) % 2) === 1,
				lead: { p: edgeConfig.lead, vec: alignedFacet.triangle[edgeConfig.lead].clone() },
				follow: { p: edgeConfig.follow, vec: alignedFacet.triangle[edgeConfig.follow].clone() }
			};
			if (facet.tab.style === 'full' || facet.tab.style === 'trapezoid') {
				const tabFootprint = alignTriangle(facet.tab.footprint.triangle, tabAlignConfig);

				if (tabStyle?.style === 'full') {
					alignedFacet.tab = generateFullTab(tabStyle, tabFootprint, edgeConfig);
				} else if (tabStyle?.style === 'trapezoid') {
					alignedFacet.tab = generateTrapTab(tabStyle, tabFootprint, edgeConfig);
				}
			} else if (facet.tab?.style.startsWith('multi-facet')) {
				if (facet.tab.style === 'multi-facet-full') {
					const edgeConfig0 = generateEdgeConfig(config.bandStyle, i % 2 === 0, false, true);
					const alignConfig0: AlignTrianglesConfig = {
						isEven: i % 2 === 0,
						isTabOnGreaterSide: i % 2 === 1,
						lead: { vec: alignedFacet.triangle[edgeConfig0.follow], p: edgeConfig0.follow },
						follow: { vec: alignedFacet.triangle[edgeConfig0.lead], p: edgeConfig0.lead }
					};
					const tabTriangle0: Triangle = alignTriangle(
						facet.tab.footprint[0].triangle,
						alignConfig0
					);
					// Configure second triangle of tab
					const edgeConfig1 =
						i % 2 === 0
							? generateEdgeConfig(config.bandStyle, i % 2 !== 0, false, false)
							: ({ lead: 'b', follow: 'a' } as EdgeConfig);
					const alignConfig1: AlignTrianglesConfig = {
						isEven: false,
						isTabOnGreaterSide: false,
						lead: { vec: tabTriangle0[edgeConfig1.lead], p: edgeConfig1.lead },
						follow: { vec: tabTriangle0[edgeConfig1.follow], p: edgeConfig1.follow }
					};
					const tabTriangle1: Triangle = alignTriangle(
						facet.tab.footprint[1].triangle,
						alignConfig1
					);
					alignedFacet.tab = generateMultiFacetFullTab(
						{
							...facet.tab.footprint[0],
							triangle: tabTriangle0
						},
						{
							...facet.tab.footprint[1],
							triangle: tabTriangle1
						},
						generateEdgeConfig(flatStripConfig.bandStyle, i % 2 === 0, false, true),
						i % 2 === 0 ? 'lesser' : 'greater',
						tabStyle
					);
				}
			}
		}
		flatStrip.facets.push(alignedFacet);
	});

	return flatStrip as T;
};

// Looks up the edge configuration for a given triangle
// "lead" is defined as:
//  the forwardmost vertex of a pair of vertices on the edge of the strip
// "follow" is defined as:
//    when the edge is conjoined with another strip triangle, the "single" vertex on the strip edge
//    when the edge is conjoined with a tab, the rearmost of the pair of vertices

export const generateEdgeConfig = (
	bandStyle: BandStyle,
	isEven: boolean,
	isStrut: boolean,
	isTabEdge: boolean
): EdgeConfig => {
	if (isStrut) {
		if (bandStyle === 'helical-right') {
			if (isEven) return { lead: 'a', follow: 'b' };
			else return { lead: 'c', follow: 'b' };
			// else if (isEven && !isTabEdge) return { lead: 'c', follow: 'b' };
			// else if (!isEven && isTabEdge) return { lead: 'a', follow: 'c' };
			// else return { lead: 'a', follow: 'b' };
		} else throw new Error('Only helical-right struts supported');
	} else {
		if (bandStyle === 'circumference') {
			if (isEven && isTabEdge) return { lead: 'b', follow: 'a' };
			else if (isEven && !isTabEdge) return { lead: 'b', follow: 'c' };
			else if (!isEven && isTabEdge) return { lead: 'a', follow: 'b' };
			else return { lead: 'a', follow: 'c' };
		} else if (bandStyle === 'helical-right') {
			if (isEven && isTabEdge) return { lead: 'c', follow: 'a' };
			else if (isEven && !isTabEdge) return { lead: 'c', follow: 'b' };
			else if (!isEven && isTabEdge) return { lead: 'a', follow: 'c' };
			else return { lead: 'a', follow: 'b' };
		} else {
			if (isEven && isTabEdge) return { lead: 'c', follow: 'b' };
			else if (isEven && !isTabEdge) return { lead: 'c', follow: 'a' };
			else if (!isEven && isTabEdge) return { lead: 'b', follow: 'c' };
			else return { lead: 'b', follow: 'a' };
		}
	}
};

function getPathFromPoints(points: (Vector3 | Vector2)[]): string {
	return `${points.reduce(
		(path, point) => `${path}L ${point.x} ${point.y}`,
		`M ${points[0].x} ${points[0].y}`
	)} z`;
}

// Utilities

export const round = (n: number) => {
	return Math.round(n * 100) / 100;
};
export const printPoint = (v: Vector3) => `(${round(v.x)}, ${round(v.y)})`;

export const printTriangle = (tri: Triangle) =>
	`
    a (${round(tri.a.x)}, ${round(tri.a.y)}, ${round(tri.a.z)})
    b (${round(tri.b.x)}, ${round(tri.b.y)}, ${round(tri.b.z)})
    c (${round(tri.c.x)}, ${round(tri.c.y)}, ${round(tri.c.z)})`;

const generatePattern = {
	flowerOfLife1: {
		generatePatternUnit: () => generateUnitFlowerOfLifeTriangle({ width: 0, unitSize: 100 }),
		deriveTransforms: (shape: Triangle, index: number) =>
			getTransformStringFromTriangle(
				{ type: 'matched', triangle: simpleTriangle(shape), width: 115 },
				index % 2 === 0
			),
		processPatternTransforms: processFlowerOfLife1PatternTransforms,
		generateBandPattern: (transformedFacets: PathSegment[][]) =>
			generateFlowerOfLife1BandPattern(transformedFacets)
	}
};

export const applyStrokeWidth = (
	bands: BandCutPattern[],
	{ dynamicStroke, dynamicStrokeMax, dynamicStrokeMin }: object & DynamicStrokeConfig
): BandCutPattern[] => {

	let patternBands = [...bands]
	const widthVariesByBand = true;

	let maxValue: number;
	let minValue: number;

	if (dynamicStroke === 'quadWidth') {
		const values: number[] = [];
		patternBands.forEach((band) =>
			band.facets.forEach((facet) => {
				if (facet.quadWidth) {
					values.push(facet.quadWidth);
				}
			})
		);
		maxValue = Math.max(...values);
		minValue = Math.min(...values);

		if (!widthVariesByBand && patternBands[0]) {
			console.debug('not width varies by band');
			const strokeWidthPrototypes = patternBands[0].facets.map((facet: CutPattern) => {
				const ratio = facet.quadWidth ? (facet.quadWidth - minValue) / (maxValue - minValue) : 1;
				return ratio * (dynamicStrokeMax - dynamicStrokeMin) + dynamicStrokeMin;
			});
			patternBands = patternBands.map((band) => ({
				...band,
				facets: band.facets.map((facet: CutPattern, i) => {
					return {
						...facet,
						strokeWidth: strokeWidthPrototypes[i]
					};
				})
			}));
		} else {
			patternBands = patternBands.map((band) => ({
				...band,
				facets: band.facets.map((facet: CutPattern) => {
					const ratio = facet.quadWidth ? (facet.quadWidth - minValue) / (maxValue - minValue) : 1;
					const strokeWidth = ratio * (dynamicStrokeMax - dynamicStrokeMin) + dynamicStrokeMin;
					return {
						...facet,
						strokeWidth
					};
				})
			}));
		}
	} else {
		console.debug({dynamicStroke})
	}
	return patternBands;
};

export const getModelHeight = (bands: Band[]): number => {
	const zValues: number[] = [];
	bands.forEach((band) =>
		band.facets.forEach((facet) => {
			zValues.push(facet.triangle.a.z, facet.triangle.b.z, facet.triangle.c.z);
		})
	);
	const minZ = Math.min(...zValues);
	const maxZ = Math.max(...zValues);
	const height = maxZ - minZ;
	return height;
};

export const getPatternLength = (
	bands: BandPattern,
	symmetry?: number
): { minLength: number; maxLength: number } => {
	if (bands.projectionType === 'none') {
		return { minLength: 0, maxLength: 15 };
	}

	const points = (bands as BandCutPatternPattern).bands.map((band) =>
		band.facets.map((facet) => Object.values(facet.quad || {})).flat(2)
	);
	const distances = points.map((band) => {
		const { distance } = getMostDistantPoints(band);
		return distance;
	});
	return { minLength: Math.min(...distances), maxLength: Math.max(...distances) };
};

export const getRenderableOnGeometry = <T extends Band[] | Level[] | Strut[]>(
	renderConfig: RenderConfig,
	geometry: T
) => {
	return getRenderable(renderConfig, geometry) as T;
};

const getMostDistantPoints = (points: Point[]) => {
	let p0 = points[Math.round(points.length / 2)];
	let p1 = points[0];
	let distance = 0;

	for (let i = 0; i < 5; i++) {
		for (let j = 0; j < points.length; j++) {
			const p = i % 2 === 0 ? points[j] : points[points.length - 1 - j];
			const length = getLength(p0, p);

			if (length > distance) {
				p1 = p0;
				p0 = points[j];
				distance = length;
			}
		}
	}
	return { distance, p0, p1 };
};
