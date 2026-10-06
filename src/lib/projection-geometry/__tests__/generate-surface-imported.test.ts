import { describe, it, expect, beforeEach } from '@jest/globals';
import { BoxGeometry, Mesh, Raycaster, Vector3, type Object3D } from 'three';
import { acceleratedRaycast } from 'three-mesh-bvh';
import { generateSurface, generateSurfaceIfAvailable } from '../generate-projection';
import type { ImportedSurfaceConfig, SurfaceConfig } from '../types';
import { cleanMesh } from '$lib/mesh-import/clean-mesh';
import {
	getLoadedAsset,
	hashMesh,
	registerAsset,
	resetAssetStoreForTests
} from '$lib/mesh-import/asset-store';
import { IcosahedronGeometry } from 'three';
import { webcrypto } from 'node:crypto';
import {
	MissingMeshAssetError,
	resetAssetGeometryCacheForTests
} from '$lib/mesh-import/asset-geometry';

const cubeConfig = (over: Partial<ImportedSurfaceConfig> = {}): SurfaceConfig =>
	({
		type: 'ImportedMeshConfig',
		assetId: 'cube',
		fileName: 'cube.glb',
		// 2×2×2 cube at the origin, fit to 800 → scale 400, half-size 400
		normalize: { upAxis: '+z', targetSize: 800, offset: { x: 0, y: 0, z: 0 }, scale: 400 },
		center: { x: 0, y: 0, z: 0 },
		transform: {
			translate: { x: 0, y: 0, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			rotate: { x: 0, y: 0, z: 0 }
		},
		...over
	}) as SurfaceConfig;

const hitX = (surface: Object3D): number => {
	const raycaster = new Raycaster(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 0, 5000);
	const hits = raycaster.intersectObject(surface, true);
	expect(hits.length).toBeGreaterThan(0);
	return hits[0].point.x;
};

const meshOf = (surface: Object3D): Mesh => {
	let found: Mesh | undefined;
	surface.traverse((c) => {
		if (c instanceof Mesh) found = c;
	});
	return found!;
};

beforeEach(() => {
	resetAssetStoreForTests();
	resetAssetGeometryCacheForTests();
	registerAsset({
		...cleanMesh(new Mesh(new BoxGeometry(2, 2, 2))),
		id: 'cube',
		fileName: 'cube.glb',
		sourceFormat: 'glb',
		createdAt: '2026-10-05T00:00:00.000Z'
	});
});

describe('generateSurface — ImportedMeshConfig', () => {
	it('applies the normalize fit', () => {
		expect(hitX(generateSurface(cubeConfig()))).toBeCloseTo(400, 3);
	});

	it('applies the user transform after the fit', () => {
		const surface = generateSurface(
			cubeConfig({
				transform: {
					translate: { x: 100, y: 0, z: 0 },
					scale: { x: 1, y: 1, z: 1 },
					rotate: { x: 0, y: 0, z: 0 }
				}
			})
		);
		expect(hitX(surface)).toBeCloseTo(500, 3);
	});

	it('reuses cached geometry and keeps the accelerated raycast on every surface', () => {
		const first = meshOf(generateSurface(cubeConfig()));
		const second = meshOf(generateSurface(cubeConfig()));
		expect(second.geometry).toBe(first.geometry);
		expect(second.raycast).toBe(acceleratedRaycast);
	});

	it('throws MissingMeshAssetError when the asset is not loaded', () => {
		expect(() => generateSurface(cubeConfig({ assetId: 'gone' }))).toThrow(MissingMeshAssetError);
	});
});

describe('generateSurfaceIfAvailable', () => {
	it('returns undefined for a missing asset', () => {
		expect(generateSurfaceIfAvailable(cubeConfig({ assetId: 'gone' }))).toBeUndefined();
	});

	it('returns the surface when available', () => {
		expect(generateSurfaceIfAvailable(cubeConfig())).toBeDefined();
	});
});

describe('generateSurface — registry asset integrity', () => {
	it('building the BVH does not reorder the registered asset (id stays its content hash)', async () => {
		if (!globalThis.crypto?.subtle) {
			(globalThis as { crypto: unknown }).crypto = webcrypto;
		}
		const clean = cleanMesh(new Mesh(new IcosahedronGeometry(1, 3)));
		const id = await hashMesh(clean);
		registerAsset({
			...clean,
			id,
			fileName: 'ball.glb',
			sourceFormat: 'glb',
			createdAt: '2026-10-05T00:00:00.000Z'
		});
		const surface = generateSurface(cubeConfig({ assetId: id }));
		const geometry = meshOf(surface).geometry;

		expect(await hashMesh(getLoadedAsset(id)!)).toBe(id);
		expect(geometry.getIndex()!.array).not.toBe(getLoadedAsset(id)!.index);
	});
});
