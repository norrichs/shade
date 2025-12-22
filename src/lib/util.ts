import { CubicBezierCurve, CurvePath, Triangle, Vector2, Vector3 } from 'three';
import { Bezier, type Line } from 'bezier-js';
import type { BezierConfig, Point, Point3 } from '$lib/types';
import type { Intersector } from '$lib/types';

export const rad = (deg: number): number => (Math.PI / 180) * deg;
export const deg = (rad: number): number => (180 / Math.PI) * rad;

export const getPolar = (x: number, y: number, cx = 0, cy = 0): { r: number; theta: number } => {
	const r = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));
	const sinx = Math.sin(x - cx);
	const cosy = Math.cos(y - cy);
	const theta =
		sinx >= 0 && cosy >= 0
			? Math.asin(sinx)
			: sinx >= 0 && cosy < 0
			? Math.PI - Math.asin(sinx)
			: sinx < 0 && cosy < 0
			? Math.PI + Math.asin(sinx)
			: Math.PI * 2 + Math.asin(sinx);
	return { r, theta };
};

// | { type: 'line'; line: [Vector2, Vector2] };

// Given a bezier curve and a value along a dimension,
// find the points on the curve that have that value
export const getCubicBezierIntersection = (
	threeBezier:
		| CubicBezierCurve
		| { v0: Vector2; v1: Vector2; v2: Vector2; v3: Vector2 }
		| { v0: Point; v1: Point; v2: Point; v3: Point },
	intersector: Intersector
	// precision = 0.001,
	// iterationLimit = 10
): Vector2 | Vector2[] | undefined => {
	const { v0, v1, v2, v3 } = threeBezier;
	const bezier = new Bezier(v0, v1, v2, v3);
	const dim = intersector.dimension;
	const val = intersector.value;
	const intersectorLine: Line = {
		p1: {
			x: dim === 'x' ? val : -1000,
			y: dim === 'x' ? -1000 : val
		},
		p2: {
			x: dim === 'x' ? val : 1000,
			y: dim === 'x' ? 1000 : val
		}
	};
	const ints = bezier.intersects(intersectorLine);
	const intPoints = ints
		.map((t) => {
			if (typeof t === 'number') {
				const point = bezier.get(t);
				return new Vector2(point.x, point.y);
			}
			return new Vector2(0, 0);
		})
		.filter((point) => point !== undefined);
	return intPoints;
	// const points = bezier.getSpacedPoints(100);
	// const ints: Vector2[] = []
	// points.forEach((point, i) => {
	// 	if (i === 0 || i === points.length - 1) {
	// 		return
	// 	}
	// 	if (points[i-1][intersector.dimension] )
	// })
};

export const generateSvgUrl = (id: string) => {
	const svg = document.getElementById(id);

	if (svg) {
		const quads = svg.querySelectorAll('.svg-pattern-quad');
		quads?.forEach((q) => q.remove());
	}
	if (!svg) return;
	const serializer = new XMLSerializer();
	const svg_blob = new Blob([serializer.serializeToString(svg)], { type: 'image/svg+xml' });
	const url = URL.createObjectURL(svg_blob);
	return url;
};

export const downloadSvg = (id: string, filename?: string) => {
	const url = generateSvgUrl('pattern-svg');
	if (url) {
		const a = document.createElement('a');
		a.href = url;
		a.download = filename || 'globule-pattern.svg';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}
};

export const round = (n: number, decimals?: number) => {
	const x = decimals && decimals > 0 ? Math.pow(10, decimals - 1) : 1;
	return Math.round(n * x) / x;
};

export const formatPoint3 = (p: Point3, decimals?: number) => {
	return `(${round(p.x, decimals)}, ${round(p.y, decimals)}, ${round(p.z, decimals)})`;
};

export const isClose = (n0?: number, n1?: number, precision: number = 1 / 1000000) =>
	n1 !== undefined && n0 !== undefined && Math.abs(n1 - n0) < precision;

export const getCubicBezier = (cfg: BezierConfig) => {
	const [p0, p1, p2, p3] = cfg.points;
	return new CubicBezierCurve(
		new Vector2(p0.x, p0.y),
		new Vector2(p1.x, p1.y),
		new Vector2(p2.x, p2.y),
		new Vector2(p3.x, p3.y)
	);
};

export const getCubicBezierCurvePath = (cfg: BezierConfig[]) => {
	const curvePath = new CurvePath<Vector2>();
	cfg.forEach((bezierConfig) => curvePath.add(getCubicBezier(bezierConfig)));
	return curvePath;
};

export const getVector3 = (cfg: Point3 | Point3[]) => {
	if (Array.isArray(cfg)) {
		return cfg.map((p) => new Vector3(p.x, p.y, p.z));
	}
	const { x, y, z } = cfg;
	return new Vector3(x, y, z);
};

export const average = (arr: number[]) => arr.reduce((acc, val) => acc + val, 0) / arr.length;

export const getSlope = (v0: Vector2, v1: Vector2): number => {
	return (v1.y - v0.y) / (v1.x - v0.x);
};

export const getIntersectionOfLines = (
	l1: { p0: Vector2; p1: Vector2 },
	l2: { p0: Vector2; p1: Vector2 }
): Vector2 | null => {
	let b1, b2, x, y: number;

	const m1 = getSlope(l1.p0, l1.p1);
	const m2 = getSlope(l2.p0, l2.p1);
	if (m1 === m2) {
		return null;
	} else if (!Number.isFinite(m1)) {
		x = l1.p1.x;
		b2 = l2.p1.y - m2 * l2.p1.x;
		y = m2 * x + b2;
	} else if (!Number.isFinite(m2)) {
		x = l2.p1.x;
		b1 = l1.p1.y - m1 * l1.p1.x;
		y = m1 * x + b1;
	} else {
		b1 = l1.p1.y - m1 * l1.p1.x;
		b2 = l2.p1.y - m2 * l2.p1.x;
		x = (b2 - b1) / (m1 - m2);
		y = m1 * x + b1;
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		console.error('--------- Infinite', x, y, m1, m2, b1, b2);
	}
	return new Vector2(x, y);
};

export const printTriangle = (t: Triangle, decimals = 3) => {
	return `a: ${round(t.a.x, decimals)}, ${round(t.a.y, decimals)}, ${round(t.a.z, decimals)}
b: ${round(t.b.x, decimals)}, ${round(t.b.y, decimals)}, ${round(t.b.z, decimals)}
c: ${round(t.c.x, decimals)}, ${round(t.c.y, decimals)}, ${round(t.c.z, decimals)}`;
};

export const formatAngle = (angle: number, precision = 1 / 10) => {
	const p = 1 / precision;
	return `${Math.round(((angle * 180) / Math.PI) * p) / p}°`;
};
