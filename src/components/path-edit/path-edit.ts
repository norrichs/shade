import type { BezierConfig, PointConfig2 } from '$lib/types';

export const onPathPointMove = (
	x: number,
	y: number,
	dx: number,
	dy: number,
	curveIndex: number,
	pointIndex: number,
	curves: BezierConfig[],
	limitAngle: number,
	isEndLocked = false
): BezierConfig[] => {
	// if (limitAngle && curveIndex === 0 && pointIndex === 0) {
	// 	if (Math.atan(y / x) < 0) return curves
	// } else if (limitAngle && curveIndex === curves.length - 1 && pointIndex === 3) {
	// 	if (Math.atan(y / x) > limitAngle) return curves
	// }

	// TODO - troubleshoot enabling setting of 'smooth' / 'angled' for ends
	// TODO - all newly added points should be 'smooth'
	// TODO - add new points in middle
	//

	// TODO - refactor this function to use Vector2???

	// TODO - instead of trying to constrain point geometry into sectors, classify point as 'isEnd', and partner end points, with movement contrained.  E.G,

	//  if isPoint && isEnd
	//		partner move(other end and other end handle)
	//  if isHandle && isEnd && isSmooth
	//		rotated partner move(other end handle)

	const curve = curves[curveIndex];
	const isPoint = pointIndex === 0 || pointIndex === 3;
	const isEnd =
		isEndLocked &&
		((curveIndex === 0 && pointIndex <= 1) ||
			(curveIndex === curves.length - 1 && pointIndex >= 2));
	const isHandle = !isPoint;

	const isJoined =
		(pointIndex <= 1 && curveIndex > 0 && curves[curveIndex - 1]) ||
		(pointIndex >= 2 && curves[curveIndex + 1]);

	const partner = !isJoined ? null : curves[curveIndex + (pointIndex <= 1 ? -1 : 1)];
	const partnerPointIndex = pointIndex <= 1 ? 3 : 0;
	const isAngled =
		isJoined &&
		(curve.points[pointIndex].pointType === 'angled' ||
			(partner && partner.points[partnerPointIndex].pointType === 'angled'));

	if (isEnd && isPoint) {
		const thisPoint = curves[curveIndex].points[pointIndex];
		const endPartner =
			curves[curveIndex === 0 ? curves.length - 1 : 0].points[pointIndex === 0 ? 3 : 0];
		// for end point, calc radius, then set point and partner to be r, expected theta
		const r = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
		const angle = curveIndex === 0 ? 0 : limitAngle;
		const partnerAngle = angle === 0 ? limitAngle : 0;

		thisPoint.x = -r * Math.sin(angle);
		thisPoint.y = r * Math.cos(angle);

		endPartner.x = -r * Math.sin(partnerAngle);
		endPartner.y = r * Math.cos(partnerAngle);

		return curves;
	} else if (isEnd && isHandle) {
		// console.error('pathEdit stub - isEnd && isHandle');
	} else if (isPoint && isJoined && partner) {
		// coordinate associated points of joined point - handle, partner point, partner handle
		const [partnerHandle, partnerPoint] =
			pointIndex <= 1
				? [partner.points[2], partner.points[3]]
				: [partner.points[1], partner.points[0]];
		const handle = curve.points[pointIndex <= 1 ? 1 : 2];
		handle.x += dx;
		handle.y += dy;
		partnerHandle.x += dx;
		partnerHandle.y += dy;
		partnerPoint.x += dx;
		partnerPoint.y += dy;
	} else if (isPoint && !isJoined) {
		const handle = curve.points[pointIndex <= 1 ? 1 : 2];
		handle.x += dx;
		handle.y += dy;
	} else if (isHandle && isJoined && !isAngled && partner) {
		// coordinate partner handle
		const [handle, point] =
			pointIndex <= 1 ? [curve.points[1], curve.points[0]] : [curve.points[2], curve.points[3]];
		const [partnerHandle, partnerPoint] =
			pointIndex <= 1
				? [partner.points[2], partner.points[3]]
				: [partner.points[1], partner.points[0]];
		const partnerHandleLength = Math.sqrt(
			Math.pow(partnerHandle.x - partnerPoint.x, 2) + Math.pow(partnerHandle.y - partnerPoint.y, 2)
		);
		const handleLength = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
		// const partnerAngle = Math.PI + Math.atan((handle.y - point.y) /  (handle.x - point.x))
		const partnerAngle =
			Math.PI + Math.acos((x - point.x) / handleLength) * (y - point.y < 0 ? -1 : 1);

		// partner handle co linear wtih point->handle, but the length is constant
		partnerHandle.x = partnerPoint.x + Math.cos(partnerAngle) * partnerHandleLength;
		partnerHandle.y = partnerPoint.y + Math.sin(partnerAngle) * partnerHandleLength;
	}

	// move the point being directly manipulated
	curve.points[pointIndex].x = x;
	curve.points[pointIndex].y = y;
	curves[curveIndex] = curve;

	return curves;
};

