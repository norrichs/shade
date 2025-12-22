import type { Edge, Polygon } from '$lib/projection-geometry/types';
import type { BezierConfig, PointConfig2 } from '$lib/types';
import { Vector2 } from 'three';
import { getPathFromVectors } from '../../projection/path-edit';
import { getMidPoint } from '$lib/patterns/utils';

export type PathEditorConfig = {
	padding: number;
	gutter: number;
	contentBounds: { top: number; left: number; width: number; height: number };
	size: { width: number; height: number };
};

export type PathEditorCanvas = {
	viewBox: string;
	viewBoxData: { top: number; left: number; width: number; height: number };
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	scale: number;
};

export const getCanvas = (pathEditorConfig: PathEditorConfig): PathEditorCanvas => {
	const { contentBounds, padding, gutter } = pathEditorConfig;
	const { top, left, width, height } = contentBounds;
	const minX = left - padding - gutter;
	const minY = top - padding - gutter;
	const maxX = left + width + padding + gutter * 2;
	const maxY = top + height + padding + gutter * 2;
	const viewBoxData = {
		top: top - padding,
		left: left - padding,
		width: width + padding * 2,
		height: height + padding * 2
	};
	const viewBox = `${viewBoxData.left} ${viewBoxData.top} ${viewBoxData.width} ${viewBoxData.height}`;
	const scale = (width + padding * 2) / pathEditorConfig.size.width;

	return { viewBox, viewBoxData, minX, minY, maxX, maxY, scale };
};

export const getPointClass = (curveIndex: number, pointIndex: number) => {
	return pointIndex === 1 || pointIndex === 2 ? 'direction' : 'anchor';
};

export const cloneCurves = (curveDef: BezierConfig[], curves: LimitedBezierConfig[]) => {
	curves = curveDef.map((curve, c) => ({
		...curve,
		points: curve.points.map((point, p) => {
			return {
				...point,
				xLimit: c + p === 0 ? 0 : undefined
			};
		}) as LimitedBezierConfig['points']
	}));
};

export type LimitedPoint = PointConfig2 & {
	xLimit?: number | ((data: any) => number);
	yLimit?: number | ((data: any) => number);
};

export type LimitedBezierConfig = {
	[key: string]: LimitedPoint[] | string;
	type: 'BezierConfig';
	points: [LimitedPoint, LimitedPoint, LimitedPoint, LimitedPoint];
};

export type FlattenedPolygon = {
	edges: {
		edgePoints: Vector2[];
		curvePoints: Vector2[];
	}[];
};

const DIRECTION_VECTOR = new Vector2(1, 0);
export const flattenPolygon = (polygon: Polygon): FlattenedPolygon => {
	const anchor = polygon.edges[0].edgePoints[0];
	const originalReference = polygon.edges[0].edgePoints[polygon.edges[0].edgePoints.length - 1]
		.clone()
		.addScaledVector(anchor, -1);
	const polygonParams = {
		edges: polygon.edges.map((edge: Edge) => ({
			edgePoints: edge.edgePoints.map((edgePoint) => {
				const relativeVector = edgePoint.clone().addScaledVector(anchor, -1);
				return {
					angle: originalReference.angleTo(relativeVector),
					length: relativeVector.length()
				};
			}),
			curvePoints: edge.curvePoints.map((curvePoint) => {
				const relativeVector = curvePoint.clone().addScaledVector(anchor, -1);
				return {
					angle: originalReference.angleTo(relativeVector),
					length: relativeVector.length()
				};
			})
		}))
	};

	const ORIGIN = new Vector2(0, 0);
	const flattenedPolygon = {
		edges: polygonParams.edges.map((edge) => ({
			edgePoints: edge.edgePoints.map(({ angle, length }) =>
				DIRECTION_VECTOR.clone().rotateAround(ORIGIN, angle).setLength(length)
			),
			curvePoints: edge.curvePoints.map(({ angle, length }) =>
				DIRECTION_VECTOR.clone().rotateAround(ORIGIN, angle).setLength(length)
			)
		}))
	};

	const centerPoint = flattenedPolygon.edges
		.map((edge) => edge.edgePoints[0])
		.reduce((acc, point) => acc.add(point), new Vector2(0, 0))
		.divideScalar(flattenedPolygon.edges.length);
	const recenteredPolygon = {
		edges: flattenedPolygon.edges.map((edge) => ({
			edgePoints: edge.edgePoints.map((point) => point.sub(centerPoint)),
			curvePoints: edge.curvePoints.map((point) => point.sub(centerPoint))
		}))
	};

	return recenteredPolygon;
};

export const getPolygonPaths = (polygon: FlattenedPolygon): string[] => {
	const edgePaths = polygon.edges.map((edge) => {
		const combinedPoints = [...edge.edgePoints, ...edge.curvePoints.reverse()];
		return getPathFromVectors(combinedPoints);
	});

	return edgePaths;
};

// LIMITS

export type LimitProps = {
	curveIndex: number;
	pointIndex: number;
	curveDef: BezierConfig[];
	newPoint: PointConfig2;
	oldPoint: PointConfig2;
};

export type LimitFunction = (props: LimitProps) => BezierConfig[];

