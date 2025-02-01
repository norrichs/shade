import {
	type PathSegment,
	type Triangle,
	type Point,
	isMovePathSegment,
	isLinePathSegment,
	isArcPathSegment,
	isCubicBezierPathSegment,
	isQuadraticBezierPathSegment,
	type Quadrilateral,
	type Facet,
	type Point3,
	type Band,
	type GlobuleData
} from '$lib/types';
import { Vector2, Vector3, type Triangle as ThreeTriangle } from 'three';
import { numberPathSegments } from '../../components/cut-pattern/number-path-segments';

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

export const getLength = <T extends Point | Vector2 | Vector3>(p0: T, p1: T): number => {
	if (p1 instanceof Vector3 && p0 instanceof Vector3) {
		return p0.clone().addScaledVector(p1, -1).length();
	}
	if (p1 instanceof Vector2 && p0 instanceof Vector2) {
		return p0.clone().addScaledVector(p1, -1).length();
	}
	return Math.sqrt(Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2));
};
export const getMidPoint = (p1: Point, p2: Point): Point => {
	const mid = {
		x: p1.x + (p2.x - p1.x) / 2,
		y: p1.y + (p2.y - p1.y) / 2
	};
	return mid;
};
export const getDirection = (p0: Point, p1: Point): 0 | 1 | 2 | 3 => {
	const diff = { x: p1.x - p0.x, y: p1.y - p0.y };
	if (diff.x >= 0 && diff.y >= 0) {
		return 0;
	} else if (diff.x >= 0 && diff.y < 0) {
		return 1;
	} else if (diff.x < 0 && diff.y >= 0) {
		return 2;
	} else {
		return 3;
	}
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

	const isForwardL0 = { x: l0.p1.x > l0.p0.x, y: l0.p1.y > l0.p0.y };
	const isForwardL1 = { x: l1.p1.x > l1.p0.x, y: l1.p1.y > l1.p0.y };

	const isInLimit = (
		isLimited: boolean,
		isStart: boolean,
		isForward: { x: boolean; y: boolean },
		intersection: Point,
		point: Point
	) => {
		if (isLimited) {
			if (isStart && isForward.x && intersection.x < point.x) {
				return false;
			}
			if (isStart && isForward.y && intersection.y < point.y) {
				return false;
			}
			if (!isStart && isForward.x && intersection.x > point.x) {
				return false;
			}
			if (!isStart && isForward.y && intersection.y > point.y) {
				return false;
			}
			return true;
		}
		return true;
	};

	if (!isInLimit(limits.l0P0, true, isForwardL0, { x, y }, l0.p0)) {
		return false;
	}
	if (!isInLimit(limits.l0P1, false, isForwardL0, { x, y }, l0.p1)) {
		return false;
	}
	if (!isInLimit(limits.l1P0, true, isForwardL1, { x, y }, l1.p0)) {
		return false;
	}
	if (!isInLimit(limits.l1P1, false, isForwardL1, { x, y }, l0.p1)) {
		return false;
	}

	return { x, y };
};

export const getSlope = (p0: Point, p1: Point) => {
	return (p1.y - p0.y) / (p1.x - p0.x);
};

