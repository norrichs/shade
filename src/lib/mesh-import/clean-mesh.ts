import {
	Box3,
	BufferAttribute,
	BufferGeometry,
	Line,
	Mesh,
	Object3D,
	Points,
	Vector3
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CleanMesh, IndexedMesh, MeshDiagnostics } from './types';

/** Weld tolerance as a fraction of the bounding-box diagonal. */
const WELD_TOLERANCE_FACTOR = 1e-6;
/** Triangles with area below this fraction of diagonal² are degenerate. */
const DEGENERATE_AREA_FACTOR = 1e-12;

/**
 * Copies a mesh's positions (and index, or an implicit 0..n-1 one) into a fresh,
 * world-space, position-only geometry. Positions are read through getX/Y/Z so
 * InterleavedBufferAttribute (common in exported GLBs) works too.
 */
const toWorldGeometry = (mesh: Mesh): BufferGeometry | null => {
	const source = mesh.geometry as BufferGeometry;
	const position = source.getAttribute('position');
	if (!position || position.count === 0) return null;

	const positions = new Float32Array(position.count * 3);
	for (let i = 0; i < position.count; i++) {
		positions[i * 3] = position.getX(i);
		positions[i * 3 + 1] = position.getY(i);
		positions[i * 3 + 2] = position.getZ(i);
	}
	const sourceIndex = source.getIndex();
	const indices = sourceIndex
		? Uint32Array.from({ length: sourceIndex.count }, (_, i) => sourceIndex.getX(i))
		: Uint32Array.from({ length: position.count }, (_, i) => i);

	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new BufferAttribute(positions, 3));
	geometry.setIndex(new BufferAttribute(indices, 1));
	geometry.applyMatrix4(mesh.matrixWorld);
	return geometry;
};

/** Drops vertices no triangle references and remaps the index to match. */
export function compactMesh(positions: Float32Array, index: Uint32Array): IndexedMesh {
	const remap = new Int32Array(positions.length / 3).fill(-1);
	const kept: number[] = [];
	const outIndex = new Uint32Array(index.length);
	for (let i = 0; i < index.length; i++) {
		const v = index[i];
		if (remap[v] === -1) {
			remap[v] = kept.length;
			kept.push(v);
		}
		outIndex[i] = remap[v];
	}
	const outPositions = new Float32Array(kept.length * 3);
	kept.forEach((v, i) => {
		outPositions[i * 3] = positions[v * 3];
		outPositions[i * 3 + 1] = positions[v * 3 + 1];
		outPositions[i * 3 + 2] = positions[v * 3 + 2];
	});
	return { positions: outPositions, index: outIndex };
}

export function computeDiagnostics(
	positions: Float32Array,
	index: Uint32Array,
	droppedPrimitives = 0
): MeshDiagnostics {
	const vertexCount = positions.length / 3;
	const edgeUse = new Map<number, number>();
	const addEdge = (a: number, b: number) => {
		const key = a < b ? a * vertexCount + b : b * vertexCount + a;
		edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
	};
	for (let i = 0; i < index.length; i += 3) {
		addEdge(index[i], index[i + 1]);
		addEdge(index[i + 1], index[i + 2]);
		addEdge(index[i + 2], index[i]);
	}
	let openEdges = 0;
	for (const uses of edgeUse.values()) if (uses === 1) openEdges++;
	return { triangles: index.length / 3, vertices: vertexCount, openEdges, droppedPrimitives };
}

/**
 * Flattens a loaded model into one welded, world-space triangle mesh:
 * bakes node transforms, skips Line/Points, keeps positions only, welds
 * coincident vertices, removes degenerate triangles.
 */
export function cleanMesh(root: Object3D): CleanMesh {
	root.updateMatrixWorld(true);

	const parts: BufferGeometry[] = [];
	let droppedPrimitives = 0;
	root.traverse((child) => {
		if (child instanceof Line || child instanceof Points) {
			droppedPrimitives++;
			return;
		}
		if (!(child instanceof Mesh) || !child.geometry) return;
		const part = toWorldGeometry(child);
		if (part) parts.push(part);
	});
	if (parts.length === 0) throw new Error('Model contains no triangle meshes');

	const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
	if (!merged) throw new Error('Model contains no triangle meshes');

	merged.computeBoundingBox();
	const diagonal = (merged.boundingBox ?? new Box3()).getSize(new Vector3()).length();
	if (!(diagonal > 0)) throw new Error('Model contains no triangle meshes');

	const welded = mergeVertices(merged, diagonal * WELD_TOLERANCE_FACTOR);
	const weldedPositions = welded.getAttribute('position');
	const weldedIndex = welded.getIndex()!;

	const positions = new Float32Array(weldedPositions.count * 3);
	for (let i = 0; i < weldedPositions.count; i++) {
		positions[i * 3] = weldedPositions.getX(i);
		positions[i * 3 + 1] = weldedPositions.getY(i);
		positions[i * 3 + 2] = weldedPositions.getZ(i);
	}

	const minArea = DEGENERATE_AREA_FACTOR * diagonal * diagonal;
	const a = new Vector3();
	const b = new Vector3();
	const c = new Vector3();
	const kept: number[] = [];
	for (let i = 0; i + 2 < weldedIndex.count; i += 3) {
		const ia = weldedIndex.getX(i);
		const ib = weldedIndex.getX(i + 1);
		const ic = weldedIndex.getX(i + 2);
		if (ia === ib || ib === ic || ia === ic) continue;
		a.fromArray(positions, ia * 3);
		b.fromArray(positions, ib * 3);
		c.fromArray(positions, ic * 3);
		const area = b.sub(a).cross(c.sub(a)).length() / 2;
		if (area < minArea) continue;
		kept.push(ia, ib, ic);
	}
	if (kept.length === 0) throw new Error('Model contains no triangle meshes');

	const compacted = compactMesh(positions, Uint32Array.from(kept));
	return {
		...compacted,
		diagnostics: computeDiagnostics(compacted.positions, compacted.index, droppedPrimitives)
	};
}
