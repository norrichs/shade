// Shade design
//    Inputs:
//      1) level shape - 
//        points array which describes the vertices of an arbitrary 2d polygon
//      2) z-curve - 
//        a curve that describes the relationship between height and scale of level shape, as it occurs at various heights
//      3) parameters
//        parameters applied to each level
//        - rotation
//        - scale (derived from z-curve), sampled either by regular z-intervals or by arclength on the z-curve
//        - 
//    Outputs: 
//      Levels
//        - flat pieces with a hole.  Either the inner or outer path is the `level shape`.  The other is offset by a "width" parameter
//        - 2 layers of flat, sandwiching a piece that is the same, but with cutouts for tabs to be inserted
//      Bands
//        - strips which describe a 3d mesh surface connecting 2 levels.  Calculated with the following algorithm
//        1) stack levels, with z-offset and rotation
//        2) lines connect between same points in sequental levels.  E.g. L0_P0 -> L1_P0 and L0_P1 -> L1_P1
//        3) lines connect between ofset point depending on rotation. E.g. if L1 is rotated such that L1_P0 is getting farther from L0_P0, then draw between L0_P0 and L1_P(n-1)
//        4) this describes essentially a conical section (if the level shapes were circles)
//        5) add tab geometry to the base of each triangle, which will match the negative tabs in the level sandwich

import { CurvePath, Vector2, Vector3, CubicBezierCurve, Triangle } from 'three';
import { rad } from "../lib/util"

// Rotated Shape Levels are 2d.  How can I enforce that?

export type RotatedShapeLevel = {
  center: Vector3,
  level: number,
  vertices: Vector3[]
}

type RotatedShapeLevelPrototype = {
  center: Vector2,
  vertices: Vector2[]
}

type LevelOffset = {
  x: number,
  y: number,
  z: number,
  rotX: number,
  rotY: number,
  rotZ: number,
  scaleX: number,
  scaleY: number,
}

export type LevelSetConfig = {
  zCurve: CurvePath<Vector2>, // constraints: zCurve[0] === {x: 1, y: 0)  zCurve[length-1] === {x: anything, y: 1}
  zCurveSampleMethod: "arcLength" | "levelInterval",
  closedEnds: {top: boolean, bottom: boolean}
  levelPrototype: RotatedShapeLevelPrototype,
  levels: number,
  baseRadius: number,
  levelOffset: LevelOffset | LevelOffset[],
  height?: number,
}

type FacetTab = {
  p0: Vector3,
  p1: Vector3,
  p2: Vector3,
  p3: Vector3,
}

type Facet = {
  triangle: Triangle,
  tab?: FacetTab, 
}

export type Band = {
  facets: Facet[],
  endTab?: FacetTab,
}

export const isBezierCurveConfig = (curve: BezierConfig | PointConfig): curve is BezierConfig =>
  (Object.hasOwn(curve, "p0") && Object.hasOwn(curve, "p1") && Object.hasOwn(curve, "p2") && Object.hasOwn(curve, "p3") && curve.type === "BezierConfig")

export type BezierConfig = {
  [key: string]: PointConfig[] | string;
  type: "BezierConfig";
  points: [PointConfig, PointConfig, PointConfig, PointConfig];
}

export type PointConfig = {
  type: "PointConfig";
  x: number;
  y: number;
  pointType?: "handle" | "end" | "smooth" | "broken"
}

export type ZCurveConfig = {
  type: "ZCurveConfig";
  curves: (BezierConfig | PointConfig)[]
}

export const generateZCurve = (config: ZCurveConfig): CurvePath<Vector2> => {
  const zCurve = new CurvePath<Vector2>()
  // TODO - update a chain of beziers, with linkages
  for (const curve of config.curves) {
    if (curve.type === "BezierConfig") {
      zCurve.add(new CubicBezierCurve(
        new Vector2(curve.points[0].x, curve.points[0].y),
        new Vector2(curve.points[1].x, curve.points[1].y),
        new Vector2(curve.points[2].x, curve.points[2].y),
        new Vector2(curve.points[3].x, curve.points[3].y),
      ))
    }
  }
  return zCurve
}

