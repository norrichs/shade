import { Vector3 } from 'three';
import type { BandCutPattern, PatternLabelsConfig } from '$lib/types';
import {
	buildEffectiveBoundsIndex,
	buildPivotIndex,
	buildTagAnchorIndex,
	tagAnchorOf
} from '../band-layout';

const makeBand = (id: string, over: Partial<BandCutPattern> = {}): BandCutPattern => ({
	id,
	projectionType: 'patterned',
	address: { globule: 0, tube: 0, band: Number(id) },
	tagAnchorPoint: { x: 1, y: 2 },
	facets: [
		{
			label: 'f0',
			path: [
				['M', 0, 0],
				['L', 10, 5],
				['L', 3, 40]
			]
		}
	],
	bounds: { left: 0, top: 0, width: 10, height: 40, center: new Vector3(5, 20, 0) },
	...over
});

const noLabels: PatternLabelsConfig | undefined = undefined;
const ctx = (labels: PatternLabelsConfig | undefined) => ({
	labels,
	externalTagEnabled: false,
	measuredDims: new Map(),
	groupCodeFor: () => undefined
});

describe('buildEffectiveBoundsIndex', () => {
	it('falls back to the raw band bounds when labels are off', () => {
		const a = makeBand('0');
		const b = makeBand('1');
		const index = buildEffectiveBoundsIndex([a, b], ctx(noLabels));
		expect(index.get(a)).toBe(a.bounds);
		expect(index.get(b)).toBe(b.bounds);
	});

	it('expands the bounds to enclose an external self tag when eligible', () => {
		const labels = {
			selfTag: { enabled: true, height: 14, padding: 10, stemLength: 20, stemWidth: 4, angle: 0 }
		} as unknown as PatternLabelsConfig;
		const band = makeBand('0', { tagAnchorAutoAngle: 0, tagAnchorPoint: { x: 10, y: 20 } });
		const index = buildEffectiveBoundsIndex([band], ctx(labels));
		const eff = index.get(band)!;
		expect(eff).not.toBe(band.bounds);
		expect(eff.width).toBeGreaterThan(band.bounds!.width);
		expect(eff.left).toBeLessThanOrEqual(band.bounds!.left);
		expect(eff.top).toBeLessThanOrEqual(band.bounds!.top);
	});

	it('is keyed by band identity so repeated lookups return the same object', () => {
		const band = makeBand('0');
		const index = buildEffectiveBoundsIndex([band], ctx(noLabels));
		expect(index.get(band)).toBe(index.get(band));
		expect(index.get(makeBand('0'))).toBeUndefined();
	});
});

describe('buildPivotIndex', () => {
	it('is the center of the effective bounds', () => {
		const band = makeBand('0', {
			bounds: { left: 10, top: 20, width: 30, height: 40, center: new Vector3() }
		});
		const bounds = buildEffectiveBoundsIndex([band], ctx(noLabels));
		expect(buildPivotIndex([band], bounds).get(band)).toEqual({ x: 25, y: 40 });
	});

	it('defaults to the origin for a band without bounds', () => {
		const band = makeBand('0', { bounds: undefined });
		const bounds = buildEffectiveBoundsIndex([band], ctx(noLabels));
		expect(buildPivotIndex([band], bounds).get(band)).toEqual({ x: 0, y: 0 });
	});
});

describe('tagAnchorOf', () => {
	it('prefers the band tag anchor point', () => {
		expect(tagAnchorOf(makeBand('0'))).toEqual({ x: 1, y: 2 });
	});

	it('falls back to the lowest path point (max y) when no anchor is set', () => {
		const band = makeBand('0', { tagAnchorPoint: undefined as unknown as { x: number; y: number } });
		expect(tagAnchorOf(band)).toEqual({ x: 3, y: 40 });
	});

	it('indexes anchors by band identity', () => {
		const band = makeBand('0');
		const index = buildTagAnchorIndex([band]);
		expect(index.get(band)).toEqual({ x: 1, y: 2 });
		expect(index.get(band)).toBe(index.get(band));
	});
});
