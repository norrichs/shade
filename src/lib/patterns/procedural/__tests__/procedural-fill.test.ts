import { svgPathStringFromSegments } from '$lib/patterns/utils';
import type { ProceduralFillConfig } from '$lib/types';
import { circlesToPathSegments, generateProceduralFill } from '../procedural-fill';
import type { Polygon } from '../polygon-2d';

const square: Polygon = [
	{ x: 0, y: 0 },
	{ x: 200, y: 0 },
	{ x: 200, y: 200 },
	{ x: 0, y: 200 }
];

const config: ProceduralFillConfig = {
	kind: 'circle-holes',
	seed: 1,
	density: 0.002,
	margin: 5,
	minRadius: 3,
	maxRadius: 15,
	spacing: 4
};

describe('circlesToPathSegments', () => {
	it('emits four segments per circle', () => {
		const segments = circlesToPathSegments([
			{ x: 10, y: 20, r: 5 },
			{ x: 30, y: 40, r: 2 }
		]);
		expect(segments).toHaveLength(8);
	});

	it('draws a closed two-arc circle', () => {
		expect(circlesToPathSegments([{ x: 10, y: 20, r: 5 }])).toEqual([
			['M', 5, 20],
			['A', 5, 5, 0, 1, 0, 15, 20],
			['A', 5, 5, 0, 1, 0, 5, 20],
			['Z']
		]);
	});

	it('emits nothing for no circles', () => {
		expect(circlesToPathSegments([])).toEqual([]);
	});
});

describe('generateProceduralFill', () => {
	it('produces a facet whose path is four segments per circle', () => {
		const facet = generateProceduralFill(square, config, 0);
		expect(facet).toBeDefined();
		expect(facet!.path.length % 4).toBe(0);
		expect(facet!.path.length).toBeGreaterThan(0);
	});

	it('round-trips through svgPathStringFromSegments', () => {
		const facet = generateProceduralFill(square, config, 0);
		expect(facet!.svgPath).toBe(svgPathStringFromSegments(facet!.path));
		expect(facet!.svgPath).toMatch(/^M/);
	});

	it('labels the facet by band index', () => {
		expect(generateProceduralFill(square, config, 7)!.label).toBe('procedural-fill-7');
	});

	it('varies between bands at the same seed', () => {
		const a = generateProceduralFill(square, config, 0)!;
		const b = generateProceduralFill(square, config, 1)!;
		expect(a.svgPath).not.toBe(b.svgPath);
	});

	it('is stable for the same band and seed', () => {
		expect(generateProceduralFill(square, config, 3)!.svgPath).toBe(
			generateProceduralFill(square, config, 3)!.svgPath
		);
	});

	it('changes when the seed changes', () => {
		const a = generateProceduralFill(square, config, 0)!;
		const b = generateProceduralFill(square, { ...config, seed: 99 }, 0)!;
		expect(a.svgPath).not.toBe(b.svgPath);
	});

	it('returns undefined when nothing fits', () => {
		const tiny: Polygon = [
			{ x: 0, y: 0 },
			{ x: 4, y: 0 },
			{ x: 4, y: 4 },
			{ x: 0, y: 4 }
		];
		expect(generateProceduralFill(tiny, config, 0)).toBeUndefined();
	});

	it('returns undefined for an invalid config rather than throwing', () => {
		expect(generateProceduralFill(square, { ...config, minRadius: 50 }, 0)).toBeUndefined();
	});
});
