import { describe, it, expect } from '@jest/globals';
import { Box3, Vector3 } from 'three';
import type { UpAxis } from '#lib/projection-geometry/types.js';
import {
	DEFAULT_TARGET_SIZE,
	computeFit,
	defaultUpAxis,
	normalizeMatrix,
	upAxisRotation
} from '../normalize';

const AXES: Record<UpAxis, Vector3> = {
	'+x': new Vector3(1, 0, 0),
	'-x': new Vector3(-1, 0, 0),
	'+y': new Vector3(0, 1, 0),
	'-y': new Vector3(0, -1, 0),
	'+z': new Vector3(0, 0, 1),
	'-z': new Vector3(0, 0, -1)
};

/** Corners of a 1×1×4 box elongated along `axis`, centered at (10, 20, 30). */
const elongatedBox = (axis: Vector3): Float32Array => {
	const half = new Vector3(0.5, 0.5, 0.5).add(
		new Vector3(Math.abs(axis.x), Math.abs(axis.y), Math.abs(axis.z)).multiplyScalar(1.5)
	);
	const out: number[] = [];
	for (const sx of [-1, 1])
		for (const sy of [-1, 1])
			for (const sz of [-1, 1]) out.push(10 + sx * half.x, 20 + sy * half.y, 30 + sz * half.z);
	return new Float32Array(out);
};

const fittedBox = (positions: Float32Array, upAxis: UpAxis, targetSize: number) => {
	const fit = computeFit(positions, upAxis, targetSize);
	const m = normalizeMatrix({ upAxis, targetSize, ...fit });
	const box = new Box3();
	for (let i = 0; i < positions.length; i += 3) {
		box.expandByPoint(new Vector3().fromArray(positions, i).applyMatrix4(m));
	}
	return box;
};

describe('upAxisRotation', () => {
	it.each(Object.keys(AXES) as UpAxis[])('maps %s onto +Z', (upAxis) => {
		const mapped = AXES[upAxis].clone().applyMatrix4(upAxisRotation(upAxis));
		expect(mapped.x).toBeCloseTo(0);
		expect(mapped.y).toBeCloseTo(0);
		expect(mapped.z).toBeCloseTo(1);
	});
});

describe('computeFit + normalizeMatrix', () => {
	it.each(Object.keys(AXES) as UpAxis[])(
		'centers at the origin and puts the long %s side on Z at target size',
		(upAxis) => {
			const box = fittedBox(elongatedBox(AXES[upAxis]), upAxis, 800);
			const size = box.getSize(new Vector3());
			const center = box.getCenter(new Vector3());
			expect(size.z).toBeCloseTo(800, 3);
			expect(size.x).toBeCloseTo(200, 3);
			expect(size.y).toBeCloseTo(200, 3);
			expect(center.length()).toBeCloseTo(0, 3);
		}
	);

	it('throws for a zero-size model', () => {
		expect(() => computeFit(new Float32Array([1, 1, 1, 1, 1, 1]), '+z', 800)).toThrow('zero size');
	});
});

describe('defaults', () => {
	it('uses +z for STL and +y otherwise', () => {
		expect(defaultUpAxis('stl')).toBe('+z');
		expect(defaultUpAxis('glb')).toBe('+y');
		expect(defaultUpAxis('gltf')).toBe('+y');
		expect(defaultUpAxis('obj')).toBe('+y');
		expect(DEFAULT_TARGET_SIZE).toBe(800);
	});
});
