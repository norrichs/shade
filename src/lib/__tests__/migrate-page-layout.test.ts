import { migrateGlobulePatternConfig } from '../validators';
import type { GlobulePatternConfig } from '../types';

describe('migrateGlobulePatternConfig — page layout', () => {
	it('maps legacy lineWrap=true to patternLayoutMode "line-wrap"', () => {
		const cfg = {
			patternViewConfig: { lineWrap: true }
		} as Partial<GlobulePatternConfig>;
		const out = migrateGlobulePatternConfig(cfg);
		expect(out.patternViewConfig?.patternLayoutMode).toBe('line-wrap');
	});

	it('maps absent/false lineWrap to "linear"', () => {
		const out = migrateGlobulePatternConfig({
			patternViewConfig: { lineWrap: false }
		} as Partial<GlobulePatternConfig>);
		expect(out.patternViewConfig?.patternLayoutMode).toBe('linear');
	});

	it('does not overwrite an existing patternLayoutMode', () => {
		const out = migrateGlobulePatternConfig({
			patternViewConfig: { patternLayoutMode: 'page', lineWrap: true }
		} as Partial<GlobulePatternConfig>);
		expect(out.patternViewConfig?.patternLayoutMode).toBe('page');
	});

	it('adds a default pageLayout block when missing', () => {
		const out = migrateGlobulePatternConfig({
			patternConfig: {}
		} as Partial<GlobulePatternConfig>);
		expect(out.patternConfig?.pageLayout?.algorithm).toBe('flex-wrap');
		expect(out.patternConfig?.pageLayout?.pageSize.width).toBeGreaterThan(0);
	});
});
