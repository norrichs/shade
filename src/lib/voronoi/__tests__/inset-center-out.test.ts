import {
	Vector3,
	Object3D,
	Mesh,
	SphereGeometry,
	MeshBasicMaterial,
	DoubleSide,
	Raycaster
} from 'three';
import { computeEdgeInsetsCenterOut } from '../inset-center-out';
import type { VoronoiEdge } from '../types';
import type { EdgeProjection } from '../project-edges-onto-surface';
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

describe('computeEdgeInsetsCenterOut', () => {
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

	// Off-seam: base lon 0.6 so no sampled ray lands on the (1,0,0) UV seam.
	const edges: VoronoiEdge[] = [
		{
			vertices: [
				[0.6, -0.3],
				[0.6, 0.3]
			],
			cellIndices: [0, 1]
		}
	];
	const relaxedSeeds: [number, number][] = [
		[0.2, 0],
		[1.0, 0]
	];
	const edgeProjections: EdgeProjection[] = [
		{
			edgePoints3d: [
				intersect(coordToDirection(0.6, -0.3))!,
				intersect(coordToDirection(0.6, 0))!,
				intersect(coordToDirection(0.6, 0.3))!
			],
			normals: []
		}
	];

	it('produces aligned curve polylines on the surface, offset toward each seed', () => {
		const result = computeEdgeInsetsCenterOut({
			edges,
			edgeProjections,
			relaxedSeeds,
			coordToDirection,
			center,
			intersect,
			curveOffsetFactor: 0.3,
			surfaceProjectionDivisions: 0
		});
		expect(result).toHaveLength(1);
		const { curvePointsA, curvePointsB, divsA, divsB } = result[0];
		expect(curvePointsA).toHaveLength(3);
		expect(curvePointsB).toHaveLength(3);
		curvePointsA.forEach((p) => expect(p.distanceTo(center)).toBeCloseTo(R, 0));
		const seedDirA = coordToDirection(relaxedSeeds[0][0], relaxedSeeds[0][1]);
		const seedDirB = coordToDirection(relaxedSeeds[1][0], relaxedSeeds[1][1]);
		const edgePt = edgeProjections[0].edgePoints3d[1];
		expect(curvePointsA[1].clone().sub(edgePt).dot(seedDirA)).toBeGreaterThan(0);
		expect(curvePointsB[1].clone().sub(edgePt).dot(seedDirB)).toBeGreaterThan(0);
		expect(divsA[0]).toEqual([]);
		expect(divsB[0]).toEqual([]);
	});

	it('produces ordered intermediate division points', () => {
		const result = computeEdgeInsetsCenterOut({
			edges,
			edgeProjections,
			relaxedSeeds,
			coordToDirection,
			center,
			intersect,
			curveOffsetFactor: 0.3,
			surfaceProjectionDivisions: 2
		});
		const { divsA, curvePointsA } = result[0];
		expect(divsA[1]).toHaveLength(2);
		const cA = curvePointsA[1];
		expect(divsA[1][0].distanceTo(cA)).toBeLessThan(divsA[1][1].distanceTo(cA));
	});
});
