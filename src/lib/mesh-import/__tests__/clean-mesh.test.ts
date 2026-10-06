import { describe, it, expect } from '@jest/globals';
import {
	Box3,
	BoxGeometry,
	BufferAttribute,
	BufferGeometry,
	Group,
	InterleavedBuffer,
	InterleavedBufferAttribute,
	Line,
	Mesh,
	Object3D,
	Vector3
} from 'three';
import { cleanMesh, compactMesh, computeDiagnostics } from '../clean-mesh';

const bboxOf = (positions: Float32Array) => {
	const box = new Box3();
	for (let i = 0; i < positions.length; i += 3) {
		box.expandByPoint(new Vector3(positions[i], positions[i + 1], positions[i + 2]));
	}
	return box;
};

/** BoxGeometry minus its last face (2 triangles) — an open box. */
const openBox = (): BufferGeometry => {
	const g = new BoxGeometry(2, 2, 2);
	const index = g.getIndex()!;
	g.setIndex(new BufferAttribute(Uint32Array.from(index.array).slice(0, index.count - 6), 1));
	return g;
};

describe('cleanMesh', () => {
	it('welds a box with split face vertices into a closed 8-vertex mesh', () => {
		const result = cleanMesh(new Mesh(new BoxGeometry(2, 2, 2)));
		expect(result.diagnostics).toEqual({
			triangles: 12,
			vertices: 8,
			openEdges: 0,
			droppedPrimitives: 0
		});
		expect(result.index.length).toBe(36);
		expect(result.positions.length).toBe(24);
	});

	it('counts the boundary of an open box as open edges', () => {
		const result = cleanMesh(new Mesh(openBox()));
		expect(result.diagnostics.triangles).toBe(10);
		expect(result.diagnostics.openEdges).toBe(4);
	});

	it('bakes nested node transforms into positions', () => {
		const group = new Group();
		group.position.set(10, 0, 0);
		const mesh = new Mesh(new BoxGeometry(2, 2, 2));
		mesh.scale.set(2, 2, 2);
		group.add(mesh);
		const box = bboxOf(cleanMesh(group).positions);
		expect(box.min.toArray()).toEqual([8, -2, -2]);
		expect(box.max.toArray()).toEqual([12, 2, 2]);
	});

	it('merges several meshes into one', () => {
		const root = new Object3D();
		const a = new Mesh(new BoxGeometry(1, 1, 1));
		const b = new Mesh(new BoxGeometry(1, 1, 1));
		b.position.set(5, 0, 0);
		root.add(a, b);
		expect(cleanMesh(root).diagnostics.triangles).toBe(24);
	});

	it('drops Line primitives and counts them', () => {
		const root = new Object3D();
		root.add(new Mesh(new BoxGeometry(1, 1, 1)));
		root.add(new Line(new BufferGeometry().setFromPoints([new Vector3(), new Vector3(1, 0, 0)])));
		const result = cleanMesh(root);
		expect(result.diagnostics.droppedPrimitives).toBe(1);
		expect(result.diagnostics.triangles).toBe(12);
	});

	it('reads interleaved position attributes (common in exported GLBs)', () => {
		// stride 6: position xyz + a dummy normal xyz per vertex
		const data = new InterleavedBuffer(
			new Float32Array([0, 0, 0, 9, 9, 9, 1, 0, 0, 9, 9, 9, 0, 1, 0, 9, 9, 9]),
			6
		);
		const g = new BufferGeometry();
		g.setAttribute('position', new InterleavedBufferAttribute(data, 3, 0));
		const result = cleanMesh(new Mesh(g));
		expect(Array.from(result.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
		expect(result.diagnostics.openEdges).toBe(3);
	});

	it('removes degenerate triangles', () => {
		const g = new BufferGeometry();
		g.setAttribute(
			'position',
			new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0]), 3)
		);
		// second triangle is collinear (zero area)
		g.setIndex([0, 1, 2, 0, 1, 3]);
		const result = cleanMesh(new Mesh(g));
		expect(result.diagnostics.triangles).toBe(1);
		expect(result.diagnostics.vertices).toBe(3);
	});

	it('throws when there are no triangles', () => {
		expect(() => cleanMesh(new Object3D())).toThrow('no triangle meshes');
	});
});

describe('compactMesh', () => {
	it('drops unreferenced vertices and remaps the index', () => {
		const positions = new Float32Array([0, 0, 0, 9, 9, 9, 1, 0, 0, 0, 1, 0]);
		const result = compactMesh(positions, Uint32Array.from([0, 2, 3]));
		expect(Array.from(result.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
		expect(Array.from(result.index)).toEqual([0, 1, 2]);
	});
});

describe('computeDiagnostics', () => {
	it('reports a single triangle as three open edges', () => {
		const d = computeDiagnostics(new Float32Array(9), Uint32Array.from([0, 1, 2]), 2);
		expect(d).toEqual({ triangles: 1, vertices: 3, openEdges: 3, droppedPrimitives: 2 });
	});
});
