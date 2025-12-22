import { CurvePath, Vector2, Vector3, CubicBezierCurve, Triangle, LineCurve } from 'three';
import type {
	TrianglePoint,
	TriangleSide,
	EdgeConfig,
	Band,
	BandConfig,
	BandStyle,
	BezierConfig,
	DepthCurveConfig,
	Facet,
	FacetTab,
	FullTab,
	Level,
	LevelConfig,
	LevelPrototype,
	LineConfig,
	MultiFacetFullTab,
	MultiFacetTrapTab,
	PointConfig2,
	RenderConfig,
	GlobuleConfig,
	ShapeConfig,
	SilhouetteConfig,
	Strip,
	Strut,
	StrutConfig,
	TabConfig,
	TabStyle,
	TrapTab,
	Validation,
	TabWidth,
	TabFootprint,
	FacetOrientation,
	RadiateOrientation,
	StripSide,
	StrutOrientation,
	TabDirection,
	TabFootprintInvert,
	GlobuleData,
	SpineCurveConfig
} from '$lib/types';
import { generateEdgeConfig } from './cut-pattern/generate-cut-pattern';
import { generateLevelSet2, generateSections } from './generate-level';
import type { Tube } from './projection-geometry/types';
import {
	generateProjectionBands,
	generateTubeBands
} from './projection-geometry/generate-projection';

// Rotated Shape Levels are 2d.  How can I enforce that?

export const isFullTab = (tab: FacetTab | FacetTab[] | undefined): tab is FullTab =>
	!Array.isArray(tab) && tab?.style === 'full';

export const isTrapTab = (tab: FacetTab | FacetTab[] | undefined): tab is TrapTab =>
	!Array.isArray(tab) && tab?.style === 'trapezoid';

export const isMultiFacetFullTab = (
	tab: FacetTab | FacetTab[] | undefined
): tab is MultiFacetFullTab => !Array.isArray(tab) && tab?.style === 'multi-facet-full';
export const isMultiFacetTrapTab = (
	tab: FacetTab | FacetTab[] | undefined
): tab is MultiFacetTrapTab => !Array.isArray(tab) && tab?.style === 'multi-facet-trapezoid';

export const isBezierCurveConfig = (curve: BezierConfig | PointConfig2): curve is BezierConfig =>
	Object.hasOwn(curve, 'p0') &&
	Object.hasOwn(curve, 'p1') &&
	Object.hasOwn(curve, 'p2') &&
	Object.hasOwn(curve, 'p3') &&
	curve.type === 'BezierConfig';

export const generateSilhouette = (config: SilhouetteConfig): CurvePath<Vector2> => {
	const silhouette = new CurvePath<Vector2>();
	for (const curve of config.curves) {
		if (curve.type === 'BezierConfig') {
			silhouette.add(
				new CubicBezierCurve(
					new Vector2(curve.points[0].x, curve.points[0].y),
					new Vector2(curve.points[1].x, curve.points[1].y),
					new Vector2(curve.points[2].x, curve.points[2].y),
					new Vector2(curve.points[3].x, curve.points[3].y)
				)
			);
		}
	}
	return silhouette;
};

export const generateSpineCurve = (config: SpineCurveConfig): CurvePath<Vector2> => {
	const spineCurve = new CurvePath<Vector2>();
	for (const curve of config.curves) {
		if (curve.type === 'BezierConfig') {
			spineCurve.add(
				new CubicBezierCurve(
					new Vector2(curve.points[0].x, curve.points[0].y),
					new Vector2(curve.points[1].x, curve.points[1].y),
					new Vector2(curve.points[2].x, curve.points[2].y),
					new Vector2(curve.points[3].x, curve.points[3].y)
				)
			);
		}
	}
	return spineCurve;
};

export const generateDepthCurve = (config: DepthCurveConfig): CurvePath<Vector2> => {
	const dCurve = new CurvePath<Vector2>();
	for (const curve of config.curves) {
		if (curve.type === 'BezierConfig') {
			dCurve.add(
				new CubicBezierCurve(
					new Vector2(curve.points[0].x, curve.points[0].y),
					new Vector2(curve.points[1].x, curve.points[1].y),
					new Vector2(curve.points[2].x, curve.points[2].y),
					new Vector2(curve.points[3].x, curve.points[3].y)
				)
			);
		}
	}
	return dCurve;
};

