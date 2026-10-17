import { normalizeShapeConfigs, primaryShapeConfig } from '../migrate-shape-configs';
import type { GlobuleConfig, ShapeConfig, SuperGlobuleConfig } from '../../types';

const S = {
	type: 'ShapeConfig',
	sampleMethod: { method: 'divideCurve', divisions: 3 },
	symmetry: 'radial',
	symmetryNumber: 4,
	curves: []
} as ShapeConfig;

const legacyGlobule = () =>
	({ type: 'GlobuleConfig', id: 'g', shapeConfig: S, levelConfig: {} }) as unknown as GlobuleConfig;

describe('normalizeShapeConfigs', () => {
	it('migrates sub-globule', () => {
		const cfg = {
			type: 'SuperGlobuleConfig',
			subGlobuleConfigs: [{ globuleConfig: legacyGlobule() }],
			projectionConfigs: []
		} as unknown as SuperGlobuleConfig;
		const g = normalizeShapeConfigs(cfg).subGlobuleConfigs[0].globuleConfig;
		expect(g.shapeConfigs).toEqual([{ ...S, isPrimary: true }]);
		expect('shapeConfig' in g).toBe(false);
	});

	it('migrates projection surface', () => {
		const cfg = {
			type: 'SuperGlobuleConfig',
			subGlobuleConfigs: [],
			projectionConfigs: [{ surfaceConfig: { ...legacyGlobule(), transform: 'inherit' } }]
		} as unknown as SuperGlobuleConfig;
		const s = normalizeShapeConfigs(cfg).projectionConfigs[0].surfaceConfig as GlobuleConfig;
		expect(s.shapeConfigs).toEqual([{ ...S, isPrimary: true }]);
		expect('shapeConfig' in s).toBe(false);
	});

	it('leaves non-globule surfaces alone', () => {
		const sphere = { type: 'SphereConfig', transform: 'inherit' };
		const cfg = {
			subGlobuleConfigs: [],
			projectionConfigs: [{ surfaceConfig: sphere }]
		} as unknown as SuperGlobuleConfig;
		expect(normalizeShapeConfigs(cfg).projectionConfigs[0].surfaceConfig).toBe(sphere);
	});

	it('is idempotent', () => {
		const cfg = {
			subGlobuleConfigs: [{ globuleConfig: legacyGlobule() }],
			projectionConfigs: [{ surfaceConfig: { ...legacyGlobule(), transform: 'inherit' } }]
		} as unknown as SuperGlobuleConfig;
		const once = normalizeShapeConfigs(cfg);
		expect(normalizeShapeConfigs(once)).toEqual(once);
	});
});

describe('primaryShapeConfig', () => {
	it('returns the isPrimary entry, else the first', () => {
		const a = { ...S, symmetryNumber: 1 };
		const b = { ...S, symmetryNumber: 2, isPrimary: true };
		expect(primaryShapeConfig({ shapeConfigs: [a, b] } as unknown as GlobuleConfig)).toBe(b);
		expect(primaryShapeConfig({ shapeConfigs: [a, S] } as unknown as GlobuleConfig)).toBe(a);
	});
});
