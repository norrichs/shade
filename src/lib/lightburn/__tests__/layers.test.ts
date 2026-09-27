import { describe, it, expect } from '@jest/globals';
import {
	LIGHTBURN_LAYERS,
	DEFAULT_LAYER_MAP,
	layerStroke,
	resolveLayer,
	isLayerId,
	layerOptionLabel
} from '../layers';
import { GEOMETRY_TYPES } from '$lib/cut-pattern/post-process-types';

describe('LightBurn layers', () => {
	it('has all 32 layers with unique ids and indexes', () => {
		expect(LIGHTBURN_LAYERS).toHaveLength(32);
		expect(new Set(LIGHTBURN_LAYERS.map((l) => l.id)).size).toBe(32);
		expect(new Set(LIGHTBURN_LAYERS.map((l) => l.index)).size).toBe(32);
	});

	it('uses the exact palette values', () => {
		const hex = Object.fromEntries(LIGHTBURN_LAYERS.map((l) => [l.id, l.hex]));
		expect(hex.C00).toBe('#000000');
		expect(hex.C01).toBe('#0000FF');
		expect(hex.C02).toBe('#FF0000');
		expect(hex.C29).toBe('#FFDB66');
		expect(hex.T1).toBe('#F36926');
		expect(hex.T2).toBe('#0C96D9');
	});

	it('indexes C00–C29 as 0–29 and tool layers as 30 and 31', () => {
		const idx = Object.fromEntries(LIGHTBURN_LAYERS.map((l) => [l.id, l.index]));
		expect(idx.C00).toBe(0);
		expect(idx.C29).toBe(29);
		expect(idx.T1).toBe(30);
		expect(idx.T2).toBe(31);
	});

	it('maps every geometry type by default', () => {
		for (const t of GEOMETRY_TYPES) expect(isLayerId(DEFAULT_LAYER_MAP[t])).toBe(true);
		expect(layerStroke('pattern-outline')).toBe('#000000');
		expect(layerStroke('outline-gap')).toBe('#0000FF');
		expect(layerStroke('page-outline')).toBe('#F36926');
	});

	it('prefers the configured layer over the default', () => {
		expect(resolveLayer('pattern-hole', { 'pattern-hole': 'C05' }).id).toBe('C05');
		expect(layerStroke('pattern-hole', { 'pattern-hole': 'C05' })).toBe('#FF8000');
	});

	it('formats option labels as id · color · function', () => {
		expect(layerOptionLabel(resolveLayer('outline-gap'))).toBe('C01 · blue · skip');
	});
});
