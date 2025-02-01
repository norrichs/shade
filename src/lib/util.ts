import { Vector2, type CubicBezierCurve } from 'three';
import { Bezier, type Line } from 'bezier-js';
import type { Point, Point3 } from '$lib/types';
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
	console.debug('*** svg', svg);
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
