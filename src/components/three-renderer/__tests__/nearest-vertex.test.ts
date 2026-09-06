import { describe, it, expect } from '@jest/globals';
import { BufferGeometry, Mesh, Vector3 } from 'three';

import { nearestVertexFromEvent } from '../nearest-vertex';

const meshWith = (points: Vector3[]): Mesh => {
	const mesh = new Mesh(new BufferGeometry().setFromPoints(points));
	mesh.updateMatrixWorld(true);
	return mesh;
};

const eventFor = (mesh: Mesh, point: Vector3) => ({
	object: mesh,
	point,
	intersections: [{ object: mesh, point }]
});

describe('nearestVertexFromEvent', () => {
	const vertices = [new Vector3(0, 0, 0), new Vector3(10, 0, 0), new Vector3(0, 10, 0)];

	it('snaps the hit point to the closest vertex of the hit mesh', () => {
		const mesh = meshWith(vertices);
		const result = nearestVertexFromEvent(eventFor(mesh, new Vector3(9, 1, 0)));
		expect(result?.toArray()).toEqual([10, 0, 0]);
	});

	it('returns the exact vertex when the hit lands on one', () => {
		const mesh = meshWith(vertices);
		const result = nearestVertexFromEvent(eventFor(mesh, new Vector3(0, 10, 0)));
		expect(result?.toArray()).toEqual([0, 10, 0]);
	});

	it('ignores hits that are not the nearest intersection', () => {
		// Only the nearest hit may be acted on — otherwise a click also lands on
		// back-faces and occluded geometry behind it.
		const near = meshWith(vertices);
		const far = meshWith([new Vector3(100, 100, 100)]);
		const result = nearestVertexFromEvent({
			object: far,
			point: new Vector3(100, 100, 100),
			intersections: [
				{ object: near, point: new Vector3(0, 0, 0) },
				{ object: far, point: new Vector3(100, 100, 100) }
			]
		});
		expect(result).toBeNull();
	});

	it('respects the mesh world transform', () => {
		const mesh = meshWith(vertices);
		mesh.position.set(100, 0, 0);
		mesh.updateMatrixWorld(true);
		const result = nearestVertexFromEvent(eventFor(mesh, new Vector3(109, 1, 0)));
		expect(result?.toArray()).toEqual([110, 0, 0]);
	});

	it('returns null when the hit object has no geometry', () => {
		expect(
			nearestVertexFromEvent({
				object: {},
				point: new Vector3(0, 0, 0),
				intersections: [{ object: {}, point: new Vector3(0, 0, 0) }]
			})
		).toBeNull();
	});
});
