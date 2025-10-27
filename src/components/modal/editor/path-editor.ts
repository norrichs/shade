import type { BezierConfig, PointConfig2 } from "$lib/types";

export type PathEditorConfig = {
  padding: number;
  gutter: number;
  contentBounds: { top: number; left: number; width: number; height: number };
  size: { width: number; height: number };
};

export type PathEditorCanvas = {
  viewBox: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  scale: number;
}

export const getCanvas = (pathEditorConfig: PathEditorConfig): PathEditorCanvas => {
  const { contentBounds, padding, gutter } = pathEditorConfig;
  const { top, left, width, height } = contentBounds;
  const minX = left - padding - gutter;
  const minY = top - padding - gutter;
  const maxX = left + width + padding + gutter * 2;
  const maxY = top + height + padding + gutter * 2;
  const viewBox = `${left - padding} ${top - padding} ${width + padding * 2} ${height + padding * 2}`;
  const scale = (width + padding * 2) / pathEditorConfig.size.width;

  console.debug({ viewBox, minX, minY, maxX, maxY, scale, padding, gutter })
  
  return { viewBox, minX, minY, maxX, maxY, scale }
}

export const getPointClass = (curveIndex: number, pointIndex: number) => {
  return pointIndex === 1 || pointIndex === 2 ? 'direction' : 'anchor';
}

export const cloneCurves = (curveDef: BezierConfig[], curves: LimitedBezierConfig[]) => {
  curves = curveDef.map((curve, c) => ({
    ...curve, points: curve.points.map((point, p) => {
      return {
        ...point,
        xLimit: c + p === 0 ? 0 : undefined
      }
    }) as LimitedBezierConfig['points']
  }));
}

export type LimitedPoint = PointConfig2 & {
  xLimit?: number | ((data: any) => number);
  yLimit?: number | ((data: any) => number);
}

export type LimitedBezierConfig = {
  [key: string]: LimitedPoint[] | string;
  type: 'BezierConfig';
  points: [LimitedPoint, LimitedPoint, LimitedPoint, LimitedPoint];
}



// LIMITS

export type LimitProps = {
  curveIndex: number;
  pointIndex: number;
  curveDef: BezierConfig[];
  newPoint: PointConfig2
}

export type LimitFunction = (props: LimitProps) => PointConfig2;

export const endPointsZeroX = ({ curveIndex: c, pointIndex: p, curveDef, newPoint }: LimitProps): PointConfig2 =>
  (c + p === 0 || (c === curveDef.length - 1 && p === 3))
    ? { ...newPoint, x: 0 }
    : newPoint;

export const applyLimits = ({ limits, ...props }: LimitProps & { limits: LimitFunction[] }) => {
  let newPoint = {type: 'PointConfig2', x: 0, y: 0};
  limits.forEach((limit) => newPoint = limit(props));
  return newPoint;
}