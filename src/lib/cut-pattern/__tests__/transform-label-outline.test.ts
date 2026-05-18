import type { PathSegment } from '$lib/types';
import { transformLabelOutlineToBandSpace } from '../transform-label-outline';

describe('transformLabelOutlineToBandSpace', () => {
	test('identity (zero angle, zero translation) leaves coords unchanged', () => {
		const path: PathSegment[] = [
			['M', 0, 0],
			['L', 10, 0],
			['L', 10, 10],
			['Z']
		];
		const out = transformLabelOutlineToBandSpace(path, { x: 0, y: 0 }, 0);
		expect(out[0][0]).toBe('M');
		expect(out[0][1] as number).toBeCloseTo(0);
		expect(out[0][2] as number).toBeCloseTo(0);
		expect(out[1][0]).toBe('L');
		expect(out[1][1] as number).toBeCloseTo(10);
		expect(out[1][2] as number).toBeCloseTo(0);
		expect(out[2][0]).toBe('L');
		expect(out[2][1] as number).toBeCloseTo(10);
		expect(out[2][2] as number).toBeCloseTo(10);
		expect(out[3]).toEqual(['Z']);
	});

	test('pure translation shifts every coord', () => {
		const path: PathSegment[] = [
			['M', 0, 0],
			['L', 10, 0],
			['Z']
		];
		const out = transformLabelOutlineToBandSpace(path, { x: 5, y: 7 }, 0);
		expect(out[0]).toEqual(['M', 5, 7]);
		expect(out[1]).toEqual(['L', 15, 7]);
	});

	test('pure rotation by π/2 around origin sends (1, 0) → (0, 1)', () => {
		const path: PathSegment[] = [
			['M', 0, 0],
			['L', 1, 0],
			['Z']
		];
		const out = transformLabelOutlineToBandSpace(path, { x: 0, y: 0 }, Math.PI / 2);
		// rotate(π/2) takes (1, 0) to (cos(π/2)*1, sin(π/2)*1) = (0, 1)
		expect(out[1][0]).toBe('L');
		expect(out[1][1] as number).toBeCloseTo(0);
		expect(out[1][2] as number).toBeCloseTo(1);
	});

	test('rotate then translate: rotate first around origin, then translate', () => {
		const path: PathSegment[] = [
			['M', 1, 0]
		];
		// rotate(π/2) takes (1, 0) → (0, 1); then translate by (5, 7) → (5, 8).
		const out = transformLabelOutlineToBandSpace(path, { x: 5, y: 7 }, Math.PI / 2);
		expect(out[0][0]).toBe('M');
		expect(out[0][1] as number).toBeCloseTo(5);
		expect(out[0][2] as number).toBeCloseTo(8);
	});
});
