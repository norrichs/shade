import { CurvePath, Vector2, Vector3, CubicBezierCurve, Triangle, LineCurve } from 'three';
import type { TrianglePoint } from './cut-pattern';
import { generateEdgeConfig } from './cut-pattern';
// import { rad } from "../lib/util"

// Rotated Shape Levels are 2d.  How can I enforce that?

export type RotatedShapeLevel = {
	center: Vector3;
	level: number;
	vertices: Vector3[];
};

type RotatedShapeLevelPrototype = {
	center: Vector2;
	vertices: Vector2[];
};

type LevelOffset = {
	x: number;
	y: number;
	z: number;
	rotX: number;
	rotY: number;
	rotZ: number;
	scaleX: number;
	scaleY: number;
};

export type LevelSetConfig = {
	// zCurveConfig: ZCurveConfig,
	zCurveSampleMethod: 'arcLength' | 'levelInterval';
	levelPrototype: RotatedShapeLevelPrototype;
	levels: number;
	sides: number;
	baseRadius?: number;
	levelOffset: LevelOffset;
	height?: number;
};

export type FacetTab = FullTab | TrapTab;
type TabFootprint = { triangle: Triangle; freeVertex: 'a' | 'b' | 'c' };

export type FullTab = {
	style: 'full';
	footprint: TabFootprint;
	outer: { a: Vector3; b: Vector3; c: Vector3 };
	scored?: { a: Vector3; b: Vector3 };
};
export type TrapTab = {
	style: 'trapezoid';
	footprint: TabFootprint;
	outer: { a: Vector3; b: Vector3; c: Vector3; d: Vector3 };
	scored?: { a: Vector3; b: Vector3 };
};

export type Facet = {
	triangle: Triangle;
	tab?: FacetTab;
};

type BandOrientation = -1 | 0 | 1;

export type Band = {
	facets: Facet[];
	orientation: BandOrientation;
	endTab?: FacetTab;
};

export const isBezierCurveConfig = (curve: BezierConfig | PointConfig): curve is BezierConfig =>
	Object.hasOwn(curve, 'p0') &&
	Object.hasOwn(curve, 'p1') &&
	Object.hasOwn(curve, 'p2') &&
	Object.hasOwn(curve, 'p3') &&
	curve.type === 'BezierConfig';

export type BezierConfig = {
	[key: string]: PointConfig[] | string;
	type: 'BezierConfig';
	points: [PointConfig, PointConfig, PointConfig, PointConfig];
};

export type PointConfig = {
	type: 'PointConfig';
	x: number;
	y: number;
	pointType?: 'smooth' | 'angled';
};

export type LineConfig = {
	type: 'LineConfig';
	points: [PointConfig, PointConfig];
};

export type ZCurveConfig = {
	type: 'ZCurveConfig';
	curves: BezierConfig[];
};

export const generateZCurve = (config: ZCurveConfig): CurvePath<Vector2> => {
	const zCurve = new CurvePath<Vector2>();
	for (const curve of config.curves) {
		if (curve.type === 'BezierConfig') {
			zCurve.add(
				new CubicBezierCurve(
					new Vector2(curve.points[0].x, curve.points[0].y),
					new Vector2(curve.points[1].x, curve.points[1].y),
					new Vector2(curve.points[2].x, curve.points[2].y),
					new Vector2(curve.points[3].x, curve.points[3].y)
				)
			);
		}
	}
	return zCurve;
};

// utility function to generate a regular polygon of type RotatedShapeLevelPrototype
export const generateRegularPolygonLevel = (
	sides: number,
	radius: number
): RotatedShapeLevelPrototype => {
	const output: RotatedShapeLevelPrototype = {
		center: new Vector2(0, 0),
		vertices: []
	};
	const a = (Math.PI * 2) / sides;

	for (let i = 0; i < sides; i++) {
		output.vertices.push(new Vector2(radius * Math.cos(a * i), radius * Math.sin(a * i)));
	}
	return output;
};

export type RadialShapeLevelPrototypeConfig = RadialShapeConfig & { divisions: number };

export type RadialShapeConfig = {
	type: 'RadialShapeConfig';
	symmetry: 'asymmetric' | 'radial' | 'lateral' | 'radial-lateral';
	symmetryNumber: number;
	curves: BezierConfig[];
};

const validateRadialShapeConfig = (config: RadialShapeConfig): Validation => {
	const validation: Validation = { isValid: true, msg: [] };
	console.debug('radialShapeConfig validation stub', config);
	// if "asymmetric" or "lateral" symmetryNumber === 1

	// if "radial", angle = Math.PI * 2 / symmetryNumber
	// else if "radial-lateral", angle = Math.PI / symmetryNumber

	// if asymmetric, start === end
	// for a radial shape, start and end points have the following requirements:
	//  start is colinear with Vector2(1, 0)
	//  if "lateral" end is colinear with Vector2(1, 0)
	//  if "radial" end === start.applyAngle(angle)
	//  if "radial-lateral", end is colinear with Vector2(1, 0).applyAngle(angle)

	return validation;
};

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
	console.debug('rotated vectors', vectors, (angle * index * 180) / Math.PI);
	return new LineCurve(v0, v1);
};

