import { writable } from "svelte/store";
import type { LevelSetConfig, ZCurveConfig, RenderConfig, RadialShapeLevelPrototypeConfig, BandSetConfig } from "./rotated-shape";
import { generateRadialShapeLevelPrototype } from "./rotated-shape"
import { rad } from "./util";

const defaultZCurveConfig: ZCurveConfig = {
  type: "ZCurveConfig",
  curves: [
    {
      type: 'BezierConfig',
      points: [
        { type: 'PointConfig', x: 120, y: 0 },
        { type: 'PointConfig', x: 100, y: 10 },
        { type: 'PointConfig', x: 100, y: 40 },
        { type: 'PointConfig', x: 100, y: 50 }
      ]
    },
    {
      type: 'BezierConfig',
      points: [
        { type: 'PointConfig', x: 100, y: 50 },
        { type: 'PointConfig', x: 100, y: 60 },
        { type: 'PointConfig', x: 100, y: 90 },
        { type: 'PointConfig', x: 0, y: 100 }
      ]
    },
  ]
}
export const curveConfig = writable<ZCurveConfig>(defaultZCurveConfig)


const symmetryNumber = 5
const a0 = Math.PI * 2 / symmetryNumber;
const radius = 10;
const defaultRadialShapeConfig: RadialShapeLevelPrototypeConfig = {
  type: "RadialShapeConfig",
  symmetry: "radial",
  symmetryNumber: symmetryNumber,
  divisions: 4,
  curves: [
    {
      type: "BezierConfig", points: [
        { type: "PointConfig", x: 0, y: radius },
        { type: "PointConfig", x: -Math.sin(a0 / 6) * radius * 1.5, y: Math.cos(a0 / 6) * radius * 1.5 },
        { type: "PointConfig", x: -Math.sin(a0 * 5 / 6) * radius * 1.5, y: Math.cos(a0 * 5 / 6) * radius * 1.5 },
        { type: "PointConfig", x: -Math.sin(a0) * radius, y: Math.cos(a0) * radius },
      ]
    },
  ]
}

const sides = 24
const defaultLevelSetConfig: LevelSetConfig = {
  // zCurve: defaultZCurve,
  zCurveSampleMethod: "arcLength",
  levelPrototype: generateRadialShapeLevelPrototype(defaultRadialShapeConfig),
    // generateRegularPolygonLevel(sides, 1),
  levels: 30,
  sides: sides,
  // height: 20,
  // baseRadius: 10,
  levelOffset: {
    x: 0,
    y: 0,
    z: 0,
    rotX: rad(0),
    rotY: rad(0),
    rotZ: rad(180 /   sides),
    scaleX: 1,
    scaleY: 1,
  }
}
export const levelConfig = writable<Omit<LevelSetConfig, "zCurve">>(defaultLevelSetConfig)

const defaultBandConfig: BandSetConfig = {
  bandStyle: "helical-right",
  // tabStyle: {style: "full", direction: 1}
  tabStyle: {style: "trapezoid", direction: 1, width: {style: "fixed", value: 4}, inset: 0}
}

export const bandConfig = writable<BandSetConfig>(defaultBandConfig)

const defaultRenderConfig: RenderConfig = {
  bandRange: { rangeStyle: "slice", bandStart: 0, bandCount: undefined, facetStart: 0, facetCount: undefined },
  show: {
    tabs: true,
    levels: false,
    bands: true,
    edges: true,
    patterns: true,
  }
}

export const renderConfig = writable<RenderConfig>(defaultRenderConfig)