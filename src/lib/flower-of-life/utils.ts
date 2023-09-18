import type { Point, Triangle } from './flower-of-life.types';

export const generateUnitTriangle = (sideLength: number): Triangle => {
	const unit = {
		a: { x: 0, y: 0 },
		b: { x: sideLength, y: 0 },
		c: { x: sideLength / 2, y: Math.sqrt(sideLength ** 2 - (sideLength / 2) ** 2) }
	};
	// console.debug('unit', unit);
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
		const skewAngle = - (Math.PI / 2 - getTriangleAngle({ a: p0, c: pApex, b: pMid }, 'b'));
		console.debug("non normalized height skewAngle", skewAngle)
		return skewAngle;
	} else {
		const triangleHeight = getTriangleHeight(triangle, apex);
		console.debug("triangleHeight", triangleHeight)
		const normalizedHeight = Math.sqrt((3 / 4) * getLength(p0, pMid) ** 2);
		const baseRatio = Math.sqrt(getLength(p0, pApex) ** 2 - triangleHeight ** 2) / getLength(p0, p1);
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
		const skewAngle = (Math.PI / 2 - baseAngle / 2)
		console.debug(
		'skewAngle',
			skewAngle,
			p0,
			p1,
			pApex,
			'mid',
			pMid,
			'base',
			baseRatio,
			pBase,
			'apexNorm',
			pApexNormalized
		);
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
	// console.debug('scaleXY', point, anchor, scaleX, scaleY);
	const scaled = {
		x: anchor.x + (point.x - anchor.x) * scaleX,
		y: anchor.y + (point.y - anchor.y) * scaleY
	};
	// console.debug(scaled)
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
	// console.debug("rotatePoint", anchor, point, angle * 180 / Math.PI)
	if (!angle && angle !== 0) {
		// console.debug("!angle")
		return { ...point };
	}
	const hypotenuse = getLength(anchor, point);
	const oldAngle = Math.asin((point.y - anchor.y) / hypotenuse);
	const newAngle = oldAngle - angle;
	const rotated = {
		x: anchor.x + hypotenuse * Math.cos(newAngle),
		y: anchor.y + hypotenuse * Math.sin(newAngle)
	};
	// console.debug("  ", hypotenuse, "old", oldAngle * 180 / Math.PI, "new", newAngle * 180 / Math.PI, rotated)
	return rotated;
};
