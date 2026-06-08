import {
	Vector3,
	Object3D,
	Mesh,
	SphereGeometry,
	MeshBasicMaterial,
	DoubleSide,
	Raycaster
} from 'three';
import { projectEdgesOntoSurface } from '../project-edges-onto-surface';
import type { VoronoiEdge } from '../types';
import type { CoordToDirection } from '../edge-sampling';

function sphereSurface(radius: number): Object3D {
	const surface = new Object3D();
	const mesh = new Mesh(
		new SphereGeometry(radius, 48, 48),
		new MeshBasicMaterial({ side: DoubleSide })
	);
	surface.add(mesh);
	surface.updateMatrixWorld(true);
	return surface;
}

describe('projectEdgesOntoSurface', () => {
	const R = 100;
	const center = new Vector3(0, 0, 0);
	const surface = sphereSurface(R);
	const coordToDirection: CoordToDirection = (lon, lat) =>
		new Vector3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
	const intersect = (dir: Vector3): Vector3 | null => {
		const rc = new Raycaster(center, dir.clone().normalize(), undefined, 2000);
		const hits = rc.intersectObject(surface, true);
		return hits.length ? hits[0].point.clone() : null;
	};

	it('places edge points on the sphere with radial normals', () => {
		// Offset off lon=0/lat=0 so no sampled ray lands exactly on the sphere's UV seam
		// (a seam-aligned ray misses the tessellation, dropping a point).
		const edges: VoronoiEdge[] = [
			{
				vertices: [
					[0.2, 0.15],
					[Math.PI / 4 + 0.2, 0.15]
				],
				cellIndices: [0, 1]
			}
		];
		const result = projectEdgesOntoSurface({
			edges,
			edgeDivisionCounts: [4],
			coordToDirection,
			center,
			surface,
			intersect
		});
		expect(result).toHaveLength(1);
		const { edgePoints3d, normals } = result[0];
		expect(edgePoints3d.length).toBe(5);
		expect(normals.length).toBe(edgePoints3d.length);
		for (let i = 0; i < edgePoints3d.length; i++) {
			expect(edgePoints3d[i].distanceTo(center)).toBeCloseTo(R, 0);
			const radial = edgePoints3d[i].clone().sub(center).normalize();
			expect(Math.abs(normals[i].dot(radial))).toBeGreaterThan(0.9);
		}
	});
});
