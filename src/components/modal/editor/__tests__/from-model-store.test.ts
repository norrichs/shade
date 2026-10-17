import { describe, it, expect } from '@jest/globals';

import { defaultModelSource } from '../from-model-store';
import { generateDefaultGlobuleConfig } from '#lib/shades-config.js';
import type { SuperGlobuleConfig } from '#lib/types.js';
import type { ImportedSurfaceConfig, SurfaceConfig } from '#lib/projection-geometry/types.js';

const model = (assetId: string): ImportedSurfaceConfig => ({
	type: 'ImportedMeshConfig',
	assetId,
	fileName: `${assetId}.glb`,
	normalize: { upAxis: '+y', targetSize: 800, offset: { x: 0, y: 0, z: 0 }, scale: 1 },
	center: { x: 0, y: 0, z: 0 },
	transform: 'inherit'
});

const config = (surfaceConfig: SurfaceConfig, modelSource?: ImportedSurfaceConfig) =>
	({
		type: 'SuperGlobuleConfig',
		id: 's',
		subGlobuleConfigs: [
			{
				globuleConfig: {
					...generateDefaultGlobuleConfig(),
					...(modelSource ? { modelSource } : {})
				}
			}
		],
		projectionConfigs: [{ surfaceConfig }]
	}) as unknown as SuperGlobuleConfig;

const sphere = {
	type: 'SphereConfig',
	radius: 100,
	center: { x: 0, y: 0, z: 0 },
	transform: 'inherit'
} as unknown as SurfaceConfig;

describe('defaultModelSource', () => {
	it("prefers the globule's own modelSource", () => {
		expect(defaultModelSource(config(model('surface'), model('own')))?.assetId).toBe('own');
	});

	it('falls back to an imported projection surface', () => {
		expect(defaultModelSource(config(model('surface')))?.assetId).toBe('surface');
	});

	it('is undefined when neither is an imported model', () => {
		expect(defaultModelSource(config(sphere))).toBeUndefined();
	});
});
