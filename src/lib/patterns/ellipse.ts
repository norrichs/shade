import type { Point } from '$lib/patterns/flower-of-life.types';
import type {
	ArcPathSegment,
	Flag,
	MovePathSegment,
	PathSegment
} from '$lib/cut-pattern/cut-pattern.types';
import { getMidPoint } from './utils';

export type ArcParams = {
	p0: Point;
	p1: Point;
	fa: Flag;
	fs: Flag;
	r0: number;
	r1: number;
	rotationRadians: number;
};

export const getIntersectionsOfLineAndEllipse = (
	ellipse: { a: number; b: number },
	p0: Point,
	p1: Point
): [Point, Point] => {
	const { a, b } = ellipse;
	const m = (p1.y - p0.y) / (p1.x - p0.x);
	const c = p1.y - m * p1.x;

	const A = b ** 2 + a ** 2 * m ** 2;
	const B = 2 * a ** 2 * c * m;
	const D = Math.sqrt((a ** 2 * b ** 2 - a ** 2 * c ** 2) / A + (B / (2 * A)) ** 2);

	const x = [-B / (2 * A) - D, -B / (2 * A) + D];
	const y = [m * x[0] + c, m * x[1] + c];

	let intersections: [Point, Point] = [
		{ x: x[0], y: y[0] },
		{ x: x[1], y: y[1] }
	];
	if (
		isNaN(intersections[0].x) ||
		isNaN(intersections[0].y) ||
		isNaN(intersections[1].x) ||
		isNaN(intersections[1].y)
	) {
		console.error('Ellipse does not intersect line.  Returning midpoint as intersections');
		const mid = getMidPoint(p0, p1);
		intersections = [{ ...mid }, { ...mid }];
	}
	return intersections;
};

export const getCenterParameters = (arc: ArcParams) => {
	const { p0, p1, fa, fs, r0, r1, rotationRadians } = arc;
	const phi = rotationRadians;
	let rx = r0;
	let ry = r1;

	const { abs, sin, cos, sqrt } = Math;

	const sinphi = sin(phi),
		cosphi = cos(phi);

	// Step 1: simplify through translation/rotation
	const x = (cosphi * (p0.x - p1.x)) / 2 + (sinphi * (p0.y - p1.y)) / 2,
		y = (-sinphi * (p0.x - p1.x)) / 2 + (cosphi * (p0.y - p1.y)) / 2;

	const px = pow(x),
		py = pow(y),
		prx = pow(rx),
		pry = pow(ry);

	// correct of out-of-range radii
	const L = px / prx + py / pry;

	if (L > 1) {
		rx = sqrt(L) * abs(rx);
		ry = sqrt(L) * abs(ry);
	} else {
		rx = abs(rx);
		ry = abs(ry);
	}

	// Step 2 + 3: compute center
	const sign = fa === fs ? -1 : 1;
	const M = sqrt((prx * pry - prx * py - pry * px) / (prx * py + pry * px)) * sign;

	const _cx = (M * (rx * y)) / ry,
		_cy = (M * (-ry * x)) / rx;

	const cx = cosphi * _cx - sinphi * _cy + (p0.x + p1.x) / 2,
		cy = sinphi * _cx + cosphi * _cy + (p0.y + p1.y) / 2;
	// Step 4: compute θ and dθ
	const theta = vectorAngle({ x: 1, y: 0 }, { x: (x - _cx) / rx, y: (y - _cy) / ry });

	let _dTheta =
		deg(
			vectorAngle(
				{ x: (x - _cx) / rx, y: (y - _cy) / ry },
				{ x: (-x - _cx) / rx, y: (-y - _cy) / ry }
			)
		) % 360;

	if (fs === 0 && _dTheta > 0) _dTheta -= 360;
	if (fs === 1 && _dTheta < 0) _dTheta += 360;
	return { center: { x: cx, y: cy }, theta, dTheta: rad(_dTheta) };
};

const vectorAngle = (u: Point, v: Point): number => {
	const { acos, sqrt } = Math;
	const sign = u.x * v.y - u.y * v.x < 0 ? -1 : 1,
		ua = sqrt(u.x * u.x + u.y * u.y),
		va = sqrt(v.x * v.x + v.y * v.y),
		dot = u.x * v.x + u.y * v.y;

	return sign * acos(dot / (ua * va));
};

const deg = (angle: number) => (angle * 180) / Math.PI;
const rad = (angle: number) => (angle * Math.PI) / 180;
const pow = (n: number) => Math.pow(n, 2);

export const getEndpointParameters = (
	ellipse: {
		center: Point;
		r0: number;
		r1: number;
		rotation: number;
	},
	theta: number,
	dTheta: number
): { p0: Point; p1: Point; fa: Flag; fs: Flag } => {
	const p0 = getEllipsePointForAngle(ellipse, theta);
	const p1 = getEllipsePointForAngle(ellipse, theta + dTheta);

	const fa = Math.abs(dTheta) > Math.PI ? 1 : 0;
	const fs = dTheta > 0 ? 1 : 0;

	return { p0, p1, fa, fs };
};

