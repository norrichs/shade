import { Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { MeshSourceFormat } from './types';

/** User-facing import failure; `message` is shown in a toast as-is. */
export class ModelImportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ModelImportError';
	}
}

const DRACO = 'KHR_draco_mesh_compression';
const DRACO_MESSAGE = 'This model uses Draco compression — re-export without Draco compression';

export const detectFormat = (fileName: string): MeshSourceFormat => {
	const ext = fileName.split('.').pop()?.toLowerCase();
	if (ext === 'glb' || ext === 'gltf' || ext === 'stl' || ext === 'obj') return ext;
	throw new ModelImportError(`Unsupported file type ".${ext}" — use GLB, glTF, STL or OBJ`);
};

type GltfJson = { buffers?: { uri?: string }[]; extensionsUsed?: string[] };

/** Checks we can answer better than GLTFLoader's own errors. */
const checkGltfJson = (json: GltfJson) => {
	if (json.extensionsUsed?.includes(DRACO)) throw new ModelImportError(DRACO_MESSAGE);
	const external = json.buffers?.some((b) => b.uri !== undefined && !b.uri.startsWith('data:'));
	if (external) {
		throw new ModelImportError(
			'This .gltf references external files — export as GLB (single file) instead'
		);
	}
};

/** Reads the JSON chunk of a GLB (header 12 bytes, then chunk length + type). */
const glbJson = (buffer: ArrayBuffer): GltfJson => {
	const view = new DataView(buffer);
	if (buffer.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) {
		throw new ModelImportError('Not a valid GLB file');
	}
	const length = view.getUint32(12, true);
	return JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
};

const parseGltf = async (buffer: ArrayBuffer, format: 'glb' | 'gltf'): Promise<Object3D> => {
	checkGltfJson(format === 'glb' ? glbJson(buffer) : JSON.parse(new TextDecoder().decode(buffer)));
	const loader = new GLTFLoader();
	loader.setMeshoptDecoder(MeshoptDecoder);
	try {
		return (await loader.parseAsync(buffer, '')).scene;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/draco/i.test(message)) throw new ModelImportError(DRACO_MESSAGE);
		throw new ModelImportError(`Could not read model: ${message}`);
	}
};

export async function parseModel(
	file: File
): Promise<{ root: Object3D; format: MeshSourceFormat }> {
	const format = detectFormat(file.name);
	const buffer = await file.arrayBuffer();
	switch (format) {
		case 'glb':
		case 'gltf':
			return { root: await parseGltf(buffer, format), format };
		case 'stl':
			return { root: new Mesh(new STLLoader().parse(buffer)), format };
		case 'obj':
			return { root: new OBJLoader().parse(new TextDecoder().decode(buffer)), format };
	}
}
