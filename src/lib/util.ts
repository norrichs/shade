import { CubicBezierCurve, Vector2 } from 'three';
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

type Intersector =
	| { dimension: 'x'; value: number }
	| { dimension: 'y'; value: number }
	// | { type: 'line'; line: [Vector2, Vector2] };

export const getCubicBezierIntersection = (
	bezier: CubicBezierCurve,
	intersector: Intersector,
	precision: number = 0.001,
	iterationLimit: number = 10,
): Vector2 | Vector2[] | undefined => {
	const points = bezier.getSpacedPoints(100);
	const ints: Vector2[] = []
	points.forEach((point, i) => {
		if (i ===0 || i === points.length-1)
		if (point[intersector.dimension])
	})



};
