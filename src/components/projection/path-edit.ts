import type { CubicBezierCurve, CurvePath, Vector2 } from 'three';

export const viewBox = (canv: { minX: number; minY: number; maxX: number; maxY: number }) =>
	`${canv.minX} ${canv.minY} ${canv.maxX - canv.minX} ${canv.maxY - canv.minY}`;

export const getPathFromCurves = (curvePath: CurvePath<Vector2>): string => {
	const curves = curvePath.curves as CubicBezierCurve[];

	const starter = `M ${curves[0].v0.x} ${curves[0].v0.y}`;
	const path = curves.reduce(
		(path, c) => `
    ${path} C 
    ${c.v1.x} ${c.v1.y}, 
    ${c.v2.x} ${c.v2.y},
    ${c.v3.x} ${c.v3.y} `,
		starter
	);
	return path;
};
// export const getPathFromCurves = (curves: BezierConfig[]): string => {
// 	const starter = `M ${curves[0].points[0].x} ${-curves[0].points[0].y}`;
// 	const path = curves.reduce(
// 		(path, c) => `
//     ${path} C
//     ${c.points[1].x} ${-c.points[1].y},
//     ${c.points[2].x} ${-c.points[2].y},
//     ${c.points[3].x} ${-c.points[3].y} `,
// 		starter
// 	);

// 	return path;
// };

export const getPathFromVectors = (v: Vector2[]) => {
	let pathString = `M ${v[0].x} ${v[0].y}`;
	const rest = v.slice(1);
	pathString = `${pathString} ${rest.map((vec) => `L ${vec.x} ${vec.y}`).join(' ')} z`;
	return pathString;
};
