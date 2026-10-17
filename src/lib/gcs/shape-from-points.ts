import type { Vector2 } from 'three';
import type { BezierConfig, PointConfig2, ShapeConfig } from '#lib/types.js';

const point = (x: number, y: number): PointConfig2 => ({
	type: 'PointConfig2',
	x,
	y,
	pointType: 'angled'
});

/** A straight segment as a cubic, handles at 1/3 and 2/3. */
const line = (a: Vector2, b: Vector2): BezierConfig => ({
	type: 'BezierConfig',
	points: [
		point(a.x, a.y),
		point(a.x + (b.x - a.x) / 3, a.y + (b.y - a.y) / 3),
		point(a.x + ((b.x - a.x) * 2) / 3, a.y + ((b.y - a.y) * 2) / 3),
		point(b.x, b.y)
	]
});

/**
 * An asymmetric GCS whose prototype vertices are exactly `points`, in order.
 * divideCurve with one division takes each curve's end point, so curve k runs
 * point k−1 → point k (curve 0 closes from the last point).
 */
export function shapeConfigFromPoints(
	points: Vector2[],
	meta: { id: number; level: number; isPrimary: boolean }
): ShapeConfig {
	const n = points.length;
	return {
		type: 'ShapeConfig',
		id: meta.id,
		...(meta.isPrimary ? { isPrimary: true } : {}),
		level: meta.level,
		blend: { mode: 'linear' },
		sampleMethod: { method: 'divideCurve', divisions: 1 },
		symmetry: 'asymmetric',
		symmetryNumber: 1,
		curves: points.map((p, k) => line(points[(k - 1 + n) % n], p))
	};
}
