import type { BandCutPattern, PathSegment, TubeCutPattern } from '$lib/types';
import { computeMergedBandPaths } from '../prepare-merge';

const rect = (x: number, y: number, w: number, h: number): PathSegment[] => [
	['M', x, y],
	['L', x + w, y],
	['L', x + w, y + h],
	['L', x, y + h],
	['Z']
];

const makeBand = (overrides: Partial<BandCutPattern> = {}): BandCutPattern => ({
	id: 'band-1',
	projectionType: 'patterned',
	facets: [
		{ path: rect(0, 0, 100, 60), svgPath: '', label: 'outline' }
	],
	svgPath: '',
	tagAnchorPoint: { x: 50, y: 60 },
	tagAnchorAutoAngle: 0,
	address: { globule: 0, tube: 0, band: 0 },
	...overrides
}) as BandCutPattern;

const makeTube = (band: BandCutPattern): TubeCutPattern =>
	({ bands: [band] } as TubeCutPattern);

const labels = {
	selfTag: {
		enabled: true,
		angle: 0,
		padding: 10,
		stemLength: 20,
		stemWidth: 4,
		height: 14
	}
} as unknown as Parameters<typeof computeMergedBandPaths>[1];

describe('computeMergedBandPaths', () => {
	test('produces a merged path for an eligible outlined band', () => {
		const band = makeBand();
		const result = computeMergedBandPaths(
			[makeTube(band)],
			labels,
			'outlined',
			new Map([['band-1', { width: 50, height: 20 }]])
		);
		expect(result.has('band-1')).toBe(true);
		const merged = result.get('band-1')!;
		expect(merged.length).toBeGreaterThan(3);
		expect(merged[0][0]).toBe('M');
		expect(merged[merged.length - 1][0]).toBe('Z');
	});

	test('skips tiled bands', () => {
		const band = makeBand();
		const result = computeMergedBandPaths(
			[makeTube(band)],
			labels,
			'tiled',
			new Map([['band-1', { width: 50, height: 20 }]])
		);
		expect(result.size).toBe(0);
	});

	test('skips bands without tagAnchorAutoAngle', () => {
		const band = makeBand({ tagAnchorAutoAngle: undefined });
		const result = computeMergedBandPaths(
			[makeTube(band)],
			labels,
			'outlined',
			new Map([['band-1', { width: 50, height: 20 }]])
		);
		expect(result.size).toBe(0);
	});

	test('skips bands when selfTag is disabled', () => {
		const band = makeBand();
		const disabledLabels = {
			selfTag: { enabled: false, angle: 0, padding: 10, stemLength: 20, stemWidth: 4, height: 14 }
		} as unknown as Parameters<typeof computeMergedBandPaths>[1];
		const result = computeMergedBandPaths(
			[makeTube(band)],
			disabledLabels,
			'outlined',
			new Map([['band-1', { width: 50, height: 20 }]])
		);
		expect(result.size).toBe(0);
	});

	test('falls back to default dims when bandId is not in labelTextDimensions', () => {
		const band = makeBand();
		const result = computeMergedBandPaths([makeTube(band)], labels, 'outlined', new Map());
		expect(result.has('band-1')).toBe(true);
	});
});
