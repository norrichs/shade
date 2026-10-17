import {
	type PathSegment,
	type Point,
	isMovePathSegment,
	isLinePathSegment,
	isArcPathSegment,
	isCubicBezierPathSegment,
	isQuadraticBezierPathSegment,
	type Quadrilateral
} from '#lib/types.js';
import { Vector2, Vector3 } from 'three';

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

export const getMidPoint = <T extends Point | Vector2 | Vector3>(
	p1: T,
	p2: T,
	proportion = 0.5
): T => {
	if (p1 instanceof Vector3 && p2 instanceof Vector3) {
		return p1.clone().add(p2).multiplyScalar(proportion) as T;
	}
	if (p1 instanceof Vector2 && p2 instanceof Vector2) {
		return p1.clone().add(p2).multiplyScalar(proportion) as T;
	}
	// Default case for Point objects
	const point1 = p1 as Point;
	const point2 = p2 as Point;
	return {
		x: point1.x + (point2.x - point1.x) * proportion,
		y: point1.y + (point2.y - point1.y) * proportion
	} as T;
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

export const getAngle = (anchor: Point, point: Point) => {
	const dx = point.x - anchor.x;
	const dy = point.y - anchor.y;
	const baseAngle = Math.atan(dy / dx);
	if (dx >= 0 && dy >= 0) return baseAngle;
	else if (dx >= 0 && dy < 0) return Math.PI * 2 + baseAngle;
	else return Math.PI + baseAngle;
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

const getPointsFromPathSegment = (segment: PathSegment): Point | null => {
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

export const getQuadWidth = (quad: Quadrilateral) => {
	return getLength(getMidPoint(quad.a, quad.d), getMidPoint(quad.b, quad.c));
};

export const svgPathStringFromSegments = (segments: PathSegment[]) => {
	return segments
		.map((segment) =>
			segment
				.map((elem) => {
					if (typeof elem === 'string') {
						return elem;
					} else {
						return `${elem}`;
					}
				})
				.join(' ')
		)
		.join('\n');
};

export const mmFromInches = (inches: number) => 25.4 * inches;
