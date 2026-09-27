import { describe, it, expect } from '@jest/globals';
import { defaultPatternConfig } from '$lib/shades-config';
import { migrateGlobulePatternConfig } from '$lib/validators';
import { DEFAULT_POST_PROCESS } from '$lib/cut-pattern/hole-drop-config';
import type { GlobulePatternConfig } from '$lib/types';

describe('postProcess config', () => {
	it('defaults to dropping nothing', () => {
		expect(defaultPatternConfig().postProcess).toEqual(DEFAULT_POST_PROCESS);
	});

	it('backfills the block on a config that predates it', () => {
		const config = {
			patternConfig: { pageLayout: { keepConnected: 0 } }
		} as unknown as GlobulePatternConfig;
		const migrated = migrateGlobulePatternConfig(config);

		expect(migrated.patternConfig?.postProcess).toEqual(DEFAULT_POST_PROCESS);
	});

	it('leaves an existing block alone', () => {
		const config = {
			patternConfig: {
				pageLayout: { keepConnected: 0 },
				postProcess: { dropHoles: { mode: 'random', chance: 0.3 }, runSeed: 4 }
			}
		} as unknown as GlobulePatternConfig;

		expect(migrateGlobulePatternConfig(config).patternConfig?.postProcess).toEqual({
			dropHoles: { mode: 'random', chance: 0.3 },
			runSeed: 4
		});
	});

	it('clamps an out-of-range drop chance', () => {
		const config = {
			patternConfig: {
				pageLayout: { keepConnected: 0 },
				postProcess: { dropHoles: { mode: 'random', chance: 7 }, runSeed: 0 }
			}
		} as unknown as GlobulePatternConfig;
		const dropHoles = migrateGlobulePatternConfig(config).patternConfig?.postProcess?.dropHoles;

		expect(dropHoles).toEqual({ mode: 'random', chance: 1 });
	});

	it('repairs a block with a missing seed or an unrecognised mode', () => {
		const config = {
			patternConfig: {
				pageLayout: { keepConnected: 0 },
				postProcess: { dropHoles: { mode: 'nonsense' } }
			}
		} as unknown as GlobulePatternConfig;
		const postProcess = migrateGlobulePatternConfig(config).patternConfig?.postProcess;

		expect(postProcess).toEqual({ dropHoles: { mode: 'none' }, runSeed: 0 });
	});

	it('keeps valid drop flags and removes malformed ones', () => {
		const config = {
			patternConfig: {
				pageLayout: { keepConnected: 0 },
				postProcess: {
					dropHoles: { mode: 'none' },
					runSeed: 0,
					dropOutline: true,
					dropLabelText: 'yes'
				}
			}
		} as unknown as GlobulePatternConfig;

		expect(migrateGlobulePatternConfig(config).patternConfig?.postProcess).toEqual({
			dropHoles: { mode: 'none' },
			runSeed: 0,
			dropOutline: true
		});
	});

	const migratePP = (postProcess: Record<string, unknown>) =>
		migrateGlobulePatternConfig({
			patternConfig: { pageLayout: { keepConnected: 0 }, postProcess }
		} as unknown as GlobulePatternConfig).patternConfig?.postProcess as Record<string, unknown>;

	it('keeps valid post-processing 2 fields', () => {
		const pp = migratePP({
			dropHoles: { mode: 'none' },
			runSeed: 0,
			disconnectSurround: true,
			connectSurround: { enabled: true, gapMm: 2 },
			pageLabel: { pageNumber: true, configName: false, text: ' shade ' },
			layerMap: { 'outline-gap': 'C05' },
			downloadFormat: 'lbrn2'
		});
		expect(pp.disconnectSurround).toBe(true);
		expect(pp.connectSurround).toEqual({ enabled: true, gapMm: 2 });
		expect(pp.pageLabel).toEqual({ pageNumber: true, configName: false, text: 'shade' });
		expect(pp.layerMap).toEqual({ 'outline-gap': 'C05' });
		expect(pp.downloadFormat).toBe('lbrn2');
	});

	it('repairs malformed post-processing 2 fields', () => {
		const pp = migratePP({
			dropHoles: { mode: 'none' },
			runSeed: 0,
			disconnectSurround: 'yes',
			connectSurround: { enabled: 1, gapMm: 999 },
			pageLabel: { pageNumber: 'x', text: 5 },
			layerMap: { 'outline-gap': 'C99', bogus: 'C01', 'pattern-hole': 'T2' },
			downloadFormat: 'pdf'
		});
		expect('disconnectSurround' in pp).toBe(false);
		expect(pp.connectSurround).toEqual({ enabled: false, gapMm: 20 });
		expect(pp.pageLabel).toEqual({ pageNumber: false, configName: false, text: '' });
		expect(pp.layerMap).toEqual({ 'pattern-hole': 'T2' });
		expect('downloadFormat' in pp).toBe(false);
	});

	it('clamps a tiny or non-finite gap', () => {
		expect(migratePP({ dropHoles: { mode: 'none' }, runSeed: 0, connectSurround: { enabled: true, gapMm: 0 } }).connectSurround).toEqual({ enabled: true, gapMm: 0.1 });
		expect(migratePP({ dropHoles: { mode: 'none' }, runSeed: 0, connectSurround: { enabled: true, gapMm: NaN } }).connectSurround).toEqual({ enabled: true, gapMm: 1.5 });
	});
});
