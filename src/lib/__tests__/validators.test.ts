import { migrateGlobulePatternConfig } from '../validators';
import type { GlobulePatternConfig, TiledPatternConfig } from '../types';

// Minimal stub for a TiledPatternConfig - only the fields the migration touches matter.
const makeTiledConfig = (labels: unknown): TiledPatternConfig =>
	({
		type: 'tiledShieldTesselationPattern',
		tiling: 'rect',
		labels,
		config: {}
	}) as unknown as TiledPatternConfig;

const wrap = (patternTypeConfig: TiledPatternConfig): Partial<GlobulePatternConfig> =>
	({
		type: 'GlobulePatternConfig',
		patternTypeConfig
	}) as unknown as Partial<GlobulePatternConfig>;

describe('migrateGlobulePatternConfig', () => {
	describe('TiledPatternConfig.labels', () => {
		it('migrates legacy { scale, angle } shape to nested externalTag/onTab', () => {
			const legacy = wrap(makeTiledConfig({ scale: 0.25, angle: Math.PI / 2 }));

			const result = migrateGlobulePatternConfig(legacy);
			const labels = (result.patternTypeConfig as TiledPatternConfig).labels;

			expect(labels).toEqual({
				externalTag: { enabled: true, scale: 0.25, angle: Math.PI / 2 },
				onTab: { enabled: false, padding: 0.1 }
			});
		});

		it('passes through new shape unchanged', () => {
			const newShape = {
				externalTag: { enabled: false, scale: 0.5, angle: 1.2 },
				onTab: { enabled: true, padding: 0.2, color: '#ff0000' }
			};
			const config = wrap(makeTiledConfig(newShape));

			const result = migrateGlobulePatternConfig(config);
			const labels = (result.patternTypeConfig as TiledPatternConfig).labels;

			expect(labels).toEqual(newShape);
		});

		it('leaves undefined labels undefined', () => {
			const config = wrap(makeTiledConfig(undefined));

			const result = migrateGlobulePatternConfig(config);
			const labels = (result.patternTypeConfig as TiledPatternConfig).labels;

			expect(labels).toBeUndefined();
		});
	});
});
