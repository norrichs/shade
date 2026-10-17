import { Vector2 } from 'three';

/** Shoelace area of a closed loop; positive when counter-clockwise. */
export function signedArea(loop: Vector2[]): number {
	let sum = 0;
	loop.forEach((p, i) => {
		const q = loop[(i + 1) % loop.length];
		sum += p.x * q.y - q.x * p.y;
	});
	return sum / 2;
}

export function largestLoop(loops: Vector2[][]): Vector2[] {
	return loops.reduce((best, loop) =>
		Math.abs(signedArea(loop)) > Math.abs(signedArea(best)) ? loop : best
	);
}

export function orientCCW(loop: Vector2[]): Vector2[] {
	return signedArea(loop) < 0 ? [...loop].reverse() : loop;
}

/** Area centroid of a closed loop; the vertex average when the area is ~0. */
const areaCentroid = (loop: Vector2[]): Vector2 => {
	const area = signedArea(loop);
	if (Math.abs(area) < 1e-12) {
		return loop.reduce((sum, p) => sum.add(p), new Vector2()).divideScalar(loop.length);
	}
	let cx = 0;
	let cy = 0;
	loop.forEach((p, i) => {
		const q = loop[(i + 1) % loop.length];
		const cross = p.x * q.y - q.x * p.y;
		cx += (p.x + q.x) * cross;
		cy += (p.y + q.y) * cross;
	});
	return new Vector2(cx / (6 * area), cy / (6 * area));
};

/**
 * The loop, counter-clockwise, beginning at its start point: the outermost place
 * it crosses the ray from its own area centroid toward +X (inserted as a new
 * point). Measuring from the loop's centroid rather than the globule axis keeps
 * the start moving smoothly with the loop, so an off-axis slice drifting across
 * the axis between levels doesn't jump its start (and twist the bands). Shapes
 * that differ only in scale or position start in the same direction. A loop the
 * ray never crosses (degenerate) starts at the vertex nearest that direction.
 */
export function startIndexedLoop(loop: Vector2[]): Vector2[] {
	const ccw = orientCCW(loop);
	const n = ccw.length;
	const centroid = areaCentroid(ccw);

	let best: { edge: number; x: number } | undefined;
	for (let i = 0; i < n; i++) {
		const p = ccw[i];
		const q = ccw[(i + 1) % n];
		// Half-open so a vertex on the ray's line is counted by exactly one edge.
		if (p.y <= centroid.y === q.y <= centroid.y) continue;
		const x = p.x + ((q.x - p.x) * (centroid.y - p.y)) / (q.y - p.y);
		if (x > centroid.x && (!best || x > best.x)) best = { edge: i, x };
	}

	if (best) {
		const { edge, x } = best;
		const start = new Vector2(x, centroid.y);
		const after = [...ccw.slice(edge + 1), ...ccw.slice(0, edge + 1)];
		// Drop endpoints the crossing coincides with so no point repeats.
		const rest = after.filter((p) => !p.equals(start));
		return [start, ...rest];
	}

	let startIndex = 0;
	let bestAngle = Infinity;
	ccw.forEach((p, i) => {
		const angle = Math.abs(Math.atan2(p.y - centroid.y, p.x - centroid.x));
		if (angle < bestAngle) {
			bestAngle = angle;
			startIndex = i;
		}
	});
	return [...ccw.slice(startIndex), ...ccw.slice(0, startIndex)];
}

/** `n` points at equal arc length around the closed loop, the first at `loop[0]`. */
export function resampleByArcLength(loop: Vector2[], n: number): Vector2[] {
	const cumulative = [0];
	loop.forEach((p, i) => {
		cumulative.push(cumulative[i] + p.distanceTo(loop[(i + 1) % loop.length]));
	});
	const total = cumulative[loop.length];

	const points: Vector2[] = [];
	let edge = 0;
	for (let k = 0; k < n; k++) {
		const target = (k * total) / n;
		while (cumulative[edge + 1] < target) edge++;
		const span = cumulative[edge + 1] - cumulative[edge];
		const u = span === 0 ? 0 : (target - cumulative[edge]) / span;
		points.push(loop[edge].clone().lerp(loop[(edge + 1) % loop.length], u));
	}
	return points;
}