// utility function to generate a regular polygon of type LevelPrototype
export const generateRegularPolygonLevel = (sides: number, radius: number): LevelPrototype => {
	const output: LevelPrototype = {
		center: new Vector2(0, 0),
		vertices: []
	};
	const a = (Math.PI * 2) / sides;

	for (let i = 0; i < sides; i++) {
		output.vertices.push(new Vector2(radius * Math.cos(a * i), radius * Math.sin(a * i)));
	}
	return output;
};

// const validateShapeConfig = (config: ShapeConfig): Validation => {
// 	const validation: Validation = { isValid: true, msg: [] };
// if "asymmetric" or "lateral" symmetryNumber === 1

// if "radial", angle = Math.PI * 2 / symmetryNumber
// else if "radial-lateral", angle = Math.PI / symmetryNumber

// if asymmetric, start === end
// for a radial shape, start and end points have the following requirements:
//  start is colinear with Vector2(1, 0)
//  if "lateral" end is colinear with Vector2(1, 0)
//  if "radial" end === start.applyAngle(angle)
//  if "radial-lateral", end is colinear with Vector2(1, 0).applyAngle(angle)

// 	return validation;
// };

const rotatedCurve = (
	config: BezierConfig | LineConfig,
	index: number,
	angle: number,
	isReflected: boolean
): CubicBezierCurve | LineCurve => {
	const center = new Vector2(0, 0);
	if (config.type === 'BezierConfig') {
		const p = config.points;
		const vectors = [
			new Vector2(p[0].x, p[0].y),
			new Vector2(p[1].x, p[1].y),
			new Vector2(p[2].x, p[2].y),
			new Vector2(p[3].x, p[3].y)
		].map((v) => {
			if (isReflected) {
				v.rotateAround(center, angle - 2 * v.angle());
			}
			v.rotateAround(center, angle * index);
			return v;
		});
		const [v0, v1, v2, v3] = vectors;
		return new CubicBezierCurve(v0, v1, v2, v3);
	}
	const p = config.points;
	const vectors = [new Vector2(p[0].x, p[0].y), new Vector2(p[1].x, p[1].y)].map((v) => {
		if (isReflected) {
			v.rotateAround(center, angle - 2 * v.angle());
		}
		v.rotateAround(center, angle * index);
		return v;
	});
	const [v0, v1] = vectors;
	return new LineCurve(v0, v1);
};

const generateRadialShape = (config: ShapeConfig): CurvePath<Vector2> => {
	// const validation = validateShapeConfig(config);
	// if (!validation.isValid) throw new Error(validation.msg.join('\n'));

	const { symmetry, symmetryNumber, curves } = config;
	const shape = new CurvePath<Vector2>();

	const isReflected = ['radial-lateral', 'lateral'].includes(symmetry);
	const angle = (Math.PI * 2) / symmetryNumber;

	for (let i = 0; i < symmetryNumber; i++) {
		curves.forEach((curve) => {
			shape.add(rotatedCurve(curve, i, angle, false));
		});
		if (isReflected) {
			curves.forEach((curve) => shape.add(rotatedCurve(curve, i, angle, true)));
		}
	}
	return shape;
};

const normalizeConfigPoints = (
	shapeConfig: ShapeConfig,
	config:
		| { maxLength: number; normalizationRatio?: number }
		| { maxLength?: number; normalizationRatio: number }
): ShapeConfig => {
	const lengths: number[] = [];
	const normalizedShapeConfig: ShapeConfig = window.structuredClone(shapeConfig);
	let ratio: number;
	if (typeof config.maxLength === 'number') {
		normalizedShapeConfig.curves.forEach((curve) =>
			curve.points.forEach((point) => {
				const length = Math.sqrt(Math.pow(point.x, 2) + Math.pow(point.y, 2));
				lengths.push(length);
			})
		);
		ratio = config.maxLength / Math.max(...lengths);
	} else if (config.normalizationRatio) {
		ratio = config.normalizationRatio;
	}

	normalizedShapeConfig.curves = normalizedShapeConfig.curves.map((curve: BezierConfig) => {
		const points: [PointConfig2, PointConfig2, PointConfig2, PointConfig2] = curve.points.map(
			(point) => {
				point.x = point.x * ratio;
				point.y = point.y * ratio;
				return point;
			}
		) as [PointConfig2, PointConfig2, PointConfig2, PointConfig2];
		curve.points = points;
		return curve;
	});
	return normalizedShapeConfig;
};

