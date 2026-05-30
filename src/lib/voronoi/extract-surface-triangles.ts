import { Mesh, Object3D, Vector3 } from 'three';
import type { SurfaceTriangle } from './types';

/**
 * Traverses an Object3D and returns every triangle of its meshes in world
 * space. Supports both indexed and non-indexed BufferGeometry. Used by the
 * area-weighted seed sampler; runs inside the geometry worker.
 */
export function extractSurfaceTriangles(object: Object3D): SurfaceTriangle[] {
	const triangles: SurfaceTriangle[] = [];

	object.traverse((child) => {
		if (!(child instanceof Mesh) || !child.geometry) return;
		const geometry = child.geometry;
		const position = geometry.getAttribute('position');
		if (!position) return;

		child.updateWorldMatrix(true, false);
		const matrixWorld = child.matrixWorld;

		const cornerAt = (vertexIndex: number): Vector3 =>
			new Vector3(
				position.getX(vertexIndex),
				position.getY(vertexIndex),
				position.getZ(vertexIndex)
			).applyMatrix4(matrixWorld);

		const index = geometry.getIndex();
		const count = index ? index.count : position.count;
		for (let i = 0; i + 2 < count + 1 && i + 2 < count; i += 3) {
			const ia = index ? index.getX(i) : i;
			const ib = index ? index.getX(i + 1) : i + 1;
			const ic = index ? index.getX(i + 2) : i + 2;
			triangles.push([cornerAt(ia), cornerAt(ib), cornerAt(ic)]);
		}
	});

	return triangles;
}
