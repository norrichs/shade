import type { GlobuleConfig } from '$lib/types';
import { generateDefaultGlobuleConfig } from '$lib/shades-config';
import { generateSilhouette } from '$lib/generate-shape';
import type { GcsValidation } from '../validate-shape-configs';
import { gcsMarkers } from '../gcs-markers';

const build = (n: number, method: 'divideCurvePath' | 'divideCurve' = 'divideCurvePath') => {
	const g = generateDefaultGlobuleConfig();
	const base = g.shapeConfigs[0];
	g.shapeConfigs = Array.from({ length: n }, (_, i) => ({
		...base,
		isPrimary: i === 0
	}));
	g.levelConfig = {
		...g.levelConfig,
		silhouetteSampleMethod: { ...g.levelConfig.silhouetteSampleMethod, method, divisions: 10 }
	} as GlobuleConfig['levelConfig'];
	return g;
};

const validation = (levels: number[], errors: GcsValidation['errors'] = []): GcsValidation => ({
	isValid: errors.length === 0,
	errors,
	levels,
	bandCount: 4
});

describe('gcsMarkers', () => {
	it('markers at effective levels', () => {
		const m = gcsMarkers(build(3), validation([0, 5, 10]));
		expect(m.map((x) => x.label)).toEqual(['A', 'B', 'C']);
		expect(m.map((x) => x.level)).toEqual([0, 5, 10]);
		expect(m.map((x) => x.t)).toEqual([0, 0.5, 1]);
		expect(m.map((x) => x.isPrimary)).toEqual([true, false, false]);
	});

	it('point matches silhouette getPointAt', () => {
		const g = build(3);
		const m = gcsMarkers(g, validation([0, 5, 10]));
		const expected = generateSilhouette(g.silhouetteConfig).getPointAt(0.5);
		expect(m[1].point).toEqual({ x: expected.x, y: expected.y });
		expect(Object.getPrototypeOf(m[1].point)).toBe(Object.prototype);
	});

	it('point matches silhouette getPoint for divideCurve', () => {
		const g = build(3, 'divideCurve');
		const m = gcsMarkers(g, validation([0, 5, 10]));
		const expected = generateSilhouette(g.silhouetteConfig).getPoint(0.5);
		expect(m[1].point).toEqual({ x: expected.x, y: expected.y });
	});

	it('single GCS -> no markers', () => {
		expect(gcsMarkers(build(1), validation([0]))).toEqual([]);
	});

	it('invalid flag from validation errors', () => {
		const m = gcsMarkers(build(3), validation([0, 5, 10], [{ index: 1, message: 'bad' }]));
		expect(m.map((x) => x.invalid)).toEqual([false, true, false]);
	});
});
