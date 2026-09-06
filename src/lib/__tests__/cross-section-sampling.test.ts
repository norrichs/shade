import { describe, it, expect } from '@jest/globals';
import { CurvePath, Vector2 } from 'three';

import { generateLevelPrototype, radialSideCurvePaths } from '../generate-shape';
import { generateDefaultRadialShapeConfig } from '../shades-config';
import { defaultLevelConfigForTest } from './cross-section-sampling.fixtures';
import type { CurveSampleMethod, ShapeConfig } from '../types';

const shapeWith = (
	sampleMethod: CurveSampleMethod,
	symmetryNumber = 7,
	symmetry: ShapeConfig['symmetry'] = 'radial'
): ShapeConfig => generateDefaultRadialShapeConfig(symmetryNumber, sampleMethod, symmetry);

const verticesOf = (shape: ShapeConfig): Vector2[] => {
	const prototype = generateLevelPrototype(shape, defaultLevelConfigForTest());
	if (Array.isArray(prototype)) throw new Error('expected a single level prototype');
	return prototype.vertices;
};

describe('divideCurvePath (By Whole Curve)', () => {
	it('produces exactly `divisions` vertices for the whole cross-section', () => {
		// Not divisions-per-curve: the entire joined path is divided once.
		expect(verticesOf(shapeWith({ method: 'divideCurvePath', divisions: 30 }))).toHaveLength(30);
		expect(verticesOf(shapeWith({ method: 'divideCurvePath', divisions: 7 }))).toHaveLength(7);
	});

	it('divides the joined outline evenly by arc length', () => {
		// The guarantee is arc-length evenness, which is NOT chord-length
		// evenness: this shape has genuine ~50deg direction changes at its 7
		// lobe joints, so measuring distances between consecutive vertices
		// cannot express it. Instead rebuild the same joined outline
		// independently and divide THAT by arc length. Generation scales points
		// by 1/200, and uniform scaling commutes with arc-length-proportional
		// sampling, so the expectation is scaled rather than the actual.
		const divisions = 37;
		const config = generateDefaultRadialShapeConfig(7, {
			method: 'divideCurvePath',
			divisions
		});
		const actual = verticesOf(config);

		const joined = new CurvePath<Vector2>();
		radialSideCurvePaths(config).forEach((side) =>
			side.curves.forEach((curve) => joined.add(curve))
		);
		const expected = joined
			.getSpacedPoints(divisions)
			.slice(1)
			.map((p) => p.clone().multiplyScalar(1 / 200));

		expect(actual).toHaveLength(divisions);
		actual.forEach((point, i) => {
			expect(point.x).toBeCloseTo(expected[i].x, 10);
			expect(point.y).toBeCloseTo(expected[i].y, 10);
		});
	});

	it('does not force radial symmetry when divisions do not divide the side count', () => {
		// 10 divisions over 7 sides cannot land a vertex on every side boundary,
		// which is the whole point of this method. The old implementation
		// ceil'd per curve and stayed symmetric.
		const vertices = verticesOf(shapeWith({ method: 'divideCurvePath', divisions: 10 }, 7));
		expect(vertices).toHaveLength(10);
		const radii = vertices.map((v) => Math.hypot(v.x, v.y));
		expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(1e-6);
	});
});