export const generateLevelPrototype = (
	config: ShapeConfig,
	levelConfig: LevelConfig
): LevelPrototype | LevelPrototype[] => {
	return generateRadialShapeLevelPrototype(config, levelConfig, 0);
};

const generateRadialShapeLevelPrototype = (
	config: ShapeConfig,
	levelConfig: LevelConfig,
	levelNumber: number
): LevelPrototype => {
	const shape = generateRadialShape(normalizeConfigPoints(config, { normalizationRatio: 1 / 200 }));
	const points: Vector2[] = [];
	const { sampleMethod } = config;
	if (sampleMethod.method === 'divideCurve') {
		// const {divisions} = sampleMethod
		shape.curves.forEach((curve) => {
			points.push(...curve.getSpacedPoints(sampleMethod.divisions).slice(1)); // removes first point from each curve to avoid dupes
		});
	} else if (sampleMethod.method === 'divideCurvePath') {
		const totalLength = shape.getLength();
		shape.curves.forEach((curve) => {
			const ratio = curve.getLength() / totalLength;
			points.push(...curve.getPoints(Math.ceil(sampleMethod.divisions * ratio)).slice(1)); // removes first point from each curve to avoid dupes
		});
	}

	return {
		center: new Vector2(0, 0),
		vertices: points
	};
};

const validateBandConfig = (config: BandConfig, levels: Level[]): Validation => {
	const validation: Validation = { isValid: true, msg: [] };
	const baseVertexCount = levels[0].vertices.length;
	levels.forEach((level) => {
		if (level.vertices.length !== baseVertexCount) {
			validation.isValid = validation.isValid && false;
			validation.msg.push(
				`level ${level.level} has ${level.vertices.length} vertices, but should have ${baseVertexCount}`
			);
		}
	});
	return validation;
};

const generateBandSet = (config: GlobuleConfig, levels: Level[]): Band[] => {
	const circumferenceBands = generateCircumferenceBands(config, levels);
	if (config.bandConfig.bandStyle.startsWith('helical')) {
		return generateHelicalBands(circumferenceBands);
	}
	return circumferenceBands;
};

const generateHelicalBands = (cBands: Band[]): Band[] => {
	const bandCount = cBands[0].facets.length / 2;
	const facetCount = cBands.length;
	const helicalBands: Band[] = new Array(bandCount);
	for (let b = 0; b < bandCount; b++) {
		helicalBands[b] = { orientation: cBands[0].orientation, facets: [], endTab: undefined };
		if (helicalBands[b].orientation === 'axial-right') {
			for (let f = 0; f < facetCount; f++) {
				helicalBands[b].facets.push(
					{ ...cBands[f].facets[b * 2] },
					{ ...cBands[f].facets[b * 2 + 1] }
				);
			}
		} else {
			for (let f = 0; f < facetCount; f++) {
				helicalBands[b].facets.push(
					{ ...cBands[f].facets[bandCount * 2 - b * 2] },
					{ ...cBands[f].facets[bandCount * 2 - b * 2 - 1] }
				);
			}
		}
	}

	return helicalBands;
};

const getFacetOrientation = (bandStyle: BandStyle): FacetOrientation => {
	if (bandStyle === 'helical-left') return 'axial-left';
	if (bandStyle === 'helical-right') return 'axial-right';
	return 'circumferential';
};

const getBandStyle = (bandOrientation: FacetOrientation): BandStyle => {
	if (bandOrientation === 'axial-left') return 'helical-left';
	if (bandOrientation === 'axial-right') return 'helical-right';
	return 'circumference';
};