export const getAngle = (anchor: Point, point: Point) => {
	const dx = point.x - anchor.x;
	const dy = point.y - anchor.y;
	const baseAngle = Math.atan(dy / dx);
	if (dx >= 0 && dy >= 0) return baseAngle;
	else if (dx >= 0 && dy < 0) return Math.PI * 2 + baseAngle;
	else return Math.PI + baseAngle;
};

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
	if ((!angle && angle !== 0) || (anchor.x === point.x && anchor.y === point.y)) {
		return { ...point };
	}

	const hypotenuse = getLength(anchor, point);
	const oldAngle = getAngle(anchor, point);

	const newAngle = oldAngle + angle;
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
	return seg.map((s) => {
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

// export const translatePSCollection = (segmentCollection: { [key: string]: PathSegment[] }, x = 0, y = 0) => {
// 	Object.entries(segmentCollection).forE
// }

export const translatePS = (segments: PathSegment[], x = 0, y = 0) => {
	const translated = segments.map((segment) => {
		const seg = [...segment] as PathSegment;
		if (isMovePathSegment(seg) || isLinePathSegment(seg)) {
			seg[1] += x;
			seg[2] += y;
		} else if (isArcPathSegment(seg)) {
			seg[6] += x;
			seg[7] += y;
		} else if (isCubicBezierPathSegment(seg)) {
			seg[1] += x;
			seg[2] += y;
			seg[3] += x;
			seg[4] += y;
			seg[5] += x;
			seg[6] += y;
		} else if (isQuadraticBezierPathSegment(seg)) {
			seg[1] += x;
			seg[2] += y;
			seg[3] += x;
			seg[4] += y;
		}
		return seg;
	});
	return translated;
};

export const scalePS = (segments: PathSegment[], scale = 1, origin = { x: 0, y: 0 }) => {
	const scaled = segments.map((segment) => {
		const seg = [...segment] as PathSegment;
		if (isMovePathSegment(seg) || isLinePathSegment(seg)) {
			const dx = (seg[1] - origin.x) * scale;
			const dy = (seg[2] - origin.y) * scale;
			seg[1] = origin.x + dx;
			seg[2] = origin.y + dy;
		} else if (isArcPathSegment(seg)) {
			const dx = (seg[6] - origin.x) * scale;
			const dy = (seg[7] - origin.y) * scale;
			seg[1] *= scale;
			seg[2] *= scale;
			seg[6] = origin.x + dx;
			seg[7] = origin.y + dy;
		} else if (isCubicBezierPathSegment(seg)) {
			const dx0 = (seg[1] - origin.x) * scale;
			const dy0 = (seg[2] - origin.y) * scale;
			const dx1 = (seg[3] - origin.x) * scale;
			const dy1 = (seg[4] - origin.y) * scale;
			const dx2 = (seg[5] - origin.x) * scale;
			const dy2 = (seg[6] - origin.y) * scale;
			seg[1] = origin.x + dx0;
			seg[2] = origin.y + dy0;
			seg[3] = origin.x + dx1;
			seg[4] = origin.y + dy1;
			seg[5] = origin.x + dx2;
			seg[6] = origin.y + dy2;
		} else if (isQuadraticBezierPathSegment(seg)) {
			const dx0 = (seg[1] - origin.x) * scale;
			const dy0 = (seg[2] - origin.y) * scale;
			const dx1 = (seg[3] - origin.x) * scale;
			const dy1 = (seg[4] - origin.y) * scale;
			seg[1] = origin.x + dx0;
			seg[2] = origin.y + dy0;
			seg[3] = origin.x + dx1;
			seg[4] = origin.y + dy1;
		}
		return seg;
	});
	return scaled;
};

export const rotatePS = (segments: PathSegment[], a = 0, origin = { x: 0, y: 0 }) => {
	const scaled = segments.map((segment) => {
		const seg = [...segment] as PathSegment;
		if (isMovePathSegment(seg) || isLinePathSegment(seg)) {
			// const dx = (seg[1] - origin.x);
			// const dy = (seg[2] - origin.y);
			// const angle =
			const { x, y } = rotatePoint(origin, { x: seg[1], y: seg[2] }, a);
			seg[1] = x;
			seg[2] = y;
		} else if (isArcPathSegment(seg)) {
			const { x, y } = rotatePoint(origin, { x: seg[6], y: seg[7] }, a);
			seg[6] = x;
			seg[7] = y;
		} else if (isCubicBezierPathSegment(seg)) {
			const { x: x0, y: y0 } = rotatePoint(origin, { x: seg[1], y: seg[2] }, a);
			const { x: x1, y: y1 } = rotatePoint(origin, { x: seg[3], y: seg[4] }, a);
			const { x: x2, y: y2 } = rotatePoint(origin, { x: seg[5], y: seg[6] }, a);
			seg[1] = x0;
			seg[2] = y0;
			seg[3] = x1;
			seg[4] = y1;
			seg[5] = x2;
			seg[6] = y2;
		} else if (isQuadraticBezierPathSegment(seg)) {
			const { x: x0, y: y0 } = rotatePoint(origin, { x: seg[1], y: seg[2] }, a);
			const { x: x1, y: y1 } = rotatePoint(origin, { x: seg[3], y: seg[4] }, a);
			seg[1] = x0;
			seg[2] = y0;
			seg[3] = x1;
			seg[4] = y1;
		}
		return seg;
	});
	return scaled;
};

export const transformPS = (
	path: PathSegment[],
	config: {
		origin?: Point;
		scale?: number;
		angle?: number;
		translateX?: number;
		translateY?: number;
	}
) => {
	const { origin = { x: 0, y: 0 }, scale = 1, angle = 0, translateX = 0, translateY = 0 } = config;
	let transformed = path.map((seg) => [...seg] as PathSegment);
	if (scale !== 1) {
		transformed = scalePS(transformed, scale, origin);
	}
	if (angle !== 0) {
		transformed = rotatePS(transformed, angle, origin);
	}
	if (translateX !== 0 || translateY !== 0) {
		transformed = translatePS(transformed, translateX, translateY);
	}
	return transformed;
};

export const getPointsFromPathSegment = (segment: PathSegment): Point | null => {
	if (isLinePathSegment(segment)) {
		return { x: segment[1], y: segment[2] };
	}
	if (isMovePathSegment(segment)) {
		return { x: segment[1], y: segment[2] };
	}
	if (isArcPathSegment(segment)) {
		return { x: segment[6], y: segment[7] };
	}
	if (isCubicBezierPathSegment(segment)) {
		return { x: segment[5], y: segment[6] };
	}
	if (isQuadraticBezierPathSegment(segment)) {
		return { x: segment[3], y: segment[4] };
	}
	return null;
};

export const getPathSize = (path: PathSegment[]) => {
	const points: Point[] = path
		.map((segment) => getPointsFromPathSegment(segment))
		.filter((point) => point !== null) as Point[];

	const xValues = points.map((point) => point.x);
	const yValues = points.map((point) => point.y);

	const minX = Math.min(...xValues);
	const maxX = Math.max(...xValues);
	const minY = Math.min(...yValues);
	const maxY = Math.max(...yValues);
	const width = maxX - minX;
	const height = maxY - minY;

	return { minX, maxX, minY, maxY, width, height };
};

export const generateLabelPath = (
	value: number,
	config: { r?: number; origin?: Point; scale?: number; angle: number }
) => {
	const { r = 0, origin = { x: 0, y: 0 }, scale = 1, angle = 0 } = config;

	const labelTextPathSegments = `${value}`
		.split('')
		.map((digit, i) => {
			return translatePS(numberPathSegments[Number.parseInt(digit, 10)], 60 * i, 0);
		})
		.flat(1);
	const stemWidth = 20;
	const stemLength = 50;

	const { width, height } = getPathSize(labelTextPathSegments);
	const padding = 20;
	const labelOutlinePathSegments: PathSegment[] = [
		['M', (width + padding * 2) / 2 + stemWidth / 2, 0],
		['L', width + padding * 2 - r, 0],
		['Q', width + padding * 2, 0, width + padding * 2, r],
		['L', width + padding * 2, 100 - r],
		['Q', width + padding * 2, 100, width + padding * 2 - r, 100],
		['L', r, 100],
		['Q', 0, 100, 0, 100 - r],
		['L', 0, r],
		['Q', 0, 0, r, 0],
		['L', (width + padding * 2) / 2 - stemWidth / 2, 0],
		['L', (width + padding * 2) / 2 - stemWidth / 2, -stemLength],
		['L', (width + padding * 2) / 2 + stemWidth / 2, -stemLength],
		['L', (width + padding * 2) / 2 + stemWidth / 2, 0],
		['Z']
	];

	const labelOrigin = { x: origin.x - (width + padding * 2) / 2, y: origin.y + stemLength };
	let combinedPaths = [...labelOutlinePathSegments, ...translatePS(labelTextPathSegments, 20, 15)];

	combinedPaths = translatePS(combinedPaths, labelOrigin.x, labelOrigin.y);
	combinedPaths = scalePS(combinedPaths, scale, origin);
	combinedPaths = rotatePS(combinedPaths, angle, origin);
	return combinedPaths;
	// return svgPathStringFromSegments(combinedPaths);
};
export const getQuadWidth = (quad: Quadrilateral) => {
	return getLength(getMidPoint(quad.p0, quad.p3), getMidPoint(quad.p1, quad.p2));
};
export const getQuadHeight = (quad: Quadrilateral) => {
	return getLength(getMidPoint(quad.p0, quad.p1), getMidPoint(quad.p3, quad.p2));
};

export type SerializedFacet = { triangle: Triangle };
export type SerializedBand = { facets: SerializedFacet[] };

const serializeVector3 = (v: Vector3): Point3 => {
	const { x, y, z } = v;
	return { x, y, z };
};

const serializeThreeTriangle = (t: ThreeTriangle): Triangle => {
	return {
		a: serializeVector3(t.a),
		b: serializeVector3(t.b),
		c: serializeVector3(t.c)
	};
};

export const serializeFacet = (f: Facet): SerializedFacet => {
	const triangle = serializeThreeTriangle(f.triangle);
	return { triangle };
};

export const serializeBand = (b: Band): { facets: SerializedFacet[] } => {
	return { facets: b.facets.map((facet) => serializeFacet(facet)) };
};

export const serializeGlobuleData = (gD: GlobuleData) => {
	return { bands: gD.bands.map((band) => serializeBand(band)) };
};
