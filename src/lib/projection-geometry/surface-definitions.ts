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

// Use the sphere config as the default surface to avoid circular dependency
// GlobuleConfig can be created via generateDefaultSurfaceConfig() when needed
export const defaultSurfaceConfig: SurfaceConfig = {
	...defaultSphereConfig,
	transform: 'inherit'
};

export const generateDefaultSurfaceConfig = (): SurfaceConfig => {
	// Lazy import to avoid circular dependency at module initialization
	const { generateDefaultGlobuleConfig } = require('$lib/shades-config');
	return {
		...generateDefaultGlobuleConfig(),
		type: 'GlobuleConfig',
		transform: 'inherit'
	};
};
