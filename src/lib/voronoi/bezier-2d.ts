import { Vector2 } from 'three';

/** Point on the quadratic bezier (p0, ctrl, p1) at parameter t in [0,1]. */
export function sampleQuadratic(p0: Vector2, ctrl: Vector2, p1: Vector2, t: number): Vector2 {
	const mt = 1 - t;
	const a = mt * mt;
	const b = 2 * mt * t;
	const c = t * t;
	return new Vector2(a * p0.x + b * ctrl.x + c * p1.x, a * p0.y + b * ctrl.y + c * p1.y);
}

/**
 * Parameter t in (0,1) where the quadratic bezier (p0, ctrl, p1) crosses the line through
 * `linePoint` with direction `lineDir`. Solves the quadratic of the curve's signed distance
 * to the line. Returns null when there is no crossing strictly inside (0,1). When two roots
 * lie inside, returns the one nearest t=0.5 (the crossing closest to the curve's apex).
 */
export function quadraticLineSplitT(
	p0: Vector2,
	ctrl: Vector2,
	p1: Vector2,
	linePoint: Vector2,
	lineDir: Vector2
): number | null {
	// Line normal (perp of lineDir); signed distance f(p) = (p - linePoint) . n.
	const nx = -lineDir.y;
	const ny = lineDir.x;
	const f = (p: Vector2) => (p.x - linePoint.x) * nx + (p.y - linePoint.y) * ny;
	const f0 = f(p0);
	const fc = f(ctrl);
	const f1 = f(p1);
	// f(B(t)) = A t^2 + B t + C, with C=f0, B=2(fc-f0), A=f0-2fc+f1.
	const A = f0 - 2 * fc + f1;
	const B = 2 * (fc - f0);
	const C = f0;
	const roots: number[] = [];
	if (Math.abs(A) < 1e-12) {
		if (Math.abs(B) > 1e-12) roots.push(-C / B);
	} else {
		const disc = B * B - 4 * A * C;
		if (disc >= 0) {
			const s = Math.sqrt(disc);
			roots.push((-B + s) / (2 * A));
			roots.push((-B - s) / (2 * A));
		}
	}
	const inside = roots.filter((t) => t > 1e-9 && t < 1 - 1e-9);
	if (inside.length === 0) return null;
	inside.sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5));
	return inside[0];
}
