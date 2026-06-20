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
	edgeDivisions: [6, 6],
	curveOffsetFactor: 0.3,
	surfaceProjectionDivisions: 0,
	voronoiMethod: 'spherical',
	insetMethod: 'centerOut'
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
		const a = { ...inlineDefaultVoronoiConfig, edgeDivisions: [3, 3] as [number, number] };
		const b = { ...inlineDefaultVoronoiConfig, edgeDivisions: [9, 9] as [number, number] };
		const result = normalizeVoronoiConfig(
			baseConfig({ voronoiConfigs: [a, b] }) as SuperGlobuleConfig & {
				voronoiConfigs: (typeof a)[];
			}
		);
		expect(result.voronoiConfig?.edgeDivisions).toEqual([3, 3]);
	});

	it('injects the default when a legacy voronoiConfigs array is empty', () => {
		const result = normalizeVoronoiConfig(baseConfig({ voronoiConfigs: [] }) as SuperGlobuleConfig);
		expect(result.voronoiConfig).toBeDefined();
	});

	it('preserves an existing single voronoiConfig', () => {
		const existing = { ...inlineDefaultVoronoiConfig, edgeDivisions: [7, 11] as [number, number] };
		const result = normalizeVoronoiConfig(baseConfig({ voronoiConfig: existing }));
		expect(result.voronoiConfig?.edgeDivisions).toEqual([7, 11]);
	});

	it('migrates a legacy scalar edgeDivisions to a [min, max] pair', () => {
		const legacy = {
			...inlineDefaultVoronoiConfig,
			edgeDivisions: 8 as unknown as [number, number]
		};
		const result = normalizeVoronoiConfig(baseConfig({ voronoiConfig: legacy }));
		expect(result.voronoiConfig?.edgeDivisions).toEqual([8, 8]);
	});

	it('enforces the min <= max invariant on a persisted pair', () => {
		const inverted = {
			...inlineDefaultVoronoiConfig,
			edgeDivisions: [12, 4] as [number, number]
		};
		const result = normalizeVoronoiConfig(baseConfig({ voronoiConfig: inverted }));
		expect(result.voronoiConfig?.edgeDivisions).toEqual([4, 12]);
	});

	it("defaults a missing insetMethod to 'centerOut'", () => {
		const legacy = { ...inlineDefaultVoronoiConfig } as Record<string, unknown>;
		delete legacy.insetMethod;
		const result = normalizeVoronoiConfig(
			baseConfig({ voronoiConfig: legacy as unknown as VoronoiConfig })
		);
		expect(result.voronoiConfig?.insetMethod).toBe('centerOut');
	});

	it('preserves an explicit insetMethod', () => {
		const existing = { ...inlineDefaultVoronoiConfig, insetMethod: 'localProjection' as const };
		const result = normalizeVoronoiConfig(baseConfig({ voronoiConfig: existing }));
		expect(result.voronoiConfig?.insetMethod).toBe('localProjection');
	});

	it('strips the legacy voronoiConfigs key from the result', () => {
		const result = normalizeVoronoiConfig(
			baseConfig({ voronoiConfigs: [inlineDefaultVoronoiConfig] }) as SuperGlobuleConfig
		);
		expect('voronoiConfigs' in result).toBe(false);
	});

	it('defaults curvedInset to false when absent', () => {
		const base = baseConfig({ voronoiConfig: inlineDefaultVoronoiConfig });
		const voronoiNoCurved = { ...base.voronoiConfig! };
		delete voronoiNoCurved.curvedInset;
		const input = { ...base, voronoiConfig: voronoiNoCurved } as typeof base;
		const result = normalizeVoronoiConfig(input);
		expect(result.voronoiConfig!.curvedInset).toBe(false);
	});

	it('coerces seed + inset methods to center-free choices when geodesic', () => {
		const cfg = normalizeVoronoiConfig(
			baseConfig({
				voronoiConfig: {
					...inlineDefaultVoronoiConfig,
					voronoiMethod: 'geodesic',
					insetMethod: 'centerOut',
					seedConfig: {
						type: 'VoronoiSeedConfig',
						seedMethod: { type: 'centerProjection', pointCount: 10, seed: 3 },
						relaxationIterations: 2
					}
				} as VoronoiConfig
			})
		);
		const v = cfg.voronoiConfig!;
		expect(v.insetMethod).toBe('localProjection');
		expect(v.seedConfig.seedMethod.type).toBe('areaWeighted');
		expect(v.seedConfig.seedMethod.pointCount).toBe(10); // preserved
		expect(v.seedConfig.seedMethod.seed).toBe(3); // preserved
		expect(v.seedConfig.relaxationIterations).toBe(2); // preserved
	});

	it('leaves an already center-free geodesic config intact', () => {
		const cfg = normalizeVoronoiConfig(
			baseConfig({
				voronoiConfig: {
					...inlineDefaultVoronoiConfig,
					voronoiMethod: 'geodesic',
					insetMethod: 'localProjection',
					seedConfig: {
						type: 'VoronoiSeedConfig',
						seedMethod: { type: 'areaWeighted', pointCount: 12, seed: 9 },
						relaxationIterations: 4
					}
				} as VoronoiConfig
			})
		);
		const v = cfg.voronoiConfig!;
		expect(v.insetMethod).toBe('localProjection');
		expect(v.seedConfig.seedMethod.type).toBe('areaWeighted');
		expect(v.seedConfig.seedMethod.pointCount).toBe(12);
		expect(v.seedConfig.seedMethod.seed).toBe(9);
		expect(v.seedConfig.relaxationIterations).toBe(4);
	});
});
