import { derived, writable, type Writable } from 'svelte/store';
import { Vector3 } from 'three';
import type { PatternConfig, PatternViewConfig } from './cut-pattern';
import { persistable, bootStrapUsePersisted, USE_PERSISTED_KEY, AUTO_PERSIST_KEY} from './persistable';
import type {
  BandSetConfig, CurveSampleMethod, DepthCurveConfig, LevelSetConfig, RadialShapeConfig, RenderConfig, RotatedShapeGeometryConfig, StrutConfig, TabStyle, ZCurveConfig
} from './rotated-shape';
import { getPersistedConfig } from './storage';
import { rad } from './util';

export interface Persistable<T> extends Writable<T> {
  reset(): void;
}

// TODO - make it so that all persistable stores are aware of the value stored in usePersisted
//				the value is to be used during initiation of the persistable stores - e.g. load the local storage version or the default
//				maybe we persist the derived store? (config) rather than (config0)

export const usePersisted = persistable(false, USE_PERSISTED_KEY, USE_PERSISTED_KEY, true)

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
export const blankCurveConfig = writable<ZCurveConfig>({ type: 'ZCurveConfig', curves: [] });

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
    strutCount: undefined
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

const defaultPatternConfig: PatternConfig = {
  showPattern: { band: 'none', strut: 'faceted', level: 'none' },
  axis: 'z',
  origin: new Vector3(0, 0, 0),
  direction: new Vector3(0, 1, 0),
  offset: new Vector3(0, 0, 0),
  showTabs: true
};

const defaultPatternViewConfig: PatternViewConfig = {
  width: 400,
  height: 400,
  zoom: 0.2,
  centerOffset: {
    x: 0,
    y: 0
  }
};

/// subconfigs, to be transitioned into overall config

export const strutConfig = persistable<StrutConfig>(
  defaultStrutConfig,
	'strutConfig',
	AUTO_PERSIST_KEY,
  bootStrapUsePersisted()
);
export const renderConfig = persistable<RenderConfig>(
  defaultRenderConfig,
	'renderConfig',
	AUTO_PERSIST_KEY,
  bootStrapUsePersisted()
);

/// Configs to be kept separate from geometry config
export const patternConfig = writable<PatternConfig>(defaultPatternConfig);
export const patternViewConfig = writable<PatternViewConfig>(defaultPatternViewConfig);

const getLevels = (sampleMethod: CurveSampleMethod, curveCount: number) => {
  if (sampleMethod.method === 'divideCurve') {
    return sampleMethod.divisions * curveCount + 1;
  }
  return sampleMethod.divisions + 1;
};

const generateDefaultConfig = (): RotatedShapeGeometryConfig => {
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

const loadAutoPersisted = (usePersisted: boolean) => {
  console.debug("*** loadAutoPersisted?")
  const autoPersisted = getPersistedConfig(AUTO_PERSIST_KEY, "RotatedShapeGeometryConfig");
  if (autoPersisted && usePersisted) {
    console.debug("    yes")
    return autoPersisted;
  } else {
    console.debug("    no")
    return generateDefaultConfig();
  }
};

export const config0 = persistable<RotatedShapeGeometryConfig>(
	loadAutoPersisted(bootStrapUsePersisted()),
	'RotatedShapeGeometryConfig',
	AUTO_PERSIST_KEY,
	bootStrapUsePersisted()
);

export const config = derived(config0, ($config0) => {
  const derivedConfig: RotatedShapeGeometryConfig = {
    ...$config0,
    levelConfig: {
      ...$config0.levelConfig,
      levels: getLevels(
        $config0.levelConfig.zCurveSampleMethod,
        $config0.zCurveConfig.curves.length
      )
    }
  };
  console.debug("update derived config", derivedConfig.id)
  return derivedConfig;
});