const generateCircumferenceBands = (config: GlobuleConfig, levels: Level[]): Band[] => {
	const validation = validateBandConfig(config.bandConfig, levels);
	if (!validation.isValid) {
		throw new Error(validation.msg.join('\n'));
	}
	const bands: Band[] = [];

	for (let i = 0; i < levels.length - 1; i++) {
		const band: Band = {
			orientation: getFacetOrientation(config.bandConfig.bandStyle),
			facets: []
		};
		levels[i].vertices.forEach((vertex, v, vertices) => {
			const triangle1 = new Triangle(
				vertex.clone(),
				vertices[(v + 1) % vertices.length].clone(),
				levels[i + 1].vertices[v].clone()
			);
			const triangle2 = new Triangle(
				levels[i + 1].vertices[(v + 1) % vertices.length].clone(),
				triangle1.c.clone(),
				triangle1.b.clone()
			);
			band.facets.push({ triangle: triangle1 }, { triangle: triangle2 });
		});

		bands.push(band);
	}
	return bands;
};

/* 
Triangle layout diagram
        __________
			/c\b     a/
		/		 \	  /
	/a     b\c/
	---------
*/

/////////////////////////////////////////
// Struts
/////////////////////////////////////////

const generateStruts = (levels: Level[], config: StrutConfig): Strut[] => {
	const struts: Strut[] = levels[0].vertices.map((vertex, i) =>
		generateHelicalStrut(i, levels, config)
	);
	return struts;
};

const getStrutVector = (
	closeness: 'outer' | 'inner',
	pointData: { base: Vector3; offset: Vector3 },
	width: number,
	orientation: StrutOrientation
): Vector3 => {
	const { base, offset } = pointData;
	const offsets = {
		outer: {
			inside: 0,
			outside: width,
			half: width / 2
		},
		inner: {
			inside: -width,
			outside: 0,
			half: -width / 2
		}
	};
	return base.clone().addScaledVector(offset, -offsets[closeness][orientation]);
};

const generateHelicalStrut = (bandIndex: number, levels: Level[], config: StrutConfig): Strut => {
	const { width, tiling, orientation, radiate } = config;
	if (tiling !== 'helical-right') throw new Error('Only helical-right tiling supported');
	const strut: Strut = {
		tiling,
		orientation,
		radiate,
		facets: [] as Facet[]
	};

	for (let i = 0; i < levels.length - 1; i++) {
		const lower = { base: levels[i].vertices[bandIndex].clone(), offset: new Vector3() };
		const upper = { base: levels[i + 1].vertices[bandIndex].clone(), offset: new Vector3() };
		// if (radiate === 'level') {
		// 	lower.offset = levels[i].center.clone().addScaledVector(lower.base, -1).setLength(1);
		// 	upper.offset = levels[i + 1].center.clone().addScaledVector(upper.base, -1).setLength(1);
		// } else if (radiate === 'orthogonal') {
		lower.offset = getStrutOffset(i, bandIndex, lower.base, levels, radiate);
		upper.offset = getStrutOffset(i + 1, bandIndex, upper.base, levels, radiate);
		// }

		const facet1: Facet = {
			triangle: new Triangle(
				getStrutVector('outer', upper, width, orientation),
				getStrutVector('inner', lower, width, orientation),
				getStrutVector('outer', lower, width, orientation)
			)
		};
		const facet2: Facet = {
			triangle: new Triangle(
				getStrutVector('inner', lower, width, orientation),
				getStrutVector('outer', upper, width, orientation),
				getStrutVector('inner', upper, width, orientation)
			)
		};

		strut.facets.push(facet1, facet2);
	}
	return strut;
};

