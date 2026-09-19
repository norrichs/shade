import {
	buildSavedConfig,
	parseSavedConfig,
	collectReferencedTilePatternSpecs,
	SAVED_CONFIG_VERSION
} from '../saved-config';
import type { GlobulePatternConfig, SuperGlobuleConfig } from '../types';
import type { ViewControls } from '../stores/viewControlStore';
import type { TiledPatternSpec } from '../patterns/spec-types';

const spec = (id: string, builtIn = false): TiledPatternSpec & { rowId?: number } => ({
	id,
	name: id,
	algorithm: 'grid',
	builtIn,
	unit: { width: 1, height: 1, start: [], middle: [], end: [] },
	adjustments: {
		withinBand: [],
		acrossBands: [],
		partner: { startEnd: [], endEnd: [] },
		skipRemove: []
	},
	rowId: 1
});

const patternConfig = (typeId: string): GlobulePatternConfig =>
	({
		type: 'GlobulePatternConfig',
		patternTypeConfig: { type: typeId }
	}) as unknown as GlobulePatternConfig;

const superConfig: SuperGlobuleConfig = {
	type: 'SuperGlobuleConfig',
	id: 's1',
	subGlobuleConfigs: [],
	projectionConfigs: []
};

const viewControls = {} as ViewControls;

describe('collectReferencedTilePatternSpecs', () => {
	it('returns the referenced custom spec, stripped of non-spec fields (rowId)', () => {
		const out = collectReferencedTilePatternSpecs(patternConfig('my-custom'), [
			spec('my-custom'),
			spec('unused')
		]);
		expect(out).toHaveLength(1);
		expect(out[0].id).toBe('my-custom');
		expect('rowId' in out[0]).toBe(false);
	});

	it('excludes built-in specs even when referenced', () => {
		const out = collectReferencedTilePatternSpecs(patternConfig('hex'), [spec('hex', true)]);
		expect(out).toHaveLength(0);
	});

	it('returns [] when the pattern type is outlined (not a tiled variant)', () => {
		const out = collectReferencedTilePatternSpecs(patternConfig('outlined'), [spec('outlined')]);
		expect(out).toHaveLength(0);
	});
});

describe('buildSavedConfig / parseSavedConfig', () => {
	it('writes the current version and round-trips embedded specs', () => {
		const env = buildSavedConfig(superConfig, patternConfig('my-custom'), viewControls, [
			spec('my-custom')
		]);
		expect(env.version).toBe(SAVED_CONFIG_VERSION);
		expect(env.tilePatternSpecs).toHaveLength(1);

		const parsed = parseSavedConfig(JSON.stringify(env));
		expect(parsed.tilePatternSpecs.map((s) => s.id)).toEqual(['my-custom']);
		expect(parsed.globulePatternConfig).toBeDefined();
	});

	it('defaults embedded specs to [] for a v2 envelope (no tilePatternSpecs field)', () => {
		const v2 = {
			type: 'SavedConfig',
			version: 2,
			superGlobuleConfig: superConfig,
			globulePatternConfig: patternConfig('hex'),
			viewControls
		};
		const parsed = parseSavedConfig(JSON.stringify(v2));
		expect(parsed.tilePatternSpecs).toEqual([]);
	});

	it('defaults embedded specs to [] for a legacy v1 bare SuperGlobuleConfig', () => {
		const parsed = parseSavedConfig(JSON.stringify(superConfig));
		expect(parsed.tilePatternSpecs).toEqual([]);
		expect(parsed.globulePatternConfig).toBeUndefined();
	});
});
