import type { BandCutPattern, PatternLabelsConfig } from '$lib/types';
import {
	unionBox,
	estimateTextDims,
	computeLabelFootprintBox,
	effectiveBandBounds,
	patternExtentBounds
} from '../label-footprint';

const labelsConfig = (overrides: Partial<NonNullable<PatternLabelsConfig['selfTag']>> = {}) =>
	({
		selfTag: {
			enabled: true,
			angle: 0,
			padding: 10,
			height: 14,
			stemLength: 10,
			stemWidth: 4,
			...overrides
		}
	}) as PatternLabelsConfig;

const makeBand = (overrides: Partial<BandCutPattern> = {}): BandCutPattern =>
	({
		id: 'band-1',
		projectionType: 'patterned',
		facets: [],
		svgPath: '',
		bounds: { left: 0, top: 0, width: 100, height: 200, center: { x: 50, y: 100 } },
		tagAnchorPoint: { x: 100, y: 100 },
		// −π/2 points the self-tag outward to the right, past the band's right edge.
		tagAnchorAutoAngle: -Math.PI / 2,
		address: { globule: 0, tube: 0, band: 0 },
		...overrides
	}) as BandCutPattern;

describe('unionBox', () => {
	test('encloses two disjoint boxes', () => {
		const a = { left: 0, top: 0, width: 10, height: 10 };
		const b = { left: 20, top: 5, width: 10, height: 30 };
		expect(unionBox(a, b)).toEqual({ left: 0, top: 0, width: 30, height: 35 });
	});

	test('is a no-op when one box contains the other', () => {
		const outer = { left: 0, top: 0, width: 100, height: 100 };
		const inner = { left: 10, top: 10, width: 20, height: 20 };
		expect(unionBox(outer, inner)).toEqual(outer);
	});
});

describe('estimateTextDims', () => {
	test('scales width by the longest line and height by line count', () => {
		// ADVANCE = 0.65, LINE_HEIGHT = 1.3 of fontSize.
		const dims = estimateTextDims(['0000', 't0/b0'], 14);
		expect(dims.width).toBeCloseTo(5 * 14 * 0.65, 5);
		expect(dims.height).toBeCloseTo(2 * 14 * 1.3, 5);
	});

	test('a longer line yields a wider estimate', () => {
		const short = estimateTextDims(['ab'], 14);
		const long = estimateTextDims(['abcdef'], 14);
		expect(long.width).toBeGreaterThan(short.width);
	});

	test('returns zero size for no lines', () => {
		expect(estimateTextDims([], 14)).toEqual({ width: 0, height: 0 });
	});
});

describe('computeLabelFootprintBox', () => {
	const base = {
		anchor: { x: 50, y: 60 },
		angle: 0,
		textWidth: 40,
		textHeight: 20,
		radius: 5,
		padding: 10,
		stemLength: 10,
		stemWidth: 4
	};

	test('un-rotated label sits directly below the anchor, sized to text + padding + stem', () => {
		const box = computeLabelFootprintBox({ ...base, autoAngle: 0 });
		// halfWidth = (40 + 20)/2 = 30; bodyHeight = 20 + 20 = 40.
		// renderAnchor = (50 - stemWidth/2, 60) = (48, 60).
		expect(box.left).toBeCloseTo(48 - 30, 5); // 18
		expect(box.top).toBeCloseTo(60, 5);
		expect(box.width).toBeCloseTo(60, 5); // 2 * halfWidth
		expect(box.height).toBeCloseTo(10 + 40, 5); // stemLength + bodyHeight
	});

	test('rotating the anchor 90° swaps the footprint width and height', () => {
		const upright = computeLabelFootprintBox({ ...base, autoAngle: 0 });
		const rotated = computeLabelFootprintBox({ ...base, autoAngle: Math.PI / 2 });
		expect(rotated.width).toBeCloseTo(upright.height, 4);
		expect(rotated.height).toBeCloseTo(upright.width, 4);
	});
});

