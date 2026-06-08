import {
	Vector3,
	Object3D,
	Mesh,
	SphereGeometry,
	MeshBasicMaterial,
	DoubleSide,
	Raycaster
} from 'three';
import { computeEdgeInsetsLocalProjection } from '../local-projection';
import { computeEdgeInsetsCenterOut } from '../inset-center-out';
import type { VoronoiEdge } from '../types';
import type { EdgeProjection } from '../project-edges-onto-surface';
import type { CoordToDirection } from '../edge-sampling';

function sphereSurface(radius: number): Object3D {
	const surface = new Object3D();
	const mesh = new Mesh(new SphereGeometry(radius, 64, 64), new MeshBasicMaterial({ side: DoubleSide }));
	surface.add(mesh);
	surface.updateMatrixWorld(true);
	return surface;
}

describe('computeEdgeInsetsLocalProjection', () => {
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

	// Off-seam: all longitudes in 0.5..1.5 so no sampled ray lands on the (1,0,0) UV seam.
	const edges: VoronoiEdge[] = [
		{ vertices: [[1.0, -0.3], [1.0, 0.3]], cellIndices: [0, 1] }, // shared edge
		{ vertices: [[0.7, -0.3], [1.0, -0.3]], cellIndices: [0, 2] },
		{ vertices: [[0.7, 0.3], [1.0, 0.3]], cellIndices: [0, 2] },
		{ vertices: [[1.3, -0.3], [1.0, -0.3]], cellIndices: [1, 3] },
		{ vertices: [[1.3, 0.3], [1.0, 0.3]], cellIndices: [1, 3] }
	];
	const relaxedSeeds: [number, number][] = [
		[0.8, 0], // cell 0
		[1.2, 0], // cell 1
		[0.5, 0], // cell 2
		[1.5, 0] // cell 3
	];
	const edgeProjections: EdgeProjection[] = edges.map((e) => {
		const ends = [e.vertices[0], e.vertices[1]].map((v) => intersect(coordToDirection(v[0], v[1]))!);
		const mid = intersect(
			coordToDirection(
				(e.vertices[0][0] + e.vertices[1][0]) / 2,
				(e.vertices[0][1] + e.vertices[1][1]) / 2
			)
		)!;
		return { edgePoints3d: [ends[0], mid, ends[1]], normals: [] };
	});
	const seedPoints3d = relaxedSeeds.map((s) => intersect(coordToDirection(s[0], s[1])));

	const common = {
		edges,
		edgeProjections,
		relaxedSeeds,
		coordToDirection,
		center,
		surface,
		surfaceCenter: center,
		curveOffsetFactor: 0.3,
		surfaceProjectionDivisions: 0
	};

	it('insets land on the sphere and offset toward each cell seed', () => {
		const result = computeEdgeInsetsLocalProjection({ ...common, seedPoints3d });
		const shared = result[0];
		expect(shared.curvePointsA).toHaveLength(3);
		expect(shared.curvePointsB).toHaveLength(3);
		shared.curvePointsA.forEach((p) => expect(p.distanceTo(center)).toBeCloseTo(R, -1));
		const seedDirA = coordToDirection(relaxedSeeds[0][0], relaxedSeeds[0][1]);
		const seedDirB = coordToDirection(relaxedSeeds[1][0], relaxedSeeds[1][1]);
		const edgePt = edgeProjections[0].edgePoints3d[1];
		expect(shared.curvePointsA[1].clone().sub(edgePt).dot(seedDirA)).toBeGreaterThan(0);
		expect(shared.curvePointsB[1].clone().sub(edgePt).dot(seedDirB)).toBeGreaterThan(0);
	});

	it('A and B sides of the shared edge differ', () => {
		const result = computeEdgeInsetsLocalProjection({ ...common, seedPoints3d });
		const shared = result[0];
		expect(shared.curvePointsA[1].distanceTo(shared.curvePointsB[1])).toBeGreaterThan(1);
	});

	it('is in rough parity with centerOut on a sphere', () => {
		const local = computeEdgeInsetsLocalProjection({ ...common, seedPoints3d });
		const centerOut = computeEdgeInsetsCenterOut({
			edges,
			edgeProjections,
			relaxedSeeds,
			coordToDirection,
			center,
			intersect,
			curveOffsetFactor: 0.3,
			surfaceProjectionDivisions: 0
		});
		const dLocal = local[0].curvePointsA[1];
		const dCenter = centerOut[0].curvePointsA[1];
		expect(dLocal.distanceTo(dCenter)).toBeLessThan(R * 0.2);
	});
});
