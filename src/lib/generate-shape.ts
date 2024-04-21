import { CurvePath, Vector2, Vector3, CubicBezierCurve, Triangle, LineCurve } from 'three';
import type {
	TrianglePoint,
	TriangleSide,
	EdgeConfig,
	CutoutConfig,
	PatternConfig,
	PatternViewConfig
} from './cut-pattern/cut-pattern.types';
import { generateEdgeConfig } from './cut-pattern/cut-pattern';
import type { TiledPatternConfig } from './shades-config';
import { getIntersectionOfLines, type Quadrilateral } from './patterns/quadrilateral';
import { end_hydrating } from 'svelte/internal';
// import { rad } from "$lib/util"

// Rotated Shape Levels are 2d.  How can I enforce that?

export type Level = {
	center: Vector3;
	level: number;
	vertices: Vector3[];
};

type LevelPrototype = {
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
	depth: number;
};

export type LevelConfig = {
	// silhouetteConfig: SilhouetteConfig,
	type: 'LevelConfig';
	silhouetteSampleMethod: CurveSampleMethod;
	levelPrototypeSampleMethod: { byDivisions: 'whole' | 'offsetHalf'; dividePer: 'shape' | 'curve' };
	levels?: number;
	baseRadius?: number;
	levelOffset: LevelOffset;
	height?: number;
};

export type FacetTab = FullTab | TrapTab | MultiFacetFullTab | MultiFacetTrapTab;

type TabFootprint = { triangle: Triangle; free: 'a' | 'b' | 'c' };
type TabFootprintInvert = { triangle: Triangle; free: 'ab' | 'ac' | 'bc' };

export type FullTab = {
	style: 'full';
	footprint: TabFootprint;
	direction: TabDirection;
	outer: { a: Vector3; b: Vector3; c: Vector3 };
	scored?: { a: Vector3; b: Vector3 };
};
export type TrapTab = {
	style: 'trapezoid';
	footprint: TabFootprint;
	direction: TabDirection;
	outer: { a: Vector3; b: Vector3; c: Vector3; d: Vector3 };
	scored?: { a: Vector3; b: Vector3 };
};

export type MultiFacetFullTab = {
	style: 'multi-facet-full';
	footprint: [TabFootprint, TabFootprintInvert];
	direction: TabDirection;
	outer: { a: Vector3; b: Vector3; c: Vector3; d: Vector3 };
	scored?: { a: Vector3; b: Vector3 };
};

export type MultiFacetTrapTab = {
	style: 'multi-facet-trapezoid';
	footprint: [TabFootprint, TabFootprintInvert];
	direction: TabDirection;
	outer: { a: Vector3; b: Vector3; c: Vector3; d: Vector3 };
	scored?: { a: Vector3; b: Vector3 };
	width: number;
	inset?: number;
};

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

// TODO - remove all FacetTab[] = a facet can only have a single attached tab
export type Facet = {
	triangle: Triangle;
	tab?: FacetTab; // | FacetTab[];
};

type BandOrientation = -1 | 0 | 1;

export type Band = {
	facets: Facet[];
	orientation: BandOrientation;
	endTab?: FacetTab;
};

export const isBezierCurveConfig = (curve: BezierConfig | PointConfig2): curve is BezierConfig =>
	Object.hasOwn(curve, 'p0') &&
	Object.hasOwn(curve, 'p1') &&
	Object.hasOwn(curve, 'p2') &&
	Object.hasOwn(curve, 'p3') &&
	curve.type === 'BezierConfig';

export type BezierConfig = {
	[key: string]: PointConfig2[] | string;
	type: 'BezierConfig';
	points: [PointConfig2, PointConfig2, PointConfig2, PointConfig2];
};

export type PointConfig2 = {
	type: 'PointConfig2';
	x: number;
	y: number;
	pointType?: 'smooth' | 'angled';
};

export type PointConfig3 = {
	type: 'PointConfig2';
	x: number;
	y: number;
	z: number;
	pointType?: 'smooth' | 'angled';
};

export type LineConfig = {
	type: 'LineConfig';
	points: [PointConfig2, PointConfig2];
};

export type CurveConfig = SilhouetteConfig | ShapeConfig | DepthCurveConfig | SpineCurveConfig;

export type SilhouetteConfig = {
	type: 'SilhouetteConfig';
	curves: BezierConfig[];
};