describe('effectiveBandBounds', () => {
	const lines = ['0000', 't0/b0'];

	test('expands the band bounds to enclose a label pointing outward', () => {
		const band = makeBand();
		const box = effectiveBandBounds({
			band,
			labels: labelsConfig(),
			selfTagLines: lines,
			measuredDims: new Map()
		});
		expect(box).toBeDefined();
		// The anchor is to the right of the band, rotated outward, so the box
		// must extend past the band's right edge (left + width = 100).
		expect(box!.left + box!.width).toBeGreaterThan(100);
		// And it never shrinks below the original band bounds.
		expect(box!.left).toBeLessThanOrEqual(0);
		expect(box!.top).toBeLessThanOrEqual(0);
	});

	test('prefers measured dims over the analytic estimate', () => {
		// Un-rotated label so text width maps straight to footprint width,
		// isolating the dims-source choice from rotation coupling.
		const band = makeBand({ tagAnchorAutoAngle: 0 });
		const measured = new Map([[band.id, { width: 400, height: 30 }]]);
		const withMeasured = effectiveBandBounds({
			band,
			labels: labelsConfig(),
			selfTagLines: lines,
			measuredDims: measured
		});
		const withEstimate = effectiveBandBounds({
			band,
			labels: labelsConfig(),
			selfTagLines: lines,
			measuredDims: new Map()
		});
		// 400-wide measured text produces a wider footprint than the estimate.
		expect(withMeasured!.width).toBeGreaterThan(withEstimate!.width);
	});

	test('returns the band bounds unchanged when the self-tag is disabled', () => {
		const band = makeBand();
		const box = effectiveBandBounds({
			band,
			labels: labelsConfig({ enabled: false }),
			selfTagLines: lines,
			measuredDims: new Map()
		});
		expect(box).toEqual(band.bounds);
	});

	test('still encloses the label when there is no auto-angle (tiled, absolute angle)', () => {
		// Anchor on the band's bottom edge; angle 0 hangs the label below it.
		const band = makeBand({ tagAnchorAutoAngle: undefined, tagAnchorPoint: { x: 50, y: 200 } });
		const box = effectiveBandBounds({
			band,
			labels: labelsConfig(),
			selfTagLines: lines,
			measuredDims: new Map()
		});
		expect(box!.top + box!.height).toBeGreaterThan(200);
	});

	test('packs the stroked pattern extent, not the flat band bounds', () => {
		const band = makeBand({
			facets: [
				{
					path: [
						['M', -20, 0],
						['L', 130, 0]
					],
					strokeWidth: 10
				}
			] as never
		});
		const box = effectiveBandBounds({
			band,
			labels: labelsConfig({ enabled: false }),
			selfTagLines: lines,
			measuredDims: new Map()
		});
		expect(box).toEqual({ left: -25, top: -5, width: 160, height: 10 });
	});
});

describe('patternExtentBounds', () => {
	test('grows every facet path by half its own stroke width', () => {
		const band = makeBand({
			facets: [
				{
					path: [
						['M', 0, 0],
						['L', 10, 0]
					],
					strokeWidth: 2
				},
				{
					path: [
						['M', 0, 50],
						['L', 0, 60]
					],
					strokeWidth: 8
				}
			] as never
		});
		expect(patternExtentBounds(band)).toEqual({ left: -4, top: -1, width: 15, height: 65 });
	});

	test('samples curves instead of boxing their control points', () => {
		const band = makeBand({
			facets: [
				{
					path: [
						['M', 0, 0],
						['C', 0, 100, 10, 100, 10, 0]
					],
					strokeWidth: 0
				}
			] as never
		});
		const box = patternExtentBounds(band)!;
		// The curve peaks at y = 75; its control points sit at 100.
		expect(box.height).toBeLessThan(80);
		expect(box.height).toBeGreaterThan(70);
	});

	test('falls back to band.bounds when no facet has a path', () => {
		const band = makeBand();
		expect(patternExtentBounds(band)).toBe(band.bounds);
	});
});
