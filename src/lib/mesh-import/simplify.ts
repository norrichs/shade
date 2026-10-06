import { MeshoptSimplifier } from 'meshoptimizer/meshopt_simplifier.module.js';
import { compactMesh, computeDiagnostics } from './clean-mesh';
import { hashMesh } from './asset-store';
import type { IndexedMesh, MeshAsset } from './types';

/**
 * target_error is relative to the mesh extent; 1 lets the simplifier go as far
 * as needed to reach the triangle target (the user chose the count explicitly).
 */
const TARGET_ERROR = 1;

export async function simplifyMesh(
	mesh: IndexedMesh,
	targetTriangles: number
): Promise<IndexedMesh> {
	const current = mesh.index.length / 3;
	const target = Math.max(1, Math.floor(targetTriangles));
	if (target >= current) return { positions: mesh.positions.slice(), index: mesh.index.slice() };

	await MeshoptSimplifier.ready;
	const [simplified] = MeshoptSimplifier.simplify(
		mesh.index,
		mesh.positions,
		3,
		target * 3,
		TARGET_ERROR
	);
	if (simplified.length === 0) {
		throw new Error('Simplification removed every triangle — raise the target');
	}
	return compactMesh(mesh.positions, simplified);
}

export async function simplifyAsset(
	source: MeshAsset,
	targetTriangles: number
): Promise<MeshAsset> {
	const mesh = await simplifyMesh(source, targetTriangles);
	return {
		...mesh,
		id: await hashMesh(mesh),
		fileName: source.fileName,
		sourceFormat: source.sourceFormat,
		diagnostics: computeDiagnostics(
			mesh.positions,
			mesh.index,
			source.diagnostics.droppedPrimitives
		),
		derivedFrom: { assetId: source.id, targetTriangles },
		createdAt: new Date().toISOString()
	};
}
