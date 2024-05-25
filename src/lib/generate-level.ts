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
	const levelCount = countLevels(levelConfig, silhouetteConfig);
	const levelPrototypes: LevelPrototype[] = getLevelPrototypeArray(levelCount, levelPrototype);
	const depthCurve: CurvePath<Vector2> = generateDepthCurve(depthCurveConfig);
	const silhouette: CurvePath<Vector2> = generateSilhouette(silhouetteConfig);
	// get levels without offsets by applying silhouette points to depthed level prototype vertices

	let rawLevels: Level[] = [];
	if (levelConfig.silhouetteSampleMethod.method === 'preserveAspectRatio') {
		rawLevels = generateRawLevelsConstantAspect({
			silhouette,
			depthCurve,
			levelPrototypes,
			sampleMethod: levelConfig.silhouetteSampleMethod
		});
	} else {
		rawLevels = generateRawLevels({
			silhouette,
			depthCurve,
			levelPrototypes,
			sampleMethod: levelConfig.silhouetteSampleMethod
		});
	}
	const levelOffsets = getLevelOffsets(levelConfig, levelCount);

	const levels = rawLevels.map((rl, i): Level => {
		const offset = levelOffsets[i];
		return applyOffsetToLevel(offset, rl, i);
	});
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

const generateRawLevelsConstantAspect = ({
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
	const meridians = new Array<Vector3[]>(levelPrototypes[0].vertices.length);
	const iterations = 10;
	const spacing = 1 / sampleMethod.divisions;
	const levelCount = sampleMethod.divisions + 1;
	let divisions = new Array(levelCount)
		.fill(0)
		.map((v, i) => (i === levelCount - 1 ? 1 : spacing * i));

	for (let iteration = 0; iteration < iterations; iteration++) {
		// console.debug(iteration, 'divisions', divisions);
		for (let vertexNumber = 0; vertexNumber < levelPrototypes[0].vertices.length; vertexNumber++) {
			const silhouettePoints: Vector2[] = [];
			meridians[vertexNumber] = [];
			for (let levelNumber = 0; levelNumber < levelCount; levelNumber++) {
				const division = divisions[levelNumber];
				const depthedLevelPrototype = getDepthedLevelPrototype(
					levelPrototypes[vertexNumber % levelPrototypes.length],
					depthCurve.getPointAt(division).x / 100
				);
				silhouettePoints.push(silhouette.getPointAt(division));
				meridians[vertexNumber].push(
					getMeridianPoint(division, silhouette, depthedLevelPrototype.vertices[vertexNumber])
				);
			}
		}
		const aspectRatios: number[][] = getAspectRatiosFromMeridians(meridians);
		// console.debug(iteration, 'aspectRatios', aspectRatios[0]);
		const divergence = getDivergence(aspectRatios[0]);
		console.debug('divergence', divergence);
		divisions = adjustDivisions(divisions, aspectRatios[0]);
	}

	const levels: Level[] = [];
	for (let levelNumber = 0; levelNumber < levelCount; levelNumber++) {
		const vertices = meridians.map((meridian) => meridian[levelNumber].clone());
		const center = new Vector3(0, 0, vertices.reduce((sum, v) => sum + v.z, 0) / vertices.length);
		levels.push({ level: levelNumber, center, vertices });
	}
	const aspectRatios: number[][] = getAspectRatiosFromLevels(levels);
	console.debug('***       aspect Ratios\n', aspectRatios[0]);
	return levels;
};

const getDivergence = (values: number[]) => {
	const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
	return values.map((val) => Math.abs(avg - val) / avg).reduce((sum, val) => sum + val, 0);
};

const adjustDivisions = (divisions: number[], aspectRatios: number[]) => {
	const avgAspectRatio = aspectRatios.reduce((sum, val) => sum + val, 0) / aspectRatios.length;
	const newDivisionsUnscaled = divisions.map((div, i) => {
		if (i === 0) {
			return 0;
		}
		const height = div - divisions[i - 1];
		return (avgAspectRatio * height) / aspectRatios[i - 1];
	});
	const totalNewDivisionsUnscaled = newDivisionsUnscaled.reduce((sum, val) => sum + val, 0);
	// console.debug('total', totalNewDivisionsUnscaled, 'unscaled', newDivisionsUnscaled);
	const newDivisions: number[] = [];
	newDivisionsUnscaled.forEach((div, i) => {
		if (i === divisions.length - 1) {
			newDivisions.push(1);
		} else if (i === 0) {
			newDivisions.push(0);
		} else {
			newDivisions.push(newDivisions[i - 1] + div / totalNewDivisionsUnscaled);
		}
	});
	return newDivisions;
};

// apply silhoette scaling to depthed vertex, givinga 3d point
const getMeridianPoint = (
	division: number,
	silhouette: CurvePath<Vector2>,
	vertex: Vector2
): Vector3 => {
	const silhouettePoint = silhouette.getPointAt(division);
	const center = new Vector3(0, 0, silhouettePoint.y);
	const meridianVectorLength = Math.sqrt(
		Math.pow(silhouettePoint.x * vertex.x * 2, 2) + Math.pow(silhouettePoint.x * vertex.y * 2, 2)
	);
	const meridianVector = new Vector3(vertex.x, vertex.y, 0).setLength(meridianVectorLength);
	const meridianPoint = center.addScaledVector(meridianVector, 1);
	return meridianPoint;
};

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
	const fractionalDivisions: number[] = [];
	const spacing = 1 / sampleMethod.divisions;
	for (let i = 0; i < sampleMethod.divisions + 1; i++) {
		if (i === sampleMethod.divisions) {
			fractionalDivisions.push(1);
		} else {
			fractionalDivisions.push(i * spacing);
		}
	}

	const rawLevels: Level[] = [];

	fractionalDivisions.forEach((division, i) => {
		const silhouetteValue =
			sampleMethod.method === 'divideCurve'
				? silhouette.getPoint(division)
				: silhouette.getPointAt(division);
		const depthValue =
			sampleMethod.method === 'divideCurve'
				? depthCurve.getPoint(division).x / 100
				: depthCurve.getPointAt(division).x / 100;
		const offset: LevelOffset = {
			x: 0,
			y: 0,
			z: silhouetteValue.y,
			rotX: 0,
			rotY: 0,
			rotZ: 0,
			scaleX: silhouetteValue.x * 2,
			scaleY: silhouetteValue.x * 2,
			depth: depthValue
		};
		rawLevels.push(generateLevel(offset, levelPrototypes[i % levelPrototypes.length], i));
	});

	return rawLevels;
};

