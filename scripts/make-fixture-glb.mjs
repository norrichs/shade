// Writes tests/fixtures/deformed-icosphere.glb — a closed, star-shaped, Y-up
// blob (~1 unit radius, like a metre-scale export) for the model-import E2E.
// Hand-assembled GLB: GLTFExporter needs FileReader, which Node lacks.
import { mkdirSync, writeFileSync } from 'node:fs';
import { IcosahedronGeometry, Vector3 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const geometry = mergeVertices(new IcosahedronGeometry(1, 15)); // 20·16² = 5120 triangles
const position = geometry.getAttribute('position');
const v = new Vector3();
for (let i = 0; i < position.count; i++) {
	v.fromBufferAttribute(position, i);
	v.multiplyScalar(1 + 0.15 * Math.sin(3 * v.x) * Math.cos(2 * v.z));
	v.y *= 1.4;
	position.setXYZ(i, v.x, v.y, v.z);
}
const positions = Float32Array.from(position.array);
const indices = Uint32Array.from(geometry.getIndex().array);

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < positions.length; i += 3) {
	for (let k = 0; k < 3; k++) {
		min[k] = Math.min(min[k], positions[i + k]);
		max[k] = Math.max(max[k], positions[i + k]);
	}
}

const pad4 = (n) => (n + 3) & ~3;
const posBytes = positions.byteLength;
const idxBytes = indices.byteLength;
const binLength = pad4(posBytes + idxBytes);

const json = {
	asset: { version: '2.0', generator: 'shades make-fixture-glb' },
	scene: 0,
	scenes: [{ nodes: [0] }],
	nodes: [{ mesh: 0 }],
	meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
	buffers: [{ byteLength: binLength }],
	bufferViews: [
		{ buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
		{ buffer: 0, byteOffset: posBytes, byteLength: idxBytes, target: 34963 }
	],
	accessors: [
		{ bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
		{ bufferView: 1, componentType: 5125, count: indices.length, type: 'SCALAR' }
	]
};

let jsonText = JSON.stringify(json);
while (jsonText.length % 4 !== 0) jsonText += ' ';
const jsonChunk = Buffer.from(jsonText, 'utf8');

const bin = Buffer.alloc(binLength);
Buffer.from(positions.buffer).copy(bin, 0);
Buffer.from(indices.buffer).copy(bin, posBytes);

const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
const out = Buffer.alloc(total);
let o = 0;
out.writeUInt32LE(0x46546c67, o);
o += 4; // 'glTF'
out.writeUInt32LE(2, o);
o += 4;
out.writeUInt32LE(total, o);
o += 4;
out.writeUInt32LE(jsonChunk.length, o);
o += 4;
out.writeUInt32LE(0x4e4f534a, o);
o += 4; // 'JSON'
jsonChunk.copy(out, o);
o += jsonChunk.length;
out.writeUInt32LE(bin.length, o);
o += 4;
out.writeUInt32LE(0x004e4942, o);
o += 4; // 'BIN\0'
bin.copy(out, o);

mkdirSync('tests/fixtures', { recursive: true });
writeFileSync('tests/fixtures/deformed-icosphere.glb', out);
console.log(
	`wrote tests/fixtures/deformed-icosphere.glb (${total} bytes, ${indices.length / 3} triangles)`
);
