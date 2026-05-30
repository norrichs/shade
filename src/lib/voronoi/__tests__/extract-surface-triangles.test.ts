import { BufferGeometry, BufferAttribute, Mesh, Object3D, Vector3 } from 'three';
import { extractSurfaceTriangles } from '../extract-surface-triangles';

function makeQuadMesh(): Mesh {
	// Two triangles forming a unit quad in the XY plane.
	const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]);
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new BufferAttribute(positions, 3));
	return new Mesh(geometry);
}

describe('extractSurfaceTriangles', () => {
	it('extracts one SurfaceTriangle per geometry triangle', () => {
		const object = new Object3D();
		object.add(makeQuadMesh());
		object.updateMatrixWorld(true);
		const triangles = extractSurfaceTriangles(object);
		expect(triangles).toHaveLength(2);
		expect(triangles[0]).toHaveLength(3);
		expect(triangles[0][0]).toBeInstanceOf(Vector3);
	});

	it('returns triangle corners in world space (applies parent transform)', () => {
		const object = new Object3D();
		const mesh = makeQuadMesh();
		mesh.position.set(10, 0, 0);
		object.add(mesh);
		object.updateMatrixWorld(true);
		const triangles = extractSurfaceTriangles(object);
		expect(triangles[0][0].x).toBeCloseTo(10, 5);
	});

	it('supports indexed geometry', () => {
		const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]);
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new BufferAttribute(positions, 3));
		geometry.setIndex([0, 1, 2, 1, 3, 2]);
		const mesh = new Mesh(geometry);
		const object = new Object3D();
		object.add(mesh);
		object.updateMatrixWorld(true);
		const triangles = extractSurfaceTriangles(object);
		expect(triangles).toHaveLength(2);
	});

	it('returns an empty array for an object with no meshes', () => {
		expect(extractSurfaceTriangles(new Object3D())).toEqual([]);
	});
});
