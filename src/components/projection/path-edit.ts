import type { Vector2 } from 'three';

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