const defaultZCurveConfig: ZCurveConfig = {
  type: "ZCurveConfig",
  curves: [
    {
      type: "BezierConfig",
      points: [
        { type: "PointConfig", x: 4, y: 0 },
        { type: "PointConfig", x: 15, y: 2 },
        { type: "PointConfig", x: 15, y: 8 },
        { type: "PointConfig", x: 4, y: 10 },
      ] 
    }
  ]
}

const defaultZCurve = generateZCurve(defaultZCurveConfig)


// utility function to generate a regular polygon of type RotatedShapeLevelPrototype
const generateRegularPolygonLevel = (sides: number, radius: number): RotatedShapeLevelPrototype => {
  const output: RotatedShapeLevelPrototype = {
    center: new Vector2(0, 0),
    vertices: []
  }
  const a = Math.PI * 2 / sides;
  
  for (let i = 0; i < sides; i++) {
    output.vertices.push(new Vector2(
      radius * Math.cos(a * i),
      radius * Math.sin(a * i)
      ))
    }
    return output;
}

const sides = 40
const defaultLevelSetConfig: LevelSetConfig = {
  zCurve: defaultZCurve,
  zCurveSampleMethod: "arcLength",
  closedEnds: {top: false, bottom: false},
  levelPrototype: generateRegularPolygonLevel(sides, 1),
  levels: 30,
  height: 20,
  baseRadius: 10,
  levelOffset: {
    x: 0,
    y: 0,
    z: 0,
    rotX: rad(0),
    rotY: rad(0),
    rotZ: rad(10),
    scaleX: 1.5,
    scaleY: 1,
  }
}

export type Validation = {
  isValid: boolean;
  msg: string[]
}

const validateLevelSetConfig = (config: LevelSetConfig): Validation => {
  const validation: Validation = {isValid: true, msg: []}
  if (config.zCurveSampleMethod === "arcLength") {
    if (Array.isArray(config.levelOffset) || config.levelOffset.z !== 0) {
      validation.isValid = validation.isValid && false;
      validation.msg.push("sampling zCurve by arc divisions, level z offsets should not be directly configured")
    }
    if (!config.height) {
      validation.isValid = validation.isValid && false;
      validation.msg.push("sampling zCurve by arc divisions, height config required")
    }
  }
  return validation
}

const isLevelOffset = (levelOffset: LevelOffset | LevelOffset[]): levelOffset is LevelOffset => !Array.isArray(levelOffset)


const generateLevelSet = (config: LevelSetConfig): RotatedShapeLevel[] => {
  const validation = validateLevelSetConfig(config)
  if (!validation.isValid) {
    throw new Error(validation.msg.join("\n"))
  }

  console.debug("generateLevelSet config:", config)
  // scale z-curve to height and baseRadius
  const { zCurve, levelPrototype } = config
  const levelOffsets: LevelOffset[] = new Array(config.levels)
  
  // generate offsets from config
  if (config.zCurveSampleMethod === "arcLength") {
    const zCurveRawPoints = zCurve.getSpacedPoints(config.levels - 1)
    const zCurveScale = {
      x: config.baseRadius / zCurveRawPoints[0].x,
      z: (config.height || 10) / zCurveRawPoints[zCurveRawPoints.length - 1].y
    }
    
    const configLevelOffset: LevelOffset = isLevelOffset(config.levelOffset) ? config.levelOffset : config.levelOffset[0]
    if (isLevelOffset(config.levelOffset)) {
      zCurveRawPoints.forEach((zCurveLevel, l) => {
        levelOffsets[l] = {...configLevelOffset}
        const { x, y, rotX, rotY, rotZ, scaleX, scaleY } = configLevelOffset
        levelOffsets[l].x = x * l
        levelOffsets[l].y = y * l
        levelOffsets[l].z = zCurveLevel.y * zCurveScale.z
        levelOffsets[l].rotX = rotX * l
        levelOffsets[l].rotY = rotY * l
        levelOffsets[l].rotZ = rotZ * l
        levelOffsets[l].scaleX = scaleX * zCurveLevel.x * zCurveScale.x
        levelOffsets[l].scaleY = scaleY * zCurveLevel.x * zCurveScale.x
      })
    }   
  }
  const levels: RotatedShapeLevel[] = new Array(config.levels)
  levelOffsets.forEach((levelOffset, l) => {
    levels[l] = generateLevel(levelOffset, config.levelPrototype, l)
  })

  console.debug("generateLevelSet  levels", levels)
  return levels
}

