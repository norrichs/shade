import { describe, it, expect } from '@jest/globals';
import { Mesh } from 'three';
import { detectFormat, ModelImportError, parseModel } from '../parse-model';
import { cleanMesh } from '../clean-mesh';

const asciiStlTetra = `solid t
facet normal 0 0 0
 outer loop
  vertex 0 0 0
  vertex 1 0 0
  vertex 0 1 0
 endloop
endfacet
facet normal 0 0 0
 outer loop
  vertex 0 0 0
  vertex 0 0 1
  vertex 1 0 0
 endloop
endfacet
facet normal 0 0 0
 outer loop
  vertex 0 0 0
  vertex 0 1 0
  vertex 0 0 1
 endloop
endfacet
facet normal 0 0 0
 outer loop
  vertex 1 0 0
  vertex 0 0 1
  vertex 0 1 0
 endloop
endfacet
endsolid t`;

const objQuad = `v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
f 1 2 3 4`;

describe('detectFormat', () => {
	it.each([
		['a.GLB', 'glb'],
		['a.gltf', 'gltf'],
		['dir.v2/a.stl', 'stl'],
		['a.obj', 'obj']
	])('%s → %s', (name, format) => {
		expect(detectFormat(name)).toBe(format);
	});

	it('rejects unknown extensions', () => {
		expect(() => detectFormat('a.fbx')).toThrow(ModelImportError);
	});
});

describe('parseModel', () => {
	it('parses ASCII STL into a closed tetrahedron', async () => {
		const { root, format } = await parseModel(new File([asciiStlTetra], 'tetra.stl'));
		expect(format).toBe('stl');
		expect(cleanMesh(root).diagnostics).toMatchObject({ triangles: 4, vertices: 4, openEdges: 0 });
	});

	it('parses OBJ and triangulates quads', async () => {
		const { root } = await parseModel(new File([objQuad], 'quad.obj'));
		let meshes = 0;
		root.traverse((c) => {
			if (c instanceof Mesh) meshes++;
		});
		expect(meshes).toBe(1);
		expect(cleanMesh(root).diagnostics.triangles).toBe(2);
	});

	it('rejects glTF that references external buffers', async () => {
		const gltf = JSON.stringify({
			asset: { version: '2.0' },
			buffers: [{ uri: 'scene.bin', byteLength: 12 }]
		});
		await expect(parseModel(new File([gltf], 'scene.gltf'))).rejects.toThrow('export as GLB');
	});

	it('rejects Draco-compressed glTF', async () => {
		const gltf = JSON.stringify({
			asset: { version: '2.0' },
			extensionsUsed: ['KHR_draco_mesh_compression'],
			extensionsRequired: ['KHR_draco_mesh_compression']
		});
		await expect(parseModel(new File([gltf], 'scene.gltf'))).rejects.toThrow(
			're-export without Draco compression'
		);
	});
});