export type DepthCurveConfig = {
	type: 'DepthCurveConfig';
	depthCurveBaseline: number;
	curves: BezierConfig[];
};

export type SpineCurveConfig = {
	type: 'SpineCurveConfig';
	curves: BezierConfig[];
};

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

const getDepthCurve = (config: DepthCurveConfig): CurvePath<Vector2> => {
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
const getDepthValues = (config: DepthCurveConfig, levelCount: number): number[] => {
	const dCurve = getDepthCurve(config);
	const points = dCurve.getSpacedPoints(levelCount - 1);
	// dCurve.getPoints(levelCount - 1);
	const values = points.map((point) => point.x / config.depthCurveBaseline);
	return values;
};
const getDepthValues2 = (
	config: DepthCurveConfig,
	levelCenters: Vector3[],
	levelCount: number
): number[] => {
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
	const points = dCurve.getSpacedPoints(levelCount - 1);
	// dCurve.getPoints(levelCount - 1);
	const values = points.map((point) => point.x / config.depthCurveBaseline);
	return values;
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

export type CurveSampleMethod =
	| { method: 'divideCurvePath'; divisions: number }
	| { method: 'divideCurve'; divisions: number }
	| { method: 'preserveAspectRatio'; divisions: number };

export type ShapeConfig = {
	type: 'ShapeConfig';
	// divisions: number;
	sampleMethod: CurveSampleMethod;
	symmetry: 'asymmetric' | 'radial' | 'lateral' | 'radial-lateral';
	symmetryNumber: number;
	curves: BezierConfig[];
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

const generateLevelPrototype = (
	config: ShapeConfig,
	levelConfig: LevelConfig
): LevelPrototype | LevelPrototype[] => {
	if (levelConfig.levelPrototypeSampleMethod.byDivisions === 'offsetHalf') {
		return [
			generateRadialShapeLevelPrototype(config, levelConfig, 0),
			generateRadialShapeLevelPrototype(config, levelConfig, 1)
		];
	}
	return generateRadialShapeLevelPrototype(config, levelConfig, 0);
};

const generateRadialShapeLevelPrototype = (
	config: ShapeConfig,
	levelConfig: LevelConfig,
	levelNumber: number
): LevelPrototype => {
	const shape = generateRadialShape(normalizeConfigPoints(config, { normalizationRatio: 1 / 200 }));
	const points: Vector2[] = [];

	const { byDivisions } = levelConfig.levelPrototypeSampleMethod;
	const { sampleMethod } = config;
	if (sampleMethod.method === 'divideCurve') {
		// const {divisions} = sampleMethod
		if (byDivisions === 'whole') {
			shape.curves.forEach((curve) => {
				points.push(...curve.getPoints(sampleMethod.divisions).slice(1)); // removes first point from each curve to avoid dupes
			});
		} else if (byDivisions === 'offsetHalf') {
			shape.curves.forEach((curve) => {
				const curvePoints = curve.getPoints(sampleMethod.divisions * 2 - 1);
				const halfPoints = curvePoints.filter((point, i) => i % 2 === levelNumber % 2);
				const recombined = halfPoints;
				points.push(...recombined);
			});
		}
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

export type Validation = {
	isValid: boolean;
	msg: string[];
};

// const validateLevelConfig = (config: LevelConfig): Validation => {
// 	const validation: Validation = { isValid: true, msg: [] };
// 	if (config.silhouetteSampleMethod === 'levelInterval') {
// 		if (Array.isArray(config.levelOffset) || config.levelOffset.z !== 0) {
// 			validation.isValid = validation.isValid && false;
// 			validation.msg.push(
// 				'sampling silhouette by arc divisions, level z offsets should not be directly configured'
// 			);
// 		}
// 	}
// 	return validation;
// };

const isLevelOffset = (levelOffset: LevelOffset | LevelOffset[]): levelOffset is LevelOffset =>
	!Array.isArray(levelOffset);

export const getCurvePoints = (
	curveConfig: SilhouetteConfig,
	{ divisions, method }: CurveSampleMethod
) => {
	const curve = generateSilhouette(curveConfig);
	// const pointCount = method === 'divideCurve' ? curveConfig.curves.length * divisions : divisions;
	const result: { points: Vector2[]; tangents: Vector2[]; normals: Vector2[] } = {
		points: curve.getSpacedPoints(divisions),
		tangents: [],
		normals: []
	};

	result.tangents = result.points.map((point, i) => curve.getTangentAt((i * 1) / divisions));
	result.normals = result.tangents.map((tangent) => new Vector2(tangent.y, -tangent.x));

	console.debug('getCurvepoints', result);
	return result;
};

export const getLevelLines = (
	{ points, normals }: { points: Vector2[]; normals: Vector2[] },
	{ levelConfig, shapeConfig }: ShadesConfig
) => {
	console.debug('GET LEVEL LINES --------------');
	const levelPrototype = generateLevelPrototype(shapeConfig, levelConfig);

	if (!Array.isArray(levelPrototype)) {
		console.debug('Level prototype for getLevelLines', levelPrototype);
		let intersection0, intersection1;
		for (let i = 0; i < levelPrototype.vertices.length; i++) {
			const v0 = levelPrototype.vertices[i];
			const v1 = levelPrototype.vertices[(i + 1) % levelPrototype.vertices.length];
			getIntersectionOfLines;
		}
	}
};

// TODO -
// 	extract z-curve points into function
// 	add an additional method to z-curve point generation options
//  - constant aspect ratio
//    - config: {targetRatio: number, shapeAnchor: "min" | "max" | "mean" | number}
//    - algorithm:
//					divisions = divideCurveByRatio({targetRatio, etc})
//					redistribute = (1 - divisions[last].t) / (divisions.length - 1)
//					divisions = divisions.map(d => ({t: d.t + redistribute, aspectRatio: getActualRatio(getQuad(t, silhouette, shape))}))
//
//
//			divideCurveByRatio = (config): {t: number, aspectRatio: number}[] =>
//				while (sections<limit)
//					n = section number
//      		get base width (n)
//					h = base * targetRatio

//					get quad0
//					if (quad0.error) break
//					get actual ratio (quad)
//					h = targetRatio / actualRatio
//					get quad1
//					if (quad1.error) break
//					n ++
//					sections ++
//        end
//
/*	- algorithm
  			divide the z curve into a set number of divisions, not equally spaced, for each vertex of the level shape
				each z curve will have the same number of divisions, but the spacing will be determined by assessing the aspect ratio of the quadrilateral formed by
				
				v0_0 = scalarMultiplication(shape.vectors[0], silhouette.point[n].x)
				v0_1 = scalarMultiplication(shape.vectors[0], silhouette.point[n+1].x)
				v1_1 = scalarMultiplication(shape.vectors[1], silhouette.point[n+1].x)
				v1_0 = scalarMultiplication(shape.vectors[1], silhouette.point[n].x)

				w = getLength( midPoint(v0_0, v0_1), midPoint(v1_0, v1_1) )
				h = getLength( midPoint(v0_0, v1_0), midPoint(v0_1, v1_1) )
				aspectRatio = h / w

				So we're solving u values where: aspectRatio(u0, vCurve) === aspectRatio(u1, vCurve) === aspectRatio(u2, vCurve)
				Use an iterative approach
					first, step through evenly spaced divisions, getting aspect ratios, and the Average aspect ratio
					second, step through divisions and find the u value that yields the avg aspect ratio

				divisions
				avgU = curveLength / divisions
				
				for each division


		- algorithm
			- for each pair of vectors (v0, v1) of the level shape
			  - find the midpoint betwen the two (m)
			- for each midpoint
			  - find a u value along silhouette giving point (p)
				- p.y * v0 = p0
				- p.y * v1 = p1
	**		- the aspect ratio of the quadrilateral formed by l0_p0, l0_p1, l1_p0, l1_p1 shall be equal for every u value along silhouette 
					- do it iteratitively -
						- start with evenly spaced u values
						- loop
						  - calculate avg aspect ratio
							- recalculate u values, w each yielding avg aspect ratio.  calculate u_remainder.  evenly distribute remainder on all u_values
			- for level shape vector
				- assign a u value calculated as u = (u_next_mid + u_prev_mid) / 2
			- yield shape points, to be further transformed
			
			calculate an array of points along silhouette, 
			which yield an array of scalars that can multiply the shape vectors to give Shape points

			each silhouette point is calculated such that



*/

const getSilhouetteAspectRatio = ({
	silhouette,
	v0,
	vPrev,
	vNext
}: {
	silhouette: CurvePath<Vector2>;
	v0: [Vector2, Vector2];
	vPrev: [Vector2, Vector2];
	vNext: [Vector2, Vector2];
}) => {};

const generateRawLevels = ({
	silhouette,
	depthCurve,
	levelPrototypes,
	sampleMethod
}: {
	silhouette: CurvePath<Vector2>;
	depthCurve: CurvePath<Vector2>;
	levelPrototypes: LevelPrototype[];
	sampleMethod: CurveSampleMethod;
}): Level[] => {
	// For simple silhouette division schemes, we're unaffected by the depth and level prototype curves
	// For 'preserveaspectratio', use depth and prototype curves
	// Either way, we should be returning "raw levels"

	if (sampleMethod.method === 'divideCurvePath') {
		const rawCurvePoints = silhouette.getSpacedPoints(sampleMethod.divisions);
		const rawLevels = rawCurvePoints.map((point) => {
			const offset: LevelOffset = {
				x: 0,
				y: 0,
				z: point.y,
				rotX: 0,
				rotY: 0,
				rotZ: 0,
				scaleX: point.x * 2,
				scaleY: point.x * 2
			};
			generateLevel();
		});
	} else if (sampleMethod.method === 'divideCurve') {
		const rawCurvePoints = silhouette.getPoints(sampleMethod.divisions);
	}
};

const getLevelPrototypeArray = (
	levelCount: number,
	levelPrototype: LevelPrototype | LevelPrototype[]
): LevelPrototype[] => {
	let levelPrototypeArray: LevelPrototype[] = new Array(levelCount);
	if (Array.isArray(levelPrototype)) {
		levelPrototypeArray.fill(levelPrototype[0]);
		levelPrototypeArray = levelPrototypeArray.map((lp, i): LevelPrototype => {
			return {
				center: levelPrototype[i % levelPrototype.length].center.clone(),
				vertices: levelPrototype[i % levelPrototype.length].vertices.map((v) => v.clone())
			};
		});
	} else {
		levelPrototypeArray.fill(levelPrototype);
		levelPrototypeArray = levelPrototypeArray.map((lp) => ({
			center: lp.center.clone(),
			vertices: lp.vertices.map((v) => v.clone())
		}));
	}
	return levelPrototypeArray;
};

const countLevels = (levelConfig: LevelConfig, silhouetteConfig: SilhouetteConfig) => {
	return levelConfig.silhouetteSampleMethod.method === 'divideCurve'
		? silhouetteConfig.curves.length * levelConfig.silhouetteSampleMethod.divisions
		: levelConfig.silhouetteSampleMethod.divisions;
};

const getLevelOffsets = (levelConfig: LevelConfig, levelCount: number) => {
	const configLevelOffset: LevelOffset = isLevelOffset(levelConfig.levelOffset)
		? levelConfig.levelOffset
		: levelConfig.levelOffset[0];
	const levelOffsets: LevelOffset[] = new Array(levelCount);
	if (isLevelOffset(levelConfig.levelOffset)) {
		levelOffsets.map((silhouetteLevel, l) => {
			levelOffsets[l] = { ...configLevelOffset };
			const { x, y, rotX, rotY, rotZ, scaleX, scaleY } = configLevelOffset;
			levelOffsets[l].x = x * l;
			levelOffsets[l].y = y * l;
			levelOffsets[l].z = 1;
			levelOffsets[l].rotX = rotX * l;
			levelOffsets[l].rotY = rotY * l;
			levelOffsets[l].rotZ = rotZ * l;
			levelOffsets[l].scaleX = scaleX; //* silhouetteScale.x
			levelOffsets[l].scaleY = scaleY; //* silhouetteScale.x
			levelOffsets[l].depth = 1;
		});
	}
	return levelOffsets;
};

// TODO - bring the call to generateLevelPrototype into this function
const generateLevelSet2 = (
	levelConfig: LevelConfig,
	silhouetteConfig: SilhouetteConfig,
	depthCurveConfig: DepthCurveConfig,
	levelPrototype: LevelPrototype | LevelPrototype[]
): Level[] => {
	const levelCount = countLevels(levelConfig, silhouetteConfig);
	const levelPrototypes: LevelPrototype[] = getLevelPrototypeArray(levelCount, levelPrototype);
	const depthCurve: CurvePath<Vector2> = getDepthCurve(depthCurveConfig);
	// refactor depth values to align to z-axis values, as average of z-axis values of levels
	// const depthedLevelPrototypes =
	const silhouette: CurvePath<Vector2> = generateSilhouette(silhouetteConfig);
	// get levels without offsets by applying silhouette points to depthed level prototype vertices
	const rawLevels: Level[] = generateRawLevels({
		silhouette,
		depthCurve,
		levelPrototypes,
		sampleMethod: levelConfig.silhouetteSampleMethod
	});
	const levelOffsets = getLevelOffsets(levelConfig, levelCount);

	const levels = levelPrototype.map((prototype, i) =>
		generateLevel2({
			prototype,
			depth: depthValues[i],
			silhouettePoint: silhouettePoints[i],
			offset: levelOffsets[i]
		})
	);
	return levels;
};

const generateLevelSet = (
	levelConfig: LevelConfig,
	silhouetteConfig: SilhouetteConfig,
	depthCurveConfig: DepthCurveConfig,
	levelPrototype: LevelPrototype | LevelPrototype[]
): Level[] => {
	// const validation = validateLevelConfig(levelConfig);
	// if (!validation.isValid) {
	// 	throw new Error(validation.msg.join('\n'));
	// }
	const levelCount =
		levelConfig.silhouetteSampleMethod.method === 'divideCurve'
			? silhouetteConfig.curves.length * levelConfig.silhouetteSampleMethod.divisions
			: levelConfig.silhouetteSampleMethod.divisions;
	const levelOffsets: LevelOffset[] = new Array(levelCount);
	let levelPrototypeArray: LevelPrototype[];
	if (Array.isArray(levelPrototype)) {
		levelPrototypeArray = [...levelPrototype];
	} else {
		levelPrototypeArray = new Array(levelCount);
		levelPrototypeArray.fill(levelPrototype);
	}
	const depths = getDepthValues(depthCurveConfig, levelConfig.silhouetteSampleMethod.divisions + 1);

	// scale z-curve to height and baseRadius
	const silhouette = generateSilhouette(silhouetteConfig);
	console.debug('-------- silhouette\n  config: ', silhouetteConfig, '\n  silhouette', silhouette);

	// generate offsets from config
	const silhouetteRawPoints: Vector2[] = getSilhouetteRawPoints(
		silhouette,
		levelConfig.silhouetteSampleMethod
	);
	console.debug('--------------- silhouetteRawPoints', silhouetteRawPoints);
	const configLevelOffset: LevelOffset = isLevelOffset(levelConfig.levelOffset)
		? levelConfig.levelOffset
		: levelConfig.levelOffset[0];
	if (isLevelOffset(levelConfig.levelOffset)) {
		silhouetteRawPoints.forEach((silhouetteLevel, l) => {
			levelOffsets[l] = { ...configLevelOffset };
			const { x, y, rotX, rotY, rotZ, scaleX, scaleY } = configLevelOffset;
			levelOffsets[l].x = x * l;
			levelOffsets[l].y = y * l;
			levelOffsets[l].z = silhouetteLevel.y;
			levelOffsets[l].rotX = rotX * l;
			levelOffsets[l].rotY = rotY * l;
			levelOffsets[l].rotZ = rotZ * l;
			levelOffsets[l].scaleX = scaleX * silhouetteLevel.x * 2; //* silhouetteScale.x
			levelOffsets[l].scaleY = scaleY * silhouetteLevel.x * 2; //* silhouetteScale.x
			levelOffsets[l].depth = depths[l];
		});
	}
	const levels: Level[] = new Array(levelCount);
	levelOffsets.forEach((levelOffset, l) => {
		let thisLevelPrototype: LevelPrototype;
		if (Array.isArray(levelPrototype)) {
			thisLevelPrototype = levelPrototype[l % levelPrototype.length];
		} else {
			thisLevelPrototype = levelPrototype;
		}

		levels[l] = generateLevel(levelOffset, thisLevelPrototype, l);
	});

	return levels;
};

const generateLevel2 = (
	offset: LevelOffset,
	prototype: LevelPrototype,
	levelNumber: number
): Level => {
	// apply offsets to prototype
	// axes for rotation
	const zAxis = new Vector3(0, 0, 1);
	const xAxis = new Vector3(1, 0, 0);
	const yAxis = new Vector3(0, 1, 0);
	// center for coordinate offset
	const center = new Vector3(offset.x, offset.y, offset.z);

	// const radialVertices = prototype.vertices.map((p) => getPolar(p.x, p.y));
	const minLength = Math.min(...prototype.vertices.map((v) => v.length()));
	const depthedVertices = prototype.vertices.map((v) => {
		const length = v.length();
		return v.clone().setLength(minLength + (length - minLength) * offset.depth);
	});

	const vertices = depthedVertices.map((pV) => {
		const scaledVertex: Vector3 = new Vector3(pV.x, pV.y, 0);
		scaledVertex.setLength(
			Math.sqrt(Math.pow(offset.scaleX * pV.x, 2) + Math.pow(offset.scaleY * pV.y, 2))
		);
		scaledVertex.applyAxisAngle(zAxis, offset.rotZ); // z axis rotation must be first
		scaledVertex.applyAxisAngle(xAxis, offset.rotX);
		scaledVertex.applyAxisAngle(yAxis, offset.rotY);
		scaledVertex.addScaledVector(center, 1);
		return scaledVertex;
	});
	const level: Level = {
		center,
		level: levelNumber,
		vertices
	};
	return level;
};

const generateLevel = (
	offset: LevelOffset,
	prototype: LevelPrototype,
	levelNumber: number
): Level => {
	// apply offsets to prototype
	// axes for rotation
	const zAxis = new Vector3(0, 0, 1);
	const xAxis = new Vector3(1, 0, 0);
	const yAxis = new Vector3(0, 1, 0);
	// center for coordinate offset
	const center = new Vector3(offset.x, offset.y, offset.z);

	// const radialVertices = prototype.vertices.map((p) => getPolar(p.x, p.y));
	const minLength = Math.min(...prototype.vertices.map((v) => v.length()));
	const depthedVertices = prototype.vertices.map((v) => {
		const length = v.length();
		return v.clone().setLength(minLength + (length - minLength) * offset.depth);
	});

	const vertices = depthedVertices.map((pV) => {
		const scaledVertex: Vector3 = new Vector3(pV.x, pV.y, 0);
		scaledVertex.setLength(
			Math.sqrt(Math.pow(offset.scaleX * pV.x, 2) + Math.pow(offset.scaleY * pV.y, 2))
		);
		scaledVertex.applyAxisAngle(zAxis, offset.rotZ); // z axis rotation must be first
		scaledVertex.applyAxisAngle(xAxis, offset.rotX);
		scaledVertex.applyAxisAngle(yAxis, offset.rotY);
		scaledVertex.addScaledVector(center, 1);
		return scaledVertex;
	});
	const level: Level = {
		center,
		level: levelNumber,
		vertices
	};
	return level;
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

const generateBandSet = (config: ShadesConfig, levels: Level[]): Band[] => {
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

const generateCircumferenceBands = (config: ShadesConfig, levels: Level[]): Band[] => {
	const validation = validateBandConfig(config.bandConfig, levels);
	if (!validation.isValid) {
		throw new Error(validation.msg.join('\n'));
	}
	const bands: Band[] = [];

	for (let i = 0; i < levels.length - 1; i++) {
		const band: Band = {
			orientation: getBandOrientation(config.bandConfig.bandStyle),
			facets: []
		};
		if (config.levelConfig.levelPrototypeSampleMethod.byDivisions === 'whole') {
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
		} else if (config.levelConfig.levelPrototypeSampleMethod.byDivisions === 'offsetHalf') {
			levels[i].vertices.forEach((vertex, v, vertices) => {
				const triangle1 = new Triangle(
					vertices[(v + Math.floor(i / 2)) % vertices.length].clone(),
					vertices[(v + 1 + Math.floor(i / 2)) % vertices.length].clone(),
					levels[i + 1].vertices[(v + i - Math.floor(i / 2)) % vertices.length].clone()
				);
				const triangle2 = new Triangle(
					levels[i + 1].vertices[(v + 1 + Math.ceil(i / 2)) % vertices.length].clone(),
					triangle1.c.clone(),
					triangle1.b.clone()
				);
				band.facets.push({ triangle: triangle1 }, { triangle: triangle2 });
			});
		}
		bands.push(band);
	}
	return bands;
};

/////////////////////////////////////////
// Struts
/////////////////////////////////////////

export type Strut = {
	tiling: Tiling;
	orientation: StrutOrientation;
	radiate: RadiateOrientation;
	facets: Facet[];
};

export type StrutConfig = {
	type: 'StrutConfig';
	tiling: Tiling;
	orientation: StrutOrientation;
	radiate: RadiateOrientation;
	width: number;
};

type Tiling = BandStyle;
type StrutOrientation = 'inside' | 'outside' | 'half';
type RadiateOrientation = 'level' | 'orthogonal' | 'hybrid';

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

const getFreeSide = (constrained: TrianglePoint): TriangleSide => {
	return ['ab', 'ac', 'bc'].find((str) => !str.includes(constrained)) as TriangleSide;
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

export type BandStyle = 'circumference' | 'helical-left' | 'helical-right';
type TabScore = 0.5 | 0.75 | 0.9;
type StripSide = 'greater' | 'lesser';
type TabDirection = StripSide | 'both';
// TODO - add a direction setting which will result in tabs on both sides
export type TabStyle =
	| { style: 'none' }
	| { style: 'full'; direction: TabDirection; scored?: TabScore } // for circumference bands, left and right are relative to rotation direction
	| {
			style: 'trapezoid';
			direction: TabDirection;
			width: TabWidth;
			inset?: number;
			scored?: TabScore;
	  }
	| {
			style: 'multi-facet-full';
			direction: TabDirection;
			directionMulti: -1 | 1;
			footprint: 'strut' | 'band';
			scored?: TabScore;
	  }
	| {
			style: 'multi-facet-trapezoid';
			direction: TabDirection;
			directionMulti: -1 | 1;
			footprint: 'strut' | 'band';
			width: TabWidth;
			inset?: number;
			scored?: TabScore;
	  };

export type BandConfig = {
	type: 'BandConfig';
	bandStyle: BandStyle;
	offsetBy: -2 | -1 | 0 | 1 | 2;
	tabStyle: TabStyle;
};

export type RenderRange =
	| { rangeStyle: 'filter'; filterFunction: (args: unknown) => boolean }
	| {
			[key: string]: number | string | undefined;
			rangeStyle: 'slice';
			bandStart: number;
			bandCount?: number;
			facetStart: number;
			facetCount?: number;
			levelStart: number;
			levelCount?: number;
			strutStart: number;
			strutCount?: number;
	  };

export type RenderConfig = {
	type: 'RenderConfig';
	ranges: RenderRange;
	show: {
		[key: string]: boolean;
		tabs: boolean;
		levels: boolean;
		bands: boolean;
		patterns: boolean;
		edges: boolean;
	};
};

export type Strip = Band | Strut;

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
			count = isStrut(shapes[0]) ? strutCount : bandCount;
			return shapes.slice(start, count ? start + count : shapes.length).map((shape) => ({
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

export type ShadesConfig = {
	[key: string]:
		| ShapeConfig
		| LevelConfig
		| SilhouetteConfig
		| DepthCurveConfig
		| SpineCurveConfig
		| BandConfig
		| StrutConfig
		| RenderConfig
		| CutoutConfig
		| PatternConfig
		| PatternViewConfig
		| TiledPatternConfig
		| string
		| undefined;
	shapeConfig: ShapeConfig;
	levelConfig: LevelConfig;
	silhouetteConfig: SilhouetteConfig;
	depthCurveConfig: DepthCurveConfig;
	spineCurveConfig: SpineCurveConfig;
	bandConfig: BandConfig;
	strutConfig: StrutConfig;
	renderConfig: RenderConfig;
	cutoutConfig: CutoutConfig;
	patternConfig: PatternConfig;
	patternViewConfig: PatternViewConfig;
	tiledPatternConfig: TiledPatternConfig;

	id?: string;
	name?: string;
};

export const generateRotatedShapeGeometry = (
	config: ShadesConfig
): { levels: Level[]; bands: Band[]; struts: Strut[] } => {
	const rotatedShapePrototype: LevelPrototype | LevelPrototype[] = generateLevelPrototype(
		config.shapeConfig,
		config.levelConfig
	);
	const levels = generateLevelSet(
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
	// console.log('generateRotatedShapeGeometry - levels', levels, 'bands', bands, 'struts', struts);
	return { levels, bands, struts };
};

// Refactor the data pipeline:
// 	1) levels
//	2) 3d bands, 3d struts, 3d tabs
//	3) flattened bands, flattened struts, flattened tabs
//	4) flattened geometry -> cut patterns
