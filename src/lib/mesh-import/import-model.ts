/**
 * User-facing import operations. Each returns a new ImportedSurfaceConfig for
 * the caller to write into superConfigStore; none touch stores themselves.
 * Main-thread only (parses files).
 */
import type { ImportedSurfaceConfig, UpAxis } from '$lib/projection-geometry/types';
import { identityTransform } from '../../components/modal/editor/transform-config';
import { cleanMesh } from './clean-mesh';
import { computeFit, DEFAULT_TARGET_SIZE, defaultUpAxis } from './normalize';
import { hashMesh, putAsset, resolveAsset } from './asset-store';
import { simplifyAsset } from './simplify';
import { parseModel } from './parse-model';
import type { MeshAsset } from './types';

/** parse → clean → hash → store. */
export async function ingestModelFile(file: File): Promise<MeshAsset> {
	const { root, format } = await parseModel(file);
	const clean = cleanMesh(root);
	const asset: MeshAsset = {
		...clean,
		id: await hashMesh(clean),
		fileName: file.name,
		sourceFormat: format,
		createdAt: new Date().toISOString()
	};
	await putAsset(asset);
	return asset;
}

export async function importModelFile(file: File): Promise<ImportedSurfaceConfig> {
	const asset = await ingestModelFile(file);
	const upAxis = defaultUpAxis(asset.sourceFormat);
	return {
		type: 'ImportedMeshConfig',
		assetId: asset.id,
		fileName: asset.fileName,
		normalize: {
			upAxis,
			targetSize: DEFAULT_TARGET_SIZE,
			...computeFit(asset.positions, upAxis, DEFAULT_TARGET_SIZE)
		},
		center: { x: 0, y: 0, z: 0 },
		transform: identityTransform()
	};
}

const withoutSimplify = (cfg: ImportedSurfaceConfig): ImportedSurfaceConfig => {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { simplify, ...rest } = cfg;
	return rest;
};

/**
 * Re-pick (missing asset) or replace the model. Same content as the original
 * → config unchanged (a simplified config gets its derived asset rebuilt;
 * meshopt is deterministic, so the id matches). Different content → keep
 * transform / center / up axis / target size, refit, drop simplification.
 */
export async function replaceImportedModel(
	prev: ImportedSurfaceConfig,
	file: File
): Promise<{ config: ImportedSurfaceConfig; sameFile: boolean }> {
	const asset = await ingestModelFile(file);
	const originalId = prev.simplify?.sourceAssetId ?? prev.assetId;

	if (asset.id === originalId) {
		if (prev.simplify) {
			const derived = await simplifyAsset(asset, prev.simplify.targetTriangles);
			await putAsset(derived);
			return { config: { ...prev, assetId: derived.id }, sameFile: true };
		}
		return { config: { ...prev }, sameFile: true };
	}

	const { upAxis, targetSize } = prev.normalize;
	return {
		config: {
			...withoutSimplify(prev),
			assetId: asset.id,
			fileName: asset.fileName,
			normalize: { upAxis, targetSize, ...computeFit(asset.positions, upAxis, targetSize) }
		},
		sameFile: false
	};
}

const requireAsset = async (id: string, fileName: string): Promise<MeshAsset> => {
	const asset = await resolveAsset(id);
	if (!asset) throw new Error(`Model "${fileName}" isn't loaded on this device`);
	return asset;
};

/** Always simplifies the ORIGINAL asset, so repeated applies never compound. */
export async function applySimplify(
	cfg: ImportedSurfaceConfig,
	targetTriangles: number
): Promise<ImportedSurfaceConfig> {
	const sourceAssetId = cfg.simplify?.sourceAssetId ?? cfg.assetId;
	const source = await requireAsset(sourceAssetId, cfg.fileName);
	const derived = await simplifyAsset(source, targetTriangles);
	if (derived.id === source.id) return withoutSimplify({ ...cfg, assetId: source.id });
	await putAsset(derived);
	return { ...cfg, assetId: derived.id, simplify: { sourceAssetId, targetTriangles } };
}

export function revertSimplify(cfg: ImportedSurfaceConfig): ImportedSurfaceConfig {
	if (!cfg.simplify) return cfg;
	return { ...withoutSimplify(cfg), assetId: cfg.simplify.sourceAssetId };
}

export async function refit(
	cfg: ImportedSurfaceConfig,
	upAxis: UpAxis,
	targetSize: number
): Promise<ImportedSurfaceConfig> {
	const asset = await requireAsset(cfg.assetId, cfg.fileName);
	return {
		...cfg,
		normalize: { upAxis, targetSize, ...computeFit(asset.positions, upAxis, targetSize) }
	};
}