const generateRadialShape = (config: RadialShapeConfig): CurvePath<Vector2> => {
	const validation = validateRadialShapeConfig(config);
	if (!validation.isValid) throw new Error(validation.msg.join('\n'));

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
	shapeConfig: RadialShapeConfig,
	maxLength = 1
): RadialShapeConfig => {
	const lengths: number[] = [];
	console.debug('shapeConfig', shapeConfig);
	shapeConfig.curves.forEach((curve) =>
		curve.points.forEach((point) => {
			const length = Math.sqrt(Math.pow(point.x, 2) + Math.pow(point.y, 2));
			lengths.push(length);
		})
	);
	const ratio = maxLength / Math.max(...lengths);

	shapeConfig.curves = shapeConfig.curves.map((curve: BezierConfig) => {
		const points: [PointConfig, PointConfig, PointConfig, PointConfig] = curve.points.map((point) => {
			point.x = point.x * ratio;
			point.y = point.y * ratio;
			return point;
    }) as [PointConfig, PointConfig, PointConfig, PointConfig];
    curve.points = points
		return curve;
	});

	console.debug('normalized', shapeConfig);
	return shapeConfig;
};

export const generateRadialShapeLevelPrototype = (
	config: RadialShapeLevelPrototypeConfig
): RotatedShapeLevelPrototype => {
	const { divisions, ...shapeConfig } = config;

	const shape = generateRadialShape(normalizeConfigPoints(shapeConfig, 1));

	const points: Vector2[] = [];
	shape.curves.forEach((curve) => {
		points.push(...curve.getPoints(divisions).slice(1));
	});

	return {
		center: new Vector2(0, 0),
		vertices: points // these points include duplicates where a curve starts at the same place another ends
	};
};

export type Validation = {
	isValid: boolean;
	msg: string[];
};

const validateLevelSetConfig = (config: LevelSetConfig): Validation => {
	const validation: Validation = { isValid: true, msg: [] };
	if (config.zCurveSampleMethod === 'arcLength') {
		if (Array.isArray(config.levelOffset) || config.levelOffset.z !== 0) {
			validation.isValid = validation.isValid && false;
			validation.msg.push(
				'sampling zCurve by arc divisions, level z offsets should not be directly configured'
			);
		}
	}
	return validation;
};

const isLevelOffset = (levelOffset: LevelOffset | LevelOffset[]): levelOffset is LevelOffset =>
	!Array.isArray(levelOffset);

const generateLevelSet = (
	levelConfig: LevelSetConfig,
	zCurveConfig: ZCurveConfig
): RotatedShapeLevel[] => {
	const validation = validateLevelSetConfig(levelConfig);
	if (!validation.isValid) {
		throw new Error(validation.msg.join('\n'));
	}

	// scale z-curve to height and baseRadius
	const zCurve = generateZCurve(zCurveConfig);
	const levelOffsets: LevelOffset[] = new Array(levelConfig.levels);

	// generate offsets from config
	if (levelConfig.zCurveSampleMethod === 'arcLength') {
		const zCurveRawPoints = zCurve.getSpacedPoints(levelConfig.levels - 1);

		const configLevelOffset: LevelOffset = isLevelOffset(levelConfig.levelOffset)
			? levelConfig.levelOffset
			: levelConfig.levelOffset[0];
		if (isLevelOffset(levelConfig.levelOffset)) {
			zCurveRawPoints.forEach((zCurveLevel, l) => {
				levelOffsets[l] = { ...configLevelOffset };
				const { x, y, rotX, rotY, rotZ, scaleX, scaleY } = configLevelOffset;
				levelOffsets[l].x = x * l;
				levelOffsets[l].y = y * l;
				levelOffsets[l].z = zCurveLevel.y;
				levelOffsets[l].rotX = rotX * l;
				levelOffsets[l].rotY = rotY * l;
				levelOffsets[l].rotZ = rotZ * l;
				levelOffsets[l].scaleX = scaleX * zCurveLevel.x; //* zCurveScale.x
				levelOffsets[l].scaleY = scaleY * zCurveLevel.x; //* zCurveScale.x
			});
		}
	}
	const levels: RotatedShapeLevel[] = new Array(levelConfig.levels);
	levelOffsets.forEach((levelOffset, l) => {
		// console.debug("generate a level", levelOffset.scaleX, levelOffset.scaleY, levelConfig.levelPrototype.vertices)
		levels[l] = generateLevel(levelOffset, levelConfig.levelPrototype, l);
	});

	return levels;
};

