import type { NestShape, Pt } from '../types';

/** Strip of quads along a polyline, half-width hw. Pivot = bbox centre. */
const stripShape = (spine: Pt[], hw: number): NestShape => {
	const polygons: Pt[][] = [];
	for (let i = 0; i + 1 < spine.length; i++) {
		const a = spine[i];
		const b = spine[i + 1];
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		const nx = (-(b.y - a.y) / len) * hw;
		const ny = ((b.x - a.x) / len) * hw;
		polygons.push([
			{ x: a.x + nx, y: a.y + ny },
			{ x: b.x + nx, y: b.y + ny },
			{ x: b.x - nx, y: b.y - ny },
			{ x: a.x - nx, y: a.y - ny }
		]);
	}
	const xs = polygons.flat().map((p) => p.x);
	const ys = polygons.flat().map((p) => p.y);
	return {
		polygons,
		pivot: {
			x: (Math.min(...xs) + Math.max(...xs)) / 2,
			y: (Math.min(...ys) + Math.max(...ys)) / 2
		}
	};
};

/** Chevron like the reference screenshot: two 100-long arms, 100° apart, opening right. */
export const chevron = (hw = 8): NestShape => {
	const arm = 100;
	const half = (50 * Math.PI) / 180;
	const apex = { x: 0, y: arm * Math.sin(half) };
	const spine: Pt[] = [];
	for (let t = 0; t <= 1.0001; t += 0.1)
		spine.push({ x: apex.x + t * arm * Math.cos(half), y: apex.y - t * arm * Math.sin(half) });
	spine.reverse();
	for (let t = 0.1; t <= 1.0001; t += 0.1)
		spine.push({ x: apex.x + t * arm * Math.cos(half), y: apex.y + t * arm * Math.sin(half) });
	return stripShape(spine, hw);
};

export const rect = (w: number, h: number): NestShape => ({
	polygons: [
		[
			{ x: 0, y: 0 },
			{ x: w, y: 0 },
			{ x: w, y: h },
			{ x: 0, y: h }
		]
	],
	pivot: { x: w / 2, y: h / 2 }
});