const getEllipsePointForAngle = (
	ellipse: {
		center: Point;
		r0: number;
		r1: number;
		rotation: number;
	},
	angle: number
): Point => {
	const { center, r0, r1, rotation } = ellipse;
	const { abs, sin, cos } = Math;

	const M = abs(r0) * cos(angle);
	const N = abs(r1) * sin(angle);

	return {
		x: center.x + cos(rotation) * M - sin(rotation) * N,
		y: center.y + sin(rotation) * M + cos(rotation) * N
	};
};

export type ArcPathSegments = [MovePathSegment, ArcPathSegment];
export const isArcPathSegments = (segments: unknown): segments is ArcPathSegments => {
	return (
		Array.isArray(segments) &&
		segments.length === 2 &&
		segments[0][0] === 'M' &&
		segments[1][0] === 'A'
	);
};

export const getCenteringTransform = (
	arc: ArcParams | [MovePathSegment, ArcPathSegment] | string
): { rotationDegrees: number; translate: Point } => {
	const arcParams = typeof arc === 'string' || isArcPathSegments(arc) ? getArcParams(arc) : arc;
	if (!arcParams) {
		throw new Error('no arc params');
	}
	const { center } = getCenterParameters(arcParams);

	const centering = {
		rotationDegrees: -deg(arcParams.rotationRadians),
		translate: { x: -center.x, y: -center.y }
	};
	return centering;
};

export const getArcParams = (arc: string | ArcPathSegments): ArcParams => {
	if (typeof arc === 'string') {
		return parseArcString(arc) as ArcParams;
	} else {
		return parseArcSegments(arc) as ArcParams;
	}
};

export const parseArcString = (arc: string): ArcParams => {
	const arr = arc.split(' ');
	return parseArcSegments([arr.slice(0, 2), arr.slice(3, 11)] as ArcPathSegments);
};

export const parseArcSegments = (arc: ArcPathSegments): ArcParams => {
	const result: ArcParams = {
		p0: { x: arc[0][1], y: arc[0][2] },
		r0: arc[1][1],
		r1: arc[1][2],
		rotationRadians: rad(arc[1][3]),
		fa: arc[1][4] as 0 | 1,
		fs: arc[1][5] as 0 | 1,
		p1: { x: arc[1][6], y: arc[1][7] }
	};
	return result;
};
export const svgFullEllipseArcFromSegments = (arc: ArcPathSegment[]) => {
	if (arc[1][0] !== 'A' || arc.length !== 2) {
		throw new Error('argument is not an Arc PathSegment');
	}
	return `M ${arc[0][1]} ${arc[0][2]}
	A ${arc[1][1]} ${arc[1][2]} ${arc[1][3]} ${arc[1][4]} ${arc[1][5]} ${arc[1][6]} ${arc[1][7]}
	A ${arc[1][1]} ${arc[1][2]} ${arc[1][3]} ${arc[1][4] ? 0 : 1} ${arc[1][5]} ${arc[0][1]} ${
		arc[0][2]
	}`;
};
export const svgFullEllipseArcFromParams = (arc: ArcParams) => {
	const path = `M ${arc.p0.x} ${arc.p0.y}
	A ${arc.r0} ${arc.r1} ${(arc.rotationRadians * 180) / Math.PI} ${arc.fa} ${arc.fs} ${arc.p1.x} ${
		arc.p1.y
	}
	Z
	M ${arc.p1.x} ${arc.p1.y}
	A ${arc.r0} ${arc.r1} ${(arc.rotationRadians * 180) / Math.PI} ${arc.fa ? 0 : 1} ${arc.fs} ${
		arc.p0.x
	} ${arc.p0.y}`;
	return path;
};

export const svgArcFromParams = (arc: ArcParams) => {
	const path = `M ${arc.p0.x} ${arc.p0.y}
	A ${arc.r0} ${arc.r1} ${(arc.rotationRadians * 180) / Math.PI} ${arc.fa} ${arc.fs} ${arc.p1.x} ${
		arc.p1.y
	}`;
	return path;
};

export const svgArcWedgeFromParams = (arc: ArcParams) => {
	const {center} = getCenterParameters(arc)

	const path = `M ${center.x} ${center.y}
	L ${arc.p0.x} ${arc.p0.y}
	A ${arc.r0} ${arc.r1} ${(arc.rotationRadians * 180) / Math.PI} ${arc.fa} ${arc.fs} ${arc.p1.x} ${
		arc.p1.y}
	L ${center.x} ${center.y}
	Z`;
	return path;
};