export const togglePointType = (
	pointIndex: number,
	curveIndex: number,
	curves: BezierConfig[],
	onChange: () => void
): void => {
	if (pointIndex === 1 || pointIndex === 2) return;
	if (
		(pointIndex === 3 && curveIndex === curves.length - 1) ||
		(pointIndex === 0 && curveIndex === 0)
	)
		return;
	//point
	const point = curves[curveIndex].points[pointIndex];
	const partner =
		curves[pointIndex === 3 ? curveIndex + 1 : curveIndex - 1].points[pointIndex === 3 ? 0 : 3];
	const newType =
		point.pointType === undefined || point.pointType === 'smooth' ? 'angled' : 'smooth';

	point.pointType = newType;
	partner.pointType = newType;
	onChange();
};

// TODO - refactor this to add new point as smooth, centered
// center will be:
// find midpoint m0 between p[0] and p[1]
// find midpoint m1 between p[2] and p[3]
//	find midpoint m between m0 and m1
//	set handles
//	find midpoint h0 between m and m0
//	find midpoint h1 between m and m1
//

const getMidpoint = (p0: PointConfig2, p1: PointConfig2): PointConfig2 => {
	const midPoint: PointConfig2 = {
		type: 'PointConfig2',
		x: (p1.x + p0.x) / 2,
		y: (p1.y + p0.y) / 2
	};
	return midPoint;
};

export const splitCurves = (curves: BezierConfig[]): BezierConfig[] => {
	const newCurves: BezierConfig[] = window.structuredClone(curves);
	const insertIndex = Math.ceil((curves.length - 1) / 2);
	const p = newCurves[insertIndex].points;
	const m0 = getMidpoint(p[0], p[1]);
	const m1 = getMidpoint(p[3], p[2]);
	const m = getMidpoint(m0, m1);
	const h0 = getMidpoint(m, m0);
	const h1 = getMidpoint(m, m1);
	const splitCurves: [BezierConfig, BezierConfig] = [
		{
			type: 'BezierConfig',
			points: [{ ...p[0] }, { ...p[1] }, { ...h0 }, { ...m }]
		},
		{
			type: 'BezierConfig',
			points: [{ ...m }, { ...h1 }, { ...p[2] }, { ...p[3] }]
		}
	];
	newCurves.splice(insertIndex, 1, ...splitCurves);
	return newCurves;
};

export const addCurve = (curves: BezierConfig[]): BezierConfig[] => {
	const newCurves = window.structuredClone(curves);
	const lastPoint = newCurves[curves.length - 1].points[3];
	lastPoint.pointType = 'angled';
	const newCurve: BezierConfig = {
		type: 'BezierConfig',
		points: [
			{ ...lastPoint },
			{ type: 'PointConfig2', x: lastPoint.x + 5, y: lastPoint.y },
			{ type: 'PointConfig2', x: lastPoint.x + 10, y: lastPoint.y },
			{ type: 'PointConfig2', pointType: 'smooth', x: lastPoint.x + 20, y: lastPoint.y }
		]
	};
	newCurves.push(newCurve);
	return newCurves;
};

export const removeCurve = (curves: BezierConfig[]): BezierConfig[] => {
	const newCurves = window.structuredClone(curves);
	newCurves.pop();
	return newCurves;
};
