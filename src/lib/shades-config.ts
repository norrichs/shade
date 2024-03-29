import { Vector3 } from "three";
import type { PatternConfig, PatternViewConfig } from "./cut-pattern";
import { AUTO_PERSIST_KEY } from "./persistable";
import type { BandSetConfig, CurveSampleMethod, DepthCurveConfig, LevelSetConfig, RadialShapeConfig, RenderConfig, RotatedShapeGeometryConfig, StrutConfig, TabStyle, ZCurveConfig } from "./rotated-shape";
import { rad } from "./util";


const defaultZCurveConfig: ZCurveConfig = {
  type: 'ZCurveConfig',
  curves: [
    {
      type: 'BezierConfig',
      points: [
        { type: 'PointConfig', x: 50, y: -20 },
        { type: 'PointConfig', x: 150, y: -20 },
        { type: 'PointConfig', x: 150, y: 50 },
        { type: 'PointConfig', x: 150, y: 100 }
      ]
    }
  ]
};

const defaultDepthCurveConfig: DepthCurveConfig = {
  type: 'DepthCurveConfig',
  depthCurveBaseline: 10,
  curves: [
    {
      type: 'BezierConfig',
      points: [
        { type: 'PointConfig', x: 10, y: -100 },
        { type: 'PointConfig', x: 10, y: -75 },
        { type: 'PointConfig', x: 10, y: 75 },
        { type: 'PointConfig', x: 10, y: 100 }
      ]
    }
  ]
};

export const generateDefaultRadialShapeConfig = (symmetryNumber: number, sampleMethod: CurveSampleMethod): RadialShapeConfig => {
  const segmentAngle = Math.PI * 2 / symmetryNumber;
  return {
    type: 'RadialShapeConfig',
    symmetry: 'radial',
    symmetryNumber,
    sampleMethod,
    curves: [
      {
        type: 'BezierConfig',
        points: [
          { type: 'PointConfig', x: 0, y: 100 },
          {
            type: 'PointConfig',
            x: -Math.sin(segmentAngle / 6) * 100 * 1.5,
            y: Math.cos(segmentAngle / 6) * 100 * 1.5
          },
          {
            type: 'PointConfig',
            x: -Math.sin((segmentAngle * 5) / 6) * 100 * 1.5,
            y: Math.cos((segmentAngle * 5) / 6) * 100 * 1.5
          },
          { type: 'PointConfig', x: -Math.sin(segmentAngle) * 100, y: Math.cos(segmentAngle) * 100 }
        ]
      }
    ]
  }
};


const defaultLevelSetConfig: LevelSetConfig = {
  type: 'LevelSetConfig',
  zCurveSampleMethod: { method: 'divideCurvePath', divisions: 10 },
  // move below into shapeConfig
  levelPrototypeSampleMethod: { byDivisions: 'whole', dividePer: 'curve' },
  // levels: 30,
  levelOffset: {
    x: 0,
    y: 0,
    z: 0,
    rotX: rad(0),
    rotY: rad(0),
    rotZ: rad(0),
    scaleX: 1,
    scaleY: 1,
    depth: 1
  }
};

export const initTabStyle = (style: TabStyle['style']): TabStyle => {
  const defaultTabStyles: { [key: string]: TabStyle } = {
    full: { style: 'full', direction: 'lesser' },
    trapezoid: { style: 'trapezoid', direction: 'lesser', width: { style: 'fixed', value: 5 } },
    'multi-facet-full': {
      style: 'multi-facet-full',
      direction: 'both',
      directionMulti: 1,
      footprint: 'strut'
    },
    'multi-facet-trapezoid': {
      style: 'multi-facet-trapezoid',
      direction: 'both',
      directionMulti: 1,
      footprint: 'strut',
      width: { style: 'fixed', value: 5 }
    }
  };
  return defaultTabStyles[style];
};

const defaultBandConfig: BandSetConfig = {
  type: 'BandSetConfig',
  bandStyle: 'helical-right',
  offsetBy: 0,
  tabStyle: initTabStyle('multi-facet-full')
};

const defaultStrutConfig: StrutConfig = {
  type: 'StrutConfig',
  tiling: 'helical-right',
  orientation: 'inside',
  radiate: 'hybrid',
  width: 5
};

const defaultRenderConfig: RenderConfig = {
  type: 'RenderConfig',
  ranges: {
    rangeStyle: 'slice',
    bandStart: 0,
    bandCount: undefined,
    facetStart: 0,
    facetCount: undefined,
    levelStart: 0,
    levelCount: 1,
    strutStart: 0,
    strutCount: 0
  },
  show: {
    tabs: false,
    levels: false,
    bands: true,
    edges: false,
    patterns: true,
    struts: true
  }
};

export const defaultPatternConfig: PatternConfig = {
  showPattern: { band: 'none', strut: 'faceted', level: 'none' },
  axis: 'z',
  origin: new Vector3(0, 0, 0),
  direction: new Vector3(0, 1, 0),
  offset: new Vector3(0, 0, 0),
  showTabs: true
};

export const defaultPatternViewConfig: PatternViewConfig = {
  width: 400,
  height: 400,
  zoom: 0.2,
  centerOffset: {
    x: 0,
    y: 0
  }
};

export const getLevels = (sampleMethod: CurveSampleMethod, curveCount: number) => {
  if (sampleMethod.method === 'divideCurve') {
    return sampleMethod.divisions * curveCount + 1;
  }
  return sampleMethod.divisions + 1;
};

export const generateDefaultConfig = (): RotatedShapeGeometryConfig => {
  const config: RotatedShapeGeometryConfig = {
    id: AUTO_PERSIST_KEY,
    name: '',
    shapeConfig: generateDefaultRadialShapeConfig(6, { method: 'divideCurvePath', divisions: 5 }),
    levelConfig: {
      ...defaultLevelSetConfig,
      levels: getLevels(defaultLevelSetConfig.zCurveSampleMethod, defaultZCurveConfig.curves.length)
    },
    zCurveConfig: defaultZCurveConfig,
    depthCurveConfig: defaultDepthCurveConfig,
    bandConfig: defaultBandConfig,
    strutConfig: defaultStrutConfig,
    renderConfig: defaultRenderConfig
  };
  return config;
};
