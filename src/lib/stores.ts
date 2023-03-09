import { writable } from "svelte/store";
import type { ZCurveConfig } from "./rotated-shape";



const defaultZCurveConfig: ZCurveConfig = {
  type: "ZCurveConfig",
  curves: [
    {
      type: 'BezierConfig',
      points: [
        { type: 'PointConfig', x: 20, y: 0 },
        { type: 'PointConfig', x: 25, y: 5 },
        { type: 'PointConfig', x: 25, y: 15 },
        { type: 'PointConfig', x: 20, y: 20 }
      ]
    },
    {
      type: 'BezierConfig',
      points: [
        { type: 'PointConfig', x: 20, y: 20 },
        { type: 'PointConfig', x: 15, y: 25 },
        { type: 'PointConfig', x: 15, y: 35 },
        { type: 'PointConfig', x: 20, y: 40 }
      ]
    },
  ]
}

export const curveConfig = writable<ZCurveConfig>(defaultZCurveConfig)