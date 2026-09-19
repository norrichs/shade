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
});
