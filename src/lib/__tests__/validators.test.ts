import { migrateGlobulePatternConfig } from '../validators';
import type {
	GlobulePatternConfig,
	OutlinedPatternConfig,
	TiledPatternConfig
} from '../types';

// Minimal stub for a TiledPatternConfig - only the fields the migration touches matter.
const makeTiledConfig = (labels: unknown): TiledPatternConfig =>
	({
		type: 'tiledShieldTesselationPattern',
		tiling: 'rect',
		labels,
		config: {}
	}) as unknown as TiledPatternConfig;

const makeOutlinedConfig = (labels: unknown): OutlinedPatternConfig =>
	({
		type: 'outlined',
		tabConfig: { tabWidth: 20, shape: 'partner', bandEdge: 'after' },
		labels
	}) as unknown as OutlinedPatternConfig;

const wrap = (
	patternTypeConfig: TiledPatternConfig | OutlinedPatternConfig
): Partial<GlobulePatternConfig> =>
	({
		type: 'GlobulePatternConfig',
		patternTypeConfig
	}) as unknown as Partial<GlobulePatternConfig>;

describe('migrateGlobulePatternConfig', () => {
	describe('TiledPatternConfig.labels', () => {
		it('migrates legacy { scale, angle } shape to nested selfTag/onTab', () => {
			const legacy = wrap(makeTiledConfig({ scale: 0.25, angle: Math.PI / 2 }));

			const result = migrateGlobulePatternConfig(legacy);
			const labels = (result.patternTypeConfig as TiledPatternConfig).labels;

			expect(labels).toEqual({
				onTab: { enabled: false, padding: 1 },
				selfTag: {
					enabled: true,
					height: 14,
					angle: Math.PI / 2,
					padding: 10,
					stemLength: 20,
					stemWidth: 4
				}
			});
		});

		it('passes through new shape unchanged', () => {
			const newShape = {
				onTab: { enabled: true, padding: 0.2, color: '#ff0000' },
				selfTag: { enabled: false, height: 20, angle: 1.2, padding: 8 }
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

	describe('OutlinedPatternConfig.labels', () => {
		it('migrates legacy { scale, angle } shape to nested selfTag/onTab', () => {
			const legacy = wrap(makeOutlinedConfig({ scale: 0.25, angle: Math.PI / 2 }));

			const result = migrateGlobulePatternConfig(legacy);
			const labels = (result.patternTypeConfig as OutlinedPatternConfig).labels;

			expect(labels).toEqual({
				onTab: { enabled: false, padding: 1 },
				selfTag: {
					enabled: true,
					height: 14,
					angle: Math.PI / 2,
					padding: 10,
					stemLength: 20,
					stemWidth: 4
				}
			});
		});
	});
});