const generateLevel = (offset: LevelOffset, prototype: RotatedShapeLevelPrototype, levelNumber: number): RotatedShapeLevel => {
  // apply offsets to prototype 
  // axes for rotation
  const zAxis = new Vector3(0, 0, 1)
  const xAxis = new Vector3(1, 0, 0)
  const yAxis = new Vector3(0, 1, 0)
  // center for coordinate offset
  const center = new Vector3(offset.x, offset.y, offset.z)
  const vertices = prototype.vertices.map((pV, i) => {
    const vertex: Vector3 = new Vector3(pV.x * offset.scaleX, pV.y * offset.scaleY, 0);
    vertex.applyAxisAngle(zAxis, offset.rotZ) // z axis rotation must be first
    vertex.applyAxisAngle(xAxis, offset.rotX)
    vertex.applyAxisAngle(yAxis, offset.rotY)
    vertex.addScaledVector(center, 1)
    return vertex
  })
  const level: RotatedShapeLevel = {
    center,
    level: levelNumber,
    vertices
  }
  return level
}
// const generateLevelTabs = (level: RotatedShapeLevelPrototype, tabConfig: {width: number, concaveOffsetAngle: number}) => {
//   // calculate 2d tab geometry
//   // for convex curves, offset from the vertex normal line
//   // for concave curves, offset from the vertex, angled in as configured

//   // this function might as well generate the inverse tabs as well

// }

const validateBandConfig = (config: BandSetConfig): Validation => {
  const validation: Validation = {isValid: true, msg: []}
  const baseVertexCount = config.levels[0].vertices.length
  config.levels.forEach((level) => {
    if (level.vertices.length !== baseVertexCount) {
      validation.isValid = validation.isValid && false
      validation.msg.push(`level ${level.level} has ${level.vertices.length} vertices, but should have ${baseVertexCount}`)
    }
  })
  return validation
}

const generateBandSet = (config: BandSetConfig): Band[] => {
  const validation = validateBandConfig(config)
  if (!validation.isValid) {
    throw new Error(validation.msg.join("\n"))
  }
  const {levels} = config
  const bands: Band[] = []

  for (let i = 0; i < levels.length - 1; i++) {
    const band: Band = {
      facets: []
    }
    levels[i].vertices.forEach((vertex, v, vertices) => {
      const triangle1 = new Triangle(
        vertex.clone(),
        vertices[(v + 1) % vertices.length].clone(),
        levels[i + 1].vertices[v].clone()
      )
      const triangle2 = new Triangle( 
        levels[i + 1].vertices[(v + 1) % vertices.length].clone(),
        triangle1.c.clone(),
        triangle1.b.clone(),
      )
      band.facets.push({ triangle: triangle1 }, {triangle: triangle2})
    })
    bands.push(band)
  }
  console.debug("calced bands")
  return bands
}

type BandSetConfig = {
  levels: RotatedShapeLevel[]
}

export type RotatedShapeGeometryConfig = {
  levelConfig?: LevelSetConfig;
  zCurveConfig?: ZCurveConfig;
}

export const generateRotatedShapeGeometry = (config: RotatedShapeGeometryConfig = {}): { levels: RotatedShapeLevel[], bands: Band[] } => {
  console.debug("generateRotatedShapeGeometry config:", config)
  const levelConfig: LevelSetConfig = config.levelConfig || defaultLevelSetConfig;
  if (config.zCurveConfig) {
    levelConfig.zCurve = generateZCurve(config.zCurveConfig)
  }
  console.debug("calc levels")
  const levels = generateLevelSet(levelConfig)
  console.debug("calc bands")
  const bands = generateBandSet({levels})
  return {levels, bands}
}