const getOrthogonalAxis = (vec1: Vector3, vec2: Vector3, vec3: Vector3): Vector3 => {
	return vec1
		.clone()
		.addScaledVector(vec2, -1)
		.cross(vec1.clone().addScaledVector(vec3, -1))
		.setLength(1);
};
const getLevelOrthogonalAxis = (level: Level) => {
	return getOrthogonalAxis(level.center, level.vertices[0], level.vertices[1]);
};
// TODO - calculate a hybrid offset -
//			get a unit vector with the direction from vertex to center
//			get angles from this vector to preVec and postVec
//			get rotAxis as cross product of unit vector and level orthogonal axis
//			rotate unit vector by difference beteen up and down angles
const getStrutOffset = (
	levelIndex: number,
	vertexIndex: number,
	base: Vector3,
	levels: Level[],
	radiate: RadiateOrientation
): Vector3 => {
	const centerDirectionVec = levels[levelIndex].center
		.clone()
		.addScaledVector(base, -1)
		.setLength(1);
	if (radiate === 'level') {
		return centerDirectionVec;
	}

	if (levelIndex > 0 && levelIndex < levels.length - 1) {
		const preVec = levels[levelIndex - 1].vertices[vertexIndex].clone().addScaledVector(base, -1);
		const postVec = levels[levelIndex + 1].vertices[vertexIndex].clone().addScaledVector(base, -1);
		const angle = preVec.angleTo(postVec);

		if (radiate === 'orthogonal') {
			const rotAxis = preVec.clone().cross(postVec).setLength(1);
			return preVec
				.clone()
				.applyAxisAngle(rotAxis, angle / 2)
				.setLength(1);
		} else {
			// const angle = (centerDirectionVec.angleTo(preVec) + centerDirectionVec.angleTo(postVec)) / 2;
			const rotAxis = getLevelOrthogonalAxis(levels[levelIndex]).cross(centerDirectionVec);

			// TODO - get the angle between  the centerDirctionVec and the rotated preVec, use to rotate centerDirectionVec
			const orthoVec = preVec
				.clone()
				.setLength(1)
				.applyAxisAngle(rotAxis, -angle / 2);
			const diffAngle = orthoVec.angleTo(centerDirectionVec);
			const invert = orthoVec.angleTo(new Vector3(0, 0, 1)) > Math.PI / 2 ? 1 : -1;
			return centerDirectionVec.applyAxisAngle(rotAxis, diffAngle * invert);
		}
	} else if (levelIndex === 0) {
		return getStrutOffset(1, vertexIndex, levels[1].vertices[vertexIndex].clone(), levels, radiate);
	} else if (levelIndex === levels.length - 1) {
		return getStrutOffset(
			levels.length - 2,
			vertexIndex,
			levels[levels.length - 2].vertices[vertexIndex].clone(),
			levels,
			radiate
		);
	} else {
		return levels[levelIndex].center.clone().addScaledVector(base, -1).setLength(-1);
	}
};

/////////////////////////////////////////
// Tabs
/////////////////////////////////////////

export const generateFullTab = (
	tabStyle: TabStyle,
	footprint: Triangle,
	tabConfig: TabConfig
): FullTab => {
	const { a, b, c } = footprint;
	const fullTab: FullTab = {
		style: 'full',
		direction: tabStyle.direction,
		footprint: {
			triangle: footprint,
			free: getFreeVertex(tabConfig.follow, tabConfig.lead)
		},
		outer: { a: a.clone(), b: b.clone(), c: c.clone() }
	};
	return fullTab;
};

const isEven = (n: number): boolean => n % 2 === 0;
const getSide = (facetIndex: number): StripSide =>
	Math.abs(facetIndex) % 2 === 0 ? 'lesser' : 'greater';
const shouldAddTabToSide = (side: StripSide, f: number, direction: TabDirection) =>
	(direction === side || direction === 'both') && side === getSide(f);

