import type { ShapeConfig } from '$lib/types';
import { validateShapeConfigs } from '../validate-shape-configs';

const sc = (isPrimary?: boolean, level?: number) => ({ isPrimary, level }) as ShapeConfig;

describe('validateShapeConfigs', () => {
	it('accepts a valid 5x6 + 6x5', () => {
		const r = validateShapeConfigs([sc(true), sc()], [30, 30], 10);
		expect(r.isValid).toBe(true);
		expect(r.errors).toEqual([]);
		expect(r.bandCount).toBe(30);
		expect(r.levels).toEqual([0, 10]);
	});
	it('flags vertex count mismatch', () => {
		const r = validateShapeConfigs([sc(true), sc()], [30, 36], 10);
		expect(r.isValid).toBe(false);
		expect(r.errors).toEqual([{ index: 1, message: 'B has 36 points; primary has 30' }]);
	});
	it('flags pinned level out of range', () => {
		const r = validateShapeConfigs([sc(true), sc(false, 12)], [30, 30], 10);
		expect(r.errors).toContainEqual({ index: 1, message: 'B: level 12 is outside 0–10' });
	});
	it('flags no primary', () => {
		const r = validateShapeConfigs([sc(), sc()], [30, 30], 10);
		expect(r.errors[0]).toEqual({
			index: null,
			message: 'Exactly one cross section must be primary'
		});
	});
	it('flags two primaries', () => {
		const r = validateShapeConfigs([sc(true), sc(true)], [30, 30], 10);
		expect(r.errors[0].index).toBeNull();
		expect(r.isValid).toBe(false);
	});
	it('flags out of order', () => {
		const r = validateShapeConfigs([sc(true, 5), sc(false, 2)], [30, 30], 10);
		expect(r.errors).toEqual([
			{ index: 1, message: 'B: level 2 must be above previous cross section (level 5)' }
		]);
	});
	it('flags too many', () => {
		const r = validateShapeConfigs([sc(true), sc(), sc()], [30, 30, 30], 1);
		expect(r.errors).toContainEqual({
			index: null,
			message: 'More cross sections (3) than silhouette levels (2)'
		});
	});
	it('flags zero vertices', () => {
		const r = validateShapeConfigs([sc(true), sc()], [30, 0], 10);
		expect(r.errors).toEqual([{ index: 1, message: 'B has no points' }]);
	});
	it('single: only zero-vertex check applies', () => {
		expect(validateShapeConfigs([sc(false, 99)], [12], 10).isValid).toBe(true);
		const r = validateShapeConfigs([sc()], [0], 10);
		expect(r.errors).toEqual([{ index: 0, message: 'A has no points' }]);
	});
	it('empty list is a list-level error', () => {
		const r = validateShapeConfigs([], [], 10);
		expect(r.isValid).toBe(false);
		expect(r.errors[0].index).toBeNull();
		expect(r.bandCount).toBe(0);
	});
});
