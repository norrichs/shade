import { BufferAttribute, BufferGeometry } from 'three';
import { getLoadedAsset } from './asset-store';

export class MissingMeshAssetError extends Error {
	constructor(
		readonly assetId: string,
		readonly fileName: string
	) {
		super(`Model "${fileName}" isn't loaded on this device`);
		this.name = 'MissingMeshAssetError';
	}
}

const cache = new Map<string, BufferGeometry>();

/**
 * One BufferGeometry per asset per thread, shared by every surface built from
 * it, so dense meshes don't rebuild geometry + BVH on each generation.
 * dispose() is disabled: the renderer or audit code disposing a surface must
 * not destroy geometry other surfaces still use.
 */
export function getAssetGeometry(assetId: string, fileName: string): BufferGeometry {
	const hit = cache.get(assetId);
	if (hit) return hit;
	const asset = getLoadedAsset(assetId);
	if (!asset) throw new MissingMeshAssetError(assetId, fileName);

	const geometry = new BufferGeometry();
	// Own copies: the BVH build reorders the index in place, which must never
	// touch the registry asset (its id is the hash of its bytes).
	geometry.setAttribute('position', new BufferAttribute(asset.positions.slice(), 3));
	geometry.setIndex(new BufferAttribute(asset.index.slice(), 1));
	geometry.computeVertexNormals();
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();
	geometry.dispose = () => {};
	cache.set(assetId, geometry);
	return geometry;
}

export function resetAssetGeometryCacheForTests(): void {
	cache.clear();
}
