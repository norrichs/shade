import { migrateGlobulePatternConfig } from '../validators';
import type { GlobulePatternConfig, OutlinedPatternConfig, TiledPatternConfig } from '../types';

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

			// No page layout in the stub, so the mm conversion runs at 1:1.
			expect(labels).toEqual({
				units: 'mm',
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

		it('converts pattern-unit labels to mm at the config page scale', () => {
			const config = {
				...wrap(
					makeTiledConfig({
						onTab: { enabled: true, padding: 2 },
						selfTag: {
							enabled: true,
							height: 14,
							angle: 1,
							padding: 10,
							stemLength: 20,
							stemWidth: 4
						}
					})
				),
				patternConfig: { pageLayout: { pageScale: 2 } }
			} as unknown as Partial<GlobulePatternConfig>;

			const result = migrateGlobulePatternConfig(config);
			const labels = (result.patternTypeConfig as TiledPatternConfig).labels;

			expect(labels).toEqual({
				units: 'mm',
				onTab: { enabled: true, padding: 1 },
				selfTag: { enabled: true, height: 7, angle: 1, padding: 5, stemLength: 10, stemWidth: 2 }
			});
		});

		it('passes mm labels through unchanged', () => {
			const newShape = {
				units: 'mm',
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

			// No page layout in the stub, so the mm conversion runs at 1:1.
			expect(labels).toEqual({
				units: 'mm',
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