const generateLevel = (
	offset: LevelOffset,
	prototype: RotatedShapeLevelPrototype,
	levelNumber: number
): RotatedShapeLevel => {
	// apply offsets to prototype
	// axes for rotation
	const zAxis = new Vector3(0, 0, 1);
	const xAxis = new Vector3(1, 0, 0);
	const yAxis = new Vector3(0, 1, 0);
	// center for coordinate offset
	const center = new Vector3(offset.x, offset.y, offset.z);
	const vertices = prototype.vertices.map((pV) => {
		const scaledVertex: Vector3 = new Vector3(pV.x, pV.y, 0);
		// check this
		scaledVertex.setLength(
			Math.sqrt(Math.pow(offset.scaleX * pV.x, 2) + Math.pow(offset.scaleY * pV.y, 2))
		);
		scaledVertex.applyAxisAngle(zAxis, offset.rotZ); // z axis rotation must be first
		scaledVertex.applyAxisAngle(xAxis, offset.rotX);
		scaledVertex.applyAxisAngle(yAxis, offset.rotY);
		scaledVertex.addScaledVector(center, 1);
		return scaledVertex;
	});
	const level: RotatedShapeLevel = {
		center,
		level: levelNumber,
		vertices
	};
	return level;
};

const validateBandConfig = (config: BandSetConfig, levels: RotatedShapeLevel[]): Validation => {
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

const generateBandSet = (config: BandSetConfig, levels: RotatedShapeLevel[]): Band[] => {
	const circumferenceBands = generateCircumferenceBands(config, levels);
	if (config.bandStyle.startsWith('helical')) {
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
		if (helicalBands[b].orientation === 1) {
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

const getBandOrientation = (bandStyle: BandStyle): BandOrientation => {
	if (bandStyle === 'helical-left') return -1;
	if (bandStyle === 'helical-right') return 1;
	return 0;
};

const getBandStyle = (bandOrientation: BandOrientation): BandStyle => {
	if (bandOrientation === -1) return 'helical-left';
	if (bandOrientation === 1) return 'helical-right';
	return 'circumference';
};

const generateCircumferenceBands = (config: BandSetConfig, levels: RotatedShapeLevel[]): Band[] => {
	const validation = validateBandConfig(config, levels);
	if (!validation.isValid) {
		throw new Error(validation.msg.join('\n'));
	}
	const bands: Band[] = [];

	for (let i = 0; i < levels.length - 1; i++) {
		const band: Band = {
			orientation: getBandOrientation(config.bandStyle),
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

const generateTabs = (bands: Band[], config: Omit<BandSetConfig, 'levels'>) => {

	const getFreeVertex = (orientation: BandOrientation): 'a' | 'b' | 'c' => {
		if (orientation === -1) return 'a';
		if (orientation === 1) return 'b';
		return 'c';
	};
	if (config.tabStyle) {
		const tabbedBands: Band[] = bands.map((band, b) => {
			return {
				...band,
				facets: band.facets.map((facet, f) => {
					if (config.tabStyle.style === 'full') {
						if (config.tabStyle.direction === 1 && f % 2 === 1) {
							const modelForTab: Facet =
								bands[(b + config.tabStyle.direction) % bands.length].facets[
									f + (f % 2 === 0 ? 1 : -1)
								];
							const tab: FullTab = {
								style: "full",
								footprint: {
									triangle: modelForTab.triangle,
									freeVertex: getFreeVertex(band.orientation)
								},
								outer: {
									a: modelForTab.triangle.a.clone(),
									b: modelForTab.triangle.b.clone(),
									c: modelForTab.triangle.c.clone()
								}
							};
							return { ...facet, tab };
						}
					} else if (config.tabStyle.style === 'trapezoid') {
						if (config.tabStyle.direction === 1 && f % 2 === 1) {
							const modelForTab: Facet =
								bands[(b + config.tabStyle.direction) % bands.length].facets[
									f + (f % 2 === 0 ? 1 : -1)
								];
							const reverseEdgeConfig = generateEdgeConfig(
								getBandStyle(bands[0].orientation),
								f % 2 === 1,
								true
							);
							const tab: TrapTab | undefined = generateTrapTab(
								config.tabStyle,
								modelForTab.triangle,
								{ lead: reverseEdgeConfig.lead, follow: reverseEdgeConfig.follow }
							);
							return { ...facet, tab };
						}
					}
					return facet;
				})
			};
		});
		console.debug('generateTabs tabbedBands', tabbedBands);
		return tabbedBands;
	}

	return bands;
};

export type TabConfig = {
	lead: TrianglePoint;
	follow: TrianglePoint;
};

const getFreeVertex = (constrained1: TrianglePoint, constrained2: TrianglePoint): TrianglePoint => {
	const points: [TrianglePoint, TrianglePoint, TrianglePoint] = ['a', 'b', 'c'];
	if (constrained1 === constrained2)
		throw new Error(`Parameter points are the same [${constrained1}, ${constrained2}]`);
	const free = points.find((p) => p !== constrained1 && p !== constrained2);
	if (free) return free;
	else throw new Error(`No free point found given [${constrained1}, ${constrained2}]`);
};

type TabWidth = { style: 'fixed'; value: number } | { style: 'fraction'; value: number };

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
		console.debug('triangle', triangle);
		console.debug('linevector length', lineVector.length(), lineVector);
		console.debug('width', width);
		length = Math.min(width.value / Math.sin(angle), lineVector.length());
	}
	const point = triangle[pivot].clone().addScaledVector(lineVector.clone().setLength(length), 1);
	return point;
};

const triangleSide = (triangle: Triangle, start: TrianglePoint, end: TrianglePoint): Vector3 => {
	if (start === end) throw new Error('same points specified');
	return triangle[end].clone().addScaledVector(triangle[start], -1);
};

export const generateFullTab = (tabStyle: TabStyle, footprint: Triangle, tabConfig: TabConfig): FullTab => {
	const {a, b, c} = footprint
  const fullTab: FullTab = {
    style: "full",
		footprint: {
			triangle: footprint,
			freeVertex: getFreeVertex(tabConfig.follow, tabConfig.lead)
		},
		outer: { a, b, c}
  }
	return fullTab
};

export const generateTrapTab = (
	tabStyle: TabStyle,
	footprint: Triangle,
	config: TabConfig
): TrapTab | undefined => {
	if (tabStyle.style === 'full') return undefined;
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
			freeVertex: getFreeVertex(config.lead, config.follow)
		},
		outer: { a, b, c, d },
		scored: getScored()
	};
	return tab;
};

export type BandStyle = 'circumference' | 'helical-left' | 'helical-right';
type TabScore = 0.5 | 0.75 | 0.9;
export type TabStyle =
	| { style: 'full'; direction: -1 | 1; scored?: TabScore } // for circumference bands, left and right are relative to rotation direction
	| { style: 'trapezoid'; direction: -1 | 1; width: TabWidth; inset?: number; scored?: TabScore };

export type BandSetConfig = {
	bandStyle: BandStyle;
	tabStyle: TabStyle;
};

export type RenderRange =
	| { rangeStyle: 'filter'; filterFunction: (args: unknown) => boolean }
	| {
			rangeStyle: 'slice';
			bandStart: number;
			bandCount?: number;
			facetStart: number;
			facetCount?: number;
	  };

export type RenderConfig = {
	bandRange?: RenderRange;
	show?: {
		[key: string]: boolean;
		tabs: boolean;
		levels: boolean;
		bands: boolean;
		patterns: boolean;
		edges: boolean;
	};
};

export const getRenderable = (config: RenderConfig, bands: Band[]): Band[] => {
	if (config.bandRange?.rangeStyle === 'slice') {
		const { bandStart, bandCount, facetStart, facetCount } = config.bandRange;
		return bands.slice(bandStart, bandCount ? bandStart + bandCount : bands.length).map((band) => ({
			...band,
			facets: band.facets.slice(
				facetStart,
				facetCount ? facetStart + facetCount : band.facets.length
			)
		}));
	}
	return bands;
};

export type RotatedShapeGeometryConfig = {
	levelConfig: LevelSetConfig;
	zCurveConfig: ZCurveConfig;
	bandConfig: BandSetConfig;
};

const defaultBandConfig: Omit<BandSetConfig, 'levels'> = {
	bandStyle: 'helical-right',
	tabStyle: { style: 'full', direction: 1 }
};

export const generateRotatedShapeGeometry = (
	config: RotatedShapeGeometryConfig
): { levels: RotatedShapeLevel[]; bands: Band[] } => {
	console.debug('generateRotatedShapeGeometry config:', config);
	const levels = generateLevelSet(config.levelConfig, config.zCurveConfig);
	const unTabbedBands = generateBandSet({ ...(config.bandConfig || defaultBandConfig) }, levels);
	// console.debug("----  unTabbedBands", unTabbedBands)
	const bands = !config.bandConfig?.tabStyle
		? unTabbedBands
		: generateTabs(unTabbedBands, config.bandConfig);
	// console.debug("tabbed bands[0]", bands[0].facets.map((f) => ({triangle: f.triangle, tabtriangle: f.tab?.footprint.triangle, freeVertex: f.tab?.footprint.freeVertex})))
	return { levels, bands };
};


// Refactor the data pipeline:
// 	1) levels
//	2) 3d bands, 3d struts, 3d tabs
//	3) flattened bands, flattened struts, flattened tabs
//	4) flattened geometry -> cut patterns
