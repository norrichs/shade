import { Vector3 } from 'three';
import { fitPlane } from '../fit-plane';

describe('fitPlane', () => {
	it('recovers the normal of an axis-aligned plane (up to sign)', () => {
		const pts = [
			new Vector3(0, 0, 5),
			new Vector3(1, 0, 5),
			new Vector3(0, 1, 5),
			new Vector3(2, 3, 5)
		];
		const { normal, centroid } = fitPlane(pts);
		expect(Math.abs(normal.z)).toBeCloseTo(1, 5);
		expect(Math.abs(normal.x)).toBeCloseTo(0, 5);
		expect(Math.abs(normal.y)).toBeCloseTo(0, 5);
		expect(centroid.z).toBeCloseTo(5, 5);
	});

	it('recovers a tilted plane normal up to sign', () => {
		const n = new Vector3(0, -Math.SQRT1_2, Math.SQRT1_2);
		const u = new Vector3(1, 0, 0);
		const v = new Vector3().crossVectors(n, u).normalize();
		const pts = [
			new Vector3(),
			u.clone(),
			v.clone(),
			u.clone().multiplyScalar(2).add(v.clone().multiplyScalar(-1))
		];
		const { normal } = fitPlane(pts);
		expect(Math.abs(normal.dot(n))).toBeCloseTo(1, 5);
	});

	it('orients the normal away from a given center', () => {
		const pts = [new Vector3(0, 0, 5), new Vector3(1, 0, 5), new Vector3(0, 1, 5)];
		const center = new Vector3(0, 0, 0);
		const { normal } = fitPlane(pts, { orientAwayFrom: center });
		expect(normal.z).toBeGreaterThan(0);
	});

	it('uses the fallback normal for fewer than 3 points', () => {
		const fallback = new Vector3(0, 1, 0);
		const { normal } = fitPlane([new Vector3(1, 1, 1)], { fallbackNormal: fallback });
		expect(normal.x).toBeCloseTo(0, 6);
		expect(normal.y).toBeCloseTo(1, 6);
		expect(normal.z).toBeCloseTo(0, 6);
	});

	it('uses the fallback normal for collinear points (degenerate fit)', () => {
		const fallback = new Vector3(0, 0, 1);
		const pts = [
			new Vector3(0, 0, 0),
			new Vector3(1, 1, 1),
			new Vector3(2, 2, 2),
			new Vector3(3, 3, 3)
		];
		const { normal } = fitPlane(pts, { fallbackNormal: fallback });
		expect(normal.z).toBeCloseTo(1, 6);
	});

	it('handles the isotropic-planar case (equal covariance diagonals, theta=0)', () => {
		// A non-square rectangle rotated 45deg in the z=0 plane yields equal diagonal
		// covariance entries with a nonzero off-diagonal, which drives theta to 0 in the
		// (0,1) Jacobi pair. This is the exact path the Math.sign(0) avoidance protects.
		const u = new Vector3(1, 1, 0).normalize();
		const v = new Vector3(-1, 1, 0).normalize();
		const corners = [
			[2, 1],
			[2, -1],
			[-2, 1],
			[-2, -1]
		].map(([a, b]) => u.clone().multiplyScalar(a).add(v.clone().multiplyScalar(b)));
		const { normal } = fitPlane(corners);
		expect(Math.abs(normal.z)).toBeCloseTo(1, 5);
		expect(Math.abs(normal.x)).toBeCloseTo(0, 5);
		expect(Math.abs(normal.y)).toBeCloseTo(0, 5);
	});
});
