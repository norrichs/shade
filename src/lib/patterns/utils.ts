import type { PathSegment } from '$lib/cut-pattern/cut-pattern.types';
import type { Point, Triangle } from './flower-of-life.types';
import type { Triangle as ThreeTriangle } from 'three';

export const generateUnitTriangle = (sideLength: number): Triangle => {
	const unit = {
		a: { x: 0, y: 0 },
		b: { x: sideLength, y: 0 },
		c: { x: sideLength / 2, y: Math.sqrt(sideLength ** 2 - (sideLength / 2) ** 2) }
	};
	return unit;
};

export const radToDeg = (n: number) => (n * 180) / Math.PI;

export const degToRad = (n: number) => (n * Math.PI) / 180;

export const getLength = (p1: Point, p2: Point): number =>
	Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

export const getMidPoint = (p1: Point, p2: Point): Point => {
	const mid = {
		x: p1.x + (p2.x - p1.x) / 2,
		y: p1.y + (p2.y - p1.y) / 2
	};
	return mid;
};

interface LineLimit {
	l0P0: boolean;
	l1P0: boolean;
	l0P1: boolean;
	l1P1: boolean;
}
interface Line {
	p0: Point;
	p1: Point;
}

export const getIntersectionOfLimitedLines = (
	l0: Line,
	l1: Line,
	limits: LineLimit = { l0P0: true, l1P0: true, l0P1: true, l1P1: true }
): Point | false => {
	let b1, b2, x, y: number;

	const m1 = getSlope(l0.p0, l0.p1);
	const m2 = getSlope(l1.p0, l1.p1);
	if (m1 === m2) {
		return false;
	} else if (!Number.isFinite(m1)) {
		x = l0.p1.x;
		b2 = l1.p1.y - m2 * l1.p1.x;
		y = m2 * x + b2;
	} else if (!Number.isFinite(m2)) {
		x = l1.p1.x;
		b1 = l0.p1.y - m1 * l0.p1.x;
		y = m1 * x + b1;
	} else {
		b1 = l0.p1.y - m1 * l0.p1.x;
		b2 = l1.p1.y - m2 * l1.p1.x;
		x = (b2 - b1) / (m1 - m2);
		y = m1 * x + b1;
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		console.error('--------- Infinite', x, y, m1, m2, b1, b2);
	}
	console.debug(`candidate ${x} ${y}`);

	const isForwardL0 = { x: l0.p1.x > l0.p0.x, y: l0.p1.y > l0.p0.y };
	const isForwardL1 = { x: l1.p1.x > l1.p0.x, y: l1.p1.y > l1.p0.y };

	const isInLimit = (
		isLimited: boolean,
		isStart: boolean,
		isForward: { x: boolean; y: boolean },
		intersection: Point,
		point: Point
	) => {
		console.debug(
			`  isInLimit - isLimited ${isLimited}, isStart ${isStart} isForward ${isForward.x} ${isForward.y}`,
			'\n  point',
			point,
			'\n  intersection',
			intersection
		);
		if (isLimited) {
			if (isStart && isForward.x && intersection.x < point.x) {
				console.debug("  limited by int x < point x")
				return false;
			}
			if (isStart && isForward.y && intersection.y < point.y) {
				console.debug("  limited by int y < point y")
				return false;
			}
			if (!isStart && isForward.x && intersection.x > point.x) {
				console.debug("  limited by int x > point x")
				return false;
			}
			if (!isStart && isForward.y && intersection.y > point.y) {
				console.debug("  limited by int x > point x")
				return false;
			}
			return true;
		}
		return true;
	};


	console.debug("check limit l0 p0")
	if (!isInLimit(limits.l0P0, true,isForwardL0, { x, y }, l0.p0)) {
		return false;
	}
	console.debug("check limit l0 p1")
	if (!isInLimit(limits.l0P1, false, isForwardL0, { x, y }, l0.p1)) {
		return false;
	}
	console.debug("check limit l1 p0")
	if (!isInLimit(limits.l1P0, true, isForwardL1, { x, y }, l1.p0)) {
		return false;
	}
	console.debug("check limit l1 p1")
	if (!isInLimit(limits.l1P1, false, isForwardL1, { x, y }, l0.p1)) {
		return false;
	}

	console.debug(`return ${x} ${y}`);
	return { x, y };
};

export const getSlope = (p0: Point, p1: Point) => {
	return (p1.y - p0.y) / (p1.x - p0.x);
};

export const getAngle = (anchor: Point, point: Point) =>
	Math.atan((point.y - anchor.y) / (point.x - anchor.x));

const otherVertices = (vertex: keyof Triangle) => ['a', 'b', 'c'].filter((v) => v !== vertex);

export const getTriangleHeight = (triangle: Triangle, apex: keyof Triangle): number => {
	const p = otherVertices(apex);
	const side0 = getLength(triangle[p[0]], triangle[apex]);
	const angle = getTriangleAngle(triangle, p[0]);
	const height = side0 * Math.sin(angle);
	return height;
};

