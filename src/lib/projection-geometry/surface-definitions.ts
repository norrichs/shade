import type { CapsuleConfig, SphereConfig, SurfaceConfig } from './types';

export const defaultSphereConfig: SphereConfig = {
	type: 'SphereConfig',
	radius: 400,
	center: { x: 0.001, y: 0.001, z: 0.001 }
};

export const defaultCapsuleConfig: CapsuleConfig = {
	type: 'CapsuleConfig',
	radius: 200,
	center: { x: 0.001, y: 0.001, z: 0.001 },
	height: 400,
	capSegments: 10,
	radialSegments: 20,
	heightSegments: 1
};

export const getDefaultSurfaceConfig = (): SurfaceConfig => {
	console.debug('getDefaultSurfaceConfig', defaultCapsuleConfig);
	return {
		...defaultSphereConfig,
		transform: 'inherit'
	};
};
