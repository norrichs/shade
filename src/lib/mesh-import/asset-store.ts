/**
 * Content-addressed store for imported meshes. Configs only carry an `assetId`;
 * this module is the ONLY place that knows where the bytes live (in-memory
 * registry → IndexedDB today; a remote backend can slot in behind resolveAsset
 * later without changing configs or generation).
 *
 * Runs on both the main thread and in the geometry worker — each thread has its
 * own registry, both read the same IndexedDB.
 */
import { writable } from 'svelte/store';
import type { SuperGlobuleConfig } from '$lib/types';
import type { IndexedMesh, MeshAsset } from './types';

const DB_NAME = 'shades-assets';
const DB_VERSION = 1;
const STORE = 'meshAssets';

export type AssetStatus = 'loaded' | 'missing';
export const assetStatus = writable<Record<string, AssetStatus>>({});

const registry = new Map<string, MeshAsset>();

const setStatus = (id: string, status: AssetStatus) =>
	assetStatus.update((s) => (s[id] === status ? s : { ...s, [id]: status }));

/** Lowercase hex SHA-256 over [positionByteLength, indexByteLength, positions, index]. */
export async function hashMesh({ positions, index }: IndexedMesh): Promise<string> {
	const header = new Uint32Array([positions.byteLength, index.byteLength]);
	const bytes = new Uint8Array(header.byteLength + positions.byteLength + index.byteLength);
	bytes.set(new Uint8Array(header.buffer), 0);
	bytes.set(
		new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength),
		header.byteLength
	);
	bytes.set(
		new Uint8Array(index.buffer, index.byteOffset, index.byteLength),
		header.byteLength + positions.byteLength
	);
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) throw new Error('Model import needs a secure context (https or localhost)');
	const digest = await subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> | null => {
	if (typeof indexedDB === 'undefined') return null;
	if (!dbPromise) {
		dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);
			request.onupgradeneeded = () => {
				request.result.createObjectStore(STORE, { keyPath: 'id' });
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		}).catch((error) => {
			dbPromise = null;
			throw error;
		});
	}
	return dbPromise;
};

const withStore = async <T>(
	mode: IDBTransactionMode,
	op: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | undefined> => {
	const pending = openDb();
	if (!pending) return undefined;
	const db = await pending;
	return new Promise<T>((resolve, reject) => {
		const tx = db.transaction(STORE, mode);
		const request = op(tx.objectStore(STORE));
		if (mode === 'readonly') {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
			return;
		}
		// Writes are only durable once the transaction commits (it can still abort
		// after the request succeeds, e.g. QuotaExceededError).
		tx.oncomplete = () => resolve(request.result);
		tx.onerror = () =>
			reject(tx.error ?? request.error ?? new Error('IndexedDB transaction aborted'));
		tx.onabort = () =>
			reject(tx.error ?? request.error ?? new Error('IndexedDB transaction aborted'));
	});
};

/** Put an asset in this thread's registry only. */
export function registerAsset(asset: MeshAsset): void {
	registry.set(asset.id, asset);
	setStatus(asset.id, 'loaded');
}

export const getLoadedAsset = (id: string): MeshAsset | undefined => registry.get(id);

export async function putAsset(asset: MeshAsset): Promise<void> {
	registerAsset(asset);
	await withStore('readwrite', (store) => store.put(asset));
}

export async function resolveAsset(id: string): Promise<MeshAsset | undefined> {
	const hit = registry.get(id);
	if (hit) return hit;
	const stored = await withStore<MeshAsset | undefined>('readonly', (store) => store.get(id)).catch(
		(error) => {
			console.warn('[asset-store] IndexedDB read failed', error);
			return undefined;
		}
	);
	if (stored) {
		registerAsset(stored);
		return stored;
	}
	setStatus(id, 'missing');
	return undefined;
}

type MaybeImportedSurface = { type?: string; assetId?: string } | undefined;

export const collectAssetIds = (config: SuperGlobuleConfig): string[] =>
	(config?.projectionConfigs ?? [])
		.map((p) => p?.surfaceConfig as MaybeImportedSurface)
		.filter((s): s is { type: string; assetId: string } => s?.type === 'ImportedMeshConfig')
		.map((s) => s.assetId);

/**
 * Loads every asset `config` references into this thread's registry. Returns
 * undefined — synchronously — when nothing is missing, so callers keep their
 * synchronous fast path. Never rejects: a missing asset is reported through
 * `assetStatus` and surfaces later as MissingMeshAssetError in generation.
 */
export function ensureAssetsLoaded(config: SuperGlobuleConfig): Promise<void> | undefined {
	const missing = collectAssetIds(config).filter((id) => !registry.has(id));
	if (missing.length === 0) return undefined;
	return Promise.all(missing.map((id) => resolveAsset(id))).then(() => undefined);
}

export function resetAssetStoreForTests(): void {
	registry.clear();
	assetStatus.set({});
	dbPromise = null;
}
