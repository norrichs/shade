import type { Edge, Polygon } from '$lib/projection-geometry/types';
import type { BezierConfig, PointConfig2 } from '$lib/types';
import { Vector2 } from 'three';
import { getPathFromVectors } from '../../projection/path-edit';
import { getMidPoint } from '$lib/patterns/utils';

export type { PathEditorConfig, PathEditorCanvas } from './path-editor-shared';
export { getCanvas } from './path-editor-shared';

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
	const newCurveDef = insertPoint(curveDef.length - 1, curveDef, { type: 'PointConfig2', x, y });

	return newCurveDef;
};

// Deep clone: a `{ ...curve }` spread shares the `points` array with the caller,
// so limit functions writing to `curveDef[c].points[p]` would mutate the config
// they were handed.
const cloneCurveDef = (curveDef: BezierConfig[]): BezierConfig[] => {
	return curveDef.map((curve) => ({
		...curve,
		points: curve.points.map((point) => ({ ...point })) as BezierConfig['points']
	}));
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

// ---------------------------------------------------------------------------
// Curve operations
//
// Adapted from `src/components/path-edit/path-edit.ts`, which stays in place as
// the legacy fixed-pane editor's implementation. Differences are noted per
// function; all of these are pure and return a new curveDef.
// ---------------------------------------------------------------------------

const deepCloneCurves = (curveDef: BezierConfig[]): BezierConfig[] =>
	curveDef.map((curve) => ({
		...curve,
		points: curve.points.map((point) => ({ ...point })) as BezierConfig['points']
	}));

/**
 * Append a curve continuing from the current end point.
 *
 * `step` sets how far the new curve reaches, in model units. The legacy version
 * hardcoded +5/+10/+20, which is roughly 20x off-screen in the 0..1 viewBoxes
 * used by the Cross Section and Edge Curve editors.
 */
export const addCurve = (curveDef: BezierConfig[], step: number): BezierConfig[] => {
	if (curveDef.length === 0) return curveDef;
	const newCurveDef = deepCloneCurves(curveDef);
	const lastPoint = newCurveDef[newCurveDef.length - 1].points[3];
	lastPoint.pointType = 'angled';
	newCurveDef.push({
		type: 'BezierConfig',
		points: [
			{ ...lastPoint },
			{ type: 'PointConfig2', x: lastPoint.x + step * 0.25, y: lastPoint.y },
			{ type: 'PointConfig2', x: lastPoint.x + step * 0.5, y: lastPoint.y },
			{ type: 'PointConfig2', pointType: 'smooth', x: lastPoint.x + step, y: lastPoint.y }
		]
	});
	return newCurveDef;
};

/** Split the middle curve in two without changing the rendered path. */
export const splitCurves = (curveDef: BezierConfig[]): BezierConfig[] => {
	if (curveDef.length === 0) return curveDef;
	const newCurveDef = deepCloneCurves(curveDef);
	const insertIndex = Math.ceil((curveDef.length - 1) / 2);
	const p = newCurveDef[insertIndex].points;
	const m0 = getMidPoint(p[0], p[1]);
	const m1 = getMidPoint(p[3], p[2]);
	const m = getMidPoint(m0, m1);
	const h0 = getMidPoint(m, m0);
	const h1 = getMidPoint(m, m1);
	newCurveDef.splice(
		insertIndex,
		1,
		{ type: 'BezierConfig', points: [{ ...p[0] }, { ...p[1] }, { ...h0 }, { ...m }] },
		{ type: 'BezierConfig', points: [{ ...m }, { ...h1 }, { ...p[2] }, { ...p[3] }] }
	);
	return newCurveDef;
};

/**
 * Drop the last curve, never going below `minCurves`. The legacy version popped
 * all the way to an empty array, after which every `curveDef[0].points[0]` read
 * in the renderer throws.
 */
export const removeCurve = (curveDef: BezierConfig[], minCurves = 1): BezierConfig[] => {
	if (curveDef.length <= minCurves) return curveDef;
	const newCurveDef = deepCloneCurves(curveDef);
	newCurveDef.pop();
	return newCurveDef;
};

/**
 * Flip an interior anchor between 'angled' and 'smooth'. Both sides of the joint
 * carry the type, so they are set together.
 *
 * No-ops on direction handles and on the two outer terminal anchors, which have
 * no partner to join to. Returns a new curveDef rather than mutating and firing
 * a callback, matching the `onChangeCurveDef` contract.
 */
export const togglePointType = (
	curveDef: BezierConfig[],
	curveIndex: number,
	pointIndex: number
): BezierConfig[] => {
	if (pointIndex === 1 || pointIndex === 2) return curveDef;
	if (
		(pointIndex === 0 && curveIndex === 0) ||
		(pointIndex === 3 && curveIndex === curveDef.length - 1)
	) {
		return curveDef;
	}
	const newCurveDef = deepCloneCurves(curveDef);
	const point = newCurveDef[curveIndex].points[pointIndex];
	const partnerCurve = newCurveDef[pointIndex === 3 ? curveIndex + 1 : curveIndex - 1];
	if (!partnerCurve) return curveDef;
	const partner = partnerCurve.points[pointIndex === 3 ? 0 : 3];
	const newType = point.pointType === 'angled' ? 'smooth' : 'angled';
	point.pointType = newType;
	partner.pointType = newType;
	return newCurveDef;
};

// ---------------------------------------------------------------------------
// Coupling limits
//
// These carry the behaviour of the legacy `onPathPointMove`
// (`src/components/path-edit/path-edit.ts`) into the composable `LimitFunction`
// pipeline, so dragging stays a pure data transform.
//
// Convention, shared with the limits above: a limit assigns the dragged point
// itself and returns the whole curveDef. `applyLimits` re-reads `newPoint` after
// each limit but preserves the original `oldPoint`, so the per-event delta is
// always `newPoint - oldPoint`.
// ---------------------------------------------------------------------------

const isAnchor = (pointIndex: number) => pointIndex === 0 || pointIndex === 3;

/** The curve joined to this one at `pointIndex`, if there is one. */
const joinedCurveIndex = (curveIndex: number, pointIndex: number, curveDef: BezierConfig[]) => {
	const index = pointIndex <= 1 ? curveIndex - 1 : curveIndex + 1;
	return index >= 0 && index < curveDef.length ? index : undefined;
};

/**
 * Dragging an anchor carries its own direction handle, and — where the anchor is
 * joined to a neighbouring curve — that neighbour's coincident anchor and its
 * facing handle. Without this an anchor tears away from its handles.
 *
 * The partner anchor is *assigned* the new position rather than displaced by the
 * delta, so composing this with `neighborPointMatch` cannot double-move it.
 */
export const anchorDragsHandles: LimitFunction = ({
	curveIndex,
	pointIndex,
	curveDef,
	newPoint,
	oldPoint
}) => {
	curveDef[curveIndex].points[pointIndex] = { ...newPoint };
	if (!isAnchor(pointIndex)) return curveDef;

	const dx = newPoint.x - oldPoint.x;
	const dy = newPoint.y - oldPoint.y;

	const handle = curveDef[curveIndex].points[pointIndex === 0 ? 1 : 2];
	handle.x += dx;
	handle.y += dy;

	const partnerIndex = joinedCurveIndex(curveIndex, pointIndex, curveDef);
	if (partnerIndex === undefined) return curveDef;

	const partner = curveDef[partnerIndex];
	const partnerAnchorIndex = pointIndex === 0 ? 3 : 0;
	const partnerHandle = partner.points[pointIndex === 0 ? 2 : 1];
	partnerHandle.x += dx;
	partnerHandle.y += dy;
	partner.points[partnerAnchorIndex] = {
		...partner.points[partnerAnchorIndex],
		x: newPoint.x,
		y: newPoint.y
	};

	return curveDef;
};

/**
 * Dragging a direction handle across a 'smooth' joint swings the partner handle
 * to stay colinear through the anchor, keeping its own length. An 'angled' joint
 * (on either side) is left free.
 *
 * The legacy version computed the partner angle with `Math.acos(dx / length)`,
 * which yields NaN when a handle is dropped exactly on its anchor and takes the
 * whole path down with it. This normalises the direction vector instead and
 * leaves the partner untouched at zero length.
 */
export const mirrorSmoothHandles: LimitFunction = ({
	curveIndex,
	pointIndex,
	curveDef,
	newPoint
}) => {
	curveDef[curveIndex].points[pointIndex] = { ...newPoint };
	if (isAnchor(pointIndex)) return curveDef;

	const partnerIndex = joinedCurveIndex(curveIndex, pointIndex, curveDef);
	if (partnerIndex === undefined) return curveDef;

	const anchor = curveDef[curveIndex].points[pointIndex === 1 ? 0 : 3];
	const partner = curveDef[partnerIndex];
	const partnerAnchor = partner.points[pointIndex === 1 ? 3 : 0];
	const partnerHandleIndex = pointIndex === 1 ? 2 : 1;
	const partnerHandle = partner.points[partnerHandleIndex];

	if (anchor.pointType === 'angled' || partnerAnchor.pointType === 'angled') return curveDef;

	const vx = newPoint.x - anchor.x;
	const vy = newPoint.y - anchor.y;
	const length = Math.hypot(vx, vy);
	if (length === 0) return curveDef;

	const partnerLength = Math.hypot(
		partnerHandle.x - partnerAnchor.x,
		partnerHandle.y - partnerAnchor.y
	);

	partner.points[partnerHandleIndex] = {
		...partnerHandle,
		x: partnerAnchor.x - (vx / length) * partnerLength,
		y: partnerAnchor.y - (vy / length) * partnerLength
	};

	return curveDef;
};

/**
 * Place a point at radius `r` on a ray `angle` radians from +y, sweeping toward
 * −x. This is the mapping the legacy radial end-lock used; it is factored out so
 * the convention lives in exactly one place.
 */
export const pointOnRay = (r: number, angle: number): { x: number; y: number } => ({
	x: -r * Math.sin(angle),
	y: r * Math.cos(angle)
});

/**
 * Pin the two terminal anchors of a radially symmetric cross-section to the rays
 * bounding one symmetry wedge, at a shared radius. Dragging either end sets the
 * radius; both ends follow.
 *
 * Opt-in through the plain `limits` array rather than the `coupling` prop —
 * only a radial `ShapeConfig` wants it, and `PathEditor` should not know about
 * `ShapeConfig`.
 */
export const radialEndLock =
	(limitAngle: number): LimitFunction =>
	({ curveIndex, pointIndex, curveDef, newPoint }) => {
		curveDef[curveIndex].points[pointIndex] = { ...newPoint };

		const isFirst = curveIndex === 0 && pointIndex === 0;
		const isLast = curveIndex === curveDef.length - 1 && pointIndex === 3;
		if (!isFirst && !isLast) return curveDef;
		if (curveDef.length === 0) return curveDef;

		const r = Math.hypot(newPoint.x, newPoint.y);
		const thisAngle = isFirst ? 0 : limitAngle;
		const partnerAngle = isFirst ? limitAngle : 0;

		const here = pointOnRay(r, thisAngle);
		const there = pointOnRay(r, partnerAngle);

		curveDef[curveIndex].points[pointIndex] = { ...newPoint, ...here };

		const partnerCurve = curveDef[isFirst ? curveDef.length - 1 : 0];
		const partnerPointIndex = isFirst ? 3 : 0;
		partnerCurve.points[partnerPointIndex] = {
			...partnerCurve.points[partnerPointIndex],
			...there
		};

		return curveDef;
	};
