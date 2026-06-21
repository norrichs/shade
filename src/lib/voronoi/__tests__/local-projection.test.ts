import {
	Vector3,
	Object3D,
	Mesh,
	SphereGeometry,
	PlaneGeometry,
	MeshBasicMaterial,
	DoubleSide,
	Raycaster
} from 'three';
import { OPENING } from '$lib/types';
import { computeEdgeInsetsLocalProjection } from '../local-projection';
import { computeEdgeInsetsCenterOut } from '../inset-center-out';
import type { VoronoiEdge } from '../types';
import type { EdgeProjection } from '../project-edges-onto-surface';
import type { CoordToDirection } from '../edge-sampling';

function sphereSurface(radius: number): Object3D {
	const surface = new Object3D();
	const mesh = new Mesh(
		new SphereGeometry(radius, 64, 64),
		new MeshBasicMaterial({ side: DoubleSide })
	);
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
		{
			vertices: [
				[1.0, -0.3],
				[1.0, 0.3]
			],
			cellIndices: [0, 1]
		}, // shared edge
		{
			vertices: [
				[0.7, -0.3],
				[1.0, -0.3]
			],
			cellIndices: [0, 2]
		},
		{
			vertices: [
				[0.7, 0.3],
				[1.0, 0.3]
			],
			cellIndices: [0, 2]
		},
		{
			vertices: [
				[1.3, -0.3],
				[1.0, -0.3]
			],
			cellIndices: [1, 3]
		},
		{
			vertices: [
				[1.3, 0.3],
				[1.0, 0.3]
			],
			cellIndices: [1, 3]
		}
	];
	const relaxedSeeds: [number, number][] = [
		[0.8, 0], // cell 0
		[1.2, 0], // cell 1
		[0.5, 0], // cell 2
		[1.5, 0] // cell 3
	];
	const edgeProjections: EdgeProjection[] = edges.map((e) => {
		const ends = [e.vertices[0], e.vertices[1]].map(
			(v) => intersect(coordToDirection(v[0], v[1]))!
		);
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

	it('curvedInset: shared edge is curved and still lands on the sphere', () => {
		const straight = computeEdgeInsetsLocalProjection({ ...common, seedPoints3d });
		const curved = computeEdgeInsetsLocalProjection({ ...common, seedPoints3d, curvedInset: true });

		// edgePoints3d are length 3, so curve points stay length 3.
		expect(curved[0].curvePointsA).toHaveLength(3);
		curved[0].curvePointsA.forEach((p) => expect(p.distanceTo(center)).toBeCloseTo(R, -1));
		curved[0].curvePointsB.forEach((p) => expect(p.distanceTo(center)).toBeCloseTo(R, -1));

		// The shared edge (index 0) has both vertices at cell-interior degree 2 for cells 0
		// and 1, so it is curved -> differs from the straight inset.
		const moved = curved[0].curvePointsA.reduce(
			(acc, p, i) => acc + p.distanceTo(straight[0].curvePointsA[i]),
			0
		);
		expect(moved).toBeGreaterThan(1e-3);
	});

	it('curvedInset: open-chain edges fall back to the straight inset', () => {
		const straight = computeEdgeInsetsLocalProjection({ ...common, seedPoints3d });
		const curved = computeEdgeInsetsLocalProjection({ ...common, seedPoints3d, curvedInset: true });
		// Edge 1 touches vertex (0.7,-0.3) which is degree 1 in cell 0 -> fallback (== straight).
		curved[1].curvePointsA.forEach((p, i) =>
			expect(p.distanceTo(straight[1].curvePointsA[i])).toBeCloseTo(0, 6)
		);
	});

	it('insets only the real-cell side for an opening-sentinel edge', () => {
		function planeSurface(): Object3D {
			const o = new Object3D();
			o.add(new Mesh(new PlaneGeometry(400, 400, 1, 1), new MeshBasicMaterial({ side: DoubleSide })));
			o.updateMatrixWorld(true);
			return o;
		}
		const surface = planeSurface();
		const edgePoints3d = [new Vector3(-50, 0, 0), new Vector3(0, 0, 0), new Vector3(50, 0, 0)];
		const normals = edgePoints3d.map(() => new Vector3(0, 0, 1));
		const insets = computeEdgeInsetsLocalProjection({
			edges: [{ vertices: [[-2, 0], [-3, 0]] as [[number, number], [number, number]], cellIndices: [0, OPENING] as [number, number] }],
			edgeProjections: [{ edgePoints3d, normals }],
			seedPoints3d: [new Vector3(0, 80, 0)],
			surface,
			surfaceCenter: new Vector3(0, 0, -1000),
			curveOffsetFactor: 0.3,
			surfaceProjectionDivisions: 0,
			curvedInset: false
		});
		// Real side (A, since cellIndices[0] === 0) is inset toward the seed.
		expect(insets[0].curvePointsA.some((p, i) => p.distanceTo(edgePoints3d[i]) > 1e-6)).toBe(true);
		// Opening side (B) is NOT inset — it stays at the edge points.
		insets[0].curvePointsB.forEach((p, i) => expect(p.distanceTo(edgePoints3d[i])).toBeLessThan(1e-6));
	});

	it('curvedInset: corners at coincident 3D points round even when vertex ids differ', () => {
		// Regression for rim-adjacent cells: a rim chain and the interior edge that
		// meets it on the rim are the SAME 3D corner but get different synthetic
		// vertex ids (rim ids live in a separate negative namespace). The curved
		// inset must recognise them as one corner from geometry, not from the id.
		function planeSurface(): Object3D {
			const o = new Object3D();
			o.add(new Mesh(new PlaneGeometry(400, 400, 1, 1), new MeshBasicMaterial({ side: DoubleSide })));
			o.updateMatrixWorld(true);
			return o;
		}
		const surface = planeSurface();

		// Triangular cell 0 with corners A, B, C. Each edge carries [start, mid, end].
		const A = new Vector3(-50, -50, 0);
		const B = new Vector3(50, -50, 0);
		const C = new Vector3(0, 50, 0);
		const mid = (p: Vector3, q: Vector3) => p.clone().add(q).multiplyScalar(0.5);
		const proj = (...pts: Vector3[]): EdgeProjection => ({
			edgePoints3d: pts,
			normals: pts.map(() => new Vector3(0, 0, 1))
		});

		// edge0 A->B (interior), edge1 B->C (interior, terminates at the rim corner C),
		// edge2 C->A (rim edge). Corner C is given id 3 on edge1 but a DIFFERENT id 99
		// on the rim edge2 — coincident in 3D, distinct ids.
		const edges: VoronoiEdge[] = [
			{ vertices: [[1, 0], [2, 0]], cellIndices: [0, 1] },
			{ vertices: [[2, 0], [3, 0]], cellIndices: [0, 2] },
			{ vertices: [[99, 0], [1, 0]], cellIndices: [0, OPENING] }
		];
		const edgeProjections: EdgeProjection[] = [
			proj(A.clone(), mid(A, B), B.clone()),
			proj(B.clone(), mid(B, C), C.clone()),
			proj(C.clone(), mid(C, A), A.clone())
		];

		const common = {
			edges,
			edgeProjections,
			seedPoints3d: [new Vector3(0, 0, 0)],
			surface,
			surfaceCenter: new Vector3(0, 0, -1000),
			curveOffsetFactor: 0.3,
			surfaceProjectionDivisions: 0
		};
		const straight = computeEdgeInsetsLocalProjection({ ...common, curvedInset: false });
		const curved = computeEdgeInsetsLocalProjection({ ...common, curvedInset: true });

		const moved = (i: number) =>
			curved[i].curvePointsA.reduce((acc, p, k) => acc + p.distanceTo(straight[i].curvePointsA[k]), 0);

		// edge0's corners (A,B) match by id either way -> always curved (sanity).
		expect(moved(0)).toBeGreaterThan(1e-3);
		// edge1 terminates at rim corner C, edge2 is the rim edge: both share corner C
		// only by geometry. These must also round.
		expect(moved(1)).toBeGreaterThan(1e-3);
		expect(moved(2)).toBeGreaterThan(1e-3);
	});
});