const generateTabs = (bands: Band[], config: BandConfig, struts?: Strut[]) => {
	const { direction } = config.tabStyle;
	if (config.tabStyle) {
		const tabbedBands: Band[] = bands.map((band, b) => {
			return {
				...band,
				facets: band.facets.map((facet, f) => {
					if (config.tabStyle.style === 'full') {
						// if ((direction === 'greater' || direction === "both") && !isEven(f)) {
						if (shouldAddTabToSide('greater', f, direction)) {
							const modelForTab: Facet = bands[(b + 1) % bands.length].facets[f - 1];
							const tab: FullTab = generateFullTab(
								config.tabStyle,
								modelForTab.triangle,
								generateEdgeConfig(config.bandStyle, isEven(f), false, true)
							);
							return { ...facet, tab };
						}
						// if ((direction === 'lesser' || direction === "both") && isEven(f)) {
						if (shouldAddTabToSide('lesser', f, direction)) {
							const modelForTab: Facet =
								bands[(bands.length + b - 1) % bands.length].facets[(f + 1) % band.facets.length];
							const tab: FullTab = generateFullTab(
								config.tabStyle,
								modelForTab.triangle,
								generateEdgeConfig(config.bandStyle, isEven(f), false, true)
							);
							return { ...facet, tab };
						}
					} else if (config.tabStyle.style === 'trapezoid') {
						if (shouldAddTabToSide('greater', f, direction)) {
							const modelForTab: Facet = bands[(b + 1) % bands.length].facets[f - 1];
							const reverseEdgeConfig = generateEdgeConfig(
								getBandStyle(bands[0].orientation),
								!isEven(f),
								false,
								true
							);
							const tab: TrapTab | undefined = generateTrapTab(
								config.tabStyle,
								modelForTab.triangle,
								{ lead: reverseEdgeConfig.lead, follow: reverseEdgeConfig.follow }
							);
							return { ...facet, tab };
						}
						if (shouldAddTabToSide('lesser', f, direction)) {
							const modelForTab: Facet =
								bands[(bands.length + b - 1) % bands.length].facets[(f + 1) % band.facets.length];
							const reverseEdgeConfig = generateEdgeConfig(
								getBandStyle(bands[0].orientation),
								isEven(f),
								false,
								true
							);
							const tab: TrapTab | undefined = generateTrapTab(
								config.tabStyle,
								modelForTab.triangle,
								{ lead: reverseEdgeConfig.lead, follow: reverseEdgeConfig.follow }
							);
							return { ...facet, tab };
						}
					} else if (
						config.tabStyle.style === 'multi-facet-full' &&
						config.tabStyle.footprint === 'strut' &&
						struts &&
						struts[0].tiling === config.bandStyle
					) {
						if (shouldAddTabToSide('greater', f, direction)) {
							const strut = struts[(b + 1) % bands.length];
							// const facetOffset = f >= strut.facets.length - 1 ? -1 : config.tabStyle.directionMulti;
							const modelForTab: [Facet, Facet] = [strut.facets[f - 1], strut.facets[f]];
							const edgeConfig = generateEdgeConfig(config.bandStyle, f % 2 === 0, false, true);
							const tab: MultiFacetFullTab = generateMultiFacetFullTab(
								...modelForTab,
								edgeConfig,
								'greater',
								config.tabStyle
							);
							return { ...facet, tab };
						}
						if (shouldAddTabToSide('lesser', f, direction)) {
							const strut = struts[b];
							// const facetOffset = f >= strut.facets.length - 1 ? 0 : config.tabStyle.directionMulti;
							const modelForTab: [Facet, Facet] = [strut.facets[f], strut.facets[f + 1]];
							const edgeConfig = generateEdgeConfig(config.bandStyle, f % 2 === 0, false, true);
							const tab: MultiFacetFullTab = generateMultiFacetFullTab(
								...modelForTab,
								edgeConfig,
								'lesser',
								config.tabStyle
							);
							return { ...facet, tab };
						}
					}
					return facet;
				})
			};
		});
		return tabbedBands;
	}
	return bands;
};

