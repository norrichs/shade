import { Mesh } from 'three';
import { generateDefaultSuperGlobuleConfig } from '$lib/shades-config';
import { generateSurface } from '../generate-projection';
import type { SurfaceConfig } from '../types';

/**
 * A globule surface is built from its band geometries. When band collation
 * started returning `{ address, geometry }` pairs, the globule mesh kept handing
 * the pair itself to `new Mesh`, so every globule surface threw
 * "Cannot convert undefined or null to object" (voronoi and projection alike).
 */
describe('generateSurface — globule', () => {
	it('builds a mesh per band from the band geometry', () => {
		const superConfig = generateDefaultSuperGlobuleConfig();
		const surfaceConfig = {
			...superConfig.subGlobuleConfigs[0].globuleConfig,
			transform: {
				translate: { x: 0, y: 0, z: 0 },
				scale: { x: 1, y: 1, z: 1 },
				rotate: { x: 0, y: 0, z: 0 }
			}
		} as SurfaceConfig;

		const surface = generateSurface(surfaceConfig);

		const meshes: Mesh[] = [];
		surface.traverse((o) => {
			if (o instanceof Mesh) meshes.push(o);
		});
		expect(meshes.length).toBeGreaterThan(0);
		meshes.forEach((m) => expect(m.geometry.getAttribute('position').count).toBeGreaterThan(0));
	});
});
