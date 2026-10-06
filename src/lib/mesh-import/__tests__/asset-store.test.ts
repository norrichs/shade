import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { get } from 'svelte/store';
import type { SuperGlobuleConfig } from '$lib/types';
import type { MeshAsset } from '../types';
import {
	assetStatus,
	collectAssetIds,
	ensureAssetsLoaded,
	getLoadedAsset,
	hashMesh,
	putAsset,
	registerAsset,
	resetAssetStoreForTests,
	resolveAsset
} from '../asset-store';

if (!globalThis.crypto?.subtle) {
	(globalThis as { crypto: unknown }).crypto = webcrypto;
}

const triangle = (z = 0): MeshAsset => ({
	id: '',
	fileName: 'tri.stl',
	sourceFormat: 'stl',
	positions: new Float32Array([0, 0, z, 1, 0, z, 0, 1, z]),
	index: Uint32Array.from([0, 1, 2]),
	diagnostics: { triangles: 1, vertices: 3, openEdges: 3, droppedPrimitives: 0 },
	createdAt: '2026-10-05T00:00:00.000Z'
});

const withId = async (asset: MeshAsset): Promise<MeshAsset> => ({
	...asset,
	id: await hashMesh(asset)
});

const configWith = (...assetIds: string[]): SuperGlobuleConfig =>
	({
		projectionConfigs: [
			...assetIds.map((assetId) => ({ surfaceConfig: { type: 'ImportedMeshConfig', assetId } })),
			{ surfaceConfig: { type: 'SphereConfig' } }
		]
	}) as unknown as SuperGlobuleConfig;

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	resetAssetStoreForTests();
});

describe('hashMesh', () => {
	it('is stable for identical data and differs for different data', async () => {
		const a = await hashMesh(triangle());
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(await hashMesh(triangle())).toBe(a);
		expect(await hashMesh(triangle(1))).not.toBe(a);
	});
});

describe('hashMesh without crypto.subtle', () => {
	it('throws a clear secure-context error', async () => {
		const original = globalThis.crypto;
		(globalThis as { crypto: unknown }).crypto = undefined;
		try {
			await expect(hashMesh(triangle())).rejects.toThrow(/secure context/);
		} finally {
			(globalThis as { crypto: unknown }).crypto = original;
		}
	});
});

describe('asset store', () => {
	it('round-trips an asset through IndexedDB', async () => {
		const asset = await withId(triangle());
		await putAsset(asset);
		resetAssetStoreForTests(); // drop the in-memory registry, keep the IDB factory
		expect(getLoadedAsset(asset.id)).toBeUndefined();

		const loaded = await resolveAsset(asset.id);
		// Compare by tag: fake-indexeddb's structuredClone yields cross-realm typed arrays under Jest.
		expect(Object.prototype.toString.call(loaded?.positions)).toBe('[object Float32Array]');
		expect(Array.from(loaded!.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
		expect(Array.from(loaded!.index)).toEqual([0, 1, 2]);
		expect(getLoadedAsset(asset.id)).toBe(loaded);
		expect(get(assetStatus)[asset.id]).toBe('loaded');
	});

	it('putAsset rejects when the write transaction aborts after the request succeeds', async () => {
		const asset = await withId(triangle());
		const realPut = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (
			this: IDBObjectStore,
			...args: Parameters<IDBObjectStore['put']>
		) {
			const request = realPut.apply(this, args);
			request.addEventListener('success', () => this.transaction.abort());
			return request;
		};
		try {
			await expect(putAsset(asset)).rejects.toThrow(/aborted/);
		} finally {
			IDBObjectStore.prototype.put = realPut;
		}
		resetAssetStoreForTests();
		expect(await resolveAsset(asset.id)).toBeUndefined();
	});

	it('warns when the IndexedDB read fails, and still reports missing', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		const spy = jest.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
			throw new Error('boom');
		});
		try {
			expect(await resolveAsset('nope')).toBeUndefined();
			expect(warn).toHaveBeenCalledWith('[asset-store] IndexedDB read failed', expect.any(Error));
			expect(get(assetStatus).nope).toBe('missing');
		} finally {
			spy.mockRestore();
			warn.mockRestore();
		}
	});

	it('marks unknown ids missing without throwing', async () => {
		expect(await resolveAsset('nope')).toBeUndefined();
		expect(get(assetStatus).nope).toBe('missing');
	});

	it('collects only imported-mesh asset ids', () => {
		expect(collectAssetIds(configWith('a', 'b'))).toEqual(['a', 'b']);
		expect(collectAssetIds({} as SuperGlobuleConfig)).toEqual([]);
	});

	it('ensureAssetsLoaded is synchronous (undefined) when everything is loaded', async () => {
		const asset = await withId(triangle());
		registerAsset(asset);
		expect(ensureAssetsLoaded(configWith(asset.id))).toBeUndefined();
		expect(ensureAssetsLoaded(configWith())).toBeUndefined();
	});

	it('ensureAssetsLoaded loads from IndexedDB and tolerates misses', async () => {
		const asset = await withId(triangle());
		await putAsset(asset);
		resetAssetStoreForTests();
		const pending = ensureAssetsLoaded(configWith(asset.id, 'missing-id'));
		expect(pending).toBeInstanceOf(Promise);
		await expect(pending).resolves.toBeUndefined();
		expect(getLoadedAsset(asset.id)).toBeDefined();
		expect(get(assetStatus)['missing-id']).toBe('missing');
	});
});
