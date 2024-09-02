import { Vector2, type CubicBezierCurve } from 'three';
import { Bezier, type Line } from 'bezier-js';
import type { Point } from '$lib/types';
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

export const show_svg = (id: string) => {
	const svg = document.getElementById(id);
	if (!svg) return;
	const serializer = new XMLSerializer();
	const svg_blob = new Blob([serializer.serializeToString(svg)], { type: 'image/svg+xml' });
	const url = URL.createObjectURL(svg_blob);
	const svg_win = window.open(url, 'svg_win');
};
