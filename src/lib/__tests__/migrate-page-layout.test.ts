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

	it('backfills reorderWindow and allowRotation when the pageLayout block is missing', () => {
		const out = migrateGlobulePatternConfig({
			patternConfig: {}
		} as Partial<GlobulePatternConfig>);
		expect(out.patternConfig?.pageLayout?.reorderWindow).toBe(8);
		expect(out.patternConfig?.pageLayout?.allowRotation).toBe(false);
	});

	it('backfills reorderWindow and allowRotation on an existing pageLayout that lacks them', () => {
		const out = migrateGlobulePatternConfig({
			patternConfig: {
				pageLayout: {
					pageSize: { width: 304.8, height: 304.8 },
					pageScale: 0.6562,
					margin: 12.7,
					gap: 20,
					displayUnit: 'inch',
					algorithm: 'flex-wrap',
					keepConnected: 0
				}
			}
		} as unknown as Partial<GlobulePatternConfig>);
		expect(out.patternConfig?.pageLayout?.reorderWindow).toBe(8);
		expect(out.patternConfig?.pageLayout?.allowRotation).toBe(false);
	});
});