export const getTriangleAngle = (triangle: Triangle, anglePoint: keyof Triangle): number => {
	const p = otherVertices(anglePoint);
	const side0 = getLength(triangle[anglePoint], triangle[p[0]]);
	const side1 = getLength(triangle[anglePoint], triangle[p[1]]);
	const opp = getLength(triangle[p[0]], triangle[p[1]]);
	const angle = Math.acos((side0 ** 2 + side1 ** 2 - opp ** 2) / (2 * side0 * side1));
	return angle;
};

export const getTriangleSkewX = (
	triangle: Triangle,
	apex: keyof Triangle,
	useNormalizedHeight = false
): number => {
	const p = otherVertices(apex);
	const p0 = triangle[p[0]];
	const p1 = triangle[p[1]];
	const pApex = triangle[apex];
	const pMid = getMidPoint(p0, p1);
	if (!useNormalizedHeight) {
		const skewAngle = -(Math.PI / 2 - getTriangleAngle({ a: p0, c: pApex, b: pMid }, 'b'));
		return skewAngle;
	} else {
		const triangleHeight = getTriangleHeight(triangle, apex);
		const normalizedHeight = Math.sqrt((3 / 4) * getLength(p0, pMid) ** 2);
		const baseRatio =
			Math.sqrt(getLength(p0, pApex) ** 2 - triangleHeight ** 2) / getLength(p0, p1);
		const pBase: Point = {
			x: p0.x + (p1.x - p0.x) * baseRatio,
			y: p0.y + (p1.y - p0.y) * baseRatio
		};
		const normalizationFactor = normalizedHeight / triangleHeight;
		const pApexNormalized: Point = {
			x: pBase.x + (pApex.x - pBase.x) * normalizationFactor,
			y: pBase.y + (pApex.y - pBase.y) * normalizationFactor
		};
		const baseAngle = getTriangleAngle({ a: p0, b: pMid, c: pApexNormalized }, 'b');
		const skewAngle = Math.PI / 2 - baseAngle / 2;

		return skewAngle;
	}
};

export const getInsetAlongEdgeFromVertex = (r: number, w: number): number => {
	const baseLineLength = Math.sqrt(Math.pow(r, 2) - Math.pow(r / 2, 2));
	const inset = r / 2 - Math.sqrt(Math.pow(r - w, 2) - Math.pow(baseLineLength, 2));
	return inset;
};

export const getInsetToOppositEdgeFromVertex = (sideLength: number, width: number): number =>
	Math.sqrt(Math.pow(sideLength + width / 2, 2) - Math.pow(sideLength, 2));

export const getPointsInsetFromPoints = (
	startPoint: Point,
	endPoint: Point,
	inset: number
): [Point, Point] => {
	const dX = endPoint.x - startPoint.x;
	const dY = endPoint.y - startPoint.y;
	const dL = Math.sqrt(Math.pow(dX, 2) + Math.pow(dY, 2));
	return [
		{ x: startPoint.x + (dX * inset) / dL, y: startPoint.y + (dY * inset) / dL },
		{ x: endPoint.x - (dX * inset) / dL, y: endPoint.y - (dY * inset) / dL }
	];
};

export const scaleXY = (point: Point, anchor: Point, scaleX: number, scaleY: number): Point => {
	const scaled = {
		x: anchor.x + (point.x - anchor.x) * scaleX,
		y: anchor.y + (point.y - anchor.y) * scaleY
	};
	return scaled;
};

export const skewXPoint = (anchor: Point, point: Point, skewAngle: number): Point => {
	if (anchor.y === point.y) {
		return point;
	}
	const newPoint: Point = {
		x: point.x + getLength(point, anchor) * Math.tan(skewAngle),
		y: point.y
	};
	return newPoint;
};

export const rotatePoint = (anchor: Point, point: Point, angle: number): Point => {
	if (!angle && angle !== 0) {
		return { ...point };
	}
	const hypotenuse = getLength(anchor, point);
	const oldAngle = Math.asin((point.y - anchor.y) / hypotenuse);
	const newAngle = oldAngle - angle;
	const rotated = {
		x: anchor.x + hypotenuse * Math.cos(newAngle),
		y: anchor.y + hypotenuse * Math.sin(newAngle)
	};
	return rotated;
};

export const simpleTriangle = (t: ThreeTriangle): Triangle => {
	return {
		a: { x: t.a.x, y: t.a.y },
		b: { x: t.b.x, y: t.b.y },
		c: { x: t.c.x, y: t.c.y }
	};
};

export const arcCircle = (c: [number, number, number]): string => {
	const [x, y, r] = c;
	return `M ${x + r} ${y}
					A ${r} ${r} 0 0 0 ${x - r} ${y}
					A ${r} ${r} 0 0 0 ${x + r} ${y}
					z 
	`;
};

export const roundPathSegments = (seg: PathSegment, decimalPlaces = 3) => {
	if (seg[0] === 'Z') {
		return seg;
	}
	return seg.map((s, i) => {
		if (typeof s === 'string') {
			return s;
		} else {
			const f = 10 ** decimalPlaces;
			return Math.round(s * f) / f;
		}
	});
};

export const closestPoint = (p0: Point, points: Point[]): Point => {
	const distances = points.map((p) => Math.sqrt((p.x - p0.x) ** 2 + (p.y - p0.y) ** 2));
	const minDistance = Math.min(...distances);
	return points[distances.indexOf(minDistance)];
};
