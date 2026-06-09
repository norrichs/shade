import { Vector2 } from 'three';
import { sampleQuadratic, quadraticLineSplitT } from '../bezier-2d';

describe('sampleQuadratic', () => {
	const p0 = new Vector2(0, 0);
	const ctrl = new Vector2(1, 1);
	const p1 = new Vector2(2, 0);

	it('returns endpoints at t=0 and t=1', () => {
		expect(sampleQuadratic(p0, ctrl, p1, 0).distanceTo(p0)).toBeCloseTo(0, 10);
		expect(sampleQuadratic(p0, ctrl, p1, 1).distanceTo(p1)).toBeCloseTo(0, 10);
	});

	it('returns the midpoint formula at t=0.5', () => {
		// (p0 + 2*ctrl + p1) / 4
		const m = sampleQuadratic(p0, ctrl, p1, 0.5);
		expect(m.x).toBeCloseTo(1, 10);
		expect(m.y).toBeCloseTo(0.5, 10);
	});
});

describe('quadraticLineSplitT', () => {
	// Parabola: p0=(-1,1), ctrl=(0,0), p1=(1,1). X(t) = -1 + 2t, crosses x=0 at t=0.5.
	const p0 = new Vector2(-1, 1);
	const ctrl = new Vector2(0, 0);
	const p1 = new Vector2(1, 1);

	it('finds the crossing of the vertical line through the control point', () => {
		const t = quadraticLineSplitT(p0, ctrl, p1, new Vector2(0, 0), new Vector2(0, 1));
		expect(t).not.toBeNull();
		expect(t as number).toBeCloseTo(0.5, 6);
	});

	it('returns null when the line never crosses the curve inside (0,1)', () => {
		const t = quadraticLineSplitT(p0, ctrl, p1, new Vector2(5, 0), new Vector2(0, 1));
		expect(t).toBeNull();
	});
});
