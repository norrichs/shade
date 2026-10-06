import { describe, it, expect, beforeEach } from '@jest/globals';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { IcosahedronGeometry, Vector3 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getLoadedAsset, resetAssetStoreForTests } from '../asset-store';
import {
	applySimplify,
	importModelFile,
	refit,
	replaceImportedModel,
	revertSimplify
} from '../import-model';

if (!globalThis.crypto?.subtle) {
	(globalThis as { crypto: unknown }).crypto = webcrypto;
}

/** ASCII STL of an icosphere of the given radius, centered at `at`. */
const sphereStl = (radius: number, at = new Vector3(), detail = 6): string => {
	const g = mergeVertices(new IcosahedronGeometry(radius, detail));
	const pos = g.getAttribute('position');
	const index = g.getIndex()!;
	const v = (i: number) =>
		`vertex ${pos.getX(i) + at.x} ${pos.getY(i) + at.y} ${pos.getZ(i) + at.z}`;
	const facets: string[] = [];
	for (let i = 0; i < index.count; i += 3) {
		facets.push(
			`facet normal 0 0 0\nouter loop\n${v(index.getX(i))}\n${v(index.getX(i + 1))}\n${v(index.getX(i + 2))}\nendloop\nendfacet`
		);
	}
	return `solid s\n${facets.join('\n')}\nendsolid s`;
};

const stlFile = (name: string, text: string) => new File([text], name);

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	resetAssetStoreForTests();
});

describe('importModelFile', () => {
	it('stores the asset and returns an auto-fit surface config', async () => {
		const cfg = await importModelFile(stlFile('ball.stl', sphereStl(1, new Vector3(5, 0, 0))));
		expect(cfg.type).toBe('ImportedMeshConfig');
		expect(cfg.fileName).toBe('ball.stl');
		expect(cfg.normalize.upAxis).toBe('+z');
		expect(cfg.normalize.targetSize).toBe(800);
		expect(cfg.normalize.scale).toBeCloseTo(400, -1);
		expect(cfg.normalize.offset.x).toBeCloseTo(-5, 3);
		expect(cfg.center).toEqual({ x: 0, y: 0, z: 0 });
		expect(cfg.transform).toEqual({
			translate: { x: 0, y: 0, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			rotate: { x: 0, y: 0, z: 0 }
		});
		expect(getLoadedAsset(cfg.assetId)?.diagnostics.openEdges).toBe(0);
	});
});

describe('simplify / revert', () => {
	it('simplifies from the source asset and reverts to it', async () => {
		const cfg = await importModelFile(stlFile('ball.stl', sphereStl(1)));
		const simplified = await applySimplify(cfg, 200);
		expect(simplified.assetId).not.toBe(cfg.assetId);
		expect(simplified.simplify).toEqual({ sourceAssetId: cfg.assetId, targetTriangles: 200 });
		expect(getLoadedAsset(simplified.assetId)!.diagnostics.triangles).toBeLessThanOrEqual(200);

		// applying again starts from the source, not the already-simplified mesh
		const again = await applySimplify(simplified, 300);
		expect(again.simplify).toEqual({ sourceAssetId: cfg.assetId, targetTriangles: 300 });

		const reverted = revertSimplify(again);
		expect(reverted.assetId).toBe(cfg.assetId);
		expect(reverted.simplify).toBeUndefined();
	});

	it('a target at or above the triangle count clears simplification', async () => {
		const cfg = await importModelFile(stlFile('ball.stl', sphereStl(1)));
		const simplified = await applySimplify(cfg, 200);
		const next = await applySimplify(simplified, 1_000_000);
		expect(next.assetId).toBe(cfg.assetId);
		expect(next.simplify).toBeUndefined();
	});
});

describe('replaceImportedModel', () => {
	it('re-picking the same file keeps the config', async () => {
		const text = sphereStl(1);
		const cfg = {
			...(await importModelFile(stlFile('ball.stl', text))),
			center: { x: 1, y: 2, z: 3 }
		};
		resetAssetStoreForTests(); // simulate "not on this device"
		globalThis.indexedDB = new IDBFactory();
		const { config, sameFile } = await replaceImportedModel(cfg, stlFile('ball.stl', text));
		expect(sameFile).toBe(true);
		expect(config).toEqual(cfg);
		expect(getLoadedAsset(cfg.assetId)).toBeDefined();
	});

	it('re-picking the original of a simplified config restores the same derived asset', async () => {
		const text = sphereStl(1);
		const simplified = await applySimplify(await importModelFile(stlFile('ball.stl', text)), 200);
		resetAssetStoreForTests();
		globalThis.indexedDB = new IDBFactory();
		const { config, sameFile } = await replaceImportedModel(simplified, stlFile('ball.stl', text));
		expect(sameFile).toBe(true);
		expect(config.assetId).toBe(simplified.assetId);
		expect(getLoadedAsset(simplified.assetId)).toBeDefined();
	});

	it('a different file keeps adjustments, refits and clears simplification', async () => {
		const simplified = await applySimplify(
			{
				...(await importModelFile(stlFile('ball.stl', sphereStl(1)))),
				center: { x: 1, y: 2, z: 3 }
			},
			200
		);
		const { config, sameFile } = await replaceImportedModel(
			simplified,
			stlFile('big.stl', sphereStl(10))
		);
		expect(sameFile).toBe(false);
		expect(config.fileName).toBe('big.stl');
		expect(config.center).toEqual({ x: 1, y: 2, z: 3 });
		expect(config.normalize.scale).toBeCloseTo(40, 0);
		expect(config.simplify).toBeUndefined();
	});
});

describe('refit', () => {
	it('on a simplified config fits from the source asset', async () => {
		const original = await importModelFile(stlFile('ball.stl', sphereStl(1)));
		const simplified = await applySimplify(original, 200);
		expect(simplified.assetId).not.toBe(original.assetId);
		const next = await refit(simplified, '+z', 400);
		const exact = await refit(original, '+z', 400);
		expect(next.normalize).toEqual(exact.normalize);
	});

	it('recomputes offset and scale for a new up axis and size', async () => {
		const cfg = await importModelFile(stlFile('ball.stl', sphereStl(1)));
		const next = await refit(cfg, '+y', 400);
		expect(next.normalize.upAxis).toBe('+y');
		expect(next.normalize.targetSize).toBe(400);
		expect(next.normalize.scale).toBeCloseTo(200, -1);
	});
});
