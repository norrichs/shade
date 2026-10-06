import { Box3, Matrix4, Vector3 } from 'three';
import type { Point3 } from '$lib/types';
import type { ImportedMeshNormalize, UpAxis } from '$lib/projection-geometry/types';
import type { MeshSourceFormat } from './types';

/** Largest bbox dimension after fit — matches the default sphere's 400 radius. */
export const DEFAULT_TARGET_SIZE = 800;

/** glTF and OBJ are conventionally Y-up; STL usually comes from Z-up CAD tools. */
export const defaultUpAxis = (format: MeshSourceFormat): UpAxis =>
	format === 'stl' ? '+z' : '+y';

/** Rotation taking the source `upAxis` onto the app's up axis, +Z. */
export const upAxisRotation = (upAxis: UpAxis): Matrix4 => {
	const m = new Matrix4();
	switch (upAxis) {
		case '+z':
			return m;
		case '-z':
			return m.makeRotationX(Math.PI);
		case '+y':
			return m.makeRotationX(Math.PI / 2);
		case '-y':
			return m.makeRotationX(-Math.PI / 2);
		case '+x':
			return m.makeRotationY(-Math.PI / 2);
		case '-x':
			return m.makeRotationY(Math.PI / 2);
	}
};

/**
 * Offset (bbox-center shift, in rotated space) and uniform scale that put the
 * rotated model's bbox center at the origin with its largest side = targetSize.
 */
export const computeFit = (
	positions: Float32Array,
	upAxis: UpAxis,
	targetSize: number
): { offset: Point3; scale: number } => {
	const rotation = upAxisRotation(upAxis);
	const box = new Box3();
	const v = new Vector3();
	for (let i = 0; i < positions.length; i += 3) {
		box.expandByPoint(v.fromArray(positions, i).applyMatrix4(rotation));
	}
	const size = box.getSize(new Vector3());
	const maxDim = Math.max(size.x, size.y, size.z);
	if (!(maxDim > 0) || !(targetSize > 0)) throw new Error('Cannot fit a model with zero size');
	const center = box.getCenter(new Vector3());
	return { offset: { x: -center.x, y: -center.y, z: -center.z }, scale: targetSize / maxDim };
};

/** scale · translate(offset) · upAxisRotation — applied to the raw asset positions. */
export const normalizeMatrix = ({ upAxis, offset, scale }: ImportedMeshNormalize): Matrix4 =>
	new Matrix4()
		.makeScale(scale, scale, scale)
		.multiply(new Matrix4().makeTranslation(offset.x, offset.y, offset.z))
		.multiply(upAxisRotation(upAxis));
