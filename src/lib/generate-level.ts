import { Vector3, CurvePath, Vector2 } from 'three';
import {
	type LevelConfig,
	type SilhouetteConfig,
	type DepthCurveConfig,
	type Level,
	generateSilhouette,
	type LevelPrototype,
	generateDepthCurve,
	type CurveSampleMethod,
	type LevelOffset,
	type ShadesConfig,
	generateLevelPrototype
} from './generate-shape';

/* 
	What's the approach here?

  1) genererate a level prototype for each level
  2) apply depth and silhouette curves to each level



*/

// TODO - bring the call to generateLevelPrototype into this function

//
export const generateLevelSet2 = (
	levelConfig: LevelConfig,
	silhouetteConfig: SilhouetteConfig,
	depthCurveConfig: DepthCurveConfig,
	levelPrototype: LevelPrototype | LevelPrototype[]
): Level[] => {
	console.debug(
		'generateLevelSet2',
		levelConfig,
		silhouetteConfig,
		depthCurveConfig,
		levelPrototype
	);
	const levelCount = countLevels(levelConfig, silhouetteConfig);
	const levelPrototypes: LevelPrototype[] = getLevelPrototypeArray(levelCount, levelPrototype);
	const depthCurve: CurvePath<Vector2> = generateDepthCurve(depthCurveConfig);
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
	console.debug('  levelOffsets', levelOffsets);

	const levels = rawLevels.map((rl, i): Level => {
		const offset = levelOffsets[i];
		return applyOffsetToLevel(offset, rl, i);
	});
	console.debug('  levels', levels);
	return levels;
};

const applyOffsetToLevel = (
	offset: LevelOffset,
	rawLevel: Level,
	levelNumber: number
	// prototype: LevelPrototype,
	// levelNumber: number
): Level => {
	// apply offsets to prototype
	// axes for rotation
	const zAxis = new Vector3(0, 0, 1);
	const xAxis = new Vector3(1, 0, 0);
	const yAxis = new Vector3(0, 1, 0);
	// center for coordinate offset
	// const center = new Vector3(offset.x, offset.y, offset.z);

	// const radialVertices = prototype.vertices.map((p) => getPolar(p.x, p.y));
	const minLength = Math.min(...rawLevel.vertices.map((v) => v.length()));
	const depthedVertices = rawLevel.vertices.map((v) => {
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
		scaledVertex.addScaledVector(rawLevel.center, 1);
		return scaledVertex;
	});
	const level: Level = {
		center: rawLevel.center,
		level: levelNumber,
		vertices
	};
	return level;
};

// const getSilhouetteAspectRatio = ({
// 	silhouette,
// 	v0,
// 	vPrev,
// 	vNext
// }: {
// 	silhouette: CurvePath<Vector2>;
// 	v0: [Vector2, Vector2];
// 	vPrev: [Vector2, Vector2];
// 	vNext: [Vector2, Vector2];
// }) => {};

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
	console.debug('generateRawLevels', silhouette, depthCurve, levelPrototypes, sampleMethod);
	const fractionalDivisions: number[] = [];
	const spacing = 1 / sampleMethod.divisions;
	for (let i = 0; i < sampleMethod.divisions + 1; i++) {
		if (i === sampleMethod.divisions) {
			fractionalDivisions.push(1);
		} else {
			fractionalDivisions.push(i * spacing);
		}
	}
	console.debug('fractional divisions', fractionalDivisions);

	let rawCurvePoints;
	if (sampleMethod.method === 'divideCurvePath') {
		// rawCurvePoints = silhouette.getSpacedPoints(sampleMethod.divisions);
		rawCurvePoints = fractionalDivisions.map((div) => {
			return silhouette.getPointAt(div);
		});
	} else {
		// if (sampleMethod.method === 'divideCurve') {
		rawCurvePoints = fractionalDivisions.map((div) => {
			return silhouette.getPoint(div);
		});
	}
	const rawLevels = rawCurvePoints.map((point, i) => {
		const depth =
			sampleMethod.method === 'divideCurvePath'
				? depthCurve.getPointAt(fractionalDivisions[i]).x / 10
				: depthCurve.getPoint(fractionalDivisions[i]).x / 10;

		const offset: LevelOffset = {
			x: 0,
			y: 0,
			z: point.y,
			rotX: 0,
			rotY: 0,
			rotZ: 0,
			scaleX: point.x * 2,
			scaleY: point.x * 2,
			depth
		};
		return generateLevel(offset, levelPrototypes[i % levelPrototypes.length], i);
	});
	console.debug('rawLevels', rawLevels);
	return rawLevels;
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
		? silhouetteConfig.curves.length * levelConfig.silhouetteSampleMethod.divisions + 1
		: levelConfig.silhouetteSampleMethod.divisions + 1;
};

const getLevelOffsets = (levelConfig: LevelConfig, levelCount: number) => {
	console.debug('getLevelOffsets', levelConfig, levelCount);
	const configLevelOffset: LevelOffset = isLevelOffset(levelConfig.levelOffset)
		? levelConfig.levelOffset
		: levelConfig.levelOffset[0];
	const levelOffsets: LevelOffset[] = new Array(levelCount);

	if (isLevelOffset(levelConfig.levelOffset)) {
		for (let l = 0; l < levelOffsets.length; l++) {
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
		}
	}
	console.debug('   levelOffsets', levelOffsets);
	return levelOffsets;
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

export const getLevelLines = (
	// { points, normals }: { points: Vector2[]; normals: Vector2[] },
	{ levelConfig, shapeConfig }: ShadesConfig
) => {
	console.debug('GET LEVEL LINES --------------');
	const levelPrototype = generateLevelPrototype(shapeConfig, levelConfig);

	if (!Array.isArray(levelPrototype)) {
		console.debug('Level prototype for getLevelLines', levelPrototype);
		// let intersection0, intersection1;
		// for (let i = 0; i < levelPrototype.vertices.length; i++) {
		// 	const v0 = levelPrototype.vertices[i];
		// 	const v1 = levelPrototype.vertices[(i + 1) % levelPrototype.vertices.length];
		// }
	}
};

export const getCurvePoints = (curveConfig: SilhouetteConfig, { divisions }: CurveSampleMethod) => {
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

// const getDepthValues2 = (
// 	config: DepthCurveConfig,
// 	levelCenters: Vector3[],
// 	levelCount: number
// ): number[] => {
// 	const dCurve = new CurvePath<Vector2>();
// 	for (const curve of config.curves) {
// 		if (curve.type === 'BezierConfig') {
// 			dCurve.add(
// 				new CubicBezierCurve(
// 					new Vector2(curve.points[0].x, curve.points[0].y),
// 					new Vector2(curve.points[1].x, curve.points[1].y),
// 					new Vector2(curve.points[2].x, curve.points[2].y),
// 					new Vector2(curve.points[3].x, curve.points[3].y)
// 				)
// 			);
// 		}
// 	}
// 	const points = dCurve.getSpacedPoints(levelCount - 1);
// 	// dCurve.getPoints(levelCount - 1);
// 	const values = points.map((point) => point.x / config.depthCurveBaseline);
// 	return values;
// };

const isLevelOffset = (levelOffset: LevelOffset | LevelOffset[]): levelOffset is LevelOffset =>
	!Array.isArray(levelOffset);
