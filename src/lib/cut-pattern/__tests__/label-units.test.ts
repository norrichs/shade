import type { PatternLabelsConfig } from '$lib/types';
import { LABEL_MM_DEFAULTS, migrateLabelsToMm, resolveLabelsToPatternUnits } from '../label-units';

const pxLabels = (): PatternLabelsConfig => ({
	onTab: { enabled: true, padding: 2, color: '#123456' },
	selfTag: {
		enabled: true,
		externalTag: true,
		height: 14,
		angle: 0.5,
		padding: 10,
		stemLength: 20,
		stemWidth: 4
	}
});

describe('resolveLabelsToPatternUnits', () => {
	test('scales every length by pageScale and leaves the rest alone', () => {
		const mm: PatternLabelsConfig = { ...pxLabels(), units: 'mm' };
		const r = resolveLabelsToPatternUnits(mm, 2)!;
		expect(r.selfTag).toEqual({
			enabled: true,
			externalTag: true,
			height: 28,
			angle: 0.5,
			padding: 20,
			stemLength: 40,
			stemWidth: 8
		});
		expect(r.onTab).toEqual({ enabled: true, padding: 4, color: '#123456' });
	});

	test('fills missing lengths from the mm defaults', () => {
		const r = resolveLabelsToPatternUnits(
			{ units: 'mm', selfTag: { enabled: true, height: 5, angle: 0 } },
			3
		)!;
		expect(r.selfTag!.padding).toBe(LABEL_MM_DEFAULTS.padding * 3);
		expect(r.selfTag!.stemLength).toBe(LABEL_MM_DEFAULTS.stemLength * 3);
		expect(r.selfTag!.stemWidth).toBe(LABEL_MM_DEFAULTS.stemWidth * 3);
	});

	test('reads a zero or missing page scale as 1:1', () => {
		const mm: PatternLabelsConfig = { ...pxLabels(), units: 'mm' };
		expect(resolveLabelsToPatternUnits(mm, 0)!.selfTag!.height).toBe(14);
		expect(resolveLabelsToPatternUnits(mm, undefined)!.selfTag!.height).toBe(14);
	});

	test('passes undefined through', () => {
		expect(resolveLabelsToPatternUnits(undefined, 2)).toBeUndefined();
	});
});

describe('migrateLabelsToMm', () => {
	test('round-trips: a migrated config resolves to its old pattern-unit sizes', () => {
		const px = pxLabels();
		const migrated = migrateLabelsToMm(px, 0.6562);
		expect(migrated.units).toBe('mm');
		const back = resolveLabelsToPatternUnits(migrated, 0.6562)!;
		expect(back.selfTag!.height).toBeCloseTo(14);
		expect(back.selfTag!.padding).toBeCloseTo(10);
		expect(back.selfTag!.stemLength).toBeCloseTo(20);
		expect(back.selfTag!.stemWidth).toBeCloseTo(4);
		expect(back.onTab!.padding).toBeCloseTo(2);
	});

	test('fills missing lengths from the old pixel defaults before converting', () => {
		const migrated = migrateLabelsToMm({ selfTag: { enabled: true, height: 14, angle: 0 } }, 2);
		expect(migrated.selfTag!.padding).toBe(5);
		expect(migrated.selfTag!.stemLength).toBe(10);
		expect(migrated.selfTag!.stemWidth).toBe(2);
	});

	test('is idempotent', () => {
		const once = migrateLabelsToMm(pxLabels(), 2);
		expect(migrateLabelsToMm(once, 2)).toBe(once);
	});
});

describe('page-scale independence', () => {
	test('the label is the same size in mm at any page scale', () => {
		const mm: PatternLabelsConfig = { ...pxLabels(), units: 'mm' };
		for (const s of [0.3, 0.6562, 2.5]) {
			expect(resolveLabelsToPatternUnits(mm, s)!.selfTag!.height / s).toBeCloseTo(14);
		}
	});
});
