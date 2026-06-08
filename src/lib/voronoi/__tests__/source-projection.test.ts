import { Vector2, Vector3 } from 'three';
import {
	buildPlaneBasis,
	intersectRayPlane,
	projectToPlane2D,
	plane2DToPoint3D
} from '../source-projection';

describe('buildPlaneBasis', () => {
	it('returns orthonormal axes perpendicular to the normal', () => {
		const n = new Vector3(0.3, -0.7, 0.65).normalize();
		const { u, v } = buildPlaneBasis(n);
		expect(u.length()).toBeCloseTo(1, 6);
		expect(v.length()).toBeCloseTo(1, 6);
		expect(u.dot(n)).toBeCloseTo(0, 6);
		expect(v.dot(n)).toBeCloseTo(0, 6);
		expect(u.dot(v)).toBeCloseTo(0, 6);
	});
});

describe('intersectRayPlane', () => {
	it('finds the pierce point of source->through with a plane', () => {
		const source = new Vector3(0, 0, 10);
		const through = new Vector3(2, 0, 5);
		const hit = intersectRayPlane(source, through, new Vector3(0, 0, 0), new Vector3(0, 0, 1));
		expect(hit).not.toBeNull();
		expect(hit!.x).toBeCloseTo(4, 5);
		expect(hit!.z).toBeCloseTo(0, 5);
	});

	it('returns null for a ray parallel to the plane', () => {
		const hit = intersectRayPlane(
			new Vector3(0, 0, 1),
			new Vector3(1, 0, 1),
			new Vector3(0, 0, 0),
			new Vector3(0, 0, 1)
		);
		expect(hit).toBeNull();
	});
});

describe('projectToPlane2D / plane2DToPoint3D', () => {
	const source = new Vector3(0, 0, 10);
	const planePoint = new Vector3(0, 0, 0);
	const normal = new Vector3(0, 0, 1);
	const basis = buildPlaneBasis(normal);

	it('round-trips a point that lies on the plane', () => {
		const onPlane = plane2DToPoint3D(new Vector2(3, -2), planePoint, basis);
		const p2d = projectToPlane2D(onPlane, source, planePoint, normal, basis);
		expect(p2d).not.toBeNull();
		const back = plane2DToPoint3D(p2d!, planePoint, basis);
		expect(back.distanceTo(onPlane)).toBeCloseTo(0, 5);
	});

	it('projects an off-plane point to its pierce location', () => {
		const p2d = projectToPlane2D(new Vector3(2, 0, 5), source, planePoint, normal, basis);
		expect(p2d).not.toBeNull();
		const back = plane2DToPoint3D(p2d!, planePoint, basis);
		expect(back.x).toBeCloseTo(4, 5);
		expect(back.y).toBeCloseTo(0, 5);
		expect(back.z).toBeCloseTo(0, 5);
	});
});