// export const applyLimits = ({ limits, ...props }: LimitProps & { limits: LimitFunction[] }) => {
//   let newPoint = {...props.newPoint}
//   limits.forEach((limit) => newPoint = limit({...props, newPoint}));
//   return newPoint;
// }

export const addControlPoint = (curveDef: BezierConfig[], x: number, y: number): BezierConfig[] => {
	console.debug('addControlPoint', x, y, curveDef);
	const newCurveDef = insertPoint(curveDef.length - 1, curveDef, { type: 'PointConfig2', x, y });

	return newCurveDef;
};

const cloneCurveDef = (curveDef: BezierConfig[]): BezierConfig[] => {
	return curveDef.map((curve) => ({ ...curve }));
};

export const applyLimits = ({
	limits,
	curveDef,
	...props
}: LimitProps & { limits: LimitFunction[] }) => {
	let newCurveDef = cloneCurveDef(curveDef);
	let newPoint = { ...props.newPoint };

	limits.forEach((limit) => {
		newCurveDef = limit({ ...props, curveDef: newCurveDef, newPoint });
		newPoint = newCurveDef[props.curveIndex].points[props.pointIndex];
	});
	return newCurveDef;
};

// Limit functions need to return curveDef

export const endPointsZeroX: LimitFunction = ({ curveIndex, pointIndex, curveDef, newPoint }) => {
	if (!isEndPoint(curveIndex, pointIndex, curveDef)) {
		curveDef[curveIndex].points[pointIndex] = { ...newPoint };
		return curveDef;
	}

	curveDef[curveIndex].points[pointIndex] = { ...newPoint, x: 0 };
	return curveDef;
};

export const endPointsInRange: LimitFunction = ({ curveIndex, pointIndex, curveDef, newPoint }) => {
	if (!isEndPoint(curveIndex, pointIndex, curveDef)) {
		curveDef[curveIndex].points[pointIndex] = { ...newPoint };
		return curveDef;
	}

	let { x, y } = newPoint;
	x = x < 0 ? 0 : x;
	x = x > 1 ? 1 : x;
	y = y < 0 ? 0 : y;
	y = y > 1 ? 1 : y;

	curveDef[curveIndex].points[pointIndex] = { ...newPoint, x, y };
	return curveDef;
};

export const endPointsLockedY: LimitFunction = ({
	curveIndex,
	pointIndex,
	curveDef,
	newPoint,
	oldPoint
}) => {
	if (!isEndPoint(curveIndex, pointIndex, curveDef)) {
		curveDef[curveIndex].points[pointIndex] = { ...newPoint };
		return curveDef;
	}
	curveDef[curveIndex].points[pointIndex] = { ...newPoint, y: oldPoint.y };
	return curveDef;
};

export const endPointsMatchedX: LimitFunction = ({
	curveIndex,
	pointIndex,
	curveDef,
	newPoint
}) => {
	if (!isEndPoint(curveIndex, pointIndex, curveDef)) {
		curveDef[curveIndex].points[pointIndex] = { ...newPoint };
		return curveDef;
	}

	curveDef[curveIndex].points[pointIndex] = { ...newPoint };
	if (curveIndex === 0) {
		curveDef[curveDef.length - 1].points[3].x = newPoint.x;
	} else {
		curveDef[0].points[0].x = newPoint.x;
	}
	return curveDef;
};

export const neighborPointMatch: LimitFunction = ({
	curveIndex,
	pointIndex,
	curveDef,
	newPoint
}) => {
	curveDef[curveIndex].points[pointIndex] = { ...newPoint };
	if (isEndPoint(curveIndex, pointIndex, curveDef) || isDirectionPoint(pointIndex)) return curveDef;

	const partnerPointIndex = pointIndex === 0 ? 3 : 0;
	const partnerCurveIndex = pointIndex === 0 ? curveIndex - 1 : curveIndex + 1;
	curveDef[partnerCurveIndex].points[partnerPointIndex] = { ...newPoint };

	return curveDef;
};

// Utility functions

const isEndPoint = (curveIndex: number, pointIndex: number, curveDef: any[]) => {
	return (
		(curveIndex === 0 && pointIndex === 0) ||
		(curveIndex === curveDef.length - 1 && pointIndex === 3)
	);
};

const isDirectionPoint = (pointIndex: number) => {
	return pointIndex === 1 || pointIndex === 2;
};

export const insertPoint = (
	curveIndex: number,
	curveDef: BezierConfig[],
	newPoint: PointConfig2
): BezierConfig[] => {
	const curve0: BezierConfig = {
		...curveDef[curveIndex],
		points: [
			...curveDef[curveIndex].points.slice(0, 2),
			getMidPoint(curveDef[curveIndex].points[0], newPoint),
			newPoint
		] as [PointConfig2, PointConfig2, PointConfig2, PointConfig2]
	};
	const curve1: BezierConfig = {
		...curveDef[curveIndex],
		points: [
			newPoint,
			getMidPoint(newPoint, curveDef[curveIndex].points[3]),
			...curveDef[curveIndex].points.slice(2)
		] as [PointConfig2, PointConfig2, PointConfig2, PointConfig2]
	};
	const newCurveDef: BezierConfig[] = [
		...curveDef.slice(0, curveIndex),
		curve0,
		curve1,
		...curveDef.slice(curveIndex + 1)
	];
	return newCurveDef;
};