const getAspectRatiosFromLevels = (levels: Level[]): number[][] => {
	const bandCount = levels[0].vertices.length;
	let bands: { v0: Vector3; v1: Vector3; v2: Vector3; v3: Vector3 }[][] = new Array(bandCount);
	bands.fill([]);
	bands = bands.map(() => []);

	for (let i = 0; i < levels.length - 1; i++) {
		const level = levels[i];
		const nextLevel = levels[i + 1];
		for (let j = 0; j < bandCount; j++) {
			const quadFacet = {
				v0: level.vertices[j],
				v1: nextLevel.vertices[j],
				v2: nextLevel.vertices[(j + 1) % bandCount],
				v3: level.vertices[(j + 1) % bandCount]
			};
			bands[j].push(quadFacet);
		}
	}
	return bands.map((band) => band.map((quad) => getAspectRatioOfQuad(quad)));
};

const getAspectRatiosFromMeridians = (meridians: Vector3[][]): number[][] => {
	const bandCount = meridians.length;
	const pointCount = meridians[0].length;
	let bands: { v0: Vector3; v1: Vector3; v2: Vector3; v3: Vector3 }[][] = new Array(bandCount);
	bands = bands.fill([]).map(() => []);

	for (let b = 0; b < bandCount; b++) {
		for (let p = 0; p < pointCount - 1; p++) {
			bands[b].push({
				v0: meridians[b][p],
				v1: meridians[b][p + 1],
				v2: meridians[(b + 1) % bandCount][p + 1],
				v3: meridians[(b + 1) % bandCount][p]
			});
		}
	}

	return bands.map((band) => band.map((quad) => getAspectRatioOfQuad(quad)));
};

const getAspectRatioOfQuad = ({
	v0,
	v1,
	v2,
	v3
}: {
	v0: Vector3;
	v1: Vector3;
	v2: Vector3;
	v3: Vector3;
}) => {
	const mid0 = new Vector3((v0.x + v1.x) / 2, (v0.y + v1.y) / 2, (v0.z + v1.z) / 2);
	const mid1 = new Vector3((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, (v1.z + v2.z) / 2);
	const mid2 = new Vector3((v2.x + v3.x) / 2, (v2.y + v3.y) / 2, (v2.z + v3.z) / 2);
	const mid3 = new Vector3((v3.x + v0.x) / 2, (v3.y + v0.y) / 2, (v3.z + v0.z) / 2);
	const width = mid2.clone().addScaledVector(mid0, -1).length();
	const height = mid3.clone().addScaledVector(mid1, -1).length();
	return height / width;
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
	return levelOffsets;
};

const getDepthedLevelPrototype = (lp: LevelPrototype, depth: number): LevelPrototype => {
	const minLength = Math.min(...lp.vertices.map((v) => v.length()));
	const depthedVertices = lp.vertices.map((v) => {
		const length = v.length();
		return v.clone().setLength(minLength + (length - minLength) * depth);
	});
	return { ...lp, vertices: depthedVertices };
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
	const levelPrototype = generateLevelPrototype(shapeConfig, levelConfig);

	if (!Array.isArray(levelPrototype)) {
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

	return result;
};

const isLevelOffset = (levelOffset: LevelOffset | LevelOffset[]): levelOffset is LevelOffset =>
	!Array.isArray(levelOffset);
