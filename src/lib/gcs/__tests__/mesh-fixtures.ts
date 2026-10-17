import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type TestMesh = { positions: Float32Array; index: Uint32Array };

/** Y-up Three geometry → welded, Z-up, origin-centered test mesh. */
const toMesh = (geometry: BufferGeometry, dropTriangles = 0): TestMesh => {
	geometry.rotateX(Math.PI / 2);
	const stripped = new BufferGeometry();
	stripped.setAttribute('position', geometry.getAttribute('position'));
	stripped.setIndex(geometry.getIndex());
	const welded = mergeVertices(stripped);
	const index = Uint32Array.from(welded.getIndex()!.array).slice(dropTriangles * 3);
	return { positions: Float32Array.from(welded.getAttribute('position').array), index };
};

export const cylinderMesh = (radius = 5, height = 20, segments = 48): TestMesh =>
	toMesh(new CylinderGeometry(radius, radius, height, segments, 4));

export const boxMesh = (w = 2, d = 4, h = 6): TestMesh =>
	// rotateX maps Three's depth (z) to -y and height (y) to z.
	toMesh(new BoxGeometry(w, h, d));

/** Apex up (+Z), base radius `radius` at z = -height / 2. */
export const coneMesh = (radius = 5, height = 20, segments = 48): TestMesh =>
	toMesh(new ConeGeometry(radius, height, segments, 4));

/** Two r=3 cylinders at x = ±10: every horizontal slice is two loops. */
export const twoCylindersMesh = (): TestMesh => {
	const a = new CylinderGeometry(3, 3, 20, 32, 4).translate(-10, 0, 0);
	const b = new CylinderGeometry(4, 4, 20, 32, 4).translate(10, 0, 0);
	return toMesh(mergeGeometries([a.toNonIndexed(), b.toNonIndexed()]));
};

/** An open-ended tube with one side quad removed: slices are open chains. */
export const openTubeMesh = (): TestMesh => toMesh(new CylinderGeometry(5, 5, 20, 24, 1, true), 2);
