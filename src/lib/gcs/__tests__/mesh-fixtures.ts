import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, PlaneGeometry } from 'three';
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

/** Cylinders of radius `ra` at x = -10 and `rb` at x = 10: every horizontal slice is two loops. */
export const twoCylindersMesh = (ra = 3, rb = 4): TestMesh => {
	const a = new CylinderGeometry(ra, ra, 20, 32, 4).translate(-10, 0, 0);
	const b = new CylinderGeometry(rb, rb, 20, 32, 4).translate(10, 0, 0);
	return toMesh(mergeGeometries([a.toNonIndexed(), b.toNonIndexed()]));
};

/** A closed r=5 cylinder plus a separate open vertical strip at x = 20 (a stray open part). */
export const cylinderWithOpenStripMesh = (): TestMesh => {
	const body = new CylinderGeometry(5, 5, 20, 32, 4);
	const strip = new PlaneGeometry(4, 20, 1, 4).translate(20, 0, 0);
	return toMesh(mergeGeometries([body.toNonIndexed(), strip.toNonIndexed()]));
};

/** An open-ended tube with one side quad removed: slices are open chains. */
export const openTubeMesh = (): TestMesh => toMesh(new CylinderGeometry(5, 5, 20, 24, 1, true), 2);