export const generateMultiFacetFullTab = (
	baseFacet: Facet,
	pointFacet: Facet,
	edgeConfig: EdgeConfig,
	side: StripSide,
	tabStyle: TabStyle
): MultiFacetFullTab => {
	// get 2 triangles
	//	choose an edge from one and a point from the other
	if (tabStyle.style !== 'multi-facet-full') throw new Error();
	const edgeConfig2: EdgeConfig =
		side === 'greater'
			? { lead: edgeConfig.follow, follow: edgeConfig.lead }
			: { lead: getFreeVertex(edgeConfig.follow, edgeConfig.lead), follow: edgeConfig.lead };

	const footprint: [TabFootprint, TabFootprintInvert] = [
		{
			triangle: baseFacet.triangle.clone(),
			free: getFreeVertex(edgeConfig.lead, edgeConfig.follow)
		},
		{
			triangle: pointFacet.triangle.clone(),
			free: getFreeSide(getFreeVertex(edgeConfig2.lead, edgeConfig2.follow))
		}
	];
	const outer =
		side === 'lesser'
			? {
					a: footprint[0].triangle[edgeConfig.follow].clone(),
					b: footprint[1].triangle[edgeConfig.lead].clone(),
					c: footprint[0].triangle[footprint[0].free].clone(),
					d: footprint[0].triangle[edgeConfig.lead].clone()
			  }
			: {
					a: footprint[0].triangle[edgeConfig.lead].clone(),
					b: footprint[1].triangle[edgeConfig.follow].clone(),
					c: footprint[0].triangle[footprint[0].free].clone(),
					d: footprint[0].triangle[edgeConfig.follow].clone()
			  };
	return {
		style: 'multi-facet-full',
		direction: tabStyle.direction,
		footprint,
		outer
	};
};

const getFreeVertex = (constrained1: TrianglePoint, constrained2: TrianglePoint): TrianglePoint => {
	const points: [TrianglePoint, TrianglePoint, TrianglePoint] = ['a', 'b', 'c'];
	if (constrained1 === constrained2)
		throw new Error(`Parameter points are the same [${constrained1}, ${constrained2}]`);
	const free = points.find((p) => p !== constrained1 && p !== constrained2);
	if (free) return free;
	else throw new Error(`No free point found given [${constrained1}, ${constrained2}]`);
};

const getFreeSide = (constrained: TrianglePoint): TriangleSide => {
	return ['ab', 'ac', 'bc'].find((str) => !str.includes(constrained)) as TriangleSide;
};

const getTriangleSegment = (
	triangle: Triangle,
	width: TabWidth,
	pivot: TrianglePoint,
	constrained: TrianglePoint,
	free: TrianglePoint
): Vector3 => {
	const baseVector = triangleSide(triangle, pivot, constrained);
	const lineVector = triangleSide(triangle, pivot, free);
	const angle = baseVector.angleTo(lineVector);
	let length;
	if (width.style === 'fraction') {
		length = lineVector.length() * width.value;
	} else {
		length = Math.min(width.value / Math.sin(angle), lineVector.length());
	}
	const point = triangle[pivot].clone().addScaledVector(lineVector.clone().setLength(length), 1);
	return point;
};

const triangleSide = (triangle: Triangle, start: TrianglePoint, end: TrianglePoint): Vector3 => {
	if (start === end) throw new Error('same points specified');
	return triangle[end].clone().addScaledVector(triangle[start], -1);
};

export const generateTrapTab = (
	tabStyle: TabStyle,
	footprint: Triangle,
	config: TabConfig
): TrapTab | undefined => {
	if (tabStyle.style !== 'trapezoid')
		throw new Error('Generating trapezoid tab with wrong config:' + tabStyle.style);
	const base = triangleSide(footprint, config.follow, config.lead);
	const { follow, lead } = config;
	const free = getFreeVertex(follow, lead);

	const a = footprint[follow].clone(); //.addScaledVector(base.clone().setLength(tabStyle.inset || 0), 1)
	const d = footprint[lead].clone(); //.addScaledVector(base.clone().setLength(tabStyle.inset || 0), -1)

	const b = getTriangleSegment(footprint, tabStyle.width, follow, lead, free);
	const c = getTriangleSegment(footprint, tabStyle.width, lead, follow, free);

	const getScored = () => {
		if (tabStyle.scored) {
			const scoreInset = (tabStyle.inset || 0) + base.length() * ((1 - tabStyle.scored) / 2);
			const scoredA = footprint[config.follow]
				.clone()
				.addScaledVector(base.clone().setLength(scoreInset), 1);
			const scoredB = scoredA.clone().addScaledVector(base.clone().setLength(tabStyle.scored), 1);

			return { a: scoredA, b: scoredB };
		}
		return undefined;
	};

	const tab: TrapTab = {
		style: 'trapezoid',
		footprint: {
			triangle: footprint,
			free: getFreeVertex(config.lead, config.follow)
		},
		direction: tabStyle.direction,
		outer: { a, b, c, d },
		scored: getScored()
	};
	return tab;
};

