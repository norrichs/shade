import { Vector3 } from 'three';
import { toUV, fromUVToDirection } from '../uv-mapping';

describe('toUV', () => {
	const center = new Vector3(0, 0, 0);

	it('maps +X axis to u=0.25, v=0.5', () => {
		const [u, v] = toUV(new Vector3(1, 0, 0), center);
		expect(u).toBeCloseTo(0.25, 5);
		expect(v).toBeCloseTo(0.5, 5);
	});

	it('maps +Z axis (north pole) to v=0', () => {
		const [u, v] = toUV(new Vector3(0, 0, 1), center);
		expect(v).toBeCloseTo(0, 5);
	});

	it('maps -Z axis (south pole) to v=1', () => {
		const [u, v] = toUV(new Vector3(0, 0, -1), center);
		expect(v).toBeCloseTo(1, 5);
	});

	it('maps +Y axis to u=0.5, v=0.5', () => {
		const [u, v] = toUV(new Vector3(0, 1, 0), center);
		expect(u).toBeCloseTo(0.5, 5);
		expect(v).toBeCloseTo(0.5, 5);
	});

	it('produces values in [0, 1] range', () => {
		const points = [
			new Vector3(1, 1, 1),
			new Vector3(-1, 0, 0.5),
			new Vector3(0, -1, -0.5),
			new Vector3(3, -2, 7)
		];
		points.forEach((p) => {
			const [u, v] = toUV(p, center);
			expect(u).toBeGreaterThanOrEqual(0);
			expect(u).toBeLessThanOrEqual(1);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
		});
	});
});

describe('fromUVToDirection', () => {
	it('round-trips a point on the equator', () => {
		const original = new Vector3(5, 0, 0);
		const center = new Vector3(0, 0, 0);
		const [u, v] = toUV(original, center);
		const direction = fromUVToDirection(u, v);
		const restored = direction.multiplyScalar(original.length());
		expect(restored.x).toBeCloseTo(original.x, 4);
		expect(restored.y).toBeCloseTo(original.y, 4);
		expect(restored.z).toBeCloseTo(original.z, 4);
	});

	it('round-trips arbitrary 3D points', () => {
		const center = new Vector3(0, 0, 0);
		const points = [
			new Vector3(1, 2, 3),
			new Vector3(-4, 1, -2),
			new Vector3(0.5, 0.5, 0.5)
		];
		points.forEach((original) => {
			const [u, v] = toUV(original, center);
			const direction = fromUVToDirection(u, v);
			const restored = direction.multiplyScalar(original.length());
			expect(restored.x).toBeCloseTo(original.x, 4);
			expect(restored.y).toBeCloseTo(original.y, 4);
			expect(restored.z).toBeCloseTo(original.z, 4);
		});
	});
});
