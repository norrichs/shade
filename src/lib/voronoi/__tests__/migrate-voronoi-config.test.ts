import type { SuperGlobuleConfig } from '$lib/types';
import type { VoronoiConfig } from '../types';

// Inline the default voronoi config to avoid pulling in uuid (via shades-config -> id-handler)
const inlineDefaultVoronoiConfig: VoronoiConfig = {
	type: 'VoronoiConfig',
	meta: {
		transform: {
			translate: { x: 0, y: 0, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			rotate: { x: 0, y: 0, z: 0 }
		}
	},
	seedConfig: {
		type: 'VoronoiSeedConfig',
		seedMethod: {
			type: 'areaWeighted',
			pointCount: 12,
			seed: 42
		},
		relaxationIterations: 5
	},
	crossSectionConfig: {
		type: 'CrossSectionConfig',
		curveSampleMethod: { method: 'divideCurve', divisions: 6 },
		curves: []
	} as unknown as VoronoiConfig['crossSectionConfig'],
	bandConfig: {
		orientation: 'axial-right',
		tubeSymmetry: 'lateral'
	},
	edgeDivisions: 6,
	curveOffsetFactor: 0.3,
	surfaceProjectionDivisions: 0,
	voronoiMethod: 'spherical'
};

// Mock shades-config to avoid uuid transitive dependency
jest.mock('$lib/shades-config', () => ({
	defaultVoronoiConfig: inlineDefaultVoronoiConfig
}));

import { normalizeVoronoiConfig } from '../migrate-voronoi-config';

const baseConfig = (extra: Record<string, unknown>): SuperGlobuleConfig =>
	({
		type: 'SuperGlobuleConfig',
		id: 1,
		subGlobuleConfigs: [],
		projectionConfigs: [],
		...extra
	}) as SuperGlobuleConfig;

describe('normalizeVoronoiConfig', () => {
	it('injects a default voronoiConfig with a random seed when none is present', () => {
		const result = normalizeVoronoiConfig(baseConfig({}));
		expect(result.voronoiConfig).toBeDefined();
		expect(result.voronoiConfig?.type).toBe('VoronoiConfig');
		expect(typeof result.voronoiConfig?.seedConfig.seedMethod.seed).toBe('number');
	});

	it('randomizes the injected seed (differs from the static default seed)', () => {
		// Force Math.random to a value that maps to a seed != defaultVoronoiConfig seed.
		const spy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
		const result = normalizeVoronoiConfig(baseConfig({}));
		expect(result.voronoiConfig?.seedConfig.seedMethod.seed).toBe(Math.floor(0.5 * 2 ** 31));
		spy.mockRestore();
	});

	it('collapses a legacy voronoiConfigs array to the first entry', () => {
		const a = { ...inlineDefaultVoronoiConfig, edgeDivisions: 3 };
		const b = { ...inlineDefaultVoronoiConfig, edgeDivisions: 9 };
		const result = normalizeVoronoiConfig(
			baseConfig({ voronoiConfigs: [a, b] }) as SuperGlobuleConfig & {
				voronoiConfigs: typeof a[];
			}
		);
		expect(result.voronoiConfig?.edgeDivisions).toBe(3);
	});

	it('injects the default when a legacy voronoiConfigs array is empty', () => {
		const result = normalizeVoronoiConfig(
			baseConfig({ voronoiConfigs: [] }) as SuperGlobuleConfig
		);
		expect(result.voronoiConfig).toBeDefined();
	});

	it('preserves an existing single voronoiConfig untouched', () => {
		const existing = { ...inlineDefaultVoronoiConfig, edgeDivisions: 7 };
		const result = normalizeVoronoiConfig(baseConfig({ voronoiConfig: existing }));
		expect(result.voronoiConfig?.edgeDivisions).toBe(7);
	});

	it('strips the legacy voronoiConfigs key from the result', () => {
		const result = normalizeVoronoiConfig(
			baseConfig({ voronoiConfigs: [inlineDefaultVoronoiConfig] }) as SuperGlobuleConfig
		);
		expect('voronoiConfigs' in result).toBe(false);
	});
});