export const isStrut = (strip: Strip): strip is Strut => (strip as Strut).tiling !== undefined;
export const isBand = (strip: Strip): strip is Strut =>
	(strip as Band).facets !== undefined && (strip as Strut).tiling === undefined;

export const isLevels = (shapes: (Strip | Level)[]): shapes is Level[] =>
	(shapes as unknown as Level[]).every((shape) => shape.level && shape.center);

export const isStrip = (shapes: (Strip | Level)[]): shapes is Strip[] =>
	(shapes as unknown as Level[]).every((shape) => !shape.level && !shape.center);

export const getRenderable = (
	config: RenderConfig,
	shapes: (Level | Strip)[]
): (Level | Strip)[] => {
	if (config.ranges?.rangeStyle === 'slice') {
		const {
			bandStart,
			bandCount,
			facetStart,
			facetCount,
			strutStart,
			strutCount,
			levelCount,
			levelStart
		} = config.ranges;
		let start, count;
		if (isLevels(shapes as Strip[] | Level[])) {
			start = levelStart;
			count = levelCount;
			return shapes.slice(start, count ? start + count : shapes.length);
		} else if (isStrip(shapes)) {
			start = isStrut(shapes[0]) ? strutStart : bandStart;
			count = (isStrut(shapes[0]) ? strutCount : bandCount) || shapes.length;

			start = ((start % shapes.length) + shapes.length) % shapes.length;
			start = start === 0 ? shapes.length : start;

			count = count % shapes.length || shapes.length;

			return [...shapes, ...shapes]
				.slice(start, count ? start + count : shapes.length)
				.map((shape) => ({
					...shape,
					facets: shape.facets.slice(
						facetStart,
						facetCount ? facetStart + facetCount : shape.facets.length
					)
				}));
		}
	}
	return shapes;
};

/**
 * @deprecated - use generateGlobuleTube instead
 */

export const generateGlobuleData = (configStore: GlobuleConfig): GlobuleData => {
	const config = window.structuredClone(configStore);
	const rotatedShapePrototype: LevelPrototype | LevelPrototype[] = generateLevelPrototype(
		config.shapeConfig,
		config.levelConfig
	);
	const levels = generateLevelSet2(
		config.levelConfig,
		config.silhouetteConfig,
		config.depthCurveConfig,
		rotatedShapePrototype
	);

	const struts = generateStruts(levels, config.strutConfig);
	const unTabbedBands = generateBandSet(config, levels);
	const bands = !config.bandConfig?.tabStyle
		? unTabbedBands
		: generateTabs(unTabbedBands, config.bandConfig, struts);

	const filteredBands = getRenderable(config.renderConfig, bands) as Band[];

	return { levels, bands: filteredBands, struts };
};

export const generateGlobuleTube = (configStore: GlobuleConfig): Tube => {
	const config = window.structuredClone(configStore);
	const rotatedShapePrototype: LevelPrototype | LevelPrototype[] = generateLevelPrototype(
		config.shapeConfig,
		config.levelConfig
	);
	const sections = generateSections(
		config.levelConfig,
		config.silhouetteConfig,
		config.depthCurveConfig,
		rotatedShapePrototype
	);

	const bands = generateProjectionBands(sections, 'axial-right', { globule: 0, tube: 0 });

	// const struts = generateStruts(levels, config.strutConfig);
	// const unTabbedBands = generateBandSet(config, sections);
	// const bands = unTabbedBands
	// !config.bandConfig?.tabStyle
	// ? unTabbedBands
	// : generateTabs(unTabbedBands, config.bandConfig, struts);

	const filteredBands = getRenderable(config.renderConfig, bands) as Band[];

	const tube: Tube = {
		sections,
		bands: filteredBands,
		orientation: 'axial-right',
		address: { globule: 0, tube: 0 }
	};

	return tube;
};
