import { Vector3 } from 'three';
import { computeTiledLabelAngle } from '../compute-tiled-label-angle';
import type { Quadrilateral } from '$lib/types';

// Axis-aligned unit square, following the quad diagram (a=bottom-left,
// b=bottom-right, c=top-right, d=top-left in a y-down / y-up agnostic sense):
//   d(0,10) ---- c(10,10)
//   |                   |
//   a(0,0)  ---- b(10,0)
const square: Quadrilateral = {
	a: new Vector3(0, 0, 0),
	b: new Vector3(10, 0, 0),
	c: new Vector3(10, 10, 0),
	d: new Vector3(0, 10, 0)
};

describe('computeTiledLabelAngle', () => {
	test('anchor near bottom edge (a→b): stem points outward (-y), text parallel to edge', () => {
		// Anchor just inside the bottom edge. Nearest edge is a→b (along +x).
		// Outward normal points away from centroid (5,5) → -y = (0,-1).
		// rotate(θ): (0,1) → (-sinθ, cosθ) = (0,-1) → θ = π.
		const angle = computeTiledLabelAngle({ x: 5, y: 1 }, square);
		expect(Math.abs(angle)).toBeCloseTo(Math.PI); // ±π both valid
	});

	test('anchor near top edge (c→d): outward normal is +y → θ = 0', () => {
		const angle = computeTiledLabelAngle({ x: 5, y: 9 }, square);
		expect(angle).toBeCloseTo(0);
	});

	test('anchor near right edge (b→c): outward normal is +x → θ = -π/2', () => {
		// N = (1,0): (-sinθ, cosθ) = (1,0) → sinθ = -1, cosθ = 0 → θ = -π/2.
		const angle = computeTiledLabelAngle({ x: 9, y: 5 }, square);
		expect(angle).toBeCloseTo(-Math.PI / 2);
	});

	test('anchor near left edge (d→a): outward normal is -x → θ = π/2', () => {
		const angle = computeTiledLabelAngle({ x: 1, y: 5 }, square);
		expect(angle).toBeCloseTo(Math.PI / 2);
	});

	test('text direction under rotation is parallel to the nearest edge', () => {
		// Skewed edge so parallelism is non-trivial. Nearest edge a→b runs along
		// direction (3,1)/√10. After rotate(θ), path-space text dir (1,0) must map
		// to that edge direction (up to sign).
		const skew: Quadrilateral = {
			a: new Vector3(0, 0, 0),
			b: new Vector3(3, 1, 0),
			c: new Vector3(2, 5, 0),
			d: new Vector3(-1, 4, 0)
		};
		const angle = computeTiledLabelAngle({ x: 1.5, y: 0.5 }, skew);
		const textDir = { x: Math.cos(angle), y: Math.sin(angle) };
		const edgeDir = { x: 3 / Math.hypot(3, 1), y: 1 / Math.hypot(3, 1) };
		// Cross product ~0 means parallel (either orientation).
		expect(textDir.x * edgeDir.y - textDir.y * edgeDir.x).toBeCloseTo(0);
	});
});
