import { describe, it, expect } from '@jest/globals';
import {
	addGcs,
	deleteGcs,
	moveGcs,
	setAllGcsBlends,
	setGcsBlend,
	setGcsLevel,
	setPrimary
} from '../gcs-editor';
import { defaultGcsBlend } from '#lib/gcs/gcs-blend.js';
import { generateDefaultRadialShapeConfig } from '#lib/shades-config.js';
import type { ShapeConfig } from '#lib/types.js';

const sm = { method: 'divideCurve', divisions: 4 } as const;
const mk = (id: number, extra: Partial<ShapeConfig> = {}): ShapeConfig => ({
	...generateDefaultRadialShapeConfig(4, sm, 'radial'),
	id,
	...extra
});

describe('gcs-editor', () => {
	it('addGcs duplicates after selection, not primary, unique id', () => {
		const list = [mk(1, { isPrimary: true, level: 0 }), mk(5, { level: 7 })];
		const out = addGcs(list, 0);
		expect(out).toHaveLength(3);
		expect(out[1].isPrimary).toBe(false);
		expect(out[1].level).toBeUndefined();
		expect(out[1].id).toBe(6);
		expect(out[1].curves).toEqual(list[0].curves);
		expect(out[1].curves).not.toBe(list[0].curves);
		expect(out[0]).toBe(list[0]);
		expect(out[2]).toBe(list[1]);
	});

	it('deleteGcs reassigns primary', () => {
		const list = [mk(1, { isPrimary: true }), mk(2, { isPrimary: false }), mk(3)];
		const out = deleteGcs(list, 0);
		expect(out.map((s) => s.id)).toEqual([2, 3]);
		expect(out.map((s) => !!s.isPrimary)).toEqual([true, false]);
	});

	it('deleteGcs keeps last one', () => {
		const list = [mk(1, { isPrimary: true })];
		expect(deleteGcs(list, 0)).toEqual(list);
	});

	it('moveGcs swaps and ignores ends', () => {
		const list = [mk(1), mk(2), mk(3)];
		expect(moveGcs(list, 1, -1).map((s) => s.id)).toEqual([2, 1, 3]);
		expect(moveGcs(list, 1, 1).map((s) => s.id)).toEqual([1, 3, 2]);
		expect(moveGcs(list, 0, -1).map((s) => s.id)).toEqual([1, 2, 3]);
		expect(moveGcs(list, 2, 1).map((s) => s.id)).toEqual([1, 2, 3]);
	});

	it('setPrimary is unique', () => {
		const list = [mk(1, { isPrimary: true }), mk(2), mk(3, { isPrimary: true })];
		expect(setPrimary(list, 1).map((s) => s.isPrimary)).toEqual([false, true, false]);
	});

	it('setGcsLevel clears with undefined', () => {
		const list = [mk(1), mk(2, { level: 3 })];
		expect(setGcsLevel(list, 0, 2)[0].level).toBe(2);
		expect(setGcsLevel(list, 1, undefined)[1].level).toBeUndefined();
		expect(list[1].level).toBe(3);
	});

	it('addGcs on id-less entries yields a defined id; add then move keeps defined ids unique', () => {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { id: _a, ...a } = mk(0);
		const list = [{ ...a, isPrimary: true } as ShapeConfig];
		const added = addGcs(list, 0);
		expect(added[1].id).toBeDefined();
		const moved = moveGcs(added, 1, -1);
		const ids = moved.map((s) => s.id).filter((v) => v !== undefined);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids.length).toBe(1);
	});

	it('setGcsBlend sets one blend as its own copy', () => {
		const list = [mk(1), mk(2)];
		const blend = defaultGcsBlend();
		const out = setGcsBlend(list, 0, blend);
		expect(out[0].blend).toEqual(blend);
		expect(out[0].blend).not.toBe(blend);
		expect(out[1].blend).toBeUndefined();
		expect(list[0].blend).toBeUndefined();
	});

	it('setAllGcsBlends gives every GCS an independent copy', () => {
		const out = setAllGcsBlends([mk(1), mk(2), mk(3)], { mode: 'linear' });
		expect(out.map((s) => s.blend?.mode)).toEqual(['linear', 'linear', 'linear']);
		expect(out[0].blend).not.toBe(out[1].blend);
	});
});